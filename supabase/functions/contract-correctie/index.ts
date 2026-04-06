import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { token, wat_klopt_niet, toelichting } = await req.json();

    if (!token || !Array.isArray(wat_klopt_niet) || wat_klopt_niet.length === 0) {
      return new Response(JSON.stringify({ error: "Token en minstens één selectie zijn verplicht" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate wat_klopt_niet items
    const GELDIGE_OPTIES = ["naam_handelsnaam", "adres", "kvk_nummer", "btw_nummer", "uurtarief", "looptijd", "anders"];
    const ongeldige = wat_klopt_niet.filter((v: string) => !GELDIGE_OPTIES.includes(v));
    if (ongeldige.length > 0) {
      return new Response(JSON.stringify({ error: "Ongeldige selectie" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (toelichting && typeof toelichting !== "string") {
      return new Response(JSON.stringify({ error: "Toelichting moet tekst zijn" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeToelicht = (toelichting || "").slice(0, 2000);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find contract by token in contract_data
    const { data: contracten } = await supabase
      .from("contracten")
      .select("id, contract_data, kandidaat_id, status")
      .in("status", ["verstuurd", "correctie_gevraagd"]);

    const contract = contracten?.find((c: any) => {
      const cd = c.contract_data as any;
      return cd?._token === token;
    });

    if (!contract) {
      return new Response(JSON.stringify({ error: "Ongeldige of verlopen link" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check token expiry
    const cd = (contract as any).contract_data as any;
    if (cd._token_geldig_tot && new Date(cd._token_geldig_tot) < new Date()) {
      return new Response(JSON.stringify({ error: "Deze link is verlopen" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: max 5 corrections per contract
    const { count } = await supabase
      .from("contract_berichten")
      .select("id", { count: "exact", head: true })
      .eq("contract_id", contract.id)
      .eq("bericht_type", "correctie_verzoek");

    if ((count || 0) >= 5) {
      return new Response(JSON.stringify({ error: "Te veel correctieverzoeken. Neem contact op met TerreVolt." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert correction message
    const { error: insertErr } = await supabase.from("contract_berichten").insert({
      contract_id: contract.id,
      richting: "kandidaat_naar_manager",
      bericht_type: "correctie_verzoek",
      wat_klopt_niet: wat_klopt_niet,
      toelichting: safeToelicht,
    });

    if (insertErr) {
      return new Response(JSON.stringify({ error: "Fout bij opslaan" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update contract status
    await supabase.from("contracten").update({ status: "correctie_gevraagd" }).eq("id", contract.id);

    // Send notification to managers
    const { data: managers } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "manager");

    if (managers?.length) {
      const { data: managerProfiles } = await supabase
        .from("profiles")
        .select("id")
        .in("user_id", managers.map((m: any) => m.user_id));

      if (managerProfiles?.length) {
        const firstManager = managerProfiles[0].id;
        const otNaam = cd.ot_naam || "Kandidaat";
        const items = wat_klopt_niet.join(", ");
        await supabase.from("mededelingen").insert({
          titel: `${otNaam} meldt een onjuistheid in het contract`,
          inhoud: `${otNaam} geeft aan dat het volgende niet klopt: ${items}. ${safeToelicht ? `Toelichting: ${safeToelicht}` : ""}`.trim(),
          verzonden_door: firstManager,
          ontvanger_type: "iedereen",
          urgentie: "urgent",
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Interne fout" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

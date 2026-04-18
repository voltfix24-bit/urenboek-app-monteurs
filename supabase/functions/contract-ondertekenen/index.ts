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
    const { token, naam, handtekening } = await req.json();

    if (!token || !naam || !handtekening) {
      return new Response(JSON.stringify({ error: "Token, naam en handtekening zijn verplicht" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof token !== "string" || typeof naam !== "string" || typeof handtekening !== "string") {
      return new Response(JSON.stringify({ error: "Ongeldige invoer" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up token in dedicated table
    const { data: tokenRow } = await supabase
      .from("contract_tokens")
      .select("contract_id, geldig_tot, gebruikt")
      .eq("token", token)
      .maybeSingle();

    if (!tokenRow || tokenRow.gebruikt || new Date(tokenRow.geldig_tot) < new Date()) {
      return new Response(JSON.stringify({ error: "Ongeldige of verlopen link" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contract } = await supabase
      .from("contracten")
      .select("id, kandidaat_id, status")
      .eq("id", tokenRow.contract_id)
      .maybeSingle();

    if (!contract || !["verstuurd", "correctie_gevraagd"].includes(contract.status)) {
      return new Response(JSON.stringify({ error: "Ongeldige of verlopen link" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contractId = contract.id;

    // Update contract with signature
    const { error: updateError } = await supabase
      .from("contracten")
      .update({
        status: "ondertekend_ot",
        ot_naam: naam,
        ot_handtekening: handtekening,
        ot_ip: ip,
        ot_user_agent: userAgent,
        ot_timestamp: new Date().toISOString(),
      })
      .eq("id", contractId);

    if (updateError) {
      return new Response(JSON.stringify({ error: "Fout bij opslaan" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark all tokens for this contract as used
    await supabase
      .from("contract_tokens")
      .update({ gebruikt: true, gebruikt_op: new Date().toISOString() })
      .eq("contract_id", contractId)
      .eq("gebruikt", false);

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
        await supabase.from("mededelingen").insert({
          titel: `${naam} heeft het contract ondertekend`,
          inhoud: `${naam} heeft het contract ondertekend — jouw handtekening is nodig om het contract te activeren.`,
          verzonden_door: firstManager,
          ontvanger_type: "iedereen",
          urgentie: "urgent",
        });
      }
    }

    // Return kandidaat email for account creation
    let kandidaatEmail = "";
    if (contract.kandidaat_id) {
      const { data: kand } = await supabase
        .from("kandidaten")
        .select("email")
        .eq("id", contract.kandidaat_id)
        .maybeSingle();
      if (kand) kandidaatEmail = kand.email;
    }

    return new Response(JSON.stringify({ success: true, email: kandidaatEmail, kandidaat_id: contract.kandidaat_id, contract_id: contractId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Interne fout" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

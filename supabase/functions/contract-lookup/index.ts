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
    const { token } = await req.json();

    if (!token || typeof token !== "string" || token.length < 10 || token.length > 200) {
      return new Response(JSON.stringify({ error: "Token is verplicht" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    if (!tokenRow) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load contract
    const { data: contract } = await supabase
      .from("contracten")
      .select("*, kandidaten(email, profiel_id)")
      .eq("id", tokenRow.contract_id)
      .maybeSingle();

    if (!contract) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cd = (contract as any).contract_data as any;
    const status = (contract as any).status;

    // Already signed
    if (status === "ondertekend_ot" || status === "ondertekend_beiden") {
      const kand = (contract as any).kandidaten;
      return new Response(JSON.stringify({
        status: "signed",
        contract_data: cd,
        kandidaat_email: kand?.email || "",
        kandidaat_id: contract.kandidaat_id,
        has_account: !!kand?.profiel_id,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Token expired or used
    if (tokenRow.gebruikt || new Date(tokenRow.geldig_tot) < new Date()) {
      return new Response(JSON.stringify({ error: "expired" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load berichten
    const { data: berichten } = await supabase
      .from("contract_berichten")
      .select("*")
      .eq("contract_id", contract.id)
      .order("aangemaakt_op", { ascending: true });

    return new Response(JSON.stringify({
      status: "pending",
      contract_id: contract.id,
      contract_data: cd,
      kandidaat_id: contract.kandidaat_id,
      kandidaat_email: (contract as any).kandidaten?.email || "",
      berichten: berichten || [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Interne fout" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

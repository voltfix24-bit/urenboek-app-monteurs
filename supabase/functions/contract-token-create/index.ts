import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Verify caller is a manager
    const { data: hasManagerRole } = await adminClient.rpc("has_role", {
      _user_id: userId,
      _role: "manager",
    });
    if (!hasManagerRole) {
      return new Response(JSON.stringify({ error: "Alleen managers" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { contract_id } = await req.json();
    if (!contract_id || typeof contract_id !== "string") {
      return new Response(JSON.stringify({ error: "contract_id verplicht" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify contract exists
    const { data: contract } = await adminClient
      .from("contracten")
      .select("id")
      .eq("id", contract_id)
      .maybeSingle();
    if (!contract) {
      return new Response(JSON.stringify({ error: "Contract niet gevonden" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Invalidate any prior unused tokens for this contract
    await adminClient
      .from("contract_tokens")
      .update({ gebruikt: true, gebruikt_op: new Date().toISOString() })
      .eq("contract_id", contract_id)
      .eq("gebruikt", false);

    // Create new token
    const newToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const geldigTot = new Date();
    geldigTot.setDate(geldigTot.getDate() + 7);

    const { error: insertErr } = await adminClient.from("contract_tokens").insert({
      contract_id,
      token: newToken,
      geldig_tot: geldigTot.toISOString(),
      gebruikt: false,
    });

    if (insertErr) {
      return new Response(JSON.stringify({ error: "Token aanmaken mislukt" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ token: newToken, geldig_tot: geldigTot.toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (_err) {
    console.error("edge function error:", _err);
    return new Response(JSON.stringify({ error: "Interne fout" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

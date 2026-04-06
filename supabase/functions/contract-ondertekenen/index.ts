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

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate token
    const { data: tokenData, error: tokenError } = await supabase
      .from("contract_tokens")
      .select("*, contracten(*)")
      .eq("token", token)
      .single();

    if (tokenError || !tokenData) {
      return new Response(JSON.stringify({ error: "Ongeldige link" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tokenData.gebruikt) {
      return new Response(JSON.stringify({ error: "Deze link is al gebruikt" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(tokenData.geldig_tot) < new Date()) {
      return new Response(JSON.stringify({ error: "Deze link is verlopen" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contractId = tokenData.contract_id;

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

    // Mark token as used
    await supabase
      .from("contract_tokens")
      .update({ gebruikt: true, gebruikt_op: new Date().toISOString() })
      .eq("id", tokenData.id);

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

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
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get profile
    const { data: profile } = await adminClient
      .from("profiles").select("id, full_name, account_status")
      .eq("user_id", user.id).single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profiel niet gevonden" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update account status
    await adminClient.from("profiles").update({
      account_status: "active",
      activated_at: new Date().toISOString(),
    }).eq("id", profile.id);

    // Send notification to all managers
    const { data: managerRoles } = await adminClient
      .from("user_roles").select("user_id").eq("role", "manager");

    if (managerRoles && managerRoles.length > 0) {
      // Get manager profile IDs
      for (const mr of managerRoles) {
        const { data: managerProfile } = await adminClient
          .from("profiles").select("id").eq("user_id", mr.user_id).single();
        if (managerProfile) {
          await adminClient.from("mededelingen").insert({
            titel: `${profile.full_name} heeft account geactiveerd`,
            inhoud: `${profile.full_name} heeft zijn/haar account geactiveerd en is klaar voor gebruik.`,
            urgentie: "normaal",
            ontvanger_type: "persoon",
            ontvanger_id: managerProfile.id,
            verzonden_door: profile.id,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

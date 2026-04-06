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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: allowed } = await adminClient.rpc("check_rate_limit", {
      _key: caller.id, _endpoint: "delete-user", _limit: 5, _window_seconds: 60,
    });
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Te veel verzoeken. Probeer het later opnieuw." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
      });
    }

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "manager");

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Alleen managers mogen gebruikers verwijderen" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { userId } = await req.json();

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId is verplicht" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (userId === caller.id) {
      return new Response(JSON.stringify({ error: "Je kunt jezelf niet verwijderen" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the profile id (medewerker_id in related tables references profiles.id, not auth user id)
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profile) {
      const pid = profile.id;
      // Delete related data using profiles.id
      await adminClient.from("uren_boekingen").delete().eq("medewerker_id", pid);
      await adminClient.from("planning").delete().eq("medewerker_id", pid);
      await adminClient.from("overuren_meldingen").delete().eq("medewerker_id", pid);
      await adminClient.from("beschikbaarheid").delete().eq("medewerker_id", pid);
      await adminClient.from("certificaten").delete().eq("medewerker_id", pid);
      await adminClient.from("mededeling_leesstatus").delete().eq("medewerker_id", pid);
      await adminClient.from("manager_handtekeningen").delete().eq("profiel_id", pid);
      await adminClient.from("inkooporders").delete().eq("medewerker_id", pid);
      await adminClient.from("contracten").delete().eq("profiel_id", pid);
      await adminClient.from("profiles").delete().eq("id", pid);
    }

    // Delete auth-level data
    await adminClient.from("user_roles").delete().eq("user_id", userId);

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

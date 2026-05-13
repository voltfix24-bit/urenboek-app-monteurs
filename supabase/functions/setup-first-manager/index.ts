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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Rate limit by IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { data: allowed } = await adminClient.rpc("check_rate_limit", {
      _key: ip, _endpoint: "setup-first-manager", _limit: 3, _window_seconds: 3600,
    });
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Te veel verzoeken. Probeer het later opnieuw." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "3600" },
      });
    }

    // Check if setup already done
    const { data: setup } = await adminClient.from("app_setup").select("setup_done").limit(1).maybeSingle();
    if (setup?.setup_done) {
      return new Response(JSON.stringify({ error: "Setup al voltooid" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if managers already exist
    const { data: existingManagers } = await adminClient
      .from("user_roles").select("id").eq("role", "manager").limit(1);
    if (existingManagers && existingManagers.length > 0) {
      return new Response(JSON.stringify({ error: "Al managers aanwezig" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, fullName } = await req.json();
    if (!email || !password || !fullName) {
      return new Response(JSON.stringify({ error: "Email, wachtwoord en naam zijn verplicht" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth account
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create profile
    const { data: existingProfile } = await adminClient
      .from("profiles").select("id").eq("user_id", newUser.user.id).maybeSingle();
    if (!existingProfile) {
      await adminClient.from("profiles").insert({
        user_id: newUser.user.id,
        full_name: fullName,
        telefoon: "",
        adres: "",
        rijbewijs: false,
        vaste_vrije_dagen: [],
        account_status: "active",
        activated_at: new Date().toISOString(),
      });
    }

    // Assign manager role
    await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role: "manager" });

    // Upsert app_setup (setup_done stays false until lockdown)
    if (!setup) {
      await adminClient.from("app_setup").insert({ setup_done: true });
    } else {
      await adminClient.from("app_setup").update({ setup_done: true }).eq("id", setup.id);
    }

    return new Response(
      JSON.stringify({ success: true, userId: newUser.user.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (_err) {
    console.error("edge function error:", _err);
    return new Response(JSON.stringify({ error: "Interne fout" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

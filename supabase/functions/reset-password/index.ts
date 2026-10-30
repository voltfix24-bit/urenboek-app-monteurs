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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Require an authenticated caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const jwt = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(jwt);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerUserId = claimsData.claims.sub;

    // Caller must be a manager
    const { data: isManager } = await adminClient.rpc("has_role", {
      _user_id: callerUserId,
      _role: "manager",
    });
    if (!isManager) {
      return new Response(JSON.stringify({ error: "Alleen managers mogen wachtwoorden resetten" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Database-backed rate limit by caller user id (more meaningful than IP for an authenticated endpoint)
    const { data: allowed } = await adminClient.rpc("check_rate_limit", {
      _key: callerUserId, _endpoint: "reset-password", _limit: 10, _window_seconds: 60,
    });
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Te veel verzoeken. Probeer het later opnieuw." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
      });
    }

    const { user_id, password, email } = await req.json();

    if (!user_id || !password) {
      return new Response(JSON.stringify({ error: "user_id en password zijn verplicht" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof password !== "string" || password.length < 8 || password.length > 200) {
      return new Response(JSON.stringify({ error: "Wachtwoord moet 8-200 tekens zijn" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A manager setting the password vouches for the account, so confirm it (invited accounts are unconfirmed otherwise and cannot log in).
    const updateData: { password: string; email?: string; email_confirm?: boolean } = { password, email_confirm: true };
    if (email) {
      if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return new Response(JSON.stringify({ error: "Ongeldig e-mailadres" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      updateData.email = email;
      updateData.email_confirm = true;
    }

    const { error } = await adminClient.auth.admin.updateUserById(user_id, updateData);

    if (error) {
      const weak = /weak|easy to guess|pwned/i.test(error.message || "") || (error as { code?: string }).code === "weak_password";
      if (weak) {
        // Expected validation outcome: return 200 so the client shows a message instead of a runtime error.
        return new Response(JSON.stringify({ error: "Dit wachtwoord is te zwak of bekend uit datalekken. Kies een ander, uniek wachtwoord.", code: "weak_password" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: error.message || "Reset mislukt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let profileWarning: string | null = null;
    const profilePatch: { account_status: string; activated_at: string; email?: string } = {
      account_status: "active",
      activated_at: new Date().toISOString(),
    };
    if (email) profilePatch.email = email;

    const { error: profileError } = await adminClient
      .from("profiles")
      .update(profilePatch)
      .eq("user_id", user_id);

    if (profileError) {
      profileWarning = "Inloggen is bijgewerkt, maar profielgegevens konden niet volledig worden opgeslagen.";
    }

    return new Response(JSON.stringify({ success: true, profileWarning }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_err) {
    console.error("edge function error:", _err);
    return new Response(JSON.stringify({ error: "Interne fout" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

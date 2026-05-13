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
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: allowed } = await adminClient.rpc("check_rate_limit", {
      _key: caller.id, _endpoint: "create-user", _limit: 5, _window_seconds: 60,
    });
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Te veel verzoeken. Probeer het later opnieuw." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
      });
    }

    const { data: roleData } = await adminClient
      .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "manager");
    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Alleen managers mogen gebruikers aanmaken" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      email, password, fullName, role,
      telefoon, adres, rijbewijs,
      noodcontact_naam, noodcontact_tel,
      contract_einddatum, uurtarief,
      invite_only, certificaten,
    } = await req.json();

    if (!email || !fullName || !role) {
      return new Response(JSON.stringify({ error: "Email, naam en rol zijn verplicht" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!invite_only && !password) {
      return new Response(JSON.stringify({ error: "Wachtwoord is verplicht" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let newUser;
    if (invite_only) {
      const { data, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
      });
      if (inviteError) {
        return new Response(JSON.stringify({ error: inviteError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      newUser = data;
    } else {
      const { data: existingUserData, error: existingUserError } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (existingUserError) {
        return new Response(JSON.stringify({ error: existingUserError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const existingUser = existingUserData.users.find((u: any) =>
        u.email?.toLowerCase() === email.toLowerCase(),
      );

      if (existingUser) {
        const { data: updatedUser, error: updateError } = await adminClient.auth.admin.updateUserById(existingUser.id, {
          password,
          email_confirm: true,
          user_metadata: {
            ...(existingUser.user_metadata ?? {}),
            full_name: fullName,
          },
        });

        if (updateError) {
          return new Response(JSON.stringify({ error: updateError.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        newUser = updatedUser;
      } else {
        const { data, error: createError } = await adminClient.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (createError) {
          return new Response(JSON.stringify({ error: createError.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        newUser = data;
      }
    }

    // Create profile if not exists (trigger may have created it)
    const { data: existingProfile } = await adminClient
      .from("profiles").select("id").eq("user_id", newUser.user.id).maybeSingle();

    let profileId: string;
    if (!existingProfile) {
      const { data: newProfile } = await adminClient.from("profiles").insert({
        user_id: newUser.user.id,
        full_name: fullName,
        telefoon: telefoon || "",
        adres: adres || "",
        rijbewijs: rijbewijs || false,
        vaste_vrije_dagen: [],
        uurtarief: uurtarief || null,
        noodcontact_naam: noodcontact_naam || null,
        noodcontact_tel: noodcontact_tel || null,
        contract_einddatum: contract_einddatum || null,
        account_status: invite_only ? "invited" : "active",
        invited_at: new Date().toISOString(),
      }).select("id").single();
      profileId = newProfile!.id;
    } else {
      // Update existing profile with additional data
      await adminClient.from("profiles").update({
        full_name: fullName,
        telefoon: telefoon || "",
        adres: adres || "",
        rijbewijs: rijbewijs || false,
        uurtarief: uurtarief || null,
        noodcontact_naam: noodcontact_naam || null,
        noodcontact_tel: noodcontact_tel || null,
        contract_einddatum: contract_einddatum || null,
        account_status: invite_only ? "invited" : "active",
        invited_at: new Date().toISOString(),
      }).eq("id", existingProfile.id);
      profileId = existingProfile.id;
    }

    // Assign role
    await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role });

    // Add certificates if provided
    if (certificaten && Array.isArray(certificaten) && certificaten.length > 0) {
      const certRows = certificaten.map((c: any) => ({
        medewerker_id: profileId,
        type: c.type || "overig",
        naam: c.naam,
        vervaldatum: c.vervaldatum,
      }));
      await adminClient.from("certificaten").insert(certRows);
    }

    return new Response(
      JSON.stringify({ success: true, user: { id: newUser.user.id, email, fullName, role } }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (_err) {
    console.error("edge function error:", _err);
    return new Response(JSON.stringify({ error: "Interne fout" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

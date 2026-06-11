import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const allowedRoles = new Set(["monteur", "schakelmonteur", "uitvoerder", "wv", "manager"]);
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= 8 && password.length <= 200;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Methode niet toegestaan" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
      is_onderaannemer, onderaannemer_id,
    } = await req.json();


    const missing: string[] = [];
    if (typeof email !== "string" || !emailRegex.test(email)) {
      missing.push(`email (ontvangen: ${JSON.stringify(email)})`);
    }
    if (typeof fullName !== "string" || fullName.trim().length < 2) {
      missing.push(`fullName (ontvangen: ${JSON.stringify(fullName)})`);
    }
    if (typeof role !== "string" || !allowedRoles.has(role)) {
      missing.push(`role (ontvangen: ${JSON.stringify(role)}, toegestaan: ${[...allowedRoles].join(", ")})`);
    }
    if (missing.length > 0) {
      return new Response(JSON.stringify({ error: `Ongeldig of ontbrekend: ${missing.join("; ")}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!invite_only && !isValidPassword(password)) {
      return new Response(JSON.stringify({ error: "Wachtwoord moet 8-200 tekens zijn" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let newUser;
    if (invite_only) {
      const { data, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
      });
      if (inviteError) {
        return new Response(JSON.stringify({ error: "Uitnodigen mislukt" }), {
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
        return new Response(JSON.stringify({ error: "Gebruikerslijst ophalen mislukt" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const existingUser = existingUserData.users.find((u: any) =>
        u.email?.toLowerCase() === normalizedEmail,
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
          return new Response(JSON.stringify({ error: "Bijwerken mislukt" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        newUser = updatedUser;
      } else {
        const { data, error: createError } = await adminClient.auth.admin.createUser({
          email: normalizedEmail, password, email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (createError) {
          return new Response(JSON.stringify({ error: "Aanmaken mislukt" }), {
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
        is_onderaannemer: !!is_onderaannemer,
        onderaannemer_id: onderaannemer_id || null,
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
        is_onderaannemer: !!is_onderaannemer,
        onderaannemer_id: onderaannemer_id || null,
      }).eq("id", existingProfile.id);
      profileId = existingProfile.id;
    }


    // Assign role
    await adminClient
      .from("user_roles")
      .upsert({ user_id: newUser.user.id, role }, { onConflict: "user_id,role" });

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
      JSON.stringify({ success: true, user: { id: newUser.user.id, email, fullName, role }, profile_id: profileId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (_err) {
    console.error("edge function error:", _err);
    return new Response(JSON.stringify({ error: "Interne fout" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

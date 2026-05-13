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
    const { email, password, kandidaat_id } = await req.json();

    if (!email || !password || !kandidaat_id) {
      return new Response(JSON.stringify({ error: "Email, wachtwoord en kandidaat ID zijn verplicht" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "Wachtwoord moet minimaal 6 tekens zijn" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Check rate limit
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      _key: email, _endpoint: "contract-register", _limit: 3, _window_seconds: 300,
    });
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Te veel pogingen. Probeer het later opnieuw." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get kandidaat data
    const { data: kandidaat, error: kError } = await supabase
      .from("kandidaten")
      .select("*")
      .eq("id", kandidaat_id)
      .single();

    if (kError || !kandidaat) {
      return new Response(JSON.stringify({ error: "Kandidaat niet gevonden" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify email matches kandidaat
    if (kandidaat.email.toLowerCase() !== email.toLowerCase()) {
      return new Response(JSON.stringify({ error: "E-mailadres komt niet overeen" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if kandidaat already has a profile linked
    if (kandidaat.profiel_id) {
      return new Response(JSON.stringify({ error: "Er is al een account aangemaakt voor deze kandidaat" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check contract exists and is signed
    const { data: contract } = await supabase
      .from("contracten")
      .select("id, contract_data, status")
      .eq("kandidaat_id", kandidaat_id)
      .in("status", ["ondertekend_ot", "ondertekend_beiden"])
      .order("aangemaakt_op", { ascending: false })
      .limit(1)
      .single();

    if (!contract) {
      return new Response(JSON.stringify({ error: "Geen ondertekend contract gevonden" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cd = contract.contract_data as any;

    // Create user account (auto-confirm email since they verified via contract token)
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `${kandidaat.voornaam} ${kandidaat.achternaam}` },
    });

    if (createError) {
      if (createError.message?.includes("already been registered")) {
        return new Response(JSON.stringify({ error: "Dit e-mailadres is al in gebruik" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Registratie mislukt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update the profile created by handle_new_user trigger
    const { data: profile, error: profileError } = await supabase.from("profiles").update({
      full_name: `${kandidaat.voornaam} ${kandidaat.achternaam}`,
      telefoon: kandidaat.telefoon || "",
      adres: cd.ot_adres ? `${cd.ot_adres}, ${cd.ot_postcode || ""} ${cd.ot_stad || ""}` : "",
      kvk_nummer: cd.ot_kvk || null,
      btw_nummer: cd.ot_btw || null,
      bedrijfsnaam: cd.ot_handelsnaam || null,
      uurtarief: cd.uurtarief || kandidaat.afgesproken_tarief || null,
      contract_einddatum: contract.status === "ondertekend_beiden" ? (cd.einddatum_raw || null) : null,
      account_status: "onboarding",
      activated_at: new Date().toISOString(),
    }).eq("user_id", newUser.user.id).select("id").single();

    if (profileError) {
      // Rollback: delete the created user
      await supabase.auth.admin.deleteUser(newUser.user.id);
      return new Response(JSON.stringify({ error: "Fout bij aanmaken profiel" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Assign monteur role
    await supabase.from("user_roles").insert({ user_id: newUser.user.id, role: "monteur" });

    // Link profile to kandidaat
    await supabase.from("kandidaten").update({
      profiel_id: profile!.id,
      status: "gecontracteerd",
    }).eq("id", kandidaat_id);

    // Link profile to contract
    await supabase.from("contracten").update({
      profiel_id: profile!.id,
    }).eq("id", contract.id);

    // Send welcome message via mededelingen
    await supabase.from("mededelingen").insert({
      titel: "Welkom bij TerreVolt! 👋",
      inhoud: `Hoi ${kandidaat.voornaam},\n\nWelkom! Je account is aangemaakt en je contract is ondertekend.\n\nVoordat je aan de slag kunt, moet je nog een paar dingen aanvullen:\n- Persoonlijke gegevens controleren\n- Geboortedatum invullen\n- Certificaten uploaden\n- Vragen beantwoorden\n\nLog in en ga naar je profiel om dit te completeren. Je manager verifieert daarna je gegevens zodat je ingepland kunt worden.`,
      verzonden_door: kandidaat.aangemaakt_door,
      ontvanger_type: "persoon",
      ontvanger_id: profile!.id,
      urgentie: "normaal",
    });

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

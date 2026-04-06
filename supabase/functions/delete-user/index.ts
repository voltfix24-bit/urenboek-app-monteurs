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
      return new Response(JSON.stringify({ error: "Te veel verzoeken" }), {
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

    // Get profile id
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (profile) {
      const pid = profile.id;

      // 1. inkooporder_regels → inkooporders
      const { data: orders } = await adminClient.from("inkooporders").select("id").eq("medewerker_id", pid);
      if (orders && orders.length > 0) {
        const ids = orders.map((o: { id: string }) => o.id);
        await adminClient.from("inkooporder_regels").delete().in("inkooporder_id", ids);
      }

      // 2. contract children → contracten (profiel_id, aangemaakt_door, og_profiel_id)
      const { data: allContracts } = await adminClient
        .from("contracten")
        .select("id")
        .or(`profiel_id.eq.${pid},aangemaakt_door.eq.${pid},og_profiel_id.eq.${pid}`);
      if (allContracts && allContracts.length > 0) {
        const cIds = allContracts.map((c: { id: string }) => c.id);
        await adminClient.from("contract_berichten").delete().in("contract_id", cIds);
        await adminClient.from("contract_tokens").delete().in("contract_id", cIds);
      }

      // 3. forecast_regels → profiles
      await adminClient.from("forecast_regels").delete().eq("medewerker_id", pid);

      // 4. Direct profile references
      await adminClient.from("uren_boekingen").delete().eq("medewerker_id", pid);
      await adminClient.from("planning").delete().eq("medewerker_id", pid);
      await adminClient.from("overuren_meldingen").delete().eq("medewerker_id", pid);
      await adminClient.from("beschikbaarheid").delete().eq("medewerker_id", pid);
      await adminClient.from("certificaten").delete().eq("medewerker_id", pid);
      await adminClient.from("mededeling_leesstatus").delete().eq("medewerker_id", pid);
      await adminClient.from("manager_handtekeningen").delete().eq("profiel_id", pid);
      await adminClient.from("inkooporders").delete().eq("medewerker_id", pid);
      await adminClient.from("contracten").delete().eq("profiel_id", pid);
      await adminClient.from("contracten").delete().eq("aangemaakt_door", pid);
      await adminClient.from("contracten").delete().eq("og_profiel_id", pid);
      await adminClient.from("kandidaten").delete().eq("aangemaakt_door", pid);

      // 5. Nullify soft references where this user is referenced but not the owner
      await adminClient.from("beschikbaarheid").update({ behandeld_door: null }).eq("behandeld_door", pid);
      await adminClient.from("overuren_meldingen").update({ behandeld_door: null }).eq("behandeld_door", pid);
      await adminClient.from("uren_boekingen").update({ approved_by: null }).eq("approved_by", pid);
      await adminClient.from("time_entries").update({ approved_by: null }).eq("approved_by", pid);
      await adminClient.from("bedrijfsgegevens").update({ updated_by: null }).eq("updated_by", pid);
      await adminClient.from("profiles").update({ geverifieerd_door: null }).eq("geverifieerd_door", pid);
      await adminClient.from("projects").update({ status_gewijzigd_door: null }).eq("status_gewijzigd_door", pid);
      await adminClient.from("inkooporders").update({ aangemaakt_door: null }).eq("aangemaakt_door", pid);

      // 6. Delete profile
      const { error: profErr } = await adminClient.from("profiles").delete().eq("id", pid);
      if (profErr) {
        console.error("Profile delete error:", JSON.stringify(profErr));
        return new Response(JSON.stringify({ error: `Profiel verwijderen mislukt: ${profErr.message}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Delete auth-level data
    await adminClient.from("user_roles").delete().eq("user_id", userId);

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("Auth delete error:", JSON.stringify(deleteError));
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("delete-user error:", err);
    return new Response(JSON.stringify({ error: err.message || "Onbekende fout" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

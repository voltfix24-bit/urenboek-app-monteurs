import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type DbError = { message: string } | null;
type DbResult<T> = { data: T; error: DbError };

type IdRow = { id: string };

async function mustSucceed<T>(label: string, operation: PromiseLike<DbResult<T>>) {
  const { data, error } = await operation;
  if (error) {
    console.error(`${label} failed:`, error);
    throw new Error(`${label}: ${error.message}`);
  }
  return data;
}

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
    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();

    if (!caller) {
      return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const allowed = await mustSucceed<boolean | null>(
      "Rate limit check",
      adminClient.rpc("check_rate_limit", {
        _key: caller.id,
        _endpoint: "delete-user",
        _limit: 5,
        _window_seconds: 60,
      }),
    );

    if (!allowed) {
      return new Response(JSON.stringify({ error: "Te veel verzoeken" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
      });
    }

    const roleData = await mustSucceed<Array<{ role: string }>>(
      "Manager role check",
      adminClient.from("user_roles").select("role").eq("user_id", caller.id).eq("role", "manager"),
    );

    if (roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Alleen managers mogen gebruikers verwijderen" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: { userId?: string } = {};
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Ongeldige request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = body.userId?.trim();
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

    const profile = await mustSucceed<{ id: string } | null>(
      "Profiel ophalen",
      adminClient.from("profiles").select("id").eq("user_id", userId).maybeSingle(),
    );

    if (profile) {
      const pid = profile.id;

      const [orders, candidatesDirect, contractsByProfile] = await Promise.all([
        mustSucceed<IdRow[]>(
          "Inkooporders ophalen",
          adminClient.from("inkooporders").select("id").eq("medewerker_id", pid),
        ),
        mustSucceed<IdRow[]>(
          "Kandidaten ophalen",
          adminClient.from("kandidaten").select("id").or(`profiel_id.eq.${pid},aangemaakt_door.eq.${pid}`),
        ),
        mustSucceed<IdRow[]>(
          "Contracten ophalen",
          adminClient
            .from("contracten")
            .select("id")
            .or(`profiel_id.eq.${pid},aangemaakt_door.eq.${pid},og_profiel_id.eq.${pid}`),
        ),
      ]);

      const orderIds = [...new Set(orders.map((row) => row.id))];
      const candidateIds = [...new Set(candidatesDirect.map((row) => row.id))];
      const contractIds = new Set(contractsByProfile.map((row) => row.id));

      if (candidateIds.length > 0) {
        const contractsByCandidate = await mustSucceed<IdRow[]>(
          "Contracten per kandidaat ophalen",
          adminClient.from("contracten").select("id").in("kandidaat_id", candidateIds),
        );
        for (const row of contractsByCandidate) {
          contractIds.add(row.id);
        }
      }

      if (orderIds.length > 0) {
        await mustSucceed(
          "Inkooporder regels verwijderen",
          adminClient.from("inkooporder_regels").delete().in("inkooporder_id", orderIds),
        );
      }

      if (contractIds.size > 0) {
        const ids = [...contractIds];
        await Promise.all([
          mustSucceed(
            "Contract berichten verwijderen",
            adminClient.from("contract_berichten").delete().in("contract_id", ids),
          ),
          mustSucceed(
            "Contract tokens verwijderen",
            adminClient.from("contract_tokens").delete().in("contract_id", ids),
          ),
        ]);

        await mustSucceed(
          "Contracten verwijderen",
          adminClient.from("contracten").delete().in("id", ids),
        );
      }

      await Promise.all([
        mustSucceed("Forecast regels verwijderen", adminClient.from("forecast_regels").delete().eq("medewerker_id", pid)),
        mustSucceed("Uren boekingen verwijderen", adminClient.from("uren_boekingen").delete().eq("medewerker_id", pid)),
        mustSucceed("Planning verwijderen", adminClient.from("planning").delete().eq("medewerker_id", pid)),
        mustSucceed("Overuren meldingen verwijderen", adminClient.from("overuren_meldingen").delete().eq("medewerker_id", pid)),
        mustSucceed("Beschikbaarheid verwijderen", adminClient.from("beschikbaarheid").delete().eq("medewerker_id", pid)),
        mustSucceed("Certificaten verwijderen", adminClient.from("certificaten").delete().eq("medewerker_id", pid)),
        mustSucceed("Leesstatus verwijderen", adminClient.from("mededeling_leesstatus").delete().eq("medewerker_id", pid)),
        mustSucceed("Manager handtekening verwijderen", adminClient.from("manager_handtekeningen").delete().eq("profiel_id", pid)),
        mustSucceed("Inkooporders verwijderen", adminClient.from("inkooporders").delete().eq("medewerker_id", pid)),
        mustSucceed("Gerichte mededelingen verwijderen", adminClient.from("mededelingen").delete().eq("ontvanger_id", pid)),
      ]);

      await Promise.all([
        mustSucceed(
          "Beschikbaarheid behandelaar opschonen",
          adminClient.from("beschikbaarheid").update({ behandeld_door: null }).eq("behandeld_door", pid),
        ),
        mustSucceed(
          "Overuren behandelaar opschonen",
          adminClient.from("overuren_meldingen").update({ behandeld_door: null }).eq("behandeld_door", pid),
        ),
        mustSucceed(
          "Uren goedkeurder opschonen",
          adminClient.from("uren_boekingen").update({ approved_by: null }).eq("approved_by", pid),
        ),
        mustSucceed(
          "Time entries goedkeurder opschonen",
          adminClient.from("time_entries").update({ approved_by: null }).eq("approved_by", pid),
        ),
        mustSucceed(
          "Bedrijfsgegevens editor opschonen",
          adminClient.from("bedrijfsgegevens").update({ updated_by: null }).eq("updated_by", pid),
        ),
        mustSucceed(
          "Profiel verifier opschonen",
          adminClient.from("profiles").update({ geverifieerd_door: null }).eq("geverifieerd_door", pid),
        ),
        mustSucceed(
          "Project status editor opschonen",
          adminClient.from("projects").update({ status_gewijzigd_door: null }).eq("status_gewijzigd_door", pid),
        ),
        mustSucceed(
          "Inkooporder maker opschonen",
          adminClient.from("inkooporders").update({ aangemaakt_door: null }).eq("aangemaakt_door", pid),
        ),
        mustSucceed(
          "Planning template maker opschonen",
          adminClient.from("planning_templates").update({ created_by: null }).eq("created_by", pid),
        ),
        mustSucceed(
          "Planning matrix editor opschonen",
          adminClient.from("project_planning_matrix").update({ updated_by: null }).eq("updated_by", pid),
        ),
        mustSucceed(
          "Planning status definitief opschonen",
          adminClient.from("project_planning_status").update({ definitief_door: null }).eq("definitief_door", pid),
        ),
        mustSucceed(
          "Spec code editor opschonen",
          adminClient.from("spec_code_tarieven").update({ updated_by: null }).eq("updated_by", pid),
        ),
      ]);

      if (candidateIds.length > 0) {
        await mustSucceed(
          "Kandidaten verwijderen",
          adminClient.from("kandidaten").delete().in("id", candidateIds),
        );
      }

      await mustSucceed("Profiel verwijderen", adminClient.from("profiles").delete().eq("id", pid));
    }

    await mustSucceed("User roles verwijderen", adminClient.from("user_roles").delete().eq("user_id", userId));

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("Auth delete error:", deleteError);
      return new Response(JSON.stringify({ error: `Auth gebruiker verwijderen mislukt: ${deleteError.message}` }), {
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
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Onbekende fout bij verwijderen" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

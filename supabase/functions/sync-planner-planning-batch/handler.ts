// Pure handler-factory voor sync-planner-planning-batch.
// Synchroniseert alleen Planner-regels met status 'nieuw'.
// Weigert de hele batch als er binnen het bereik conflicts, problemen of verwijderd_in_planner zijn.
// Vertrouwt geen browserdata behalve datumbereik, optionele external_ids en limiet.

import {
  classify,
  parseDateRange,
  VOORGESTELDE_START,
  VOORGESTELDE_EIND,
  type PlannerPlanningItem,
  type PlannerUitgeslotenItem,
  type BestaandePlanningRow,
  type ProjectMini,
  type ProfileMini,
  type PreviewRegel,
} from "./classifier.ts";

export const BATCH_LIMIT_MAX = 25;

export interface SupabaseLikeClient {
  from: (table: string) => any;
  auth: { getClaims: (token: string) => Promise<{ data: any; error: any }> };
  rpc: (name: string, args: any) => Promise<{ data: any; error: any }>;
}

export interface Deps {
  supaUser: (authHeader: string) => SupabaseLikeClient;
  supaAdmin: () => SupabaseLikeClient;
  fetchPlannerPlanning: (range: { datum_vanaf: string; datum_tot: string }) => Promise<{
    ok: boolean;
    status: number;
    payload: { planning?: PlannerPlanningItem[]; uitgesloten?: PlannerUitgeslotenItem[] } | null;
  }>;
  env: (k: string) => string | undefined;
  corsHeaders: Record<string, string>;
}

export type BatchUitkomst =
  | "gesynchroniseerd"
  | "reeds_gesynchroniseerd"
  | "geweigerd"
  | "fout";

export interface BatchRegelResultaat {
  external_id: string;
  datum: string;
  uitkomst: BatchUitkomst;
  planning_id: string | null;
  fout_reden?: string;
}

export function createHandler(deps: Deps) {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...deps.corsHeaders, "content-type": "application/json" },
    });

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: deps.corsHeaders });
    if (req.method !== "POST") return json(405, { error: "Method not allowed" });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    if (!deps.env("URENAPP_SYNC_SECRET")) return json(500, { error: "Server misconfigured" });

    const supaUser = deps.supaUser(authHeader);
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supaUser.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return json(401, { error: "Unauthorized" });
    const userId = claimsData.claims.sub as string;

    const supaAdmin = deps.supaAdmin();

    const { data: roleRow, error: roleErr } = await supaAdmin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", userId)
      .eq("role", "manager")
      .maybeSingle();
    if (roleErr) return json(500, { error: "Role check failed" });
    if (!roleRow) return json(403, { error: "Forbidden: manager required" });

    const { data: rateOk, error: rateErr } = await supaAdmin.rpc("check_rate_limit", {
      _key: `user:${userId}`,
      _endpoint: "sync-planner-planning-batch",
      _limit: 5,
      _window_seconds: 60,
    });
    if (rateErr) return json(500, { error: "Rate-limit check failed" });
    if (rateOk === false) return json(429, { error: "Te veel verzoeken" });

    let body: any;
    try { body = await req.json(); } catch { return json(400, { error: "Ongeldige JSON" }); }
    const parsed = parseDateRange(body);
    if (!parsed.ok) return json(400, { error: parsed.error });
    const { datum_vanaf, datum_tot } = parsed.value;

    // Limit
    let limit = BATCH_LIMIT_MAX;
    if (body?.limit !== undefined) {
      const n = Number(body.limit);
      if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) {
        return json(400, { error: "Ongeldige limit" });
      }
      limit = Math.min(BATCH_LIMIT_MAX, n);
    }

    // Optionele external_ids
    let externalIdsFilter: Set<string> | null = null;
    if (body?.external_ids !== undefined) {
      if (!Array.isArray(body.external_ids)) return json(400, { error: "external_ids moet een array zijn" });
      if (body.external_ids.length > BATCH_LIMIT_MAX) {
        return json(400, { error: `Maximaal ${BATCH_LIMIT_MAX} external_ids` });
      }
      const set = new Set<string>();
      for (const v of body.external_ids) {
        if (typeof v !== "string" || v.length === 0 || v.length > 256) {
          return json(400, { error: "Ongeldige external_id in lijst" });
        }
        set.add(v);
      }
      externalIdsFilter = set;
    }

    // Planner-data live ophalen.
    const plannerResp = await deps.fetchPlannerPlanning({ datum_vanaf, datum_tot });
    if (!plannerResp.ok) {
      return json(502, { error: "Planner-endpoint gaf een fout", status: plannerResp.status });
    }
    const planner: PlannerPlanningItem[] = Array.isArray(plannerResp.payload?.planning) ? plannerResp.payload!.planning! : [];
    const uitgesloten: PlannerUitgeslotenItem[] = Array.isArray(plannerResp.payload?.uitgesloten) ? plannerResp.payload!.uitgesloten! : [];

    // Lokale data laden.
    const [{ data: projs, error: pErr }, { data: profs, error: prErr }, { data: bestaande, error: bErr }] = await Promise.all([
      supaAdmin.from("projects").select("id, nummer, naam, planner_project_id, planner_sync_enabled, planner_sync_exclusion_reason"),
      supaAdmin.from("profiles").select("id, user_id, full_name, planner_monteur_id"),
      supaAdmin.from("planning")
        .select("id, datum, starttijd, eindtijd, notitie, project_id, medewerker_id, activiteit, activiteit_kleur, external_source, external_id")
        .gte("datum", datum_vanaf).lte("datum", datum_tot),
    ]);
    if (pErr || prErr || bErr) return json(500, { error: "Kon urenapp-data niet laden" });

    const projecten: ProjectMini[] = (projs ?? []).map((p: any) => ({
      id: p.id, nummer: p.nummer ?? "", naam: p.naam ?? "",
      planner_project_id: p.planner_project_id ?? null,
      planner_sync_enabled: p.planner_sync_enabled !== false,
      planner_sync_exclusion_reason: p.planner_sync_exclusion_reason ?? null,
    }));
    const profielen: ProfileMini[] = (profs ?? []).map((p: any) => ({
      id: p.id, full_name: p.full_name ?? "",
      planner_monteur_id: p.planner_monteur_id ?? null,
    }));
    const bestaandeRows: BestaandePlanningRow[] = (bestaande ?? []).map((r: any) => ({
      id: r.id, datum: r.datum, starttijd: r.starttijd, eindtijd: r.eindtijd,
      notitie: r.notitie ?? "", project_id: r.project_id, medewerker_id: r.medewerker_id,
      activiteit: r.activiteit ?? null, activiteit_kleur: r.activiteit_kleur ?? null,
      external_source: r.external_source ?? null, external_id: r.external_id ?? null,
    }));

    const classified = classify({
      datum_vanaf, datum_tot, planner, uitgesloten,
      bestaande: bestaandeRows, projecten, profielen,
    });

    // Batch-precheck: hele bereik moet schoon zijn.
    if (
      classified.aantallen.conflict > 0 ||
      classified.aantallen.verwijderd_in_planner > 0 ||
      classified.aantallen.gewijzigd > 0
    ) {
      return json(409, {
        error: "Batch geweigerd: bereik bevat conflicten, gewijzigd of verwijderd_in_planner",
        aantallen: classified.aantallen,
      });
    }

    // Kandidaten: alle 'nieuw' regels (optioneel gefilterd op external_ids), tot limit.
    let kandidaten: PreviewRegel[] = classified.regels.filter(r => r.status === "nieuw");
    if (externalIdsFilter) {
      const missing: string[] = [];
      for (const id of externalIdsFilter) {
        if (!kandidaten.some(k => k.external_id === id)) missing.push(id);
      }
      if (missing.length > 0) {
        return json(409, { error: "Sommige external_ids hebben geen status 'nieuw'", missing });
      }
      kandidaten = kandidaten.filter(r => externalIdsFilter!.has(r.external_id));
    }

    if (kandidaten.length === 0) {
      return json(200, {
        success: true,
        verwerkt: 0,
        aantallen: { gesynchroniseerd: 0, reeds_gesynchroniseerd: 0, geweigerd: 0, fout: 0 },
        resultaten: [] as BatchRegelResultaat[],
        limit,
      });
    }

    if (kandidaten.length > limit) kandidaten = kandidaten.slice(0, limit);

    // Manager-profiel ophalen.
    const { data: managerProfile, error: mpErr } = await supaAdmin
      .from("profiles").select("id").eq("user_id", userId).maybeSingle();
    if (mpErr || !managerProfile?.id) return json(500, { error: "Managerprofiel niet gevonden" });

    const resultaten: BatchRegelResultaat[] = [];
    const tellers = { gesynchroniseerd: 0, reeds_gesynchroniseerd: 0, geweigerd: 0, fout: 0 };

    // Audit-helper
    const audit = async (
      uitkomst: BatchUitkomst,
      external_id: string,
      datum: string,
      planning_id: string | null,
      fout?: string,
    ) => {
      const { error } = await supaAdmin.from("planner_planning_sync_audit").insert({
        manager_user_id: userId,
        external_id,
        datum,
        planning_id,
        uitkomst,
        fout_reden: fout ?? null,
      });
      if (error) console.error("audit insert error:", error.message);
    };

    for (const regel of kandidaten) {
      // Defensieve hercheck (race-vrij: RPC vergrendelt + valideert opnieuw).
      if (!regel.urenapp_project_id || !regel.urenapp_profile_id) {
        tellers.geweigerd++;
        resultaten.push({
          external_id: regel.external_id, datum: regel.datum,
          uitkomst: "geweigerd", planning_id: null, fout_reden: "ontbrekende_koppeling",
        });
        await audit("geweigerd", regel.external_id, regel.datum, null, "ontbrekende_koppeling");
        continue;
      }

      try {
        const { data: rpcData, error: rpcErr } = await supaAdmin.rpc("sync_planner_planning_item_v1", {
          _manager_profile_id: managerProfile.id,
          _external_id: regel.external_id,
          _datum: regel.datum,
          _project_id: regel.urenapp_project_id,
          _medewerker_id: regel.urenapp_profile_id,
          _activiteit: regel.activiteit ?? null,
          _kleur: regel.kleur ?? null,
          _notitie: regel.notitie ?? "",
        });

        if (rpcErr) {
          tellers.fout++;
          resultaten.push({
            external_id: regel.external_id, datum: regel.datum,
            uitkomst: "fout", planning_id: null, fout_reden: "rpc_fout",
          });
          await audit("fout", regel.external_id, regel.datum, null, "rpc_fout");
          continue;
        }
        const u = (rpcData?.uitkomst ?? "fout") as BatchUitkomst;
        const planning_id = (rpcData?.planning_id as string | undefined) ?? null;
        const fout_reden = rpcData?.fout_reden as string | undefined;

        if (u === "gesynchroniseerd") tellers.gesynchroniseerd++;
        else if (u === "reeds_gesynchroniseerd") tellers.reeds_gesynchroniseerd++;
        else if (u === "geweigerd") tellers.geweigerd++;
        else tellers.fout++;

        resultaten.push({
          external_id: regel.external_id, datum: regel.datum,
          uitkomst: u, planning_id, fout_reden,
        });
        await audit(u, regel.external_id, regel.datum, planning_id, fout_reden);
      } catch (e) {
        tellers.fout++;
        resultaten.push({
          external_id: regel.external_id, datum: regel.datum,
          uitkomst: "fout", planning_id: null, fout_reden: "exception",
        });
        await audit("fout", regel.external_id, regel.datum, null, "exception");
        console.error("batch regel exception:", (e as Error).message);
      }
    }

    return json(200, {
      success: true,
      verwerkt: resultaten.length,
      aantallen: tellers,
      resultaten,
      limit,
      voorgesteld: { starttijd: VOORGESTELDE_START, eindtijd: VOORGESTELDE_EIND },
    });
  };
}

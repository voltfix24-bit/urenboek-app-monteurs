// Handler-factory: pure logica, IO via deps.
import { classify, parseDateRange, type PlannerPlanningItem, type PlannerUitgeslotenItem, type BestaandePlanningRow, type ProjectMini, type ProfileMini } from "./classifier.ts";

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
    payload: { planning?: PlannerPlanningItem[]; uitgesloten?: PlannerUitgeslotenItem[]; problemen?: any[] } | null;
  }>;
  env: (k: string) => string | undefined;
  corsHeaders: Record<string, string>;
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
      _endpoint: "preview-planner-planning",
      _limit: 10,
      _window_seconds: 60,
    });
    if (rateErr) return json(500, { error: "Rate-limit check failed" });
    if (rateOk === false) return json(429, { error: "Te veel verzoeken" });

    let body: any;
    try { body = await req.json(); } catch { return json(400, { error: "Ongeldige JSON" }); }
    const parsed = parseDateRange(body);
    if (!parsed.ok) return json(400, { error: parsed.error });
    const { datum_vanaf, datum_tot } = parsed.value;

    const plannerResp = await deps.fetchPlannerPlanning({ datum_vanaf, datum_tot });
    if (!plannerResp.ok) return json(502, { error: "Planner-endpoint gaf een fout", status: plannerResp.status });
    const planner: PlannerPlanningItem[] = Array.isArray(plannerResp.payload?.planning) ? plannerResp.payload!.planning! : [];
    const uitgesloten: PlannerUitgeslotenItem[] = Array.isArray(plannerResp.payload?.uitgesloten) ? plannerResp.payload!.uitgesloten! : [];

    const [{ data: projs, error: pErr }, { data: profs, error: prErr }, { data: bestaande, error: bErr }] = await Promise.all([
      supaAdmin.from("projects").select("id, nummer, naam, planner_project_id, planner_sync_enabled, planner_sync_exclusion_reason"),
      supaAdmin.from("profiles").select("id, full_name, planner_monteur_id"),
      supaAdmin
        .from("planning")
        .select("id, datum, starttijd, eindtijd, notitie, project_id, medewerker_id, activiteit, activiteit_kleur, external_source, external_id")
        .gte("datum", datum_vanaf)
        .lte("datum", datum_tot),
    ]);
    if (pErr || prErr || bErr) return json(500, { error: "Kon urenapp-data niet laden" });

    const projecten: ProjectMini[] = (projs ?? []).map((p: any) => ({
      id: p.id,
      nummer: p.nummer ?? "",
      naam: p.naam ?? "",
      planner_project_id: p.planner_project_id ?? null,
      planner_sync_enabled: p.planner_sync_enabled !== false,
      planner_sync_exclusion_reason: p.planner_sync_exclusion_reason ?? null,
    }));
    const profielen: ProfileMini[] = (profs ?? []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name ?? "",
      planner_monteur_id: p.planner_monteur_id ?? null,
    }));
    const bestaandeRows: BestaandePlanningRow[] = (bestaande ?? []).map((r: any) => ({
      id: r.id, datum: r.datum, starttijd: r.starttijd, eindtijd: r.eindtijd,
      notitie: r.notitie ?? "", project_id: r.project_id, medewerker_id: r.medewerker_id,
      activiteit: r.activiteit ?? null, activiteit_kleur: r.activiteit_kleur ?? null,
      external_source: r.external_source ?? null, external_id: r.external_id ?? null,
    }));

    const result = classify({
      datum_vanaf, datum_tot,
      planner, uitgesloten,
      bestaande: bestaandeRows, projecten, profielen,
    });
    return json(200, { success: true, ...result });
  };
}

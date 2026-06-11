// Pure, testbare orchestratie van Planner-synchronisatie.
// Edge function injecteert fetch en db-callbacks → makkelijk te mocken.

export type Actie = "projecten" | "monteurs" | "alles";

export interface PlannerProjectPayload {
  urenapp_project_id: string;
  nummer: string;
  naam: string;
  stationsnaam: string | null;
  straat: string | null;
  postcode: string | null;
  stad: string | null;
  jaar: number;
  actief: boolean;
}

export interface PlannerMonteurPayload {
  urenapp_profile_id: string;
  naam: string;
  type: "montagemonteur" | "schakelmonteur";
  actief: boolean;
  werkdagen: number[];
}

export interface PlannerResponse {
  planner_id: string;
  urenapp_id: string;
  action: "created" | "updated";
}

export interface ProjectRow {
  id: string;
  nummer: string;
  naam: string;
  stationsnaam: string | null;
  straat: string | null;
  postcode: string | null;
  stad: string | null;
  active: boolean;
  projectjaar: number | null;
}

export interface MonteurRow {
  id: string;
  full_name: string;
  account_status: string;
  is_onderaannemer: boolean;
  vaste_vrije_dagen: number[];
  roles: string[];
}

// ─── Pure helpers (gespiegeld vanuit src/lib/plannerSync.ts) ───────────────

export function berekenWerkdagen(vrij: number[] | undefined | null): number[] {
  const set = new Set(vrij ?? []);
  return [1, 2, 3, 4, 5].filter(d => !set.has(d));
}

export function mapMonteurType(roles: string[]): "montagemonteur" | "schakelmonteur" | null {
  if (roles.includes("schakelmonteur")) return "schakelmonteur";
  if (roles.includes("monteur")) return "montagemonteur";
  return null;
}

export function isPlanbareMonteur(m: MonteurRow): boolean {
  if (m.is_onderaannemer) return false;
  if (m.roles.includes("manager")) return false;
  return m.roles.includes("monteur") || m.roles.includes("schakelmonteur");
}

export function magProjectSync(p: ProjectRow): boolean {
  return p.projectjaar != null && p.projectjaar >= 2000 && p.projectjaar <= 2100;
}

export function buildProjectPayload(p: ProjectRow): PlannerProjectPayload {
  return {
    urenapp_project_id: p.id,
    nummer: p.nummer,
    naam: p.naam,
    stationsnaam: p.stationsnaam,
    straat: p.straat,
    postcode: p.postcode,
    stad: p.stad,
    jaar: p.projectjaar as number,
    actief: p.active,
  };
}

export function buildMonteurPayload(m: MonteurRow): PlannerMonteurPayload {
  return {
    urenapp_profile_id: m.id,
    naam: m.full_name,
    type: mapMonteurType(m.roles)!,
    actief: m.account_status === "active",
    werkdagen: berekenWerkdagen(m.vaste_vrije_dagen),
  };
}

// ─── HTTP send met 429 retry ──────────────────────────────────────────────

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface SendOptions {
  endpoint: string;
  secret: string;
  fetchImpl: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  maxRetry429?: number;
}

export interface SendResult {
  ok: boolean;
  status: number;
  planner_id?: string;
  urenapp_id?: string;
  action?: "created" | "updated";
  error?: string;
}

export async function sendOne(
  kind: "project" | "monteur",
  payload: PlannerProjectPayload | PlannerMonteurPayload,
  opts: SendOptions,
): Promise<SendResult> {
  const maxRetry = opts.maxRetry429 ?? 2;
  const sleep = opts.sleep ?? ((ms) => new Promise(r => setTimeout(r, ms)));
  let attempt = 0;
  // attempts: 1 initial + maxRetry retries when 429
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt++;
    let res: Response;
    try {
      res = await opts.fetchImpl(opts.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-urenapp-secret": opts.secret,
        },
        body: JSON.stringify({ kind, payload }),
      });
    } catch (e) {
      return { ok: false, status: 0, error: `Netwerkfout: ${(e as Error).message}` };
    }

    if (res.status === 429 && attempt <= maxRetry) {
      await res.text().catch(() => {});
      await sleep(500 * attempt);
      continue;
    }

    let body: any = null;
    try { body = await res.json(); } catch { /* ignore */ }

    if (!res.ok) {
      const msg = body?.error || `HTTP ${res.status}`;
      return { ok: false, status: res.status, error: typeof msg === "string" ? msg : JSON.stringify(msg) };
    }

    if (!body || typeof body.planner_id !== "string" || typeof body.urenapp_id !== "string" || typeof body.action !== "string") {
      return { ok: false, status: res.status, error: "Response mist planner_id/urenapp_id/action" };
    }

    const expected = kind === "project"
      ? (payload as PlannerProjectPayload).urenapp_project_id
      : (payload as PlannerMonteurPayload).urenapp_profile_id;
    if (body.urenapp_id !== expected) {
      return { ok: false, status: res.status, error: `urenapp_id mismatch: kreeg ${body.urenapp_id}, verwacht ${expected}` };
    }

    return {
      ok: true,
      status: res.status,
      planner_id: body.planner_id,
      urenapp_id: body.urenapp_id,
      action: body.action,
    };
  }
}

// ─── Concurrency-pool ─────────────────────────────────────────────────────

export async function runPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(runners);
  return results;
}

// ─── Orchestrator (project- + monteur-batch) ──────────────────────────────

export interface ResultaatItem {
  kind: "project" | "monteur";
  urenapp_id: string;
  status: "gesynchroniseerd" | "overgeslagen" | "mislukt";
  planner_id?: string;
  action?: "created" | "updated";
  reden?: string;
}

export interface OrchestratorAantallen {
  gevonden: number;
  gesynchroniseerd: number;
  overgeslagen: number;
  mislukt: number;
}

export interface OrchestratorResult {
  resultaten: ResultaatItem[];
  fouten: { urenapp_id: string; kind: "project" | "monteur"; reden: string }[];
  aantallen: OrchestratorAantallen;
}

export interface OrchestratorDeps {
  endpoint: string;
  secret: string;
  fetchImpl: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  concurrency?: number;
  dryRun: boolean;
  // DB-update callbacks: alleen aangeroepen bij echte sync (geen dry-run)
  writePlannerProjectId?: (urenappId: string, plannerId: string) => Promise<void>;
  writePlannerMonteurId?: (urenappId: string, plannerId: string) => Promise<void>;
}

export async function synchroniseer(
  projects: ProjectRow[],
  monteurs: MonteurRow[],
  deps: OrchestratorDeps,
): Promise<OrchestratorResult> {
  const resultaten: ResultaatItem[] = [];
  const fouten: { urenapp_id: string; kind: "project" | "monteur"; reden: string }[] = [];
  const concurrency = deps.concurrency ?? 5;

  // ── Projecten ──
  const projectJobs = projects.map(p => {
    if (!magProjectSync(p)) {
      const item: ResultaatItem = {
        kind: "project",
        urenapp_id: p.id,
        status: "overgeslagen",
        reden: "projectjaar_ontbreekt",
      };
      resultaten.push(item);
      return null;
    }
    return p;
  }).filter((p): p is ProjectRow => p != null);

  const projRes = await runPool(projectJobs, concurrency, async (p) => {
    if (deps.dryRun) {
      return { p, result: { ok: true, status: 200, planner_id: "(dry-run)", urenapp_id: p.id, action: "updated" as const } as SendResult };
    }
    const payload = buildProjectPayload(p);
    const result = await sendOne("project", payload, { endpoint: deps.endpoint, secret: deps.secret, fetchImpl: deps.fetchImpl, sleep: deps.sleep });
    return { p, result };
  });

  for (const { p, result } of projRes) {
    if (result.ok && result.planner_id) {
      resultaten.push({
        kind: "project",
        urenapp_id: p.id,
        status: "gesynchroniseerd",
        planner_id: result.planner_id,
        action: result.action,
      });
      if (!deps.dryRun && deps.writePlannerProjectId && result.planner_id !== "(dry-run)") {
        try { await deps.writePlannerProjectId(p.id, result.planner_id); }
        catch (e) {
          fouten.push({ urenapp_id: p.id, kind: "project", reden: `DB-update mislukt: ${(e as Error).message}` });
        }
      }
    } else {
      resultaten.push({ kind: "project", urenapp_id: p.id, status: "mislukt", reden: result.error });
      fouten.push({ urenapp_id: p.id, kind: "project", reden: result.error || "onbekend" });
    }
  }

  // ── Monteurs ──
  const monteurJobs = monteurs.map(m => {
    if (!isPlanbareMonteur(m)) {
      const reden = m.is_onderaannemer
        ? "onderaannemer_bedrijfsaccount"
        : m.roles.includes("manager")
          ? "ook_manager"
          : "rol_niet_planbaar";
      resultaten.push({ kind: "monteur", urenapp_id: m.id, status: "overgeslagen", reden });
      return null;
    }
    if (!mapMonteurType(m.roles)) {
      resultaten.push({ kind: "monteur", urenapp_id: m.id, status: "overgeslagen", reden: "geen_monteurtype" });
      return null;
    }
    return m;
  }).filter((m): m is MonteurRow => m != null);

  const monRes = await runPool(monteurJobs, concurrency, async (m) => {
    if (deps.dryRun) {
      return { m, result: { ok: true, status: 200, planner_id: "(dry-run)", urenapp_id: m.id, action: "updated" as const } as SendResult };
    }
    const payload = buildMonteurPayload(m);
    const result = await sendOne("monteur", payload, { endpoint: deps.endpoint, secret: deps.secret, fetchImpl: deps.fetchImpl, sleep: deps.sleep });
    return { m, result };
  });

  for (const { m, result } of monRes) {
    if (result.ok && result.planner_id) {
      resultaten.push({
        kind: "monteur",
        urenapp_id: m.id,
        status: "gesynchroniseerd",
        planner_id: result.planner_id,
        action: result.action,
      });
      if (!deps.dryRun && deps.writePlannerMonteurId && result.planner_id !== "(dry-run)") {
        try { await deps.writePlannerMonteurId(m.id, result.planner_id); }
        catch (e) {
          fouten.push({ urenapp_id: m.id, kind: "monteur", reden: `DB-update mislukt: ${(e as Error).message}` });
        }
      }
    } else {
      resultaten.push({ kind: "monteur", urenapp_id: m.id, status: "mislukt", reden: result.error });
      fouten.push({ urenapp_id: m.id, kind: "monteur", reden: result.error || "onbekend" });
    }
  }

  const aantallen: OrchestratorAantallen = {
    gevonden: projects.length + monteurs.length,
    gesynchroniseerd: resultaten.filter(r => r.status === "gesynchroniseerd").length,
    overgeslagen: resultaten.filter(r => r.status === "overgeslagen").length,
    mislukt: resultaten.filter(r => r.status === "mislukt").length,
  };

  return { resultaten, fouten, aantallen };
}

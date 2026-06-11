// Tests via handler-factory met geïnjecteerde mocks.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createHandler, type Deps } from "./handler.ts";

interface MockState {
  projects: any[];
  profiles: any[];
  roles: { user_id: string; role: string }[];
  audit: any[];
  plannerProjects: any[];
  plannerMonteurs: any[];
  plannerLinkResponse: { ok: boolean; status: number };
  plannerLinkCalls: number;
  rateLimitOk: boolean;
}

let state: MockState;
function freshState(): MockState {
  return {
    projects: [],
    profiles: [],
    roles: [],
    audit: [],
    plannerProjects: [],
    plannerMonteurs: [],
    plannerLinkResponse: { ok: true, status: 200 },
    plannerLinkCalls: 0,
    rateLimitOk: true,
  };
}

function makeClient() {
  const tableProxy = (table: string) => {
    const filters: { col: string; op: string; val: any }[] = [];
    let mode: "select" | "update" | "insert" = "select";
    let updates: any = null;
    let inserts: any = null;

    const baseRows = (): any[] => {
      if (table === "projects") return state.projects;
      if (table === "profiles") return state.profiles;
      if (table === "user_roles") return state.roles;
      if (table === "planner_match_audit") return state.audit;
      return [];
    };
    const match = (r: any) =>
      filters.every((f) => {
        if (f.op === "eq") return r[f.col] === f.val;
        if (f.op === "is_null") return r[f.col] == null;
        return true;
      });
    const exec = async () => {
      const rows = baseRows();
      if (mode === "select") return { data: rows.filter(match), error: null };
      if (mode === "update") {
        const matched = rows.filter(match);
        for (const r of matched) Object.assign(r, updates);
        return { data: matched, error: null };
      }
      if (mode === "insert") {
        const arr = Array.isArray(inserts) ? inserts : [inserts];
        if (table === "planner_match_audit") state.audit.push(...arr);
        return { data: arr, error: null };
      }
      return { data: null, error: null };
    };

    const builder: any = {
      select(_c: string) { return builder; },
      eq(col: string, val: any) { filters.push({ col, op: "eq", val }); return builder; },
      is(col: string, val: any) { if (val === null) filters.push({ col, op: "is_null", val: null }); return builder; },
      update(u: any) { mode = "update"; updates = u; return builder; },
      insert(rows: any) { mode = "insert"; inserts = rows; return builder; },
      async maybeSingle() {
        const { data, error } = await exec();
        return { data: (data && data[0]) ?? null, error };
      },
      then(resolve: any, reject: any) { return exec().then(resolve, reject); },
    };
    return builder;
  };
  return {
    from: tableProxy,
    auth: { getClaims: async () => ({ data: { claims: { sub: "user-1" } }, error: null }) },
    rpc: async (name: string) =>
      name === "check_rate_limit" ? { data: state.rateLimitOk, error: null } : { data: null, error: null },
  };
}

function makeDeps(): Deps {
  return {
    env: (k) => (k === "URENAPP_SYNC_SECRET" ? "secret" : undefined),
    corsHeaders: {},
    supaUser: () => makeClient() as any,
    supaAdmin: () => makeClient() as any,
    fetchPlannerList: async () => ({
      ok: true,
      status: 200,
      payload: { projecten: state.plannerProjects, monteurs: state.plannerMonteurs },
    }),
    fetchPlannerLink: async () => {
      state.plannerLinkCalls++;
      return state.plannerLinkResponse;
    },
  };
}

function postReq(body: any, method = "POST"): Request {
  return new Request("http://x/", {
    method,
    headers: { Authorization: "Bearer t" },
    body: method === "POST" ? JSON.stringify(body) : null,
  });
}
function seedManager() { state.roles.push({ user_id: "user-1", role: "manager" }); }
function seedProject(o: Partial<any> = {}) {
  state.projects.push({
    id: "uuid-proj",
    nummer: "001", naam: "Project X", projectjaar: 2025,
    planner_project_id: null, stad: "Den Haag",
    planner_sync_enabled: true, planner_sync_exclusion_reason: null,
    ...o,
  });
}
function seedPlannerProject(o: Partial<any> = {}) {
  state.plannerProjects.push({
    planner_id: "pl-1", urenapp_project_id: null,
    nummer: "001", naam: "Project X", locatie: "Den Haag", jaar: 2025,
    ...o,
  });
}

const PROJ = "11111111-1111-1111-1111-111111111111";
function call(body: any, method = "POST") {
  return createHandler(makeDeps())(postReq(body, method));
}

Deno.test("GET → 405", async () => {
  state = freshState();
  const r = await call(null, "GET");
  assertEquals(r.status, 405);
  await r.text();
});

Deno.test("ontbrekend auth → 401", async () => {
  state = freshState();
  const r = await createHandler(makeDeps())(
    new Request("http://x/", { method: "POST", body: "{}" }),
  );
  assertEquals(r.status, 401);
  await r.text();
});

Deno.test("non-manager → 403", async () => {
  state = freshState();
  const r = await call({ kind: "project", urenapp_id: PROJ, planner_id: "pl-1" });
  assertEquals(r.status, 403);
  await r.text();
});

Deno.test("ongeldige body → 400", async () => {
  state = freshState(); seedManager();
  const r = await call({ kind: "x" as any, urenapp_id: PROJ, planner_id: "pl-1" });
  assertEquals(r.status, 400);
  await r.text();
});

Deno.test("succesvolle project-koppeling (exact)", async () => {
  state = freshState(); seedManager();
  seedProject({ id: PROJ });
  seedPlannerProject();
  const r = await call({ kind: "project", urenapp_id: PROJ, planner_id: "pl-1" });
  assertEquals(r.status, 200);
  const body = await r.json();
  assertEquals(body.gekoppeld, true);
  assertEquals(body.status, "exact");
  assertEquals(state.projects[0].planner_project_id, "pl-1");
  assertEquals(state.plannerLinkCalls, 1);
  assert(state.audit.some((a) => a.uitkomst === "gekoppeld"));
});

Deno.test("reeds wederzijds gekoppeld → 200 reeds_gekoppeld", async () => {
  state = freshState(); seedManager();
  seedProject({ id: PROJ, planner_project_id: "pl-1" });
  seedPlannerProject({ urenapp_project_id: PROJ });
  const r = await call({ kind: "project", urenapp_id: PROJ, planner_id: "pl-1" });
  assertEquals(r.status, 200);
  const body = await r.json();
  assertEquals(body.reeds_gekoppeld, true);
  assertEquals(state.plannerLinkCalls, 0);
});

Deno.test("stale analyse (planner_id wijkt af) → 409", async () => {
  state = freshState(); seedManager();
  seedProject({ id: PROJ });
  seedPlannerProject({ planner_id: "pl-1" });
  const r = await call({ kind: "project", urenapp_id: PROJ, planner_id: "pl-OTHER" });
  assertEquals(r.status, 409);
  await r.text();
});

Deno.test("urenapp al anders gekoppeld → 409", async () => {
  state = freshState(); seedManager();
  seedProject({ id: PROJ, planner_project_id: "pl-OTHER" });
  seedPlannerProject({ planner_id: "pl-1" });
  const r = await call({ kind: "project", urenapp_id: PROJ, planner_id: "pl-1" });
  assertEquals(r.status, 409);
  await r.text();
});

Deno.test("Planner-record al anders gekoppeld → 409", async () => {
  state = freshState(); seedManager();
  seedProject({ id: PROJ });
  seedPlannerProject({ urenapp_project_id: "22222222-2222-2222-2222-222222222222" });
  const r = await call({ kind: "project", urenapp_id: PROJ, planner_id: "pl-1" });
  assertEquals(r.status, 409);
  await r.text();
});

Deno.test("Planner-write faalt → rollback en 502", async () => {
  state = freshState(); seedManager();
  seedProject({ id: PROJ });
  seedPlannerProject();
  state.plannerLinkResponse = { ok: false, status: 500 };
  const r = await call({ kind: "project", urenapp_id: PROJ, planner_id: "pl-1" });
  assertEquals(r.status, 502);
  assertEquals(state.projects[0].planner_project_id, null);
  assert(state.audit.some((a) => a.uitkomst === "rolled_back"));
  await r.text();
});

Deno.test("uitgesloten project → 409", async () => {
  state = freshState(); seedManager();
  seedProject({ id: PROJ, planner_sync_enabled: false, planner_sync_exclusion_reason: "historisch_afgerond" });
  seedPlannerProject();
  const r = await call({ kind: "project", urenapp_id: PROJ, planner_id: "pl-1" });
  assertEquals(r.status, 409);
  await r.text();
});

Deno.test("dubbele klik: tweede call → reeds_gekoppeld", async () => {
  state = freshState(); seedManager();
  seedProject({ id: PROJ });
  seedPlannerProject();
  const r1 = await call({ kind: "project", urenapp_id: PROJ, planner_id: "pl-1" });
  assertEquals(r1.status, 200);
  await r1.text();
  // Planner-zijde is nu ook gekoppeld (zou de echte Planner-endpoint hebben gedaan).
  state.plannerProjects[0].urenapp_project_id = PROJ;
  const r2 = await call({ kind: "project", urenapp_id: PROJ, planner_id: "pl-1" });
  assertEquals(r2.status, 200);
  const body = await r2.json();
  assertEquals(body.reeds_gekoppeld, true);
});

Deno.test("rate-limit hit → 429", async () => {
  state = freshState(); seedManager();
  state.rateLimitOk = false;
  const r = await call({ kind: "project", urenapp_id: PROJ, planner_id: "pl-1" });
  assertEquals(r.status, 429);
  await r.text();
});

Deno.test("urenapp-record niet gevonden → 404", async () => {
  state = freshState(); seedManager();
  seedPlannerProject();
  const r = await call({ kind: "project", urenapp_id: PROJ, planner_id: "pl-1" });
  assertEquals(r.status, 404);
  await r.text();
});

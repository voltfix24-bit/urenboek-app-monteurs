// Integration tests voor confirm-planner-match.
// We mocken fetch (Planner-endpoints) en de Supabase-client globaal via een
// import-shim. De handler in index.ts wordt dynamisch geïmporteerd nadat de
// mocks zijn geïnstalleerd.
//
// Scenario's:
//  - succesvolle koppeling (project)
//  - reeds wederzijds gekoppeld → 200 reeds_gekoppeld
//  - stale analyse (kandidaat planner_id wijkt af) → 409
//  - urenapp al anders gekoppeld → 409
//  - Planner-write faalt → rollback en 502
//  - non-manager → 403
//  - uitgesloten project → 409
//  - dubbele klik (tweede call vindt al gekoppeld) → 200 reeds_gekoppeld
//  - geen POST → 405

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

type FetchHandler = (url: string, init?: RequestInit) => Promise<Response>;

interface MockState {
  projects: any[];
  profiles: any[];
  roles: { user_id: string; role: string }[];
  audit: any[];
  plannerProjects: any[];
  plannerMonteurs: any[];
  plannerLinkResponse: { status: number; body?: any };
  isManager: boolean;
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
    plannerLinkResponse: { status: 200, body: { success: true } },
    isManager: true,
    rateLimitOk: true,
  };
}

// --- Mock supabase client ---
function makeClient() {
  const tableProxy = (table: string) => {
    let mode: "select" | "update" | "insert" = "select";
    let updates: any = null;
    let inserts: any = null;
    const filters: { col: string; op: string; val: any }[] = [];
    let selectCols = "*";

    const exec = async () => {
      // Get base rows
      let rows: any[] = [];
      if (table === "projects") rows = [...state.projects];
      else if (table === "profiles") rows = [...state.profiles];
      else if (table === "user_roles") rows = [...state.roles];
      else if (table === "planner_match_audit") rows = [...state.audit];

      // Apply filters
      const match = (r: any) =>
        filters.every((f) => {
          if (f.op === "eq") return r[f.col] === f.val;
          if (f.op === "is_null") return r[f.col] == null;
          return true;
        });

      if (mode === "select") {
        const data = rows.filter(match);
        return { data, error: null };
      }
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
      select(cols: string) {
        selectCols = cols;
        return builder;
      },
      eq(col: string, val: any) {
        filters.push({ col, op: "eq", val });
        return builder;
      },
      is(col: string, val: any) {
        if (val === null) filters.push({ col, op: "is_null", val: null });
        return builder;
      },
      update(u: any) {
        mode = "update";
        updates = u;
        return builder;
      },
      insert(rows: any) {
        mode = "insert";
        inserts = rows;
        return builder;
      },
      async maybeSingle() {
        const { data, error } = await exec();
        return { data: (data && data[0]) ?? null, error };
      },
      then(resolve: any, reject: any) {
        return exec().then(resolve, reject);
      },
    };
    return builder;
  };

  return {
    from: (t: string) => tableProxy(t),
    auth: {
      getClaims: async (_token: string) =>
        ({ data: { claims: { sub: "user-1" } }, error: null }),
    },
    rpc: async (name: string, _args: any) => {
      if (name === "check_rate_limit")
        return { data: state.rateLimitOk, error: null };
      return { data: null, error: null };
    },
  };
}

// --- Install shims ---
const realFetch = globalThis.fetch;
async function runHandler(req: Request): Promise<Response> {
  // Stub Deno.serve before importing.
  let handler: (r: Request) => Promise<Response> = async () =>
    new Response("noop");
  const origServe = (Deno as any).serve;
  (Deno as any).serve = (h: any) => {
    handler = h;
    return { finished: Promise.resolve() } as any;
  };

  // Stub fetch
  globalThis.fetch = (async (url: any, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("list-masterdata-for-matching")) {
      return new Response(
        JSON.stringify({
          projecten: state.plannerProjects,
          monteurs: state.plannerMonteurs,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (u.includes("apply-urenapp-link")) {
      return new Response(
        JSON.stringify(state.plannerLinkResponse.body ?? {}),
        { status: state.plannerLinkResponse.status },
      );
    }
    return realFetch(url, init);
  }) as any;

  // Stub supabase module via mocking createClient
  const mod = await import("npm:@supabase/supabase-js@2");
  const origCreate = (mod as any).createClient;
  (mod as any).createClient = () => makeClient();

  // Env
  Deno.env.set("SUPABASE_URL", "http://localhost");
  Deno.env.set("SUPABASE_ANON_KEY", "anon");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service");
  Deno.env.set("URENAPP_SYNC_SECRET", "secret");

  await import(`./index.ts?cachebust=${Math.random()}`);
  try {
    return await handler(req);
  } finally {
    (Deno as any).serve = origServe;
    globalThis.fetch = realFetch;
    (mod as any).createClient = origCreate;
    // Manager check moet werken bij volgende run
  }
}

function postReq(body: any, method = "POST"): Request {
  return new Request("http://x/confirm-planner-match", {
    method,
    headers: { Authorization: "Bearer t" },
    body: method === "POST" ? JSON.stringify(body) : null,
  });
}

function seedProject(opts: Partial<any> = {}) {
  const p = {
    id: "uuren-proj-1",
    nummer: "001",
    naam: "Project X",
    projectjaar: 2025,
    planner_project_id: null,
    stad: "Den Haag",
    planner_sync_enabled: true,
    planner_sync_exclusion_reason: null,
    ...opts,
  };
  state.projects.push(p);
}
function seedPlannerProject(opts: Partial<any> = {}) {
  state.plannerProjects.push({
    planner_id: "pl-1",
    urenapp_project_id: null,
    nummer: "001",
    naam: "Project X",
    locatie: "Den Haag",
    jaar: 2025,
    ...opts,
  });
}
function seedManagerRole() {
  state.roles.push({ user_id: "user-1", role: "manager" });
}

const PROJ_UUID = "11111111-1111-1111-1111-111111111111";

Deno.test("GET → 405", async () => {
  state = freshState();
  const res = await runHandler(postReq(null, "GET"));
  assertEquals(res.status, 405);
  await res.text();
});

Deno.test("non-manager → 403", async () => {
  state = freshState();
  // geen manager-role
  const res = await runHandler(
    postReq({ kind: "project", urenapp_id: PROJ_UUID, planner_id: "pl-1" }),
  );
  assertEquals(res.status, 403);
  await res.text();
});

Deno.test("succesvolle project-koppeling (exact)", async () => {
  state = freshState();
  seedManagerRole();
  seedProject({ id: PROJ_UUID });
  seedPlannerProject();
  const res = await runHandler(
    postReq({ kind: "project", urenapp_id: PROJ_UUID, planner_id: "pl-1" }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.gekoppeld, true);
  assertEquals(state.projects[0].planner_project_id, "pl-1");
  assert(state.audit.some((a) => a.uitkomst === "gekoppeld"));
});

Deno.test("reeds wederzijds gekoppeld → 200 reeds_gekoppeld", async () => {
  state = freshState();
  seedManagerRole();
  seedProject({ id: PROJ_UUID, planner_project_id: "pl-1" });
  seedPlannerProject({ urenapp_project_id: PROJ_UUID });
  const res = await runHandler(
    postReq({ kind: "project", urenapp_id: PROJ_UUID, planner_id: "pl-1" }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.reeds_gekoppeld, true);
});

Deno.test("stale analyse: kandidaat-planner_id wijkt af → 409", async () => {
  state = freshState();
  seedManagerRole();
  seedProject({ id: PROJ_UUID });
  seedPlannerProject({ planner_id: "pl-1" });
  // Client vraagt onbestaand planner_id
  const res = await runHandler(
    postReq({ kind: "project", urenapp_id: PROJ_UUID, planner_id: "pl-OTHER" }),
  );
  assertEquals(res.status, 409);
  await res.text();
});

Deno.test("urenapp al anders gekoppeld → 409", async () => {
  state = freshState();
  seedManagerRole();
  seedProject({ id: PROJ_UUID, planner_project_id: "pl-OTHER" });
  seedPlannerProject({ planner_id: "pl-1" });
  const res = await runHandler(
    postReq({ kind: "project", urenapp_id: PROJ_UUID, planner_id: "pl-1" }),
  );
  assertEquals(res.status, 409);
  await res.text();
});

Deno.test("Planner-write faalt → rollback en 502", async () => {
  state = freshState();
  seedManagerRole();
  seedProject({ id: PROJ_UUID });
  seedPlannerProject();
  state.plannerLinkResponse = { status: 500, body: { error: "boom" } };
  const res = await runHandler(
    postReq({ kind: "project", urenapp_id: PROJ_UUID, planner_id: "pl-1" }),
  );
  assertEquals(res.status, 502);
  // Rollback uitgevoerd
  assertEquals(state.projects[0].planner_project_id, null);
  assert(state.audit.some((a) => a.uitkomst === "rolled_back"));
  await res.text();
});

Deno.test("uitgesloten project → 409", async () => {
  state = freshState();
  seedManagerRole();
  seedProject({
    id: PROJ_UUID,
    planner_sync_enabled: false,
    planner_sync_exclusion_reason: "historisch_afgerond",
  });
  seedPlannerProject();
  const res = await runHandler(
    postReq({ kind: "project", urenapp_id: PROJ_UUID, planner_id: "pl-1" }),
  );
  assertEquals(res.status, 409);
  await res.text();
});

Deno.test("dubbele klik: tweede call ziet reeds_gekoppeld", async () => {
  state = freshState();
  seedManagerRole();
  seedProject({ id: PROJ_UUID });
  seedPlannerProject();
  const r1 = await runHandler(
    postReq({ kind: "project", urenapp_id: PROJ_UUID, planner_id: "pl-1" }),
  );
  assertEquals(r1.status, 200);
  await r1.text();
  // Simuleer dat Planner-zijde nu ook gekoppeld is
  state.plannerProjects[0].urenapp_project_id = PROJ_UUID;
  const r2 = await runHandler(
    postReq({ kind: "project", urenapp_id: PROJ_UUID, planner_id: "pl-1" }),
  );
  assertEquals(r2.status, 200);
  const body = await r2.json();
  assertEquals(body.reeds_gekoppeld, true);
});

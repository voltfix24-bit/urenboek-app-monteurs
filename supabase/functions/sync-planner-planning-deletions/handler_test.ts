import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createHandler } from "./handler.ts";

const cors = { "access-control-allow-origin": "*" };

const PROJ = "11111111-1111-1111-1111-111111111111";
const PROFILE = "22222222-2222-2222-2222-222222222222";
const MGR = "33333333-3333-3333-3333-333333333333";
const PLANNER_PROJ = "f38e8b64-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PLANNER_MONT = "ab12be3f-b7e7-4f8d-942e-b54237b5e36e";
const DATUM_A = "2026-06-22";
const DATUM_B = "2026-06-23";
const EXT_A = "ext-A";
const EXT_B = "ext-B";

interface State {
  isManager?: boolean;
  rateOk?: boolean;
  planner?: any[];
  projects?: any[];
  profiles?: any[];
  planning?: any[];
  managerProfile?: any;
  rpcResults?: Map<string, { data: any; error: any }>;
  rpcCalls: any[];
  auditCalls: any[];
}

function buildSupaAdmin(state: State) {
  return {
    from: (table: string) => {
      if (table === "user_roles") {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: state.isManager === false ? null : { user_id: "u1" }, error: null,
        }) }) }) }) };
      }
      if (table === "projects") return { select: () => Promise.resolve({ data: state.projects ?? [], error: null }) };
      if (table === "profiles") {
        return {
          select: (cols: string) => {
            if (cols.trim() === "id") {
              return { eq: () => ({ maybeSingle: async () => ({
                data: state.managerProfile === undefined ? { id: MGR } : state.managerProfile,
                error: null,
              }) }) };
            }
            return Promise.resolve({ data: state.profiles ?? [], error: null });
          },
        };
      }
      if (table === "planning") {
        return { select: () => ({ gte: () => ({ lte: async () => ({ data: state.planning ?? [], error: null }) }) }) };
      }
      if (table === "planner_planning_sync_audit") {
        return { insert: async (row: any) => { state.auditCalls.push(row); return { error: null }; } };
      }
      return {};
    },
    auth: { getClaims: async () => ({ data: { claims: { sub: "u1" } }, error: null }) },
    rpc: async (name: string, args: any) => {
      if (name === "check_rate_limit") return { data: state.rateOk !== false, error: null };
      if (name === "sync_planner_planning_delete_v1") {
        state.rpcCalls.push(args);
        const ext = args._external_id as string;
        const r = state.rpcResults?.get(ext);
        if (r) return r;
        // Default = hard verwijderd
        return { data: { uitkomst: "verwijderd", planning_id: `p-${ext}` }, error: null };
      }
      return { data: null, error: null };
    },
  } as any;
}

function makeDeps(state: State, plannerFetchOverride?: any) {
  return {
    env: (k: string) => (k === "URENAPP_SYNC_SECRET" ? "sek" : undefined),
    corsHeaders: cors,
    supaUser: () => ({
      from: () => ({}),
      auth: { getClaims: async () => ({ data: { claims: { sub: "u1" } }, error: null }) },
      rpc: async () => ({ data: null, error: null }),
    }) as any,
    supaAdmin: () => buildSupaAdmin(state),
    fetchPlannerPlanning: plannerFetchOverride ?? (async () => ({
      ok: true, status: 200,
      payload: { planning: state.planner ?? [], uitgesloten: [] },
    })),
  };
}

function externRow(ext: string, datum: string, extra: Partial<any> = {}) {
  return {
    id: "row-" + ext, datum, starttijd: "07:00:00", eindtijd: "16:00:00",
    notitie: "", project_id: PROJ, medewerker_id: PROFILE,
    activiteit: "Schakelen", activiteit_kleur: "c2",
    external_source: "terrevolt_planner", external_id: ext,
    external_deleted_at: null,
    ...extra,
  };
}

const baseProjects = [{
  id: PROJ, nummer: "003", naam: "Project X",
  planner_project_id: PLANNER_PROJ, planner_sync_enabled: true,
  planner_sync_exclusion_reason: null,
}];
const baseProfiles = [
  { id: PROFILE, user_id: "m1", full_name: "Mohammed", planner_monteur_id: PLANNER_MONT },
];

function freshState(over: Partial<State> = {}): State {
  return {
    isManager: true,
    rateOk: true,
    planner: [], // alle bestaande rijen zijn dus 'verwijderd_in_planner'
    projects: baseProjects,
    profiles: baseProfiles,
    planning: [externRow(EXT_A, DATUM_A)],
    rpcCalls: [],
    auditCalls: [],
    ...over,
  };
}

const authReq = (body: string) => new Request("https://x", {
  method: "POST", headers: { Authorization: "Bearer x" }, body,
});

function postBody(extra: any = {}) {
  return JSON.stringify({ datum_vanaf: DATUM_A, datum_tot: DATUM_B, ...extra });
}

Deno.test("405 op GET", async () => {
  const h = createHandler(makeDeps(freshState()));
  const r = await h(new Request("https://x", { method: "GET" }));
  assertEquals(r.status, 405);
});

Deno.test("401 zonder bearer", async () => {
  const h = createHandler(makeDeps(freshState()));
  const r = await h(new Request("https://x", { method: "POST" }));
  assertEquals(r.status, 401);
});

Deno.test("403 zonder managerrol", async () => {
  const s = freshState({ isManager: false });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 403);
});

Deno.test("429 bij rate-limit", async () => {
  const s = freshState({ rateOk: false });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 429);
});

Deno.test("400 bij ongeldige limit", async () => {
  const h = createHandler(makeDeps(freshState()));
  const r = await h(authReq(postBody({ limit: -1 })));
  assertEquals(r.status, 400);
});

Deno.test("hard verwijderen zonder boekingen: 1 verwerkt + audit", async () => {
  const s = freshState();
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.verwerkt, 1);
  assertEquals(j.aantallen.verwijderd, 1);
  assertEquals(s.rpcCalls.length, 1);
  assertEquals(s.rpcCalls[0]._external_id, EXT_A);
  assertEquals(s.auditCalls.length, 1);
  assertEquals(s.auditCalls[0].uitkomst, "verwijderd");
});

Deno.test("met urenboekingen: RPC geeft gemarkeerd_verwijderd terug", async () => {
  const rpcResults = new Map<string, { data: any; error: any }>();
  rpcResults.set(EXT_A, {
    data: { uitkomst: "gemarkeerd_verwijderd", planning_id: "row-" + EXT_A },
    error: null,
  });
  const s = freshState({ rpcResults });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.aantallen.gemarkeerd_verwijderd, 1);
  assertEquals(j.aantallen.verwijderd, 0);
  assertEquals(s.auditCalls[0].uitkomst, "gemarkeerd_verwijderd");
});

Deno.test("reeds gemarkeerd: niet meer in kandidaten -> 0 verwerkt", async () => {
  const s = freshState({
    planning: [externRow(EXT_A, DATUM_A, { external_deleted_at: "2026-06-20T10:00:00Z" })],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.verwerkt, 0);
  assertEquals(s.rpcCalls.length, 0);
});

Deno.test("idempotentie: tweede call na hard-delete blijft 0", async () => {
  const s = freshState();
  const h = createHandler(makeDeps(s));
  const r1 = await h(authReq(postBody()));
  assertEquals(r1.status, 200);
  // simuleer: planning leeg
  s.planning = [];
  const r2 = await h(authReq(postBody()));
  assertEquals(r2.status, 200);
  assertEquals((await r2.json()).verwerkt, 0);
});

Deno.test("limit cap op 25", async () => {
  const rows: any[] = [];
  for (let i = 0; i < 30; i++) {
    rows.push(externRow("ext-" + i, DATUM_A, { id: "r" + i }));
  }
  const s = freshState({ planning: rows });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(JSON.stringify({ datum_vanaf: DATUM_A, datum_tot: DATUM_B, limit: 100 })));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.verwerkt, 25);
  assertEquals(j.limit, 25);
});

Deno.test("external_ids filter: alleen genoemde IDs verwerken", async () => {
  const s = freshState({
    planning: [externRow(EXT_A, DATUM_A), externRow(EXT_B, DATUM_B)],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody({ external_ids: [EXT_A] })));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.verwerkt, 1);
  assertEquals(s.rpcCalls[0]._external_id, EXT_A);
});

Deno.test("external_ids filter: onbekende ID -> 409 zonder writes", async () => {
  const s = freshState();
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody({ external_ids: ["onbekend"] })));
  assertEquals(r.status, 409);
  assertEquals(s.rpcCalls.length, 0);
});

Deno.test("partial failure: één RPC-fout, anderen slagen", async () => {
  const rpcResults = new Map<string, { data: any; error: any }>();
  rpcResults.set(EXT_A, { data: null, error: { message: "boom" } });
  const s = freshState({
    planning: [externRow(EXT_A, DATUM_A), externRow(EXT_B, DATUM_B)],
    rpcResults,
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.aantallen.fout, 1);
  assertEquals(j.aantallen.verwijderd, 1);
  assertEquals(s.auditCalls.length, 2);
});

Deno.test("RPC overgeslagen (bestaande_extern_niet_gevonden)", async () => {
  const rpcResults = new Map<string, { data: any; error: any }>();
  rpcResults.set(EXT_A, {
    data: { uitkomst: "overgeslagen", fout_reden: "bestaande_extern_niet_gevonden" },
    error: null,
  });
  const s = freshState({ rpcResults });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.aantallen.overgeslagen, 1);
  assertEquals(s.auditCalls[0].uitkomst, "overgeslagen");
});

Deno.test("planner endpoint faalt -> 502, geen writes", async () => {
  const s = freshState();
  const fetchFail = async () => ({ ok: false, status: 500, payload: null });
  const h = createHandler(makeDeps(s, fetchFail));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 502);
  assertEquals(s.rpcCalls.length, 0);
});

Deno.test("geen verwijderingen in bereik -> 0 verwerkt", async () => {
  // Planner heeft de regel nog -> status ongewijzigd
  const plannerItem = {
    external_id: EXT_A, planning_cel_id: "c",
    planner_project_id: PLANNER_PROJ, planner_monteur_id: PLANNER_MONT,
    urenapp_project_id: PROJ, urenapp_profile_id: PROFILE,
    datum: DATUM_A, activiteit: "Schakelen", kleur: "c2", notitie: "",
  };
  const s = freshState({ planner: [plannerItem] });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.verwerkt, 0);
  assertEquals(s.rpcCalls.length, 0);
});

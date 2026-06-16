import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createHandler } from "./handler.ts";

const cors = { "access-control-allow-origin": "*" };

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const PROFILE_ID = "22222222-2222-2222-2222-222222222222";
const MGR_PROFILE = "33333333-3333-3333-3333-333333333333";
const PLANNER_PROJ = "f38e8b64-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PLANNER_MONT = "ab12be3f-b7e7-4f8d-942e-b54237b5e36e";
const EXT_ID = "a62d9771-9a2b-4a13-8b6e-ad01b87bf6a0:" + PLANNER_MONT;
const DATUM = "2026-06-22";

interface State {
  isManager?: boolean;
  rateOk?: boolean;
  planner?: any[];
  uitgesloten?: any[];
  projects?: any[];
  profiles?: any[];
  planning?: any[];
  managerProfile?: any;
  rpcResult?: { data: any; error: any };
  // Recorders
  rpcCalls: any[];
  auditCalls: any[];
}

function makeDeps(state: State, extra: any = {}) {
  state.rpcCalls = state.rpcCalls ?? [];
  state.auditCalls = state.auditCalls ?? [];

  const deps = {
    env: (k: string) => (k === "URENAPP_SYNC_SECRET" ? "sek" : undefined),
    corsHeaders: cors,
    supaUser: () => ({
      from: () => ({}),
      auth: { getClaims: async () => ({ data: { claims: { sub: "u1" } }, error: null }) },
      rpc: async () => ({ data: null, error: null }),
    }) as any,
    supaAdmin: () => ({
      from: (table: string) => {
        if (table === "user_roles") {
          return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({
            data: state.isManager === false ? null : { user_id: "u1" }, error: null,
          }) }) }) }) };
        }
        if (table === "projects") return { select: async () => ({ data: state.projects ?? [], error: null }) };
        if (table === "profiles") {
          return {
            select: (cols?: string) => {
              if (typeof cols === "string" && cols.trim() === "id") {
                // managerProfile lookup chain
                return { eq: () => ({ maybeSingle: async () => ({
                  data: state.managerProfile === undefined ? { id: MGR_PROFILE } : state.managerProfile,
                  error: null,
                }) }) };
              }
              return { then: undefined } as any; // not used
            },
          } as any;
        }
        if (table === "planning") {
          return { select: () => ({ gte: () => ({ lte: async () => ({ data: state.planning ?? [], error: null }) }) }) };
        }
        if (table === "planner_planning_sync_audit") {
          return { insert: async (row: any) => { state.auditCalls.push(row); return { error: null }; } };
        }
        return {} as any;
      },
      auth: { getClaims: async () => ({ data: { claims: { sub: "u1" } }, error: null }) },
      rpc: async (name: string, args: any) => {
        if (name === "check_rate_limit") return { data: state.rateOk !== false, error: null };
        if (name === "sync_planner_planning_item_v1") {
          state.rpcCalls.push(args);
          return state.rpcResult ?? { data: { uitkomst: "gesynchroniseerd", planning_id: "p-new" }, error: null };
        }
        return { data: null, error: null };
      },
    }) as any,
    fetchPlannerPlanning: async () => ({
      ok: true, status: 200,
      payload: { planning: state.planner ?? [], uitgesloten: state.uitgesloten ?? [] },
    }),
  };
  return { ...deps, ...extra };
}

// Speciaal voor profiles: vereenvoudig select(...).maybeSingle voor managerProfile
// en select(...) (zonder .eq) voor lijst.
function patchProfilesList(state: State) {
  // We override fully: profiles supports both list-select (await) and single-lookup.
  const fn = (table: string) => {
    if (table === "profiles") {
      return {
        select: (cols?: string) => {
          if (typeof cols === "string" && cols.includes("user_id")) {
            return { eq: () => ({ maybeSingle: async () => ({
              data: state.managerProfile === undefined ? { id: MGR_PROFILE } : state.managerProfile,
              error: null,
            }) }) };
          }
          // list select used in Promise.all
          return Promise.resolve({ data: state.profiles ?? [], error: null });
        },
      };
    }
    return null;
  };
  return fn;
}

// We need supaAdmin.from('profiles').select(...) used in two contexts:
// 1) Promise.all list: supaAdmin.from('profiles').select('id, user_id, full_name, planner_monteur_id')
//    -> awaited directly -> returns { data, error }
// 2) Manager lookup: supaAdmin.from('profiles').select('id').eq('user_id', userId).maybeSingle()
// Build a smarter supaAdmin.
function buildSupaAdmin(state: State) {
  return {
    from: (table: string) => {
      if (table === "user_roles") {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: state.isManager === false ? null : { user_id: "u1" }, error: null,
        }) }) }) }) };
      }
      if (table === "projects") {
        const p = { data: state.projects ?? [], error: null };
        return { select: () => Promise.resolve(p) };
      }
      if (table === "profiles") {
        return {
          select: (cols: string) => {
            // Manager-lookup als select alleen 'id' bevat én er een .eq komt
            const isLookup = cols.trim() === "id";
            const listP = Promise.resolve({ data: state.profiles ?? [], error: null });
            if (isLookup) {
              return { eq: () => ({ maybeSingle: async () => ({
                data: state.managerProfile === undefined ? { id: MGR_PROFILE } : state.managerProfile,
                error: null,
              }) }) };
            }
            return listP;
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
      if (name === "sync_planner_planning_item_v1") {
        state.rpcCalls.push(args);
        return state.rpcResult ?? { data: { uitkomst: "gesynchroniseerd", planning_id: "p-new" }, error: null };
      }
      return { data: null, error: null };
    },
  } as any;
}

function freshState(over: Partial<State> = {}): State {
  return {
    isManager: true,
    rateOk: true,
    planner: [{
      external_id: EXT_ID, planning_cel_id: "cel-1",
      planner_project_id: PLANNER_PROJ, planner_monteur_id: PLANNER_MONT,
      urenapp_project_id: PROJECT_ID, urenapp_profile_id: PROFILE_ID,
      datum: DATUM, activiteit: "Schakelen MS+LS", kleur: "c2", notitie: "",
    }],
    uitgesloten: [],
    projects: [{
      id: PROJECT_ID, nummer: "003", naam: "Fjodor",
      planner_project_id: PLANNER_PROJ, planner_sync_enabled: true,
      planner_sync_exclusion_reason: null,
    }],
    profiles: [{
      id: PROFILE_ID, user_id: "m1", full_name: "Mohammed Aamarou",
      planner_monteur_id: PLANNER_MONT,
    }],
    planning: [],
    rpcCalls: [],
    auditCalls: [],
    ...over,
  };
}

function makeFullDeps(state: State, fetchOverride?: any) {
  const base = makeDeps(state);
  return {
    ...base,
    supaAdmin: () => buildSupaAdmin(state),
    ...(fetchOverride ? { fetchPlannerPlanning: fetchOverride } : {}),
  };
}

function postBody(extra: any = {}) {
  return JSON.stringify({ datum_vanaf: DATUM, datum_tot: DATUM, external_id: EXT_ID, ...extra });
}
const authReq = (body: string) => new Request("https://x", {
  method: "POST", headers: { Authorization: "Bearer x" }, body,
});

Deno.test("405 op GET", async () => {
  const h = createHandler(makeFullDeps(freshState()));
  const r = await h(new Request("https://x", { method: "GET" }));
  assertEquals(r.status, 405);
});

Deno.test("401 zonder bearer", async () => {
  const h = createHandler(makeFullDeps(freshState()));
  const r = await h(new Request("https://x", { method: "POST" }));
  assertEquals(r.status, 401);
});

Deno.test("403 zonder managerrol (manager-only)", async () => {
  const s = freshState({ isManager: false });
  const h = createHandler(makeFullDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 403);
});

Deno.test("429 bij rate-limit", async () => {
  const s = freshState({ rateOk: false });
  const h = createHandler(makeFullDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 429);
});

Deno.test("400 bij ongeldige external_id", async () => {
  const h = createHandler(makeFullDeps(freshState()));
  const r = await h(authReq(JSON.stringify({ datum_vanaf: DATUM, datum_tot: DATUM, external_id: "" })));
  assertEquals(r.status, 400);
});

Deno.test("200 success voor nieuwe regel: juiste velden aan rpc", async () => {
  const s = freshState();
  const h = createHandler(makeFullDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.uitkomst, "gesynchroniseerd");
  assertEquals(s.rpcCalls.length, 1);
  const call = s.rpcCalls[0];
  assertEquals(call._external_id, EXT_ID);
  assertEquals(call._datum, DATUM);
  assertEquals(call._project_id, PROJECT_ID);
  assertEquals(call._medewerker_id, PROFILE_ID);
  assertEquals(call._activiteit, "Schakelen MS+LS");
  assertEquals(call._kleur, "c2");
  assertEquals(call._manager_profile_id, MGR_PROFILE);
  // Audit geschreven
  assertEquals(s.auditCalls.length, 1);
  assertEquals(s.auditCalls[0].uitkomst, "gesynchroniseerd");
});

Deno.test("idempotent: reeds_gesynchroniseerd geeft 200", async () => {
  const s = freshState({
    rpcResult: { data: { uitkomst: "reeds_gesynchroniseerd", planning_id: "p-existing" }, error: null },
  });
  const h = createHandler(makeFullDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.uitkomst, "reeds_gesynchroniseerd");
  assertEquals(j.planning_id, "p-existing");
});

Deno.test("stale preview: regel niet meer in Planner -> 409 zonder rpc", async () => {
  const s = freshState({ planner: [] });
  const h = createHandler(makeFullDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 409);
  assertEquals(s.rpcCalls.length, 0);
  assertEquals(s.auditCalls[0].uitkomst, "geweigerd");
});

Deno.test("overlap met handmatige planning -> conflict-status -> 409 zonder rpc", async () => {
  const s = freshState({
    planning: [{
      id: "h1", datum: DATUM, starttijd: "08:00:00", eindtijd: "17:00:00",
      notitie: "", project_id: PROJECT_ID, medewerker_id: PROFILE_ID,
      activiteit: null, activiteit_kleur: null,
      external_source: null, external_id: null,
    }],
  });
  const h = createHandler(makeFullDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 409);
  assertEquals(s.rpcCalls.length, 0);
});

Deno.test("ontbrekende koppeling -> 409 zonder rpc", async () => {
  const s = freshState({
    profiles: [{ id: PROFILE_ID, user_id: "m1", full_name: "X", planner_monteur_id: null }],
  });
  const h = createHandler(makeFullDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 409);
  assertEquals(s.rpcCalls.length, 0);
});

Deno.test("project uitgesloten -> 409", async () => {
  const s = freshState({
    projects: [{
      id: PROJECT_ID, nummer: "003", naam: "Fjodor",
      planner_project_id: PLANNER_PROJ, planner_sync_enabled: false,
      planner_sync_exclusion_reason: "geen_planner_project",
    }],
  });
  const h = createHandler(makeFullDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 409);
  assertEquals(s.rpcCalls.length, 0);
});

Deno.test("dubbele klik: rpc geweigerd door db -> 409 met juiste audit", async () => {
  const s = freshState({
    rpcResult: { data: { uitkomst: "geweigerd", fout_reden: "overlap_handmatige_planning" }, error: null },
  });
  const h = createHandler(makeFullDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 409);
  assertEquals(s.auditCalls[0].uitkomst, "geweigerd");
});

Deno.test("datum buiten bereik -> 409", async () => {
  const s = freshState();
  const h = createHandler(makeFullDeps(s));
  const body = JSON.stringify({ datum_vanaf: "2026-07-01", datum_tot: "2026-07-02", external_id: EXT_ID });
  const r = await h(authReq(body));
  // Planner respons levert nog steeds DATUM=2026-06-22 → buiten bereik
  assertEquals(r.status, 409);
});

// --- Regressie: multi-monteur op zelfde project/datum ---

const PROFILE_ID_2 = "44444444-4444-4444-4444-444444444444";
const PROFILE_ID_3 = "55555555-5555-5555-5555-555555555555";
const PLANNER_MONT_2 = "66666666-1111-1111-1111-111111111111";
const PLANNER_MONT_3 = "77777777-2222-2222-2222-222222222222";
const EXT_ID_2 = "a62d9771-9a2b-4a13-8b6e-ad01b87bf6a0:" + PLANNER_MONT_2;
const EXT_ID_3 = "a62d9771-9a2b-4a13-8b6e-ad01b87bf6a0:" + PLANNER_MONT_3;

function multiMonteurState(): State {
  const s = freshState({
    planner: [
      { external_id: EXT_ID,  planning_cel_id: "cel-1", planner_project_id: PLANNER_PROJ, planner_monteur_id: PLANNER_MONT,
        urenapp_project_id: PROJECT_ID, urenapp_profile_id: PROFILE_ID,
        datum: DATUM, activiteit: "Montage", kleur: "c1", notitie: "" },
      { external_id: EXT_ID_2, planning_cel_id: "cel-1", planner_project_id: PLANNER_PROJ, planner_monteur_id: PLANNER_MONT_2,
        urenapp_project_id: PROJECT_ID, urenapp_profile_id: PROFILE_ID_2,
        datum: DATUM, activiteit: "Montage", kleur: "c1", notitie: "" },
      { external_id: EXT_ID_3, planning_cel_id: "cel-1", planner_project_id: PLANNER_PROJ, planner_monteur_id: PLANNER_MONT_3,
        urenapp_project_id: PROJECT_ID, urenapp_profile_id: PROFILE_ID_3,
        datum: DATUM, activiteit: "Montage", kleur: "c1", notitie: "" },
    ],
    profiles: [
      { id: PROFILE_ID,   user_id: "m1", full_name: "Samir", planner_monteur_id: PLANNER_MONT },
      { id: PROFILE_ID_2, user_id: "m2", full_name: "Ali",   planner_monteur_id: PLANNER_MONT_2 },
      { id: PROFILE_ID_3, user_id: "m3", full_name: "Yazan", planner_monteur_id: PLANNER_MONT_3 },
    ],
  });
  return s;
}

Deno.test("multi-monteur: drie verschillende monteurs op zelfde project/datum syncen elk succesvol", async () => {
  for (const ext of [EXT_ID, EXT_ID_2, EXT_ID_3]) {
    const s = multiMonteurState();
    const h = createHandler(makeFullDeps(s));
    const r = await h(authReq(JSON.stringify({ datum_vanaf: DATUM, datum_tot: DATUM, external_id: ext })));
    assertEquals(r.status, 200, `verwacht 200 voor ${ext}`);
    assertEquals(s.rpcCalls.length, 1);
    assertEquals(s.rpcCalls[0]._external_id, ext);
  }
});

Deno.test("multi-monteur: andere monteur al gesynchroniseerd voor zelfde datum/project blokkeert niet", async () => {
  const s = multiMonteurState();
  // Bestaande planner-regel voor monteur 1 al aanwezig (eerder gesynchroniseerd).
  s.planning = [{
    id: "p-bestaand", datum: DATUM, starttijd: "07:00:00", eindtijd: "16:00:00",
    notitie: "", project_id: PROJECT_ID, medewerker_id: PROFILE_ID,
    activiteit: "Montage", activiteit_kleur: "c1",
    external_source: "terrevolt_planner", external_id: EXT_ID,
  }];
  const h = createHandler(makeFullDeps(s));
  // Sync monteur 2 — moet gewoon doorgaan.
  const r = await h(authReq(JSON.stringify({ datum_vanaf: DATUM, datum_tot: DATUM, external_id: EXT_ID_2 })));
  assertEquals(r.status, 200);
  assertEquals(s.rpcCalls.length, 1);
  assertEquals(s.rpcCalls[0]._medewerker_id, PROFILE_ID_2);
});

Deno.test("multi-monteur: handmatige overlap bij eigen monteur blijft blokkeren", async () => {
  const s = multiMonteurState();
  s.planning = [{
    id: "h2", datum: DATUM, starttijd: "07:00:00", eindtijd: "16:00:00",
    notitie: "", project_id: PROJECT_ID, medewerker_id: PROFILE_ID_2,
    activiteit: null, activiteit_kleur: null,
    external_source: null, external_id: null,
  }];
  const h = createHandler(makeFullDeps(s));
  const r = await h(authReq(JSON.stringify({ datum_vanaf: DATUM, datum_tot: DATUM, external_id: EXT_ID_2 })));
  assertEquals(r.status, 409);
  assertEquals(s.rpcCalls.length, 0);
});

Deno.test("multi-monteur: idempotentie blijft per external_id (reeds_gesynchroniseerd geeft 200)", async () => {
  const s = multiMonteurState();
  s.rpcResult = { data: { uitkomst: "reeds_gesynchroniseerd", planning_id: "p-bestaand" }, error: null };
  const h = createHandler(makeFullDeps(s));
  const r = await h(authReq(JSON.stringify({ datum_vanaf: DATUM, datum_tot: DATUM, external_id: EXT_ID })));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.uitkomst, "reeds_gesynchroniseerd");
});


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
const EXT_A = "ext-A:" + PLANNER_MONT;
const EXT_B = "ext-B:" + PLANNER_MONT;

interface State {
  isManager?: boolean;
  rateOk?: boolean;
  planner?: any[];
  uitgesloten?: any[];
  projects?: any[];
  profiles?: any[];
  planning?: any[];
  managerProfile?: any;
  rpcResults?: Map<string, { data: any; error: any }>;
  rpcDefault?: { data: any; error: any };
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
      if (name === "sync_planner_planning_item_v1") {
        state.rpcCalls.push(args);
        const ext = args._external_id as string;
        const r = state.rpcResults?.get(ext);
        if (r) return r;
        return state.rpcDefault ?? { data: { uitkomst: "gesynchroniseerd", planning_id: `p-${ext}` }, error: null };
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
      payload: { planning: state.planner ?? [], uitgesloten: state.uitgesloten ?? [] },
    })),
  };
}

function plannerItem(ext: string, datum: string, extra: Partial<any> = {}) {
  return {
    external_id: ext, planning_cel_id: "cel-" + ext,
    planner_project_id: PLANNER_PROJ, planner_monteur_id: PLANNER_MONT,
    urenapp_project_id: PROJ, urenapp_profile_id: PROFILE,
    datum, activiteit: "Schakelen", kleur: "c2", notitie: "",
    ...extra,
  };
}

function freshState(over: Partial<State> = {}): State {
  return {
    isManager: true,
    rateOk: true,
    planner: [plannerItem(EXT_A, DATUM_A), plannerItem(EXT_B, DATUM_B)],
    uitgesloten: [],
    projects: [{
      id: PROJ, nummer: "003", naam: "Fjodor",
      planner_project_id: PLANNER_PROJ, planner_sync_enabled: true,
      planner_sync_exclusion_reason: null,
    }],
    profiles: [{
      id: PROFILE, user_id: "m1", full_name: "Mohammed",
      planner_monteur_id: PLANNER_MONT,
    }],
    planning: [],
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

Deno.test("succes: alleen 'nieuw' wordt verwerkt, audit per regel", async () => {
  const s = freshState();
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.verwerkt, 2);
  assertEquals(j.aantallen.gesynchroniseerd, 2);
  assertEquals(s.rpcCalls.length, 2);
  assertEquals(s.auditCalls.length, 2);
  assertEquals(s.auditCalls.every((a: any) => a.uitkomst === "gesynchroniseerd"), true);
});

Deno.test("batch geweigerd bij conflict (overlap handmatige planning)", async () => {
  const s = freshState({
    planning: [{
      id: "h1", datum: DATUM_A, starttijd: "08:00:00", eindtijd: "17:00:00",
      notitie: "", project_id: PROJ, medewerker_id: PROFILE,
      activiteit: null, activiteit_kleur: null,
      external_source: null, external_id: null,
    }],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 409);
  assertEquals(s.rpcCalls.length, 0);
  assertEquals(s.auditCalls.length, 0);
});

Deno.test("batch geweigerd bij verwijderd_in_planner", async () => {
  const s = freshState({
    // Planner heeft alleen EXT_A; lokaal externe regel EXT_B die niet meer in planner staat -> verwijderd
    planner: [plannerItem(EXT_A, DATUM_A)],
    planning: [{
      id: "ext-old", datum: DATUM_B, starttijd: "07:00:00", eindtijd: "16:00:00",
      notitie: "", project_id: PROJ, medewerker_id: PROFILE,
      activiteit: "X", activiteit_kleur: "c1",
      external_source: "terrevolt_planner", external_id: "weg-uit-planner",
    }],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 409);
  assertEquals(s.rpcCalls.length, 0);
});

Deno.test("batch geweigerd bij gewijzigd", async () => {
  const s = freshState({
    planning: [{
      id: "ext-1", datum: DATUM_A, starttijd: "07:00:00", eindtijd: "16:00:00",
      notitie: "anders", project_id: PROJ, medewerker_id: PROFILE,
      activiteit: "Anders", activiteit_kleur: "c9",
      external_source: "terrevolt_planner", external_id: EXT_A,
    }],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 409);
});

Deno.test("ongewijzigd en uitgesloten worden genegeerd (alleen nieuw verwerkt)", async () => {
  const s = freshState({
    // EXT_A bestaat al ongewijzigd; EXT_B is nieuw.
    planning: [{
      id: "ext-1", datum: DATUM_A, starttijd: "07:00:00", eindtijd: "16:00:00",
      notitie: "", project_id: PROJ, medewerker_id: PROFILE,
      activiteit: "Schakelen", activiteit_kleur: "c2",
      external_source: "terrevolt_planner", external_id: EXT_A,
    }],
    uitgesloten: [{ planner_monteur_id: PLANNER_MONT, planning_cel_id: "x", datum: DATUM_A, reden: "iets" }],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.verwerkt, 1);
  assertEquals(s.rpcCalls.length, 1);
  assertEquals(s.rpcCalls[0]._external_id, EXT_B);
});

Deno.test("limit cap op 25 ook bij grotere input", async () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    plannerItem(`ext-${i}:${PLANNER_MONT}`, DATUM_A, { planning_cel_id: `c${i}` }));
  // Vermijd conflict 'meerdere projecten zelfde dag' door datum te varieren
  for (let i = 0; i < many.length; i++) {
    const d = new Date(Date.parse(DATUM_A) + i * 86400000).toISOString().slice(0, 10);
    many[i].datum = d;
  }
  const s = freshState({ planner: many });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(JSON.stringify({ datum_vanaf: DATUM_A, datum_tot: "2026-07-22", limit: 100 })));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.verwerkt, 25);
  assertEquals(j.limit, 25);
});

Deno.test("partial failure: één RPC-fout, anderen slagen", async () => {
  const rpcResults = new Map<string, { data: any; error: any }>();
  rpcResults.set(EXT_A, { data: null, error: { message: "boom" } });
  const s = freshState({ rpcResults });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.aantallen.fout, 1);
  assertEquals(j.aantallen.gesynchroniseerd, 1);
  assertEquals(s.auditCalls.length, 2);
});

Deno.test("idempotent: reeds_gesynchroniseerd telt apart, geen duplicaten", async () => {
  const rpcResults = new Map<string, { data: any; error: any }>();
  rpcResults.set(EXT_A, { data: { uitkomst: "reeds_gesynchroniseerd", planning_id: "p-existing" }, error: null });
  rpcResults.set(EXT_B, { data: { uitkomst: "reeds_gesynchroniseerd", planning_id: "p-existing-b" }, error: null });
  const s = freshState({ rpcResults });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.aantallen.reeds_gesynchroniseerd, 2);
  assertEquals(j.aantallen.gesynchroniseerd, 0);
});

Deno.test("external_ids filter: alleen genoemde IDs verwerken", async () => {
  const s = freshState();
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
  assertEquals(s.auditCalls.length, 0);
});

Deno.test("planner endpoint faalt -> 502, geen writes", async () => {
  const s = freshState();
  const fetchFail = async () => ({ ok: false, status: 500, payload: null });
  const h = createHandler(makeDeps(s, fetchFail));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 502);
  assertEquals(s.rpcCalls.length, 0);
  assertEquals(s.auditCalls.length, 0);
});

Deno.test("geen nieuwe regels -> 200 met lege resultaten", async () => {
  const s = freshState({ planner: [] });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.verwerkt, 0);
});

// --- Regressie: multi-monteur op zelfde project/datum ---

Deno.test("multi-monteur batch: drie monteurs zelfde project/datum allen succesvol", async () => {
  const PROF_2 = "44444444-4444-4444-4444-444444444444";
  const PROF_3 = "55555555-5555-5555-5555-555555555555";
  const PM_2 = "66666666-1111-1111-1111-111111111111";
  const PM_3 = "77777777-2222-2222-2222-222222222222";
  const EXT_1 = "cel-x:" + PLANNER_MONT;
  const EXT_2 = "cel-x:" + PM_2;
  const EXT_3 = "cel-x:" + PM_3;
  const s = freshState({
    planner: [
      { external_id: EXT_1, planning_cel_id: "cel-x", planner_project_id: PLANNER_PROJ,
        planner_monteur_id: PLANNER_MONT, urenapp_project_id: PROJ, urenapp_profile_id: PROFILE,
        datum: DATUM_A, activiteit: "Montage", kleur: "c1", notitie: "" },
      { external_id: EXT_2, planning_cel_id: "cel-x", planner_project_id: PLANNER_PROJ,
        planner_monteur_id: PM_2, urenapp_project_id: PROJ, urenapp_profile_id: PROF_2,
        datum: DATUM_A, activiteit: "Montage", kleur: "c1", notitie: "" },
      { external_id: EXT_3, planning_cel_id: "cel-x", planner_project_id: PLANNER_PROJ,
        planner_monteur_id: PM_3, urenapp_project_id: PROJ, urenapp_profile_id: PROF_3,
        datum: DATUM_A, activiteit: "Montage", kleur: "c1", notitie: "" },
    ],
    profiles: [
      { id: PROFILE, user_id: "m1", full_name: "Samir", planner_monteur_id: PLANNER_MONT },
      { id: PROF_2,  user_id: "m2", full_name: "Ali",   planner_monteur_id: PM_2 },
      { id: PROF_3,  user_id: "m3", full_name: "Yazan", planner_monteur_id: PM_3 },
    ],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(JSON.stringify({ datum_vanaf: DATUM_A, datum_tot: DATUM_A })));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.verwerkt, 3);
  assertEquals(j.aantallen.gesynchroniseerd, 3);
  const monteurs = new Set(s.rpcCalls.map((c: any) => c._medewerker_id));
  assertEquals(monteurs.size, 3);
});


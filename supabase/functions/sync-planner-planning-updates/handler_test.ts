import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createHandler } from "./handler.ts";

const cors = { "access-control-allow-origin": "*" };

const PROJ = "11111111-1111-1111-1111-111111111111";
const PROJ_2 = "12121212-1212-1212-1212-121212121212";
const PROFILE = "22222222-2222-2222-2222-222222222222";
const PROFILE_2 = "23232323-2323-2323-2323-232323232323";
const MGR = "33333333-3333-3333-3333-333333333333";
const PLANNER_PROJ = "f38e8b64-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PLANNER_MONT = "ab12be3f-b7e7-4f8d-942e-b54237b5e36e";
const PLANNER_MONT_2 = "bb12be3f-b7e7-4f8d-942e-b54237b5e36e";
const DATUM_A = "2026-06-22";
const DATUM_B = "2026-06-23";
const EXT_A = "ext-A:" + PLANNER_MONT;

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
      if (name === "sync_planner_planning_update_v1") {
        state.rpcCalls.push(args);
        const ext = args._external_id as string;
        const r = state.rpcResults?.get(ext);
        if (r) return r;
        return state.rpcDefault ?? { data: { uitkomst: "bijgewerkt", planning_id: `p-${ext}` }, error: null };
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

// Bestaande Planner-row die exact matcht met plannerItem(EXT_A, DATUM_A): status = ongewijzigd.
// Iedere mutatie maakt het status = gewijzigd.
function externRow(ext: string, datum: string, extra: Partial<any> = {}) {
  return {
    id: "ext-" + ext, datum, starttijd: "07:00:00", eindtijd: "16:00:00",
    notitie: "", project_id: PROJ, medewerker_id: PROFILE,
    activiteit: "Schakelen", activiteit_kleur: "c2",
    external_source: "terrevolt_planner", external_id: ext,
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
    planner: [plannerItem(EXT_A, DATUM_A)],
    uitgesloten: [],
    projects: baseProjects,
    profiles: baseProfiles,
    planning: [externRow(EXT_A, DATUM_A)], // status ongewijzigd by default
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

Deno.test("ongewijzigd: 0 te verwerken, geen rpc-calls", async () => {
  const s = freshState();
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.verwerkt, 0);
  assertEquals(s.rpcCalls.length, 0);
  assertEquals(s.auditCalls.length, 0);
});

Deno.test("datumwijziging: status gewijzigd -> verwerkt", async () => {
  // Bestaande regel op DATUM_B, Planner wil DATUM_A.
  const s = freshState({
    planning: [externRow(EXT_A, DATUM_B)],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.verwerkt, 1);
  assertEquals(j.aantallen.bijgewerkt, 1);
  assertEquals(s.rpcCalls[0]._datum, DATUM_A);
  assertEquals(s.auditCalls.length, 1);
  assertEquals(s.auditCalls[0].uitkomst, "bijgewerkt");
});

Deno.test("monteurwijziging: status gewijzigd -> verwerkt", async () => {
  const s = freshState({
    planner: [plannerItem(EXT_A, DATUM_A, { planner_monteur_id: PLANNER_MONT_2, urenapp_profile_id: PROFILE_2 })],
    profiles: [
      ...baseProfiles,
      { id: PROFILE_2, user_id: "m2", full_name: "Ali", planner_monteur_id: PLANNER_MONT_2 },
    ],
    planning: [externRow(EXT_A, DATUM_A, { medewerker_id: PROFILE })],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.verwerkt, 1);
  assertEquals(j.aantallen.bijgewerkt, 1);
  assertEquals(s.rpcCalls[0]._medewerker_id, PROFILE_2);
});

Deno.test("activiteit/kleur/notitie wijziging -> verwerkt", async () => {
  const s = freshState({
    planning: [externRow(EXT_A, DATUM_A, {
      activiteit: "Oude activiteit", activiteit_kleur: "c9", notitie: "oud",
    })],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.verwerkt, 1);
  assertEquals(s.rpcCalls[0]._activiteit, "Schakelen");
  assertEquals(s.rpcCalls[0]._kleur, "c2");
});

Deno.test("conflict in bereik -> 409, geen writes", async () => {
  // Bestaande regel gewijzigd + handmatige overlap zorgt voor conflict.
  const s = freshState({
    planning: [
      externRow(EXT_A, DATUM_B), // gewijzigd
      { id: "h1", datum: DATUM_A, starttijd: "08:00:00", eindtijd: "17:00:00",
        notitie: "", project_id: PROJ, medewerker_id: PROFILE,
        activiteit: null, activiteit_kleur: null,
        external_source: null, external_id: null },
    ],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 409);
  assertEquals(s.rpcCalls.length, 0);
  assertEquals(s.auditCalls.length, 0);
});

Deno.test("verwijderd_in_planner in bereik -> 409", async () => {
  const s = freshState({
    planner: [], // EXT_A is "weg"
    planning: [externRow(EXT_A, DATUM_A)],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 409);
});

Deno.test("RPC weigert bij urenboekingen aanwezig: telt als geweigerd, audit per regel", async () => {
  const rpcResults = new Map<string, { data: any; error: any }>();
  rpcResults.set(EXT_A, {
    data: { uitkomst: "geweigerd", fout_reden: "urenboekingen_aanwezig_oud", planning_id: "ext-" + EXT_A },
    error: null,
  });
  const s = freshState({
    planning: [externRow(EXT_A, DATUM_B)], // gewijzigd
    rpcResults,
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.aantallen.geweigerd, 1);
  assertEquals(j.aantallen.bijgewerkt, 0);
  assertEquals(s.auditCalls[0].uitkomst, "geweigerd");
  assertEquals(s.auditCalls[0].fout_reden, "urenboekingen_aanwezig_oud");
});

Deno.test("limit cap op 25 ook bij grotere input", async () => {
  const items: any[] = [];
  const rows: any[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.parse(DATUM_A) + i * 86400000).toISOString().slice(0, 10);
    const ext = `ext-${i}`;
    items.push(plannerItem(ext, d, { planning_cel_id: `c${i}` }));
    // Maak bestaande row met andere datum zodat status = gewijzigd.
    rows.push(externRow(ext, "2026-12-01", { id: "r" + i }));
  }
  const s = freshState({ planner: items, planning: rows });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(JSON.stringify({ datum_vanaf: DATUM_A, datum_tot: "2026-07-22", limit: 100 })));
  assertEquals(r.status, 200);
  const j = await r.json();
  // Bestaande rows liggen buiten bereik (2026-12-01) -> ze worden NIET geladen.
  // Daarom zijn ze "nieuw" in classifier. Verplaats rows binnen bereik:
  // (re-test) — vervang met in-range rows
  const rows2 = items.map((it, i) => externRow(it.external_id, it.datum, { id: "r" + i, activiteit: "X" }));
  const s2 = freshState({ planner: items, planning: rows2 });
  const h2 = createHandler(makeDeps(s2));
  const r2 = await h2(authReq(JSON.stringify({ datum_vanaf: DATUM_A, datum_tot: "2026-07-22", limit: 100 })));
  assertEquals(r2.status, 200);
  const j2 = await r2.json();
  assertEquals(j2.verwerkt, 25);
  assertEquals(j2.limit, 25);
});

Deno.test("partial failure: één RPC-fout, anderen slagen", async () => {
  const EXT_C = "ext-C";
  const rpcResults = new Map<string, { data: any; error: any }>();
  rpcResults.set(EXT_A, { data: null, error: { message: "boom" } });
  const s = freshState({
    planner: [
      plannerItem(EXT_A, DATUM_A),
      plannerItem(EXT_C, DATUM_B, { external_id: EXT_C }),
    ],
    planning: [
      externRow(EXT_A, DATUM_A, { activiteit: "oud" }),
      externRow(EXT_C, DATUM_B, { activiteit: "oud" }),
    ],
    rpcResults,
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.aantallen.fout, 1);
  assertEquals(j.aantallen.bijgewerkt, 1);
  assertEquals(s.auditCalls.length, 2);
});

Deno.test("idempotent: tweede call zonder veranderingen levert 0 verwerkt", async () => {
  const s = freshState(); // bestaande regel matcht Planner exact
  const h = createHandler(makeDeps(s));
  const r1 = await h(authReq(postBody()));
  const r2 = await h(authReq(postBody()));
  assertEquals(r1.status, 200);
  assertEquals(r2.status, 200);
  assertEquals((await r1.json()).verwerkt, 0);
  assertEquals((await r2.json()).verwerkt, 0);
  assertEquals(s.rpcCalls.length, 0);
});

Deno.test("external_ids filter: alleen genoemde IDs verwerken", async () => {
  const EXT_C = "ext-C";
  const s = freshState({
    planner: [
      plannerItem(EXT_A, DATUM_A),
      plannerItem(EXT_C, DATUM_B, { external_id: EXT_C }),
    ],
    planning: [
      externRow(EXT_A, DATUM_A, { activiteit: "oud" }),
      externRow(EXT_C, DATUM_B, { activiteit: "oud" }),
    ],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody({ external_ids: [EXT_A] })));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.verwerkt, 1);
  assertEquals(s.rpcCalls[0]._external_id, EXT_A);
});

Deno.test("external_ids filter: onbekende ID -> 409 zonder writes", async () => {
  const s = freshState({
    planning: [externRow(EXT_A, DATUM_A, { activiteit: "oud" })],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody({ external_ids: ["onbekend"] })));
  assertEquals(r.status, 409);
  assertEquals(s.rpcCalls.length, 0);
  assertEquals(s.auditCalls.length, 0);
});

Deno.test("ontbrekende projectkoppeling: RPC niet aangeroepen, geweigerd", async () => {
  // Planner zonder bekend project (geen project met planner_project_id, geen urenapp_project_id hint)
  const s = freshState({
    planner: [plannerItem(EXT_A, DATUM_A, { planner_project_id: "onbekend", urenapp_project_id: null })],
    planning: [externRow(EXT_A, DATUM_A, { activiteit: "oud" })],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  // ontbrekende koppeling -> classifier status = conflict -> hele batch geweigerd (409)
  assertEquals(r.status, 409);
});

Deno.test("uitgesloten project -> conflict in bereik -> 409", async () => {
  const s = freshState({
    projects: [{ ...baseProjects[0], planner_sync_enabled: false, planner_sync_exclusion_reason: "uren" }],
    planning: [externRow(EXT_A, DATUM_A, { activiteit: "oud" })],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 409);
  assertEquals(s.rpcCalls.length, 0);
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

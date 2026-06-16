import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createHandler } from "./handler.ts";

const cors = { "access-control-allow-origin": "*" };

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const PROFILE_ID = "22222222-2222-2222-2222-222222222222";
const MGR_PROFILE = "33333333-3333-3333-3333-333333333333";
const PLANNER_PROJ = "f38e8b64-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PLANNER_MONT = "ab12be3f-b7e7-4f8d-942e-b54237b5e36e";
const EXT_ID = "a62d9771-9a2b-4a13-8b6e-ad01b87bf6a0:" + PLANNER_MONT;
const HANDMATIG_ID = "44444444-4444-4444-4444-444444444444";
const DATUM = "2026-06-15";

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
      if (table === "projects") {
        return { select: () => Promise.resolve({ data: state.projects ?? [], error: null }) };
      }
      if (table === "profiles") {
        return {
          select: (cols: string) => {
            const isLookup = cols.trim() === "id";
            if (isLookup) {
              return { eq: () => ({ maybeSingle: async () => ({
                data: state.managerProfile === undefined ? { id: MGR_PROFILE } : state.managerProfile,
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
      if (name === "adopt_planner_planning_item_v1") {
        state.rpcCalls.push(args);
        return state.rpcResult ?? { data: { uitkomst: "geadopteerd", planning_id: HANDMATIG_ID }, error: null };
      }
      return { data: null, error: null };
    },
  } as any;
}

function makeDeps(state: State) {
  return {
    env: (k: string) => (k === "URENAPP_SYNC_SECRET" ? "sek" : undefined),
    corsHeaders: cors,
    supaUser: () => ({
      from: () => ({}),
      auth: { getClaims: async () => ({ data: { claims: { sub: "u1" } }, error: null }) },
      rpc: async () => ({ data: null, error: null }),
    }) as any,
    supaAdmin: () => buildSupaAdmin(state),
    fetchPlannerPlanning: async () => ({
      ok: true, status: 200,
      payload: { planning: state.planner ?? [], uitgesloten: state.uitgesloten ?? [] },
    }),
  };
}

function freshState(over: Partial<State> = {}): State {
  return {
    isManager: true,
    rateOk: true,
    planner: [{
      external_id: EXT_ID, planning_cel_id: "cel-1",
      planner_project_id: PLANNER_PROJ, planner_monteur_id: PLANNER_MONT,
      urenapp_project_id: PROJECT_ID, urenapp_profile_id: PROFILE_ID,
      datum: DATUM, activiteit: "Schakelen MS+LS", kleur: "c2", notitie: "Planner-notitie",
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
    // 1 exact-matchende handmatige regel: 07-16, leeg, geen externe.
    planning: [{
      id: HANDMATIG_ID, datum: DATUM, starttijd: "07:00:00", eindtijd: "16:00:00",
      notitie: "", project_id: PROJECT_ID, medewerker_id: PROFILE_ID,
      activiteit: null, activiteit_kleur: null,
      external_source: null, external_id: null,
    }],
    rpcCalls: [],
    auditCalls: [],
    ...over,
  };
}

function postBody(extra: any = {}) {
  return JSON.stringify({ datum_vanaf: DATUM, datum_tot: DATUM, external_id: EXT_ID, ...extra });
}
const authReq = (body: string) => new Request("https://x", {
  method: "POST", headers: { Authorization: "Bearer x" }, body,
});

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

Deno.test("400 bij ongeldige external_id", async () => {
  const h = createHandler(makeDeps(freshState()));
  const r = await h(authReq(JSON.stringify({ datum_vanaf: DATUM, datum_tot: DATUM, external_id: "" })));
  assertEquals(r.status, 400);
});

Deno.test("succesvolle adoptie: 200, juiste rpc-args en audit", async () => {
  const s = freshState();
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.uitkomst, "geadopteerd");
  assertEquals(j.planning_id, HANDMATIG_ID);
  assertEquals(s.rpcCalls.length, 1);
  const call = s.rpcCalls[0];
  assertEquals(call._external_id, EXT_ID);
  assertEquals(call._datum, DATUM);
  assertEquals(call._project_id, PROJECT_ID);
  assertEquals(call._medewerker_id, PROFILE_ID);
  assertEquals(call._activiteit, "Schakelen MS+LS");
  assertEquals(call._kleur, "c2");
  assertEquals(call._notitie, "Planner-notitie");
  assertEquals(s.auditCalls.length, 1);
  assertEquals(s.auditCalls[0].uitkomst, "geadopteerd");
  assertEquals(s.auditCalls[0].planning_id, HANDMATIG_ID);
});

Deno.test("idempotent: reeds_geadopteerd geeft 200 zonder fout", async () => {
  const s = freshState({
    rpcResult: { data: { uitkomst: "reeds_geadopteerd", planning_id: HANDMATIG_ID }, error: null },
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.uitkomst, "reeds_geadopteerd");
});

Deno.test("stale preview: regel niet meer in Planner -> 409 zonder rpc", async () => {
  const s = freshState({ planner: [] });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 409);
  assertEquals(s.rpcCalls.length, 0);
  assertEquals(s.auditCalls[0].uitkomst, "geweigerd");
});

Deno.test("tijd wijkt af van 07-16: geen kandidaat -> 409 zonder rpc", async () => {
  const s = freshState({
    planning: [{
      id: HANDMATIG_ID, datum: DATUM, starttijd: "08:00:00", eindtijd: "17:00:00",
      notitie: "", project_id: PROJECT_ID, medewerker_id: PROFILE_ID,
      activiteit: null, activiteit_kleur: null,
      external_source: null, external_id: null,
    }],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 409);
  assertEquals(s.rpcCalls.length, 0);
  assertEquals(s.auditCalls[0].fout_reden, "geen_kandidaat");
});

Deno.test("meerdere overlappen: 409 zonder rpc", async () => {
  const s = freshState({
    planning: [
      {
        id: HANDMATIG_ID, datum: DATUM, starttijd: "07:00:00", eindtijd: "16:00:00",
        notitie: "", project_id: PROJECT_ID, medewerker_id: PROFILE_ID,
        activiteit: null, activiteit_kleur: null,
        external_source: null, external_id: null,
      },
      {
        id: "55555555-5555-5555-5555-555555555555", datum: DATUM,
        starttijd: "07:00:00", eindtijd: "16:00:00",
        notitie: "", project_id: PROJECT_ID, medewerker_id: PROFILE_ID,
        activiteit: null, activiteit_kleur: null,
        external_source: null, external_id: null,
      },
    ],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 409);
  assertEquals(s.rpcCalls.length, 0);
  assertEquals(s.auditCalls[0].fout_reden, "meerdere_kandidaten");
});

Deno.test("bestaande externe regel met dezelfde external_id -> status gewijzigd/ongewijzigd, niet conflict -> 409", async () => {
  const s = freshState({
    planning: [{
      id: "66666666-6666-6666-6666-666666666666", datum: DATUM,
      starttijd: "07:00:00", eindtijd: "16:00:00",
      notitie: "Planner-notitie", project_id: PROJECT_ID, medewerker_id: PROFILE_ID,
      activiteit: "Schakelen MS+LS", activiteit_kleur: "c2",
      external_source: "terrevolt_planner", external_id: EXT_ID,
    }],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 409);
  assertEquals(s.rpcCalls.length, 0);
});

Deno.test("rpc geeft geweigerd (historie aanwezig) -> 409 met juiste audit", async () => {
  const s = freshState({
    rpcResult: { data: { uitkomst: "geweigerd", fout_reden: "urenboekingen_aanwezig" }, error: null },
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 409);
  const j = await r.json();
  assertEquals(j.error, "urenboekingen_aanwezig");
  assertEquals(s.auditCalls[0].fout_reden, "urenboekingen_aanwezig");
});

Deno.test("dubbele klik: tweede oproep krijgt reeds_geadopteerd", async () => {
  const s = freshState({
    rpcResult: { data: { uitkomst: "reeds_geadopteerd", planning_id: HANDMATIG_ID }, error: null },
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.uitkomst, "reeds_geadopteerd");
});

Deno.test("ontbrekende koppeling (planner_monteur_id null op profiel) -> 409", async () => {
  const s = freshState({
    profiles: [{ id: PROFILE_ID, user_id: "m1", full_name: "X", planner_monteur_id: null }],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 409);
  assertEquals(s.rpcCalls.length, 0);
});

Deno.test("conflict met meer dan alleen overlap (project uitgesloten) -> niet-adopteerbaar -> 409", async () => {
  const s = freshState({
    projects: [{
      id: PROJECT_ID, nummer: "003", naam: "Fjodor",
      planner_project_id: PLANNER_PROJ, planner_sync_enabled: false,
      planner_sync_exclusion_reason: "geen_planner_project",
    }],
  });
  const h = createHandler(makeDeps(s));
  const r = await h(authReq(postBody()));
  assertEquals(r.status, 409);
  assertEquals(s.rpcCalls.length, 0);
});

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  synchroniseer,
  sendOne,
  mapMonteurType,
  isPlanbareMonteur,
  berekenWerkdagen,
  magProjectSync,
  type ProjectRow,
  type MonteurRow,
} from "./orchestrator.ts";

const proj = (over: Partial<ProjectRow> = {}): ProjectRow => ({
  id: crypto.randomUUID(), nummer: "001", naam: "T", stationsnaam: null,
  straat: "S 1", postcode: "1234 AB", stad: "A", active: true, projectjaar: 2026, ...over,
});
const mon = (over: Partial<MonteurRow> = {}): MonteurRow => ({
  id: crypto.randomUUID(), full_name: "M", account_status: "active",
  is_onderaannemer: false, vaste_vrije_dagen: [], roles: ["monteur"], ...over,
});

// ─── pure helpers ──────────────────────────────────────────────────────────

Deno.test("rolmapping monteur → montagemonteur", () => {
  assertEquals(mapMonteurType(["monteur"]), "montagemonteur");
  assertEquals(mapMonteurType(["schakelmonteur"]), "schakelmonteur");
  assertEquals(mapMonteurType(["monteur", "schakelmonteur"]), "schakelmonteur");
  assertEquals(mapMonteurType(["manager"]), null);
});

Deno.test("werkdagen maandag en vrijdag", () => {
  assertEquals(berekenWerkdagen([1]), [2, 3, 4, 5]);
  assertEquals(berekenWerkdagen([5]), [1, 2, 3, 4]);
});

Deno.test("onderaannemer-bedrijfsaccount uitgesloten, gekoppelde monteur niet", () => {
  assertEquals(isPlanbareMonteur(mon({ is_onderaannemer: true })), false);
  assertEquals(isPlanbareMonteur(mon({ is_onderaannemer: false })), true);
});

Deno.test("manager-profiel uitgesloten van monteur-sync", () => {
  assertEquals(isPlanbareMonteur(mon({ roles: ["monteur", "manager"] })), false);
});

Deno.test("projectjaar null blokkeert sync", () => {
  assertEquals(magProjectSync(proj({ projectjaar: null })), false);
  assertEquals(magProjectSync(proj({ projectjaar: 1999 })), false);
  assertEquals(magProjectSync(proj({ projectjaar: 2026 })), true);
});

// ─── sendOne (response-vorm + retry) ───────────────────────────────────────

function mockFetch(responses: { status: number; body?: any }[]): { fn: any; calls: number } {
  let i = 0;
  const state = { calls: 0 };
  const fn = async (_url: string, _init: RequestInit) => {
    state.calls++;
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return new Response(r.body == null ? "" : JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  };
  return { fn, ...state, get calls() { return state.calls; } } as any;
}

Deno.test("sendOne: missende velden in response → mislukt", async () => {
  const m = mockFetch([{ status: 200, body: { id: "x" } }]);
  const res = await sendOne(
    "project",
    { urenapp_project_id: "p1", nummer: "n", naam: "n", stationsnaam: null, straat: null, postcode: null, stad: null, jaar: 2026, actief: true },
    { endpoint: "x", secret: "s", fetchImpl: m.fn },
  );
  assertEquals(res.ok, false);
  assert(res.error?.includes("planner_id"));
});

Deno.test("sendOne: urenapp_id mismatch → mislukt", async () => {
  const m = mockFetch([{ status: 200, body: { planner_id: "pl1", urenapp_id: "ANDERS", action: "created" } }]);
  const res = await sendOne(
    "project",
    { urenapp_project_id: "p1", nummer: "n", naam: "n", stationsnaam: null, straat: null, postcode: null, stad: null, jaar: 2026, actief: true },
    { endpoint: "x", secret: "s", fetchImpl: m.fn },
  );
  assertEquals(res.ok, false);
  assert(res.error?.includes("urenapp_id mismatch"));
});

Deno.test("sendOne: 429 wordt 2× herhaald, dan succes", async () => {
  const m = mockFetch([
    { status: 429, body: { error: "rate" } },
    { status: 429, body: { error: "rate" } },
    { status: 200, body: { planner_id: "pl1", urenapp_id: "p1", action: "created" } },
  ]);
  const res = await sendOne(
    "project",
    { urenapp_project_id: "p1", nummer: "n", naam: "n", stationsnaam: null, straat: null, postcode: null, stad: null, jaar: 2026, actief: true },
    { endpoint: "x", secret: "s", fetchImpl: m.fn, sleep: () => Promise.resolve() },
  );
  assertEquals(res.ok, true);
  assertEquals(res.planner_id, "pl1");
  assertEquals(m.calls, 3);
});

Deno.test("sendOne: 429 blijft → mislukt na max retries", async () => {
  const m = mockFetch([
    { status: 429 }, { status: 429 }, { status: 429 }, { status: 429 },
  ]);
  const res = await sendOne(
    "monteur",
    { urenapp_profile_id: "m1", naam: "n", type: "montagemonteur", actief: true, werkdagen: [1, 2, 3, 4, 5] },
    { endpoint: "x", secret: "s", fetchImpl: m.fn, sleep: () => Promise.resolve(), maxRetry429: 2 },
  );
  assertEquals(res.ok, false);
  assertEquals(res.status, 429);
});

Deno.test("sendOne: secret gaat in header x-urenapp-secret, niet in body", async () => {
  let capturedInit: RequestInit | null = null;
  const fetchImpl = async (_url: string, init: RequestInit) => {
    capturedInit = init;
    return new Response(JSON.stringify({ planner_id: "pl1", urenapp_id: "p1", action: "updated" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  await sendOne(
    "project",
    { urenapp_project_id: "p1", nummer: "n", naam: "n", stationsnaam: null, straat: null, postcode: null, stad: null, jaar: 2026, actief: true },
    { endpoint: "x", secret: "GEHEIM123", fetchImpl },
  );
  const init = capturedInit as unknown as RequestInit;
  assert(init, "geen init opgevangen");
  const headers = init.headers as Record<string, string>;
  assertEquals(headers["x-urenapp-secret"], "GEHEIM123");
  const body = init.body as string;
  assert(!body.includes("GEHEIM123"), "secret lekt in body");
});

// ─── synchroniseer (orchestrator) ──────────────────────────────────────────

Deno.test("dry-run verstuurt en wijzigt niets", async () => {
  let fetchCalls = 0;
  let dbCalls = 0;
  const r = await synchroniseer(
    [proj({ id: "p1" })],
    [mon({ id: "m1" })],
    {
      endpoint: "x", secret: "s",
      fetchImpl: async () => { fetchCalls++; return new Response("", { status: 200 }); },
      dryRun: true,
      writePlannerProjectId: async () => { dbCalls++; },
      writePlannerMonteurId: async () => { dbCalls++; },
    },
  );
  assertEquals(fetchCalls, 0);
  assertEquals(dbCalls, 0);
  assertEquals(r.aantallen.gesynchroniseerd, 2);
});

Deno.test("project zonder projectjaar → overgeslagen met reden projectjaar_ontbreekt", async () => {
  const r = await synchroniseer(
    [proj({ id: "p1", projectjaar: null })],
    [],
    { endpoint: "x", secret: "s", fetchImpl: async () => new Response("", { status: 200 }), dryRun: false },
  );
  assertEquals(r.aantallen.overgeslagen, 1);
  assertEquals(r.resultaten[0].reden, "projectjaar_ontbreekt");
});

Deno.test("onderaannemer-bedrijf overgeslagen, gekoppelde monteur wel meegenomen", async () => {
  let calls = 0;
  const r = await synchroniseer(
    [],
    [
      mon({ id: "bedrijf", is_onderaannemer: true }),
      mon({ id: "gekoppeld", is_onderaannemer: false }),
    ],
    {
      endpoint: "x", secret: "s",
      fetchImpl: async () => {
        calls++;
        return new Response(JSON.stringify({ planner_id: "pl", urenapp_id: "gekoppeld", action: "created" }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      },
      dryRun: false,
    },
  );
  assertEquals(calls, 1);
  assertEquals(r.aantallen.overgeslagen, 1);
  assertEquals(r.aantallen.gesynchroniseerd, 1);
});

Deno.test("succesvolle sync → schrijft planner_id terug via callback", async () => {
  const writes: { tafel: string; urenapp: string; planner: string }[] = [];
  const r = await synchroniseer(
    [proj({ id: "p1" })],
    [mon({ id: "m1" })],
    {
      endpoint: "x", secret: "s",
      fetchImpl: async (_u, init) => {
        const body = JSON.parse(init.body as string);
        const id = body.type === "project" ? body.data.urenapp_project_id : body.data.urenapp_profile_id;
        return new Response(JSON.stringify({ planner_id: "pl-" + id, urenapp_id: id, action: "created" }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      },
      dryRun: false,
      writePlannerProjectId: async (u, pl) => { writes.push({ tafel: "projects", urenapp: u, planner: pl }); },
      writePlannerMonteurId: async (u, pl) => { writes.push({ tafel: "profiles", urenapp: u, planner: pl }); },
    },
  );
  assertEquals(r.aantallen.gesynchroniseerd, 2);
  assertEquals(writes.length, 2);
  assert(writes.some(w => w.tafel === "projects" && w.urenapp === "p1" && w.planner === "pl-p1"));
  assert(writes.some(w => w.tafel === "profiles" && w.urenapp === "m1" && w.planner === "pl-m1"));
});

Deno.test("gedeeltelijke mislukking: één faalt, andere slaagt", async () => {
  let n = 0;
  const r = await synchroniseer(
    [proj({ id: "p1" }), proj({ id: "p2" })],
    [],
    {
      endpoint: "x", secret: "s",
      fetchImpl: async (_u, init) => {
        n++;
        const body = JSON.parse(init.body as string);
        const id = body.data.urenapp_project_id;
        if (id === "p2") return new Response(JSON.stringify({ error: "kapot" }), { status: 500, headers: { "content-type": "application/json" } });
        return new Response(JSON.stringify({ planner_id: "pl", urenapp_id: id, action: "created" }), { status: 200, headers: { "content-type": "application/json" } });
      },
      dryRun: false,
      concurrency: 1,
    },
  );
  assertEquals(r.aantallen.gesynchroniseerd, 1);
  assertEquals(r.aantallen.mislukt, 1);
  assertEquals(r.fouten.length, 1);
  assertEquals(r.fouten[0].urenapp_id, "p2");
});

// ─── Regressie: exacte envelope { type, data } ────────────────────────────

Deno.test("envelope: project gebruikt {type:'project', data:{...}} en niets anders top-level", async () => {
  let captured: any = null;
  const fetchImpl = async (_u: string, init: RequestInit) => {
    captured = JSON.parse(init.body as string);
    return new Response(JSON.stringify({ planner_id: "pl1", urenapp_id: "p1", action: "created" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  await sendOne(
    "project",
    { urenapp_project_id: "p1", nummer: "0295591", naam: "Clakenweg 21 Elburg", stationsnaam: null, straat: "Clakenweg 21", postcode: "8081 LT", stad: "Elburg", jaar: 2026, actief: true },
    { endpoint: "x", secret: "s", fetchImpl },
  );
  assertEquals(Object.keys(captured).sort(), ["data", "type"]);
  assertEquals(captured.type, "project");
  assertEquals(captured.data.urenapp_project_id, "p1");
  assertEquals(captured.data.nummer, "0295591");
  assertEquals(captured.data.jaar, 2026);
  assertEquals(captured.data.actief, true);
  // Geen oude envelope-velden
  assertEquals((captured as any).kind, undefined);
  assertEquals((captured as any).payload, undefined);
});

Deno.test("envelope: monteur gebruikt {type:'monteur', data:{...}} en niets anders top-level", async () => {
  let captured: any = null;
  const fetchImpl = async (_u: string, init: RequestInit) => {
    captured = JSON.parse(init.body as string);
    return new Response(JSON.stringify({ planner_id: "pl1", urenapp_id: "m1", action: "created" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  await sendOne(
    "monteur",
    { urenapp_profile_id: "m1", naam: "Jan", type: "montagemonteur", actief: true, werkdagen: [1,2,3,4,5] },
    { endpoint: "x", secret: "s", fetchImpl },
  );
  assertEquals(Object.keys(captured).sort(), ["data", "type"]);
  assertEquals(captured.type, "monteur");
  assertEquals(captured.data.urenapp_profile_id, "m1");
  assertEquals(captured.data.type, "montagemonteur");
  assertEquals(captured.data.werkdagen, [1,2,3,4,5]);
  assertEquals((captured as any).kind, undefined);
  assertEquals((captured as any).payload, undefined);
});

Deno.test("interne resultaatvelden behouden 'kind' en 'urenapp_id'", async () => {
  const r = await synchroniseer(
    [proj({ id: "p1" })],
    [],
    {
      endpoint: "x", secret: "s",
      fetchImpl: async () => new Response(JSON.stringify({ planner_id: "pl-p1", urenapp_id: "p1", action: "created" }), {
        status: 200, headers: { "content-type": "application/json" },
      }),
      dryRun: false,
    },
  );
  assertEquals(r.resultaten[0].kind, "project");
  assertEquals(r.resultaten[0].urenapp_id, "p1");
});

Deno.test("planner_project_id wordt NIET geschreven bij foutieve response-ID", async () => {
  const writes: string[] = [];
  const r = await synchroniseer(
    [proj({ id: "p1" })],
    [],
    {
      endpoint: "x", secret: "s",
      fetchImpl: async () => new Response(JSON.stringify({ planner_id: "pl", urenapp_id: "ANDERS", action: "created" }), {
        status: 200, headers: { "content-type": "application/json" },
      }),
      dryRun: false,
      writePlannerProjectId: async (u, _pl) => { writes.push(u); },
    },
  );
  assertEquals(writes.length, 0);
  assertEquals(r.aantallen.mislukt, 1);
});

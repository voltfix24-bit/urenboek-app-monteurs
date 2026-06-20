import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createHandler, classifyStatus, classifyStatusUren, safeEqual, dedupePreserveOrder, type RpcRow } from "./handler.ts";

const SECRET = "test-secret-1234567890";

interface Spy {
  rpcCalls: string[][];
  rateCalls: string[];
  rows: RpcRow[];
  allow: boolean;
  rpcError?: string;
}

function build(spy: Spy) {
  return createHandler({
    env: (k) => (k === "URENAPP_SYNC_SECRET" ? SECRET : undefined),
    corsHeaders: {},
    rpc: async (ids) => {
      spy.rpcCalls.push(ids);
      if (spy.rpcError) return { data: null, error: { message: spy.rpcError } };
      const set = new Set(ids);
      return { data: spy.rows.filter((r) => set.has(r.external_id)), error: null };
    },
    checkRateLimit: async (k) => { spy.rateCalls.push(k); return spy.allow; },
    clientIp: () => "1.2.3.4",
  });
}

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://x/planner-impact-check", {
    method: "POST",
    headers: { "content-type": "application/json", "x-urenapp-secret": SECRET, ...headers },
    body: JSON.stringify(body),
  });
}

function newSpy(rows: RpcRow[] = []): Spy {
  return { rpcCalls: [], rateCalls: [], rows, allow: true };
}

Deno.test("classifyStatusUren - geen", () => assertEquals(classifyStatusUren([]), "geen"));
Deno.test("classifyStatusUren - één", () => assertEquals(classifyStatusUren(["concept"]), "concept"));
Deno.test("classifyStatusUren - afgekeurd blijft afgekeurd", () => assertEquals(classifyStatusUren(["afgekeurd"]), "afgekeurd"));
Deno.test("classifyStatusUren - meerdere = gemengd", () => assertEquals(classifyStatusUren(["concept", "goedgekeurd"]), "gemengd"));
Deno.test("classifyStatusUren - onbekend filtered", () => assertEquals(classifyStatusUren(["xx"]), "geen"));

Deno.test("classifyStatus", () => {
  assertEquals(classifyStatus(false, 0), "niet_gesynced");
  assertEquals(classifyStatus(true, 0), "gesynced_geen_uren");
  assertEquals(classifyStatus(true, 4), "uren_geregistreerd");
});

Deno.test("safeEqual", () => {
  assertEquals(safeEqual("abc", "abc"), true);
  assertEquals(safeEqual("abc", "abd"), false);
  assertEquals(safeEqual("a", "abc"), false);
});

Deno.test("dedupe behoudt volgorde", () => {
  const { ordered, valid } = dedupePreserveOrder(["a:1", "b:2", "a:1", "x", "c:3"]);
  assertEquals(ordered, ["a:1", "b:2", "x", "c:3"]);
  assertEquals(valid.has("a:1"), true);
  assertEquals(valid.has("x"), false);
});

Deno.test("401 zonder secret", async () => {
  const h = build(newSpy());
  const r = new Request("http://x", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  const res = await h(r); await res.text();
  assertEquals(res.status, 401);
});

Deno.test("401 met fout secret", async () => {
  const h = build(newSpy());
  const res = await h(req({ external_ids: ["a:1"] }, { "x-urenapp-secret": "wrong" }));
  await res.text();
  assertEquals(res.status, 401);
});

Deno.test("405 niet-POST", async () => {
  const h = build(newSpy());
  const res = await h(new Request("http://x", { method: "GET", headers: { "x-urenapp-secret": SECRET } }));
  await res.text();
  assertEquals(res.status, 405);
});

Deno.test("400 bij lege array", async () => {
  const h = build(newSpy());
  const res = await h(req({ external_ids: [] }));
  await res.text();
  assertEquals(res.status, 400);
});

Deno.test("413 bij >500 ids", async () => {
  const h = build(newSpy());
  const ids = Array.from({ length: 501 }, (_, i) => `c:${i}`);
  const res = await h(req({ external_ids: ids }));
  await res.text();
  assertEquals(res.status, 413);
});

Deno.test("429 bij rate-limit", async () => {
  const spy = newSpy(); spy.allow = false;
  const h = build(spy);
  const res = await h(req({ external_ids: ["a:1"] }));
  await res.text();
  assertEquals(res.status, 429);
});

Deno.test("niet_gesynced voor onbekende geldige id", async () => {
  const h = build(newSpy());
  const res = await h(req({ external_ids: ["a:1"] }));
  const j = await res.json();
  assertEquals(res.status, 200);
  assertEquals(j.results[0], { external_id: "a:1", status: "niet_gesynced", uren_totaal: 0, status_uren: "geen", laatste_boeking_at: null });
});

Deno.test("onbekend bij ongeldig formaat", async () => {
  const h = build(newSpy());
  const res = await h(req({ external_ids: ["abc", "a:b:c", "x:"] }));
  const j = await res.json();
  for (const r of j.results) assertEquals(r.status, "onbekend");
});

Deno.test("gesynced_geen_uren", async () => {
  const h = build(newSpy([{ external_id: "a:1", has_planning: true, uren_totaal: 0, statussen: [], laatste_boeking_at: null }]));
  const res = await h(req({ external_ids: ["a:1"] }));
  const j = await res.json();
  assertEquals(j.results[0].status, "gesynced_geen_uren");
  assertEquals(j.results[0].status_uren, "geen");
});

Deno.test("uren_geregistreerd met concept", async () => {
  const h = build(newSpy([{ external_id: "a:1", has_planning: true, uren_totaal: 8, statussen: ["concept"], laatste_boeking_at: "2026-06-20T08:00:00Z" }]));
  const res = await h(req({ external_ids: ["a:1"] }));
  const j = await res.json();
  assertEquals(j.results[0], { external_id: "a:1", status: "uren_geregistreerd", uren_totaal: 8, status_uren: "concept", laatste_boeking_at: "2026-06-20T08:00:00Z" });
});

Deno.test("status_uren = afgekeurd blijft expliciet", async () => {
  const h = build(newSpy([{ external_id: "a:1", has_planning: true, uren_totaal: 4, statussen: ["afgekeurd"], laatste_boeking_at: "2026-06-20T08:00:00Z" }]));
  const res = await h(req({ external_ids: ["a:1"] }));
  const j = await res.json();
  assertEquals(j.results[0].status_uren, "afgekeurd");
});

Deno.test("gemengd bij meerdere statussen", async () => {
  const h = build(newSpy([{ external_id: "a:1", has_planning: true, uren_totaal: 12, statussen: ["concept","goedgekeurd"], laatste_boeking_at: "2026-06-20T08:00:00Z" }]));
  const res = await h(req({ external_ids: ["a:1"] }));
  const j = await res.json();
  assertEquals(j.results[0].status_uren, "gemengd");
});

Deno.test("soft-deleted krijgt geen aparte status (uren_geregistreerd of gesynced_geen_uren)", async () => {
  // RPC retourneert has_planning=true ongeacht external_deleted_at; gedrag is identiek.
  const h = build(newSpy([{ external_id: "a:1", has_planning: true, uren_totaal: 8, statussen: ["concept"], laatste_boeking_at: "2026-06-20T08:00:00Z" }]));
  const res = await h(req({ external_ids: ["a:1"] }));
  const j = await res.json();
  assertEquals(j.results[0].status, "uren_geregistreerd");
});

Deno.test("duplicaten gededupliceerd in volgorde van eerste voorkomen", async () => {
  const h = build(newSpy([
    { external_id: "a:1", has_planning: true, uren_totaal: 0, statussen: [], laatste_boeking_at: null },
    { external_id: "b:2", has_planning: false, uren_totaal: 0, statussen: [], laatste_boeking_at: null },
  ]));
  const res = await h(req({ external_ids: ["a:1", "b:2", "a:1", "a:1"] }));
  const j = await res.json();
  assertEquals(j.results.length, 2);
  assertEquals(j.results.map((r: any) => r.external_id), ["a:1", "b:2"]);
});

Deno.test("rate-limit-key bevat secret-hash en IP", async () => {
  const spy = newSpy([{ external_id: "a:1", has_planning: false, uren_totaal: 0, statussen: [], laatste_boeking_at: null }]);
  const h = build(spy);
  const res = await h(req({ external_ids: ["a:1"] }));
  await res.text();
  assertEquals(spy.rateCalls.length, 1);
  assertEquals(spy.rateCalls[0].startsWith("planner-impact:"), true);
  assertEquals(spy.rateCalls[0].endsWith(":1.2.3.4"), true);
});

Deno.test("read-only: RPC krijgt alleen geldige ids, geen writes elders", async () => {
  const spy = newSpy([{ external_id: "a:1", has_planning: true, uren_totaal: 0, statussen: [], laatste_boeking_at: null }]);
  const h = build(spy);
  const res = await h(req({ external_ids: ["a:1", "ongeldig", "b:2"] }));
  await res.text();
  assertEquals(spy.rpcCalls.length, 1);
  assertEquals(spy.rpcCalls[0].sort(), ["a:1", "b:2"]);
});

Deno.test("500 bij RPC-fout, geen detail in response", async () => {
  const spy = newSpy(); spy.rpcError = "boom-internal-detail";
  const h = build(spy);
  const res = await h(req({ external_ids: ["a:1"] }));
  const j = await res.json();
  assertEquals(res.status, 500);
  assertEquals(j.error, "Interne fout");
});

Deno.test("response bevat geen persoonsgegevens-velden", async () => {
  const h = build(newSpy([{ external_id: "a:1", has_planning: true, uren_totaal: 4, statussen: ["concept"], laatste_boeking_at: "2026-06-20T08:00:00Z" }]));
  const res = await h(req({ external_ids: ["a:1"] }));
  const j = await res.json();
  const keys = Object.keys(j.results[0]).sort();
  assertEquals(keys, ["external_id","laatste_boeking_at","status","status_uren","uren_totaal"]);
});

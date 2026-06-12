import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createHandler } from "./handler.ts";

const cors = { "access-control-allow-origin": "*" };

function makeDeps(over: Partial<Parameters<typeof createHandler>[0]> = {}) {
  const base: Parameters<typeof createHandler>[0] = {
    env: (k) => (k === "URENAPP_SYNC_SECRET" ? "sek" : undefined),
    corsHeaders: cors,
    supaUser: () => ({
      from: () => ({}),
      auth: { getClaims: async () => ({ data: { claims: { sub: "u1" } }, error: null }) },
      rpc: async () => ({ data: null, error: null }),
    }) as any,
    supaAdmin: () => ({
      from: (table: string) => {
        if (table === "user_roles") {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: "u1" }, error: null }) }) }) }),
          };
        }
        if (table === "projects" || table === "profiles") {
          return { select: async () => ({ data: [], error: null }) };
        }
        if (table === "planning") {
          return {
            select: () => ({ gte: () => ({ lte: async () => ({ data: [], error: null }) }) }),
          };
        }
        return {} as any;
      },
      auth: { getClaims: async () => ({ data: { claims: { sub: "u1" } }, error: null }) },
      rpc: async (_n: string, _a: any) => ({ data: true, error: null }),
    }) as any,
    fetchPlannerPlanning: async () => ({ ok: true, status: 200, payload: { planning: [], uitgesloten: [] } }),
  };
  return { ...base, ...over };
}

Deno.test("405 op GET", async () => {
  const h = createHandler(makeDeps());
  const r = await h(new Request("https://x", { method: "GET" }));
  assertEquals(r.status, 405);
});

Deno.test("401 zonder bearer", async () => {
  const h = createHandler(makeDeps());
  const r = await h(new Request("https://x", { method: "POST" }));
  assertEquals(r.status, 401);
});

Deno.test("403 zonder managerrol", async () => {
  const h = createHandler(makeDeps({
    supaAdmin: () => ({
      from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
      auth: { getClaims: async () => ({ data: { claims: { sub: "u1" } }, error: null }) },
      rpc: async () => ({ data: true, error: null }),
    }) as any,
  }));
  const r = await h(new Request("https://x", {
    method: "POST",
    headers: { Authorization: "Bearer x" },
    body: JSON.stringify({ datum_vanaf: "2026-06-15", datum_tot: "2026-06-15" }),
  }));
  assertEquals(r.status, 403);
});

Deno.test("400 bij ongeldig bereik", async () => {
  const h = createHandler(makeDeps());
  const r = await h(new Request("https://x", {
    method: "POST",
    headers: { Authorization: "Bearer x" },
    body: JSON.stringify({ datum_vanaf: "2026-06-15", datum_tot: "2026-12-31" }),
  }));
  assertEquals(r.status, 400);
});

Deno.test("429 bij rate-limit", async () => {
  const h = createHandler(makeDeps({
    supaAdmin: () => ({
      from: (table: string) => {
        if (table === "user_roles") return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: "u1" }, error: null }) }) }) }) };
        return { select: async () => ({ data: [], error: null }) };
      },
      auth: { getClaims: async () => ({ data: { claims: { sub: "u1" } }, error: null }) },
      rpc: async () => ({ data: false, error: null }),
    }) as any,
  }));
  const r = await h(new Request("https://x", {
    method: "POST",
    headers: { Authorization: "Bearer x" },
    body: JSON.stringify({ datum_vanaf: "2026-06-15", datum_tot: "2026-06-15" }),
  }));
  assertEquals(r.status, 429);
});

Deno.test("200 leeg pad", async () => {
  const h = createHandler(makeDeps());
  const r = await h(new Request("https://x", {
    method: "POST",
    headers: { Authorization: "Bearer x" },
    body: JSON.stringify({ datum_vanaf: "2026-06-15", datum_tot: "2026-06-15" }),
  }));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.success, true);
  assertEquals(j.aantallen.totaal_planner, 0);
});

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createHandler } from "./handler.ts";

const PLANNER_PLANNING_ENDPOINT =
  "https://nafldfgbhjpswwaqfjwr.supabase.co/functions/v1/list-planning-for-urenapp";

const handler = createHandler({
  env: (k) => Deno.env.get(k),
  corsHeaders,
  supaUser: (authHeader) =>
    createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    ) as any,
  supaAdmin: () =>
    createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    ) as any,
  fetchPlannerPlanning: async (range) => {
    const secret = Deno.env.get("URENAPP_SYNC_SECRET")!;
    try {
      const resp = await fetch(PLANNER_PLANNING_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", "x-urenapp-secret": secret },
        body: JSON.stringify(range),
      });
      if (!resp.ok) {
        await resp.text().catch(() => "");
        return { ok: false, status: resp.status, payload: null };
      }
      return { ok: true, status: resp.status, payload: await resp.json() };
    } catch (e) {
      console.error("Planner planning onbereikbaar:", (e as Error).message);
      return { ok: false, status: 0, payload: null };
    }
  },
});

Deno.serve(handler);

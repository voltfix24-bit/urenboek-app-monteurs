// Productie-entrypoint: wired echte Supabase + fetch in.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createHandler } from "./handler.ts";

const PLANNER_LIST_ENDPOINT =
  "https://nafldfgbhjpswwaqfjwr.supabase.co/functions/v1/list-masterdata-for-matching";
const PLANNER_LINK_ENDPOINT =
  "https://nafldfgbhjpswwaqfjwr.supabase.co/functions/v1/apply-urenapp-link";

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
  fetchPlannerList: async () => {
    const secret = Deno.env.get("URENAPP_SYNC_SECRET")!;
    try {
      const resp = await fetch(PLANNER_LIST_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", "x-urenapp-secret": secret },
        body: "{}",
      });
      if (!resp.ok) {
        await resp.text().catch(() => "");
        return { ok: false, status: resp.status, payload: null };
      }
      return { ok: true, status: resp.status, payload: await resp.json() };
    } catch (e) {
      console.error("Planner list onbereikbaar:", (e as Error).message);
      return { ok: false, status: 0, payload: null };
    }
  },
  fetchPlannerLink: async (body) => {
    const secret = Deno.env.get("URENAPP_SYNC_SECRET")!;
    const resp = await fetch(PLANNER_LINK_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-urenapp-secret": secret },
      body: JSON.stringify(body),
    });
    await resp.text().catch(() => "");
    return { ok: resp.ok, status: resp.status };
  },
});

Deno.serve(handler);

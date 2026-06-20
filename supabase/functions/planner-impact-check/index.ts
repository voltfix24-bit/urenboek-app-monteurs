import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createHandler } from "./handler.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const handler = createHandler({
  env: (k) => Deno.env.get(k),
  corsHeaders,
  rpc: async (ids) => {
    const { data, error } = await admin.rpc("planner_impact_check_v1", { _external_ids: ids });
    return { data: (data as any) ?? null, error: error ? { message: error.message } : null };
  },
  checkRateLimit: async (key) => {
    const { data, error } = await admin.rpc("check_rate_limit", {
      _key: key,
      _endpoint: "planner-impact-check",
      _limit: 30,
      _window_seconds: 60,
    });
    if (error) return false;
    return data !== false;
  },
  clientIp: (req) => {
    const xf = req.headers.get("x-forwarded-for");
    if (xf) return xf.split(",")[0].trim();
    return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "";
  },
});

Deno.serve(handler);

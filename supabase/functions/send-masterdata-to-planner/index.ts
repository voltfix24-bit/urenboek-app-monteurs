// Edge function: handmatige verzending van masterdata (projecten + monteurs)
// naar TerreVolt Planner. Geen triggers, geen achtergrondtaken.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";
import {
  synchroniseer,
  type ProjectRow,
  type MonteurRow,
} from "./orchestrator.ts";

const PLANNER_ENDPOINT = "https://nafldfgbhjpswwaqfjwr.supabase.co/functions/v1/receive-urenapp-masterdata";

const BodySchema = z.object({
  actie: z.enum(["projecten", "monteurs", "alles"]),
  ids: z.array(z.string().uuid()).optional(),
  dry_run: z.boolean().optional().default(false),
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // 1) Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sharedSecret = Deno.env.get("URENAPP_SYNC_SECRET");
  if (!sharedSecret) return json(500, { error: "Server misconfigured" });

  const supaUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await supaUser.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims?.sub) return json(401, { error: "Unauthorized" });
  const userId = claimsData.claims.sub as string;

  // 2) Manager-check (service role, bypass RLS)
  const supaAdmin = createClient(supabaseUrl, serviceKey);
  const { data: roleRow, error: roleErr } = await supaAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "manager")
    .maybeSingle();
  if (roleErr) return json(500, { error: "Role check failed" });
  if (!roleRow) return json(403, { error: "Forbidden: manager required" });

  // 3) DB rate-limit (5/min per gebruiker op dit endpoint)
  const { data: rateOk, error: rateErr } = await supaAdmin.rpc("check_rate_limit", {
    _key: `user:${userId}`,
    _endpoint: "send-masterdata-to-planner",
    _limit: 5,
    _window_seconds: 60,
  });
  if (rateErr) return json(500, { error: "Rate-limit check failed" });
  if (rateOk === false) return json(429, { error: "Te veel verzoeken, probeer later opnieuw" });

  // 4) Body
  let parsed: z.infer<typeof BodySchema>;
  try {
    const raw = await req.json();
    const r = BodySchema.safeParse(raw);
    if (!r.success) return json(400, { error: r.error.flatten() });
    parsed = r.data;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  // 5) Data laden
  let projects: ProjectRow[] = [];
  let monteurs: MonteurRow[] = [];

  if (parsed.actie === "projecten" || parsed.actie === "alles") {
    let q = supaAdmin.from("projects").select(
      "id, nummer, naam, stationsnaam, straat, postcode, stad, active, projectjaar"
    );
    if (parsed.ids?.length) q = q.in("id", parsed.ids);
    const { data, error } = await q;
    if (error) return json(500, { error: "Kon projecten niet laden" });
    projects = (data ?? []) as ProjectRow[];
  }

  if (parsed.actie === "monteurs" || parsed.actie === "alles") {
    let q = supaAdmin.from("profiles").select(
      "id, user_id, full_name, account_status, is_onderaannemer, vaste_vrije_dagen"
    );
    if (parsed.ids?.length) q = q.in("id", parsed.ids);
    const { data: profs, error: pErr } = await q;
    if (pErr) return json(500, { error: "Kon profielen niet laden" });

    const userIds = (profs ?? []).map((p: any) => p.user_id);
    const { data: rolesData, error: rErr } = await supaAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    if (rErr) return json(500, { error: "Kon rollen niet laden" });

    const rolesByUser = new Map<string, string[]>();
    for (const r of rolesData ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    }

    monteurs = (profs ?? []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      account_status: p.account_status,
      is_onderaannemer: p.is_onderaannemer,
      vaste_vrije_dagen: p.vaste_vrije_dagen ?? [],
      roles: rolesByUser.get(p.user_id) ?? [],
    }));
  }

  // 6) Orchestreer
  const result = await synchroniseer(projects, monteurs, {
    endpoint: PLANNER_ENDPOINT,
    secret: sharedSecret,
    fetchImpl: fetch,
    concurrency: 5,
    dryRun: parsed.dry_run,
    writePlannerProjectId: async (urenappId, plannerId) => {
      const { error } = await supaAdmin.from("projects")
        .update({ planner_project_id: plannerId }).eq("id", urenappId);
      if (error) throw new Error(error.message);
    },
    writePlannerMonteurId: async (urenappId, plannerId) => {
      const { error } = await supaAdmin.from("profiles")
        .update({ planner_monteur_id: plannerId }).eq("id", urenappId);
      if (error) throw new Error(error.message);
    },
  });

  return json(200, {
    success: true,
    dry_run: parsed.dry_run,
    aantallen: result.aantallen,
    resultaten: result.resultaten,
    fouten: result.fouten,
  });
});

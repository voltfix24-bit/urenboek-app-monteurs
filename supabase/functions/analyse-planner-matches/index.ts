// Manager-only, read-only analyse.
// Roept het Planner-endpoint list-masterdata-for-matching aan met server-side
// shared secret en vergelijkt met urenapp-data via de pure matcher-module.
// Geen DB-writes, geen upserts.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  matchMonteurs,
  matchProjecten,
  type PlannerMonteur,
  type PlannerProject,
  type UrenappMonteur,
  type UrenappProject,
} from "./matcher.ts";

const PLANNER_ENDPOINT =
  "https://nafldfgbhjpswwaqfjwr.supabase.co/functions/v1/list-masterdata-for-matching";

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

  // 2) Manager-check
  const supaAdmin = createClient(supabaseUrl, serviceKey);
  const { data: roleRow, error: roleErr } = await supaAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "manager")
    .maybeSingle();
  if (roleErr) return json(500, { error: "Role check failed" });
  if (!roleRow) return json(403, { error: "Forbidden: manager required" });

  // 3) DB rate-limit (5/min)
  const { data: rateOk, error: rateErr } = await supaAdmin.rpc("check_rate_limit", {
    _key: `user:${userId}`,
    _endpoint: "analyse-planner-matches",
    _limit: 5,
    _window_seconds: 60,
  });
  if (rateErr) return json(500, { error: "Rate-limit check failed" });
  if (rateOk === false) return json(429, { error: "Te veel verzoeken, probeer later opnieuw" });

  // 4) Haal urenapp-data op (read-only)
  const [{ data: projs, error: pErr }, { data: profs, error: prErr }, { data: rolesRows, error: rErr }] =
    await Promise.all([
      supaAdmin.from("projects").select("id, nummer, naam, projectjaar, planner_project_id, stad"),
      supaAdmin
        .from("profiles")
        .select("id, user_id, full_name, is_onderaannemer, planner_monteur_id"),
      supaAdmin.from("user_roles").select("user_id, role"),
    ]);
  if (pErr || prErr || rErr) return json(500, { error: "Kon urenapp-data niet laden" });

  const rolesByUser = new Map<string, string[]>();
  for (const r of rolesRows ?? []) {
    const a = rolesByUser.get(r.user_id) ?? [];
    a.push(r.role);
    rolesByUser.set(r.user_id, a);
  }
  const urenappProjects: UrenappProject[] = (projs ?? []).map((p: any) => ({
    id: p.id,
    nummer: p.nummer ?? "",
    naam: p.naam ?? "",
    projectjaar: p.projectjaar ?? null,
    planner_project_id: p.planner_project_id ?? null,
    locatie: p.stad ?? null,
  }));
  const urenappMonteurs: UrenappMonteur[] = (profs ?? [])
    .map((p: any) => {
      const roles = rolesByUser.get(p.user_id) ?? [];
      const planbaar =
        !p.is_onderaannemer &&
        !roles.includes("manager") &&
        (roles.includes("monteur") || roles.includes("schakelmonteur"));
      if (!planbaar) return null;
      const type = roles.includes("schakelmonteur") ? "schakelmonteur" : "monteur";
      return {
        id: p.id,
        full_name: p.full_name ?? "",
        planner_monteur_id: p.planner_monteur_id ?? null,
        type,
      } as UrenappMonteur;
    })
    .filter((x): x is UrenappMonteur => x !== null);

  // 5) Haal Planner-data (server-side secret, niet loggen)
  let plannerProjects: PlannerProject[] = [];
  let plannerMonteurs: PlannerMonteur[] = [];
  try {
    const resp = await fetch(PLANNER_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-urenapp-secret": sharedSecret,
      },
      body: "{}",
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error("Planner endpoint fout:", resp.status, body.slice(0, 200));
      return json(502, { error: "Planner-endpoint gaf een fout" });
    }
    const payload = await resp.json();
    plannerProjects = Array.isArray(payload?.projecten) ? payload.projecten : [];
    plannerMonteurs = Array.isArray(payload?.monteurs) ? payload.monteurs : [];
    console.log("DEBUG first planner project:", JSON.stringify(plannerProjects[0] ?? null));
    console.log("DEBUG first planner monteur:", JSON.stringify(plannerMonteurs[0] ?? null));
  } catch (e) {
    console.error("Planner endpoint onbereikbaar:", (e as Error).message);
    return json(502, { error: "Planner-endpoint onbereikbaar" });
  }

  // 6) Match (puur, in-memory)
  const projectResultaten = matchProjecten(urenappProjects, plannerProjects);
  const monteurResultaten = matchMonteurs(urenappMonteurs, plannerMonteurs);

  const telling = (arr: { status: string }[]) => ({
    exact: arr.filter((r) => r.status === "exact").length,
    waarschijnlijk: arr.filter((r) => r.status === "waarschijnlijk").length,
    conflict: arr.filter((r) => r.status === "conflict").length,
    geen_match: arr.filter((r) => r.status === "geen_match").length,
    totaal: arr.length,
  });

  return json(200, {
    success: true,
    projecten: {
      aantallen: telling(projectResultaten),
      resultaten: projectResultaten,
    },
    monteurs: {
      aantallen: telling(monteurResultaten),
      resultaten: monteurResultaten,
    },
    planner_aantallen: {
      projecten: plannerProjects.length,
      monteurs: plannerMonteurs.length,
    },
  });
});

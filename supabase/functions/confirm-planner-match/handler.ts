// Pure handler-factory: alle externe IO komt via `deps` binnen, zodat dezelfde
// code 1-op-1 in productie én in tests kan draaien.

import {
  matchMonteurs,
  matchProjecten,
  type PlannerMonteur,
  type PlannerProject,
  type UrenappMonteur,
  type UrenappProject,
} from "../analyse-planner-matches/matcher.ts";

export interface SupabaseLikeClient {
  // We gebruiken alleen .from(table).{select,update,insert,eq,is,maybeSingle}
  from: (table: string) => any;
  auth: { getClaims: (token: string) => Promise<{ data: any; error: any }> };
  rpc: (name: string, args: any) => Promise<{ data: any; error: any }>;
}

export interface Deps {
  supaUser: (authHeader: string) => SupabaseLikeClient;
  supaAdmin: () => SupabaseLikeClient;
  fetchPlannerList: () => Promise<{ ok: boolean; status: number; payload: any }>;
  fetchPlannerLink: (body: {
    kind: "project" | "monteur";
    planner_id: string;
    urenapp_id: string;
    expected_current_urenapp_id: string | null;
  }) => Promise<{ ok: boolean; status: number }>;
  env: (k: string) => string | undefined;
  corsHeaders: Record<string, string>;
}

type Kind = "project" | "monteur";

function isUuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

export function createHandler(deps: Deps) {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...deps.corsHeaders, "content-type": "application/json" },
    });

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS")
      return new Response("ok", { headers: deps.corsHeaders });
    if (req.method !== "POST") return json(405, { error: "Method not allowed" });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer "))
      return json(401, { error: "Unauthorized" });

    const sharedSecret = deps.env("URENAPP_SYNC_SECRET");
    if (!sharedSecret) return json(500, { error: "Server misconfigured" });

    const supaUser = deps.supaUser(authHeader);
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } =
      await supaUser.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub)
      return json(401, { error: "Unauthorized" });
    const userId = claimsData.claims.sub as string;

    const supaAdmin = deps.supaAdmin();
    const { data: roleRow, error: roleErr } = await supaAdmin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", userId)
      .eq("role", "manager")
      .maybeSingle();
    if (roleErr) return json(500, { error: "Role check failed" });
    if (!roleRow) return json(403, { error: "Forbidden: manager required" });

    const { data: rateOk, error: rateErr } = await supaAdmin.rpc(
      "check_rate_limit",
      {
        _key: `user:${userId}`,
        _endpoint: "confirm-planner-match",
        _limit: 10,
        _window_seconds: 60,
      },
    );
    if (rateErr) return json(500, { error: "Rate-limit check failed" });
    if (rateOk === false) return json(429, { error: "Te veel verzoeken" });

    let body: { kind: Kind; urenapp_id: string; planner_id: string };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Ongeldige JSON" });
    }
    const { kind, urenapp_id, planner_id } = body ?? ({} as any);
    if (kind !== "project" && kind !== "monteur")
      return json(400, { error: "Ongeldig kind" });
    if (!isUuid(urenapp_id)) return json(400, { error: "Ongeldig urenapp_id" });
    if (
      typeof planner_id !== "string" ||
      planner_id.length === 0 ||
      planner_id.length > 128
    )
      return json(400, { error: "Ongeldig planner_id" });

    const audit = async (
      status: "exact" | "waarschijnlijk",
      uitkomst: "gekoppeld" | "rolled_back" | "geweigerd" | "reeds_gekoppeld",
      fout?: string,
    ) => {
      const { error } = await supaAdmin.from("planner_match_audit").insert({
        manager_user_id: userId,
        kind,
        urenapp_id,
        planner_id,
        status,
        uitkomst,
        fout_reden: fout ?? null,
      });
      if (error) console.error("audit insert error:", error.message);
    };

    const [
      { data: projs, error: pErr },
      { data: profs, error: prErr },
      { data: rolesRows, error: rErr },
    ] = await Promise.all([
      supaAdmin
        .from("projects")
        .select(
          "id, nummer, naam, projectjaar, planner_project_id, stad, planner_sync_enabled, planner_sync_exclusion_reason",
        ),
      supaAdmin
        .from("profiles")
        .select("id, user_id, full_name, is_onderaannemer, planner_monteur_id"),
      supaAdmin.from("user_roles").select("user_id, role"),
    ]);
    if (pErr || prErr || rErr)
      return json(500, { error: "Kon urenapp-data niet laden" });

    const rolesByUser = new Map<string, string[]>();
    for (const r of rolesRows ?? []) {
      const a = rolesByUser.get(r.user_id) ?? [];
      a.push(r.role);
      rolesByUser.set(r.user_id, a);
    }

    const projRow = (projs ?? []).find((p: any) => p.id === urenapp_id);
    const profRow = (profs ?? []).find((p: any) => p.id === urenapp_id);

    if (kind === "project") {
      if (!projRow) {
        await audit("exact", "geweigerd", "urenapp_record_niet_gevonden");
        return json(404, { error: "Urenapp-project niet gevonden" });
      }
      if (projRow.planner_sync_enabled === false) {
        await audit("exact", "geweigerd", "uitgesloten");
        return json(409, { error: "Project is uitgesloten van sync" });
      }
    } else {
      if (!profRow) {
        await audit("exact", "geweigerd", "urenapp_record_niet_gevonden");
        return json(404, { error: "Urenapp-monteur niet gevonden" });
      }
    }

    const listResp = await deps.fetchPlannerList();
    if (!listResp.ok)
      return json(502, { error: "Planner-endpoint gaf een fout" });
    const payload = listResp.payload;
    const plannerProjects: PlannerProject[] = (Array.isArray(payload?.projecten)
      ? payload.projecten
      : []
    ).map((p: any) => ({
      planner_id: p.planner_id,
      urenapp_project_id: p.urenapp_project_id ?? null,
      nummer: String(p.nummer ?? p.case_nummer ?? ""),
      naam: String(p.naam ?? p.station_naam ?? ""),
      locatie: p.locatie ?? p.stad ?? null,
      jaar: p.jaar ?? null,
    }));
    const plannerMonteurs: PlannerMonteur[] = (Array.isArray(payload?.monteurs)
      ? payload.monteurs
      : []
    ).map((m: any) => ({
      planner_id: m.planner_id,
      urenapp_profile_id: m.urenapp_profile_id ?? null,
      naam: String(m.naam ?? ""),
      type: m.type ?? null,
      actief: m.actief ?? true,
    }));

    let analyseRow:
      | { status: string; kandidaat: { planner_id: string } | null }
      | undefined;
    if (kind === "project") {
      const urenappProjects: UrenappProject[] = (projs ?? [])
        .filter((p: any) => p.planner_sync_enabled !== false)
        .map((p: any) => ({
          id: p.id,
          nummer: p.nummer ?? "",
          naam: p.naam ?? "",
          projectjaar: p.projectjaar ?? null,
          planner_project_id: p.planner_project_id ?? null,
          locatie: p.stad ?? null,
        }));
      analyseRow = matchProjecten(urenappProjects, plannerProjects).find(
        (r) => r.urenapp.id === urenapp_id,
      ) as any;
    } else {
      const urenappMonteurs: UrenappMonteur[] = (profs ?? [])
        .map((p: any) => {
          const roles = rolesByUser.get(p.user_id) ?? [];
          const planbaar =
            !p.is_onderaannemer &&
            !roles.includes("manager") &&
            (roles.includes("monteur") || roles.includes("schakelmonteur"));
          if (!planbaar) return null;
          const type = roles.includes("schakelmonteur")
            ? "schakelmonteur"
            : "montagemonteur";
          return {
            id: p.id,
            full_name: p.full_name ?? "",
            planner_monteur_id: p.planner_monteur_id ?? null,
            type,
          } as UrenappMonteur;
        })
        .filter((x: UrenappMonteur | null): x is UrenappMonteur => x !== null);
      analyseRow = matchMonteurs(urenappMonteurs, plannerMonteurs).find(
        (r) => r.urenapp.id === urenapp_id,
      ) as any;
    }

    if (!analyseRow) {
      await audit("exact", "geweigerd", "geen_analyse_resultaat");
      return json(409, { error: "Geen analyseresultaat voor dit record" });
    }
    if (
      analyseRow.status !== "exact" &&
      analyseRow.status !== "waarschijnlijk"
    ) {
      await audit("exact", "geweigerd", `status:${analyseRow.status}`);
      return json(409, {
        error: `Status ${analyseRow.status} kan niet worden gekoppeld`,
      });
    }
    if (
      !analyseRow.kandidaat ||
      analyseRow.kandidaat.planner_id !== planner_id
    ) {
      await audit(
        analyseRow.status as any,
        "geweigerd",
        "stale_analyse_kandidaat_afwijkend",
      );
      return json(409, {
        error:
          "Analyse is verouderd of komt niet meer overeen. Vernieuw en probeer opnieuw.",
      });
    }

    const analyseStatus = analyseRow.status as "exact" | "waarschijnlijk";

    const plannerSide =
      kind === "project"
        ? plannerProjects.find((p) => p.planner_id === planner_id)
        : plannerMonteurs.find((m) => m.planner_id === planner_id);
    if (!plannerSide) {
      await audit(analyseStatus, "geweigerd", "planner_record_weg");
      return json(409, { error: "Planner-record bestaat niet meer" });
    }

    const huidigUrenappLink =
      kind === "project"
        ? (projRow.planner_project_id as string | null)
        : (profRow.planner_monteur_id as string | null);
    const huidigPlannerLink =
      kind === "project"
        ? ((plannerSide as PlannerProject).urenapp_project_id as string | null)
        : ((plannerSide as PlannerMonteur).urenapp_profile_id as string | null);

    if (huidigUrenappLink === planner_id && huidigPlannerLink === urenapp_id) {
      await audit(analyseStatus, "reeds_gekoppeld");
      return json(200, { success: true, reeds_gekoppeld: true });
    }
    if (huidigUrenappLink && huidigUrenappLink !== planner_id) {
      await audit(analyseStatus, "geweigerd", "urenapp_anders_gekoppeld");
      return json(409, {
        error:
          "Urenapp-record is al aan een ander Planner-record gekoppeld",
      });
    }
    if (huidigPlannerLink && huidigPlannerLink !== urenapp_id) {
      await audit(analyseStatus, "geweigerd", "planner_anders_gekoppeld");
      return json(409, {
        error: "Planner-record is al aan een ander urenapp-record gekoppeld",
      });
    }

    let urenappUpdated = false;
    if (huidigUrenappLink !== planner_id) {
      const table = kind === "project" ? "projects" : "profiles";
      const col = kind === "project" ? "planner_project_id" : "planner_monteur_id";
      const { data, error } = await supaAdmin
        .from(table)
        .update({ [col]: planner_id })
        .eq("id", urenapp_id)
        .is(col, null)
        .select("id")
        .maybeSingle();
      if (error) {
        await audit(analyseStatus, "geweigerd", "urenapp_write_fout");
        return json(500, { error: "Urenapp-write mislukt" });
      }
      if (!data) {
        await audit(analyseStatus, "geweigerd", "urenapp_state_veranderd");
        return json(409, {
          error: "Urenapp-record is tijdens de actie gewijzigd",
        });
      }
      urenappUpdated = true;
    }

    const rollback = async () => {
      if (!urenappUpdated) return;
      const table = kind === "project" ? "projects" : "profiles";
      const col = kind === "project" ? "planner_project_id" : "planner_monteur_id";
      await supaAdmin
        .from(table)
        .update({ [col]: null })
        .eq("id", urenapp_id)
        .eq(col, planner_id);
    };

    try {
      const linkResp = await deps.fetchPlannerLink({
        kind,
        planner_id,
        urenapp_id,
        expected_current_urenapp_id: huidigPlannerLink,
      });
      if (!linkResp.ok) {
        await rollback();
        await audit(analyseStatus, "rolled_back", `planner_status_${linkResp.status}`);
        return json(502, {
          error:
            "Planner-kant kon niet worden bijgewerkt; urenapp-kant teruggedraaid",
        });
      }
    } catch (e) {
      console.error("Planner link onbereikbaar:", (e as Error).message);
      await rollback();
      await audit(analyseStatus, "rolled_back", "planner_onbereikbaar");
      return json(502, {
        error: "Planner-endpoint onbereikbaar; urenapp-kant teruggedraaid",
      });
    }

    await audit(analyseStatus, "gekoppeld");
    return json(200, { success: true, gekoppeld: true, status: analyseStatus });
  };
}

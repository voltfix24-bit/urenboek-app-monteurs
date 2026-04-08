import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { format, startOfISOWeek, addDays } from "date-fns";
import { volledigAdres } from "@/lib/utils";

interface DashboardData {
  pendingCount: number;
  weekHours: number;
  activeProjects: number;
  teamCount: number;
  pendingEntries: any[];
  verlofAanvragen: any[];
  expiringCerts: any[];
  todayPlanning: any[];
  projectsWithMarge: any[];
  overurenMeldingen: any[];
  overurenCount: number;
  statusGroups: Record<string, number>;
}

async function fetchDashboard(): Promise<DashboardData> {
  try {
  const weekStart = startOfISOWeek(new Date());
  const weekEnd = addDays(weekStart, 6);
  const today = format(new Date(), "yyyy-MM-dd");

  // Pending approvals
  const { data: pending } = await supabase
    .from("uren_boekingen")
    .select("id, datum, project_id, uren, beschrijving, medewerker_id, type")
    .eq("status", "ingediend")
    .order("datum")
    .limit(10);

  let pendingEntries: any[] = [];
  if (pending && pending.length > 0) {
    const medIds = [...new Set(pending.map((p: any) => p.medewerker_id))];
    const projIds = [...new Set(pending.map((p: any) => p.project_id))];
    const [{ data: profiles }, { data: projects }] = await Promise.all([
      medIds.length > 0 ? supabase.from("profiles").select("id, full_name").in("id", medIds) : { data: [] },
      projIds.length > 0 ? supabase.from("projects").select("id, naam, nummer").in("id", projIds) : { data: [] },
    ]);
    const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));
    const projMap = new Map((projects ?? []).map((p: any) => [p.id, p]));
    pendingEntries = pending.map(e => {
      const proj = projMap.get(e.project_id) || { naam: "", nummer: "" };
      return { ...e, full_name: nameMap.get(e.medewerker_id) || "Onbekend", project_naam: (proj as any).naam, project_nummer: (proj as any).nummer };
    });
  }

  // Week hours
  const { data: weekData } = await supabase
    .from("uren_boekingen")
    .select("uren")
    .eq("status", "goedgekeurd")
    .gte("datum", format(weekStart, "yyyy-MM-dd"))
    .lte("datum", format(weekEnd, "yyyy-MM-dd"));
  const weekHours = weekData?.reduce((s: number, e: any) => s + Number(e.uren), 0) || 0;

  // Active projects + status groups
  const { data: allProjects } = await supabase.from("projects").select("id, status").eq("active", true);
  const activeProjects = allProjects?.length || 0;
  const statusGroups: Record<string, number> = {};
  (allProjects || []).forEach((p: any) => {
    const s = p.status || "nieuw";
    statusGroups[s] = (statusGroups[s] || 0) + 1;
  });

  // Team count
  const { count: tCount } = await supabase.from("profiles").select("id", { count: "exact", head: true });

  // Verlof
  const { data: verlof } = await supabase.from("beschikbaarheid").select("id, medewerker_id, type, datum_van, datum_tot, reden, status").eq("status", "aangevraagd").order("datum_van").limit(5);
  let verlofAanvragen: any[] = [];
  if (verlof && verlof.length > 0) {
    const profIds = [...new Set(verlof.map((v: any) => v.medewerker_id))];
    const { data: profs } = profIds.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", profIds) : { data: [] };
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
    verlofAanvragen = verlof.map((v: any) => ({ ...v, naam: profMap.get(v.medewerker_id) || "Onbekend" }));
  }

  // Expiring certs
  const thirtyDays = format(addDays(new Date(), 30), "yyyy-MM-dd");
  const { data: certs } = await supabase.from("certificaten").select("id, medewerker_id, naam, type, vervaldatum").lte("vervaldatum", thirtyDays).order("vervaldatum").limit(5);
  let expiringCerts: any[] = [];
  if (certs && certs.length > 0) {
    const profIds = [...new Set(certs.map((c: any) => c.medewerker_id))];
    const { data: profs } = profIds.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", profIds) : { data: [] };
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
    expiringCerts = certs.map((c: any) => ({ ...c, medewerker: profMap.get(c.medewerker_id) || "Onbekend" }));
  }

  // Today planning
  let todayPlanning: any[] = [];
  const { data: plan } = await supabase.from("planning").select("id, medewerker_id, project_id, starttijd, eindtijd, activiteit, activiteit_kleur").eq("datum", today);
  if (plan && plan.length > 0) {
    const profIds = [...new Set(plan.map((p: any) => p.medewerker_id))];
    const projIds = [...new Set(plan.map((p: any) => p.project_id))];
    const [{ data: profs }, { data: projs }, { data: boekData }] = await Promise.all([
      profIds.length > 0 ? supabase.from("profiles").select("id, full_name").in("id", profIds) : { data: [] },
      projIds.length > 0 ? supabase.from("projects").select("id, naam, straat, postcode, stad, adres").in("id", projIds) : { data: [] },
      profIds.length > 0 ? supabase.from("uren_boekingen").select("medewerker_id, uren, status").eq("datum", today).in("medewerker_id", profIds).in("status", ["concept", "ingediend", "goedgekeurd"]) : { data: [] },
    ]);
    const profMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
    const projMap = new Map((projs ?? []).map((p: any) => [p.id, p]));
    const boekMap = new Map<string, { uren: number; status: string }>();
    (boekData ?? []).forEach((b: any) => { boekMap.set(b.medewerker_id, { uren: Number(b.uren), status: b.status }); });
    todayPlanning = plan.map((p: any) => {
      const proj = projMap.get(p.project_id) || {};
      return { ...p, naam: profMap.get(p.medewerker_id) || "Onbekend", project: (proj as any).naam || "Onbekend", projectAdres: volledigAdres(proj as any), starttijd: p.starttijd?.slice(0, 5), eindtijd: p.eindtijd?.slice(0, 5), activiteit: p.activiteit || null, activiteit_kleur: p.activiteit_kleur || null, boeking: boekMap.get(p.medewerker_id) || null };
    });
  }

  // Projects with marge
  let projectsWithMarge: any[] = [];
  const { data: forecasts } = await supabase.from("project_forecast").select("id, project_id, methode");
  if (forecasts && forecasts.length > 0) {
    const fIds = forecasts.map((f: any) => f.id);
    const pIds = forecasts.map((f: any) => f.project_id);
    const [{ data: regels }, { data: projs }] = await Promise.all([
      supabase.from("forecast_regels").select("forecast_id, tarief, eigen_kosten, aantal, geplande_uren, uurtarief_snap, type").in("forecast_id", fIds),
      supabase.from("projects").select("id, naam, nummer").in("id", pIds),
    ]);
    const projMap = new Map((projs ?? []).map((p: any) => [p.id, p]));
    const fProject = new Map(forecasts.map((f: any) => [f.id, f.project_id]));
    const regelsByForecast = new Map<string, any[]>();
    (regels ?? []).forEach((r: any) => {
      const arr = regelsByForecast.get(r.forecast_id) || [];
      arr.push(r);
      regelsByForecast.set(r.forecast_id, arr);
    });
    forecasts.forEach((f: any) => {
      const rules = regelsByForecast.get(f.id) || [];
      if (rules.length === 0) return;
      let omzet = 0, kosten = 0;
      rules.forEach((r: any) => {
        if (r.type === "spec") {
          omzet += (r.tarief || 0) * (r.aantal || 1);
          kosten += (r.eigen_kosten || 0) * (r.aantal || 1);
        } else if (r.type === "uren") {
          kosten += (r.geplande_uren || 0) * (r.uurtarief_snap || 0);
        }
      });
      const marge = omzet > 0 ? ((omzet - kosten) / omzet) * 100 : 0;
      const proj = projMap.get(f.project_id);
      if (proj) projectsWithMarge.push({ ...proj, omzet, kosten, marge });
    });
    projectsWithMarge.sort((a, b) => a.marge - b.marge);
  }

  // Overuren
  const { data: ouData, count: ouCount } = await supabase
    .from("overuren_meldingen")
    .select("id, medewerker_id, datum, type, geboekte_uren, limiet_uren", { count: "exact" })
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(3);
  let overurenMeldingen: any[] = [];
  if (ouData && ouData.length > 0) {
    const ouMedIds = [...new Set(ouData.map((m: any) => m.medewerker_id))];
    const { data: ouProfs } = ouMedIds.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", ouMedIds) : { data: [] };
    const ouNameMap = new Map((ouProfs ?? []).map((p: any) => [p.id, p.full_name]));
    overurenMeldingen = ouData.map((m: any) => ({ ...m, full_name: ouNameMap.get(m.medewerker_id) || "Onbekend", geboekte_uren: Number(m.geboekte_uren), limiet_uren: Number(m.limiet_uren) }));
  }

  return {
    pendingCount: pending?.length || 0,
    weekHours,
    activeProjects,
    teamCount: tCount || 0,
    pendingEntries,
    verlofAanvragen,
    expiringCerts,
    todayPlanning,
    projectsWithMarge,
    overurenMeldingen,
    overurenCount: ouCount || 0,
    statusGroups,
  };
}

export function useDashboardQuery() {
  return useQuery({
    queryKey: queryKeys.dashboard(),
    queryFn: fetchDashboard,
    staleTime: 30 * 1000,
  });
}

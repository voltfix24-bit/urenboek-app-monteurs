import { useCallback, useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { planningProjects } from "@/lib/projectsAdmin";
import type { BeschikbaarheidBasis, ConceptRij, MedewerkerBasis, PlanningRij } from "@/lib/weekPlanning";

export interface WpMedewerker extends MedewerkerBasis { role: string | null; ploeg: string | null }
export interface WpProject { id: string; naam: string; nummer: string; straat?: string | null; postcode?: string | null; stad?: string | null; adres?: string | null;
  soort?: string | null; contactpersoon_naam?: string | null; contactpersoon_tel?: string | null; benodigd_per_dag?: number | null }

const ROL_PRIORITEIT: Record<string, number> = { manager: 5, uitvoerder: 4, wv: 3, schakelmonteur: 2, monteur: 1 };

/** Data voor de desktop-weekplanning: gepubliceerde planning + concepten voor ma–vr × N weken. */
export interface WpGelezen { gelezen_op: string | null; laatst_gepubliceerd_op: string | null }
export interface WpBoeking { medewerker_id: string; datum: string; uren: number }

export function useWeekPlanningData(weekStart: Date, weeks: number = 1) {
  const { isManager } = useAuth();
  const [gelezen, setGelezen] = useState<Map<string, WpGelezen> | null>(null);
  const [planning, setPlanning] = useState<PlanningRij[]>([]);
  const [concepten, setConcepten] = useState<ConceptRij[]>([]);
  const [medewerkers, setMedewerkers] = useState<WpMedewerker[]>([]);
  const [projects, setProjects] = useState<WpProject[]>([]);
  const [beschikbaarheid, setBeschikbaarheid] = useState<BeschikbaarheidBasis[]>([]);
  const [conceptModus, setConceptModus] = useState(true);
  const [boekingen, setBoekingen] = useState<WpBoeking[]>([]);
  const [detacheringen, setDetacheringen] = useState<any[]>([]);
  const [weekgrens, setWeekgrens] = useState(40);
  const [loading, setLoading] = useState(true);

  const startStr = format(weekStart, "yyyy-MM-dd");
  const endStr = format(addDays(weekStart, 7 * (weeks - 1) + 4), "yyyy-MM-dd");

  const fetchAll = useCallback(async () => {
    const [plan, conc, prof, proj, besch, roles, bedrijf, boek, nodig, det] = await Promise.all([
      supabase.from("planning")
        .select("id, medewerker_id, project_id, datum, starttijd, eindtijd, notitie, activiteit, activiteit_kleur, planning_group_id, collega_ids, external_source, sync_locked, werklocatie, contactpersoon, contact_telefoon")
        .gte("datum", startStr).lte("datum", endStr),
      supabase.from("planning_concept").select("*").gte("datum", startStr).lte("datum", endStr),
      supabase.from("profiles").select("id, user_id, full_name, vaste_vrije_dagen, planning_partner_ids, ploeg").eq("account_status", "active").eq("is_onderaannemer", false).order("full_name"),
      planningProjects().select("id, naam, nummer, straat, postcode, stad, adres, soort, contactpersoon_naam, contactpersoon_tel").eq("active", true).order("nummer"),
      supabase.from("beschikbaarheid").select("id, medewerker_id, datum_van, datum_tot, type, status").eq("status", "goedgekeurd").lte("datum_van", endStr).gte("datum_tot", startStr),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("bedrijfsgegevens").select("planning_conceptmodus, planning_weekgrens").limit(1).maybeSingle(),
      supabase.from("uren_boekingen").select("medewerker_id, datum, uren").neq("status", "afgekeurd").gte("datum", startStr).lte("datum", endStr),
      supabase.from("projects").select("id, benodigd_per_dag").eq("active", true),
      supabase.from("detacheringen").select("medewerker_id, project_id, opdrachtgever_id, rol, van, tot").order("van"),
    ]);
    // Gelezen-status is alleen voor managers leesbaar.
    if (isManager) {
      const gel = await supabase.from("planning_gelezen").select("medewerker_id, gelezen_op, laatst_gepubliceerd_op");
      if (!gel.error) {
        setGelezen(new Map((gel.data ?? []).map((g) => [g.medewerker_id, { gelezen_op: g.gelezen_op, laatst_gepubliceerd_op: g.laatst_gepubliceerd_op }])));
      } else setGelezen(null);
    } else { setGelezen(null); }
    const rolMap = new Map<string, string>();
    (roles.data ?? []).forEach((r) => {
      const prev = rolMap.get(r.user_id);
      if (!prev || (ROL_PRIORITEIT[r.role] ?? 0) > (ROL_PRIORITEIT[prev] ?? 0)) rolMap.set(r.user_id, r.role);
    });
    setPlanning((plan.data ?? []) as PlanningRij[]);
    setConcepten((conc.data ?? []) as ConceptRij[]);
    setMedewerkers((prof.data ?? []).map((p) => ({
      id: p.id, full_name: p.full_name, vaste_vrije_dagen: p.vaste_vrije_dagen ?? [],
      planning_partner_ids: p.planning_partner_ids ?? [], role: rolMap.get(p.user_id) ?? null, ploeg: (p as { ploeg?: string | null }).ploeg ?? null,
    })));
    const nodigMap = new Map((nodig.data ?? []).map((r) => [r.id, r.benodigd_per_dag]));
    setProjects(((proj.data ?? []) as WpProject[]).map((p) => ({ ...p, benodigd_per_dag: nodigMap.get(p.id) ?? null })));
    setBeschikbaarheid((besch.data ?? []) as BeschikbaarheidBasis[]);
    setConceptModus(bedrijf.data?.planning_conceptmodus ?? true);
    setWeekgrens((bedrijf.data as { planning_weekgrens?: number } | null)?.planning_weekgrens ?? 40);
    setBoekingen((boek.data ?? []) as WpBoeking[]);
    setDetacheringen(det.data ?? []);
    setLoading(false);
  }, [startStr, endStr, isManager]);

  useEffect(() => { setLoading(true); fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const channel = supabase.channel("desktop-weekplanning-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "planning" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "planning_concept" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  return { gelezen, planning, concepten, medewerkers, projects, beschikbaarheid, conceptModus, boekingen, detacheringen, weekgrens, loading, refetch: fetchAll };
}

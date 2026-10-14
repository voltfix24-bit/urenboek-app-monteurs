import { useCallback, useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { planningProjects } from "@/lib/projectsAdmin";
import type { BeschikbaarheidBasis, ConceptRij, MedewerkerBasis, PlanningRij } from "@/lib/weekPlanning";

export interface WpMedewerker extends MedewerkerBasis { role: string | null }
export interface WpProject { id: string; naam: string; nummer: string; straat?: string | null; postcode?: string | null; stad?: string | null; adres?: string | null;
  soort?: string | null; contactpersoon_naam?: string | null; contactpersoon_tel?: string | null }

const ROL_PRIORITEIT: Record<string, number> = { manager: 5, uitvoerder: 4, wv: 3, schakelmonteur: 2, monteur: 1 };

/** Data voor de desktop-weekplanning: gepubliceerde planning + concepten voor ma–vr. */
/** Bevoegdheid per medewerker: laatste geldig_tot van aanwijzingen en VCA (null = geen). */
export interface WpBevoegdheid { aanwijzingTot: string | null; vcaTot: string | null }

export function useWeekPlanningData(weekStart: Date) {
  const { isManager } = useAuth();
  const [bevoegdheden, setBevoegdheden] = useState<Map<string, WpBevoegdheid> | null>(null);
  const [planning, setPlanning] = useState<PlanningRij[]>([]);
  const [concepten, setConcepten] = useState<ConceptRij[]>([]);
  const [medewerkers, setMedewerkers] = useState<WpMedewerker[]>([]);
  const [projects, setProjects] = useState<WpProject[]>([]);
  const [beschikbaarheid, setBeschikbaarheid] = useState<BeschikbaarheidBasis[]>([]);
  const [conceptModus, setConceptModus] = useState(true);
  const [loading, setLoading] = useState(true);

  const startStr = format(weekStart, "yyyy-MM-dd");
  const endStr = format(addDays(weekStart, 4), "yyyy-MM-dd");

  const fetchAll = useCallback(async () => {
    const [plan, conc, prof, proj, besch, roles, bedrijf] = await Promise.all([
      supabase.from("planning")
        .select("id, medewerker_id, project_id, datum, starttijd, eindtijd, notitie, activiteit, activiteit_kleur, planning_group_id, collega_ids, external_source, sync_locked, werklocatie, contactpersoon, contact_telefoon")
        .gte("datum", startStr).lte("datum", endStr),
      supabase.from("planning_concept").select("*").gte("datum", startStr).lte("datum", endStr),
      supabase.from("profiles").select("id, user_id, full_name, vaste_vrije_dagen, planning_partner_ids").eq("account_status", "active").eq("planbaar", true).eq("is_onderaannemer", false).order("full_name"),
      planningProjects().select("id, naam, nummer, straat, postcode, stad, adres, soort, contactpersoon_naam, contactpersoon_tel").eq("active", true).order("nummer"),
      supabase.from("beschikbaarheid").select("id, medewerker_id, datum_van, datum_tot, type, status").eq("status", "goedgekeurd").lte("datum_van", endStr).gte("datum_tot", startStr),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("bedrijfsgegevens").select("planning_conceptmodus").limit(1).maybeSingle(),
    ]);
    // Aanwijzingen/certificaten zijn alleen voor managers leesbaar; anders geen waarschuwingen tonen.
    if (isManager) {
      const [aw, cert] = await Promise.all([
        supabase.from("aanwijzingen").select("medewerker_id, geldig_tot"),
        supabase.from("certificaten").select("medewerker_id, vervaldatum").eq("type", "VCA"),
      ]);
      if (!aw.error && !cert.error) {
        const m = new Map<string, WpBevoegdheid>();
        const get = (id: string) => { let b = m.get(id); if (!b) { b = { aanwijzingTot: null, vcaTot: null }; m.set(id, b); } return b; };
        (aw.data ?? []).forEach((r) => { const b = get(r.medewerker_id); if (!b.aanwijzingTot || r.geldig_tot > b.aanwijzingTot) b.aanwijzingTot = r.geldig_tot; });
        (cert.data ?? []).forEach((r) => { const b = get(r.medewerker_id); if (!b.vcaTot || r.vervaldatum > b.vcaTot) b.vcaTot = r.vervaldatum; });
        setBevoegdheden(m);
      } else setBevoegdheden(null);
    } else setBevoegdheden(null);
    const rolMap = new Map<string, string>();
    (roles.data ?? []).forEach((r) => {
      const prev = rolMap.get(r.user_id);
      if (!prev || (ROL_PRIORITEIT[r.role] ?? 0) > (ROL_PRIORITEIT[prev] ?? 0)) rolMap.set(r.user_id, r.role);
    });
    setPlanning((plan.data ?? []) as PlanningRij[]);
    setConcepten((conc.data ?? []) as ConceptRij[]);
    setMedewerkers((prof.data ?? []).map((p) => ({
      id: p.id, full_name: p.full_name, vaste_vrije_dagen: p.vaste_vrije_dagen ?? [],
      planning_partner_ids: p.planning_partner_ids ?? [], role: rolMap.get(p.user_id) ?? null,
    })));
    setProjects((proj.data ?? []) as WpProject[]);
    setBeschikbaarheid((besch.data ?? []) as BeschikbaarheidBasis[]);
    setConceptModus(bedrijf.data?.planning_conceptmodus ?? true);
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

  return { bevoegdheden, planning, concepten, medewerkers, projects, beschikbaarheid, conceptModus, loading, refetch: fetchAll };
}

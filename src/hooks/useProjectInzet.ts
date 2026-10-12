import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  bepaalAfwezigheid, bouwCellen, type BeschikbaarheidBasis, type Cel, type ConceptRij, type MedewerkerBasis, type PlanningRij,
} from "@/lib/weekPlanning";

/** Komende inzet van één project uit planning + planning_concept, plus of er data aan het project hangt. */
export function useProjectInzet(projectId: string) {
  const [inzet, setInzet] = useState<Cel[]>([]);
  const [medewerkers, setMedewerkers] = useState<Map<string, MedewerkerBasis>>(new Map());
  const [conflicten, setConflicten] = useState(0);
  const [heeftData, setHeeftData] = useState(true);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const vandaag = format(new Date(), "yyyy-MM-dd");
    const [plan, conc, prof, besch, planAll, uren, orders, forecasts] = await Promise.all([
      supabase.from("planning")
        .select("id, medewerker_id, project_id, datum, starttijd, eindtijd, notitie, activiteit, activiteit_kleur, planning_group_id, collega_ids, external_source, sync_locked")
        .eq("project_id", projectId).gte("datum", vandaag).order("datum"),
      supabase.from("planning_concept").select("*").gte("datum", vandaag),
      supabase.from("profiles").select("id, full_name, vaste_vrije_dagen, planning_partner_ids"),
      supabase.from("beschikbaarheid").select("medewerker_id, datum_van, datum_tot, type, status").eq("status", "goedgekeurd").gte("datum_tot", vandaag),
      supabase.from("planning").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      supabase.from("uren_boekingen").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      supabase.from("inkooporder_regels").select("id", { count: "exact", head: true }).eq("project_id", projectId),
      supabase.from("project_forecast").select("id").eq("project_id", projectId),
    ]);
    let regels = 0;
    const fIds = (forecasts.data ?? []).map((f) => f.id);
    if (fIds.length) {
      const { count } = await supabase.from("forecast_regels").select("id", { count: "exact", head: true }).in("forecast_id", fIds);
      regels = count ?? 0;
    }
    const conceptAantal = (conc.data ?? []).filter((c) => c.project_id === projectId).length;
    // Bij een fout of onbekende telling verwijderen blokkeren (veilige kant).
    const fout = planAll.error || uren.error || orders.error;
    setHeeftData(!!fout || (planAll.count ?? 0) + (uren.count ?? 0) + (orders.count ?? 0) + regels + conceptAantal > 0);

    const meds = new Map<string, MedewerkerBasis>(((prof.data ?? []) as MedewerkerBasis[]).map((m) => [m.id, { ...m, vaste_vrije_dagen: m.vaste_vrije_dagen ?? [], planning_partner_ids: m.planning_partner_ids ?? [] }]));
    const cellen = Array.from(bouwCellen((plan.data ?? []) as PlanningRij[], (conc.data ?? []) as ConceptRij[]).values())
      .filter((c) => c.project_id === projectId && c.status !== "leeg")
      .sort((a, b) => a.datum.localeCompare(b.datum) || (meds.get(a.medewerker_id)?.full_name ?? "").localeCompare(meds.get(b.medewerker_id)?.full_name ?? "", "nl"));
    const b = (besch.data ?? []) as BeschikbaarheidBasis[];
    setConflicten(cellen.filter((c) => c.status !== "verwijderd" && bepaalAfwezigheid(meds.get(c.medewerker_id), c.datum, b)).length);
    setMedewerkers(meds);
    setInzet(cellen);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { setLoading(true); fetchAll(); }, [fetchAll]);

  const actief = inzet.filter((c) => c.status !== "verwijderd");
  return {
    inzet,
    actief,
    medewerkers,
    conflicten,
    heeftData,
    heeftConcept: inzet.some((c) => c.status !== "pub"),
    eersteConceptDatum: inzet.find((c) => c.status !== "pub")?.datum ?? null,
    eersteDatum: actief[0]?.datum ?? null,
    loading,
    refetch: fetchAll,
  };
}

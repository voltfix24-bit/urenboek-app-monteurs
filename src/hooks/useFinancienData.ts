import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adminProjects } from "@/lib/projectsAdmin";
import { berekenUren } from "@/lib/weekPlanning";
import { forecastOmzet } from "@/lib/forecastCalculatie";
import {
  berekenFinannen,
  type AanwijzingRol,
  type CaseForecast,
  type DetacheringRij,
  type FinancienUitkomst,
  type KostentariefRij,
  type PersoonInfo,
  type ProjectInfo,
  type UrenRij,
  type VerkooptariefRij,
} from "@/lib/financien";

export interface FinancienData {
  uitkomst: FinancienUitkomst | null;
  loading: boolean;
  fout: string | null;
  vasteKostenPerWeek: number;
  herladen: () => void;
}

/** Namen mogen in beide lijsten anders geschreven zijn (NH Montage B.V. vs nh montage). */
export const normNaam = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Haalt alles op wat het financieel overzicht nodig heeft en rekent het door
 * `berekenFinannen`. Tarieven worden hier alleen opgehaald; de bepaling per
 * dag gebeurt in lib/financien.ts (dezelfde regel als in de database).
 */
export function useFinancienData(van: string, tot: string): FinancienData {
  const [uitkomst, setUitkomst] = useState<FinancienUitkomst | null>(null);
  const [loading, setLoading] = useState(true);
  const [fout, setFout] = useState<string | null>(null);
  const [vasteKostenPerWeek, setVasteKostenPerWeek] = useState(0);
  const [poging, setPoging] = useState(0);

  const herladen = useCallback(() => setPoging((n) => n + 1), []);

  useEffect(() => {
    let dood = false;

    async function laad() {
      setLoading(true);
      setFout(null);

      const [
        boekingenRes, planningRes, projectenRes, profielenRes, verkoopRes, kostenRes,
        detRes, ogRes, aanwRes, partijenRes, forecastRes, regelsRes,
        totaalRes, totaalPlanningRes, reisRes, bedrijfRes,
      ] = await Promise.all([
        supabase.from("uren_boekingen")
          .select("medewerker_id, project_id, datum, uren, status")
          .in("status", ["goedgekeurd", "ingediend"])
          .gte("datum", van).lte("datum", tot),
        supabase.from("planning")
          .select("medewerker_id, project_id, datum, starttijd, eindtijd")
          .gte("datum", van).lte("datum", tot),
        adminProjects().select("id, naam, nummer, soort, opdrachtgever_id"),
        supabase.from("profiles").select("id, full_name, is_eigenaar, fictief_uurtarief"),
        supabase.from("verkooptarieven").select("*").order("geldig_vanaf"),
        supabase.from("kostentarieven").select("*").order("geldig_vanaf"),
        supabase.from("detacheringen").select("*").order("van"),
        supabase.from("opdrachtgevers").select("id, naam"),
        supabase.from("aanwijzingen").select("medewerker_id, rol, geldig_tot, partij_id"),
        supabase.from("aanwijs_partijen").select("id, naam"),
        supabase.from("project_forecast").select("id, project_id, methode, verwachte_omzet"),
        supabase.from("forecast_regels").select("forecast_id, tarief, aantal, geplande_uren, uurtarief_snap"),
        supabase.from("uren_boekingen").select("project_id, uren").neq("status", "afgekeurd"),
        supabase.from("planning").select("project_id, starttijd, eindtijd"),
        supabase.from("inkooporder_regels").select("bedrag").eq("regel_type", "reiskosten")
          .gte("datum", van).lte("datum", tot),
        supabase.from("bedrijfsgegevens").select("vaste_kosten_per_week").limit(1).maybeSingle(),
      ]);

      if (dood) return;

      if (projektenRes.error) {
        setFout("Projectgegevens konden niet worden opgehaald.");
        setLoading(false);
        return;
      }
      if (verkoopRes.error || kostenRes.error) {
        setFout("Tarieven konden niet worden opgehaald.");
        setLoading(false);
        return;
      }

      const projecten: ProjectInfo[] = (projektenRes.data || []).map((p: any) => ({
        id: p.id,
        naam: p.naam,
        nummer: p.nummer,
        soort: p.soort === "uitleen" ? "uitleen" : "project",
        opdrachtgever_id: p.opdrachtgever_id ?? null,
      }));

      const personen: PersoonInfo[] = (profielenRes.data || []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        is_eigenaar: !!p.is_eigenaar,
        fictief_uurtarief: p.fictief_uurtarief == null ? null : Number(p.fictief_uurtarief),
      }));

      const verkooptarieven: VerkooptariefRij[] = (verkoopRes.data || []).map((r: any) => ({
        id: r.id,
        opdrachtgever_id: r.opdrachtgever_id,
        rol: r.rol ?? null,
        uurtarief: Number(r.uurtarief),
        g_rekening_pct: Number(r.g_rekening_pct),
        geldig_vanaf: r.geldig_vanaf,
      }));

      const kostentarieven: KostentariefRij[] = (kostenRes.data || []).map((r: any) => ({
        id: r.id,
        medewerker_id: r.medewerker_id,
        uurtarief: Number(r.uurtarief),
        geldig_vanaf: r.geldig_vanaf,
      }));

      const detacheringen: DetacheringRij[] = (detRes.data || []).map((d: any) => ({
        id: d.id,
        medewerker_id: d.medewerker_id,
        opdrachtgever_id: d.opdrachtgever_id,
        project_id: d.project_id ?? null,
        rol: d.rol,
        van: d.van,
        tot: d.tot ?? null,
        uren_per_week: d.uren_per_week == null ? null : Number(d.uren_per_week),
        tarief_override: d.tarief_override == null ? null : Number(d.tarief_override),
        notitie: d.notitie ?? null,
      }));

      // BEI-aanwijzingsrol koppelen aan de opdrachtgever op (genormaliseerde) naam.
      const partijen = partijenRes.data || [];
      const ogLijst = (ogRes.data || []).map((o: any) => ({ id: o.id, naam: o.naam }));
      const ogPerPartij = new Map<string, string>();
      for (const p of partijen) {
        const match = ogLijst.find((o) => normNaam(o.naam) === normNaam(p.naam));
        if (match) ogPerPartij.set(p.id, match.id);
      }
      const aanwijzingsrollen: AanwijzingRol[] = (aanwRes.data || [])
        .filter((a: any) => ogPerPartij.has(a.partij_id))
        .map((a: any) => ({
          medewerker_id: a.medewerker_id,
          opdrachtgever_id: ogPerPartij.get(a.partij_id)!,
          rol: a.rol,
          geldig_tot: a.geldig_tot,
        }));

      // Geboekte uren; geplande uren tellen alleen mee als er die dag nog niets geboekt is.
      const uren: UrenRij[] = [];
      const dagGeboekt = new Set<string>();
      for (const b of boekingenRes.data || []) {
        uren.push({
          medewerker_id: b.medewerker_id,
          project_id: b.project_id,
          datum: b.datum,
          uren: Number(b.uren),
          verwachte: false,
        });
        dagGeboekt.add(`${b.medewerker_id}|${b.datum}`);
      }
      for (const p of planningRes.data || []) {
        if (dagGeboekt.has(`${p.medewerker_id}|${p.datum}`)) continue;
        const u = berekenUren(p.starttijd, p.eindtijd);
        if (u <= 0) continue;
        uren.push({
          medewerker_id: p.medewerker_id,
          project_id: p.project_id,
          datum: p.datum,
          uren: u,
          verwachte: true,
        });
      }

      // Forecast per project, met de uren waarover de opbrengst verdeeld wordt.
      const regelsPerForecast = new Map<string, any[]>();
      for (const r of regelsRes.data || []) {
        const lijst = regelsPerForecast.get(r.forecast_id) || [];
        lijst.push(r);
        regelsPerForecast.set(r.forecast_id, lijst);
      }
      const urenPerProject = new Map<string, number>();
      for (const b of totaalRes.data || []) {
        urenPerProject.set(b.project_id, (urenPerProject.get(b.project_id) || 0) + Number(b.uren));
      }
      const geplandPerProject = new Map<string, number>();
      for (const p of totaalPlanningRes.data || []) {
        geplandPerProject.set(p.project_id, (geplandPerProject.get(p.project_id) || 0) + berekenUren(p.starttijd, p.eindtijd));
      }
      const caseForecasts: CaseForecast[] = (forecastRes.data || []).map((f: any) => ({
        project_id: f.project_id,
        omzet: forecastOmzet(f.methode, regelsPerForecast.get(f.id) || [], f.verwachte_omzet),
        totaal_uren: urenPerProject.get(f.project_id) || geplandPerProject.get(f.project_id) || 0,
      }));

      const reiskosten = (reisRes.data || []).reduce((s: number, r: any) => s + Number(r.bedrag || 0), 0);
      const perWeek = Number(bedrijfRes.data?.vaste_kosten_per_week ?? 0) || 0;
      setVasteKostenPerWeek(perWeek);
      const dagen = (new Date(tot).getTime() - new Date(van).getTime()) / 86400000 + 1;
      const vasteKosten = perWeek * Math.max(1, Math.ceil(dagen / 7));

      setUitkomst(berekenFinannen({
        van,
        tot,
        uren,
        projecten,
        personen,
        verkooptarieven,
        kostentarieven,
        detacheringen,
        aanwijzingsrollen,
        caseForecasts,
        reiskosten,
        vasteKosten,
        opdrachtgevers: ogLijst,
      }));
      setLoading(false);
    }

    laad();
    return () => { dood = true; };
  }, [van, tot, poging]);

  return { uitkomst, loading, fout, vasteKostenPerWeek, herladen };
}

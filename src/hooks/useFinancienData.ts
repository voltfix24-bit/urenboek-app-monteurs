import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, addWeeks, format } from "date-fns";
import { adminProjects } from "@/lib/projectsAdmin";
import { berekenUren } from "@/lib/weekPlanning";
import { forecastOmzet } from "@/lib/forecastCalculatie";
import {
  berekenFinannen,
  type AanwijzingRol,
  type CaseForecast,
  type DetacheringRij,
  type FinancienInput,
  type FinancienUitkomst,
  type KostentariefRij,
  type PersoonInfo,
  type ProjectInfo,
  type UrenRij,
  type VerkooptariefRij,
} from "@/lib/financien";

export interface SeriePunt {
  week: string; // iso maandag
  omzet: number;
  kosten: number;
  marge: number;
}

export interface FinancienData {
  uitkomst: FinancienUitkomst | null;
  serie: SeriePunt[];
  loading: boolean;
  fout: string | null;
  vasteKostenPerWeek: number;
  herladen: () => void;
}

/** Namen mogen in beide lijsten anders geschreven zijn (NH Montage B.V. vs nh montage). */
export const normNaam = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const WEEKGRENZEN = 12;

/**
 * Haalt alles op wat het financieel overzicht nodig heeft en rekent het door
 * `berekenFinannen`. Tarieven worden hier alleen opgehaald; de bepaling per dag
 * gebeurt in lib/financien.ts — dezelfde regel als de databasefuncties.
 */
export function useFinancienData(van: string, tot: string): FinancienData {
  const [uitkomst, setUitkomst] = useState<FinancienUitkomst | null>(null);
  const [serie, setSerie] = useState<SeriePunt[]>([]);
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

      // Het grafiekblok toont de laatste 12 weken; die halen we meteen mee op.
      const serieVan = iso(startOfWeek(addWeeks(new Date(van), -(WEEKGRENZEN - 1)), { weekStartsOn: 1 }));

      const [
        boekingenRes, planningRes, projectenRes, profielenRes, verkoopRes, kostenRes,
        detRes, ogRes, aanwRes, partijenRes, forecastRes, regelsRes,
        totaalRes, totaalPlanningRes, reisRes, bedrijfRes,
      ] = await Promise.all([
        supabase.from("uren_boekingen")
          .select("medewerker_id, project_id, datum, uren, status")
          .in("status", ["goedgekeurd", "ingediend"])
          .gte("datum", serieVan).lte("datum", tot),
        supabase.from("planning")
          .select("medewerker_id, project_id, datum, starttijd, eindtijd")
          .gte("datum", serieVan).lte("datum", tot),
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
        supabase.from("inkooporder_regels").select("bedrag, datum").eq("regel_type", "reiskosten")
          .gte("datum", serieVan).lte("datum", tot),
        supabase.from("bedrijfsgegevens").select("vaste_kosten_per_week").limit(1).maybeSingle(),
      ]);

      if (dood) return;

      if (projectenRes.error) {
        setFout("Projectgegevens konden niet worden opgehaald.");
        setLoading(false);
        return;
      }
      if (verkoopRes.error || kostenRes.error) {
        setFout("Tarieven konden niet worden opgehaald.");
        setLoading(false);
        return;
      }

      const projecten: ProjectInfo[] = (projectenRes.data || []).map((p: any) => ({
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
      const alleUren: UrenRij[] = [];
      const dagGeboekt = new Set<string>();
      for (const b of boekingenRes.data || []) {
        alleUren.push({
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
        alleUren.push({
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

      const perWeek = Number(bedrijfRes.data?.vaste_kosten_per_week ?? 0) || 0;
      setVasteKostenPerWeek(perWeek);

      const reiskostenPerWeek = new Map<string, number>();
      for (const r of reisRes.data || []) {
        const wk = iso(startOfWeek(new Date(r.datum), { weekStartsOn: 1 }));
        reiskostenPerWeek.set(wk, (reiskostenPerWeek.get(wk) || 0) + Number(r.bedrag || 0));
      }

      const basis: Omit<FinancienInput, "van" | "tot" | "uren" | "reiskosten" | "vasteKosten"> = {
        projecten,
        personen,
        verkooptarieven,
        kostentarieven,
        detacheringen,
        aanwijzingsrollen,
        caseForecasts,
        opdrachtgevers: ogLijst,
      };

      function voorPeriode(periodeVan: string, periodeTot: string) {
        const uren = alleUren.filter((u) => u.datum >= periodeVan && u.datum <= periodeTot);
        const reiskosten = Array.from(reiskostenPerWeek.entries())
          .filter(([wk]) => wk >= iso(startOfWeek(new Date(periodeVan), { weekStartsOn: 1 })))
          .filter(([wk]) => wk <= iso(startOfWeek(new Date(periodeTot), { weekStartsOn: 1 })))
          .reduce((s, [, n]) => s + n, 0);
        const dagen = (new Date(periodeTot).getTime() - new Date(periodeVan).getTime()) / 86400000 + 1;
        return berekenFinannen({
          ...basis,
          van: periodeVan,
          tot: periodeTot,
          uren,
          reiskosten,
          vasteKosten: perWeek * Math.max(1, Math.ceil(dagen / 7)),
        });
      }

      setUitkomst(voorPeriode(van, tot));

      const seriePunten: SeriePunt[] = [];
      let wk = new Date(serieVan);
      const wkEind = startOfWeek(new Date(tot), { weekStartsOn: 1 });
      while (wk <= wkEind) {
        const wkVan = iso(wk);
        const wkTot = iso(addWeeks(wk, 1));
        const r = voorPeriode(wkVan, wkTot);
        seriePunten.push({ week: wkVan, omzet: r.omzet, kosten: r.kosten, marge: r.marge });
        wk = addWeeks(wk, 1);
      }
      setSerie(seriePunten.slice(-WEEKGRENZEN));
      setLoading(false);
    }

    laad();
    return () => { dood = true; };
  }, [van, tot, poging]);

  return { uitkomst, serie, loading, fout, vasteKostenPerWeek, herladen };
}

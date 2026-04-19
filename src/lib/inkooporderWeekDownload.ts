import { supabase } from "@/integrations/supabase/client";
import { getBedrijfsgegevens } from "@/hooks/useBedrijfsgegevens";
import { downloadInkooporderPdf } from "@/components/InkooporderPdf";
import { format, parseISO, startOfISOWeek, endOfISOWeek, getISOWeek, getISOWeekYear } from "date-fns";

export interface WeekGroup {
  key: string;          // "2026-W15"
  jaar: number;
  week: number;
  van: string;          // YYYY-MM-DD
  tot: string;          // YYYY-MM-DD
  orders: any[];        // alle inkooporders die in deze week vallen
  totaalUren: number;
  totaalBedrag: number;
}

/**
 * Groepeer inkooporders per ISO-week (op basis van periode_van).
 * Eén order = één PDF (per week per monteur, zoals gewenst).
 */
export function groepeerOrdersPerWeek(orders: any[]): WeekGroup[] {
  const map = new Map<string, WeekGroup>();
  for (const o of orders) {
    if (!o.periode_van) continue;
    const datum = parseISO(o.periode_van);
    const jaar = getISOWeekYear(datum);
    const week = getISOWeek(datum);
    const key = `${jaar}-W${String(week).padStart(2, "0")}`;
    if (!map.has(key)) {
      map.set(key, {
        key, jaar, week,
        van: format(startOfISOWeek(datum), "yyyy-MM-dd"),
        tot: format(endOfISOWeek(datum), "yyyy-MM-dd"),
        orders: [],
        totaalUren: 0,
        totaalBedrag: 0,
      });
    }
    const g = map.get(key)!;
    g.orders.push(o);
    g.totaalUren += Number(o.totaal_uren) || 0;
    g.totaalBedrag += Number(o.totaal_excl_btw) || 0;
  }
  return Array.from(map.values()).sort((a, b) =>
    a.jaar !== b.jaar ? b.jaar - a.jaar : b.week - a.week
  );
}

/**
 * Download alle PDFs van één week (één PDF per order = per monteur).
 */
export async function downloadWeekPdfs(orders: any[]) {
  const bedrijf = await getBedrijfsgegevens();
  for (const order of orders) {
    // Regels ophalen
    const { data: regelData } = await supabase
      .from("inkooporder_regels")
      .select("*, uren_boekingen(beschrijving, type)")
      .eq("inkooporder_id", order.id)
      .order("datum");
    const regels = (regelData || []).map((r: any) => ({
      ...r,
      activiteit: r.activiteit || (r.uren_boekingen as any)?.beschrijving || (r.uren_boekingen as any)?.type || "",
    }));
    // Project-nummers verrijken
    const projIds = [...new Set(regels.map((r: any) => r.project_id).filter(Boolean))];
    if (projIds.length > 0) {
      const { data: projs } = await supabase.from("projects").select("id, nummer").in("id", projIds);
      const nrMap = new Map((projs || []).map((p: any) => [p.id, p.nummer]));
      regels.forEach((r: any) => { r._project_nummer = nrMap.get(r.project_id) || ""; });
    }
    // Profiel monteur
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, uurtarief, kvk_nummer, btw_nummer, iban, bedrijfsnaam, factuuradres, adres, betalingstermijn, telefoon")
      .eq("id", order.medewerker_id)
      .single();
    // Goedgekeurd door
    let gkNaam: string | undefined;
    if (order.aangemaakt_door) {
      const { data: gk } = await supabase.from("profiles").select("full_name").eq("id", order.aangemaakt_door).maybeSingle();
      gkNaam = gk?.full_name || undefined;
    }
    await downloadInkooporderPdf(order, regels, profile, bedrijf, gkNaam);
    // Korte pauze zodat de browser elke download apart kan triggeren
    await new Promise(r => setTimeout(r, 350));
  }
}

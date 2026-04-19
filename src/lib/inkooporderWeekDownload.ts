import { supabase } from "@/integrations/supabase/client";
import { getBedrijfsgegevens } from "@/hooks/useBedrijfsgegevens";
import { downloadInkooporderPdf } from "@/components/InkooporderPdf";
import { format, parseISO, startOfISOWeek, endOfISOWeek, getISOWeek, getISOWeekYear } from "date-fns";

export interface WeekGroup {
  key: string;          // "2026-W15"
  jaar: number;
  week: number;
  van: string;          // YYYY-MM-DD (maandag)
  tot: string;          // YYYY-MM-DD (zondag)
  /** Inkooporders die regels in deze week hebben (incl. bijbehorende regels). */
  orderRegels: Array<{ order: any; regels: any[] }>;
  totaalUren: number;
  totaalBedrag: number;
}

/**
 * Groepeer inkooporders per ISO-week op basis van de DATUM van iedere regel.
 * Eén order kan meerdere weken beslaan; dan komt hij in meerdere weekgroepen
 * terug (telkens met alleen de regels van die specifieke week).
 *
 * Vereist dat orders al een veld `_regels` hebben (voorgeladen door page).
 * Als er geen regels zijn, valt hij terug op periode_van.
 */
export function groepeerOrdersPerWeek(
  ordersMetRegels: Array<{ order: any; regels: any[] }>
): WeekGroup[] {
  const map = new Map<string, WeekGroup>();

  for (const { order, regels } of ordersMetRegels) {
    // Per regel in een weekgroep stoppen
    const regelsPerWeek = new Map<string, any[]>();

    if (regels && regels.length > 0) {
      for (const r of regels) {
        if (!r.datum) continue;
        const datum = parseISO(r.datum);
        const jaar = getISOWeekYear(datum);
        const week = getISOWeek(datum);
        const key = `${jaar}-W${String(week).padStart(2, "0")}`;
        if (!regelsPerWeek.has(key)) regelsPerWeek.set(key, []);
        regelsPerWeek.get(key)!.push(r);
      }
    } else if (order.periode_van) {
      // Fallback: hele order in week van periode_van
      const datum = parseISO(order.periode_van);
      const jaar = getISOWeekYear(datum);
      const week = getISOWeek(datum);
      const key = `${jaar}-W${String(week).padStart(2, "0")}`;
      regelsPerWeek.set(key, []);
    }

    for (const [key, weekRegels] of regelsPerWeek) {
      const eersteDatum = weekRegels[0]?.datum
        ? parseISO(weekRegels[0].datum)
        : parseISO(order.periode_van);
      const jaar = getISOWeekYear(eersteDatum);
      const week = getISOWeek(eersteDatum);

      if (!map.has(key)) {
        map.set(key, {
          key, jaar, week,
          van: format(startOfISOWeek(eersteDatum), "yyyy-MM-dd"),
          tot: format(endOfISOWeek(eersteDatum), "yyyy-MM-dd"),
          orderRegels: [],
          totaalUren: 0,
          totaalBedrag: 0,
        });
      }
      const g = map.get(key)!;
      g.orderRegels.push({ order, regels: weekRegels });
      g.totaalUren += weekRegels.reduce((s, r) => s + (Number(r.uren) || 0), 0);
      g.totaalBedrag += weekRegels.reduce((s, r) => s + (Number(r.bedrag) || 0), 0);
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.jaar !== b.jaar ? b.jaar - a.jaar : b.week - a.week
  );
}

/**
 * Haal alle regels op voor een lijst inkooporders, in 1 query.
 */
export async function laadRegelsVoorOrders(
  orders: any[]
): Promise<Array<{ order: any; regels: any[] }>> {
  if (orders.length === 0) return [];
  const ids = orders.map(o => o.id);
  const { data: alleRegels } = await supabase
    .from("inkooporder_regels")
    .select("*, uren_boekingen(beschrijving, type)")
    .in("inkooporder_id", ids)
    .order("datum");

  const verrijkt = (alleRegels || []).map((r: any) => ({
    ...r,
    activiteit: r.activiteit
      || (r.uren_boekingen as any)?.beschrijving
      || (r.uren_boekingen as any)?.type
      || "",
  }));

  // Project-nummers verrijken
  const projIds = [...new Set(verrijkt.map((r: any) => r.project_id).filter(Boolean))];
  if (projIds.length > 0) {
    const { data: projs } = await supabase
      .from("projects")
      .select("id, nummer")
      .in("id", projIds);
    const nrMap = new Map((projs || []).map((p: any) => [p.id, p.nummer]));
    verrijkt.forEach((r: any) => { r._project_nummer = nrMap.get(r.project_id) || ""; });
  }

  return orders.map(order => ({
    order,
    regels: verrijkt.filter((r: any) => r.inkooporder_id === order.id),
  }));
}

/**
 * Download één PDF per order in deze week, met alleen de regels van die week.
 */
export async function downloadWeekPdfs(orderRegels: Array<{ order: any; regels: any[] }>) {
  const bedrijf = await getBedrijfsgegevens();

  // Cache profielen
  const profielCache = new Map<string, any>();
  const gkCache = new Map<string, string>();

  for (const { order, regels } of orderRegels) {
    // Profiel monteur
    let profile = profielCache.get(order.medewerker_id);
    if (!profile) {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, uurtarief, kvk_nummer, btw_nummer, iban, bedrijfsnaam, factuuradres, adres, betalingstermijn, telefoon")
        .eq("id", order.medewerker_id)
        .single();
      profile = data;
      profielCache.set(order.medewerker_id, profile);
    }

    // Goedgekeurd door
    let gkNaam: string | undefined;
    if (order.aangemaakt_door) {
      gkNaam = gkCache.get(order.aangemaakt_door);
      if (!gkNaam) {
        const { data: gk } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", order.aangemaakt_door)
          .maybeSingle();
        gkNaam = gk?.full_name || undefined;
        if (gkNaam) gkCache.set(order.aangemaakt_door, gkNaam);
      }
    }

    // Maak een week-specifieke order: pas totalen + periode aan op basis van regels
    const weekTotaalUren = regels.reduce((s, r) => s + (Number(r.uren) || 0), 0);
    const weekTotaalExcl = regels.reduce((s, r) => s + (Number(r.bedrag) || 0), 0);
    const datums = regels.map(r => r.datum).filter(Boolean).sort();
    const weekOrder = {
      ...order,
      totaal_uren: weekTotaalUren,
      totaal_excl_btw: weekTotaalExcl,
      btw_bedrag: 0,
      totaal_incl_btw: weekTotaalExcl,
      periode_van: datums[0] || order.periode_van,
      periode_tot: datums[datums.length - 1] || order.periode_tot,
    };

    await downloadInkooporderPdf(weekOrder, regels, profile, bedrijf, gkNaam);
    // Korte pauze zodat de browser elke download apart kan triggeren
    await new Promise(r => setTimeout(r, 350));
  }
}

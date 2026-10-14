import { addDays, addWeeks, endOfMonth, format, startOfISOWeek } from "date-fns";
import { bepaalAfwezigheid, celBezet, celKey, celTelt, type Cel, type MedewerkerBasis, type BeschikbaarheidBasis, type PlanWaarden } from "./weekPlanning";

export interface GridPoint { row: number; day: number }
export interface ClipboardDay { row: number; day: number; sourceKey: string; waarden: PlanWaarden }
export interface TransferTarget { source: ClipboardDay; medewerker_id: string; datum: string }
export const splitCellKey = (key: string) => { const [medewerker_id, datum] = key.split("|"); return { medewerker_id, datum }; };
export function copyDays(keys: Set<string>, rows: MedewerkerBasis[], dates: string[], cells: Map<string, Cel>): ClipboardDay[] {
  const points = [...keys].map((key) => ({ key, ...splitCellKey(key) })).map((p) => ({ ...p, row: rows.findIndex((r) => r.id === p.medewerker_id), day: dates.indexOf(p.datum) })).filter((p) => p.row >= 0 && p.day >= 0);
  if (!points.length) return [];
  const top = Math.min(...points.map((p) => p.row)), left = Math.min(...points.map((p) => p.day));
  return points.flatMap((p) => {
    const c = cells.get(p.key);
    if (!celTelt(c) || !c.project_id) return [];
    return [{ row: p.row - top, day: p.day - left, sourceKey: p.key, waarden: { project_id: c.project_id, starttijd: c.starttijd ?? "07:00", eindtijd: c.eindtijd ?? "16:00", notitie: c.notitie, werklocatie: c.werklocatie ?? null, contactpersoon: c.contactpersoon ?? null, contact_telefoon: c.contact_telefoon ?? null } }];
  });
}
export function transferTargets(days: ClipboardDay[], anchor: GridPoint, rows: MedewerkerBasis[], dates: string[], cells: Map<string, Cel>, absence: BeschikbaarheidBasis[], moving = false) {
  const targets: TransferTarget[] = [], skipped: string[] = [];
  for (const source of days) {
    const med = rows[anchor.row + source.row], datum = dates[anchor.day + source.day];
    if (!med || !datum) { skipped.push("buiten het rooster"); continue; }
    const key = celKey(med.id, datum), afw = bepaalAfwezigheid(med, datum, absence);
    if (moving && cells.get(source.sourceKey)?.beschermd) { skipped.push("Planner-koppeling"); continue; }
    if (afw || celBezet(cells.get(key))) { skipped.push(afw ?? "al ingepland"); continue; }
    targets.push({ source, medewerker_id: med.id, datum });
  }
  return { targets, skipped };
}
export function repeatEnd(start: Date, month: number) {
  let year = start.getFullYear();
  if (month < start.getMonth()) year++;
  return endOfMonth(new Date(year, month, 1, 12));
}
export function repeatDates(start: Date, end: Date, weekdays: number[], interval: number) {
  const result: string[] = [];
  for (let week = startOfISOWeek(start); week <= end; week = addWeeks(week, interval)) {
    for (const weekday of [...weekdays].sort()) {
      const date = addDays(week, weekday);
      if (date >= start && date <= end) result.push(format(date, "yyyy-MM-dd"));
    }
  }
  return result;
}
// ── Stap 2: overzicht (vrij/wijzigingen per dag, weken, groeperen/filteren, bezetting per klus) ──

/** Medewerkers zonder planning én zonder afwezigheid op een dag. */
export function vrijOpDag(datum: string, rows: MedewerkerBasis[], cellen: Map<string, Cel>, afwezigheid: BeschikbaarheidBasis[]): MedewerkerBasis[] {
  return rows.filter((m) => !celBezet(cellen.get(celKey(m.id, datum))) && !bepaalAfwezigheid(m, datum, afwezigheid));
}

/** Aantal concepten op een dag. */
export function wijzigingenOpDag<T extends { datum: string }>(concepten: T[], datum: string): number {
  return concepten.filter((c) => c.datum === datum).length;
}

export type GroepMode = "geen" | "rol" | "ploeg";
export type ToonMode = "iedereen" | "monteurs" | "leerlingen";

/** `profiles.ploeg` met "leerling" erin (ongeacht hoofdletters) telt als leerling. */
export function isLeerling(med: { ploeg?: string | null }): boolean {
  return !!med.ploeg && /leerling/i.test(med.ploeg);
}

export function filterToon<T extends { ploeg?: string | null }>(rows: T[], toon: ToonMode): T[] {
  if (toon === "leerlingen") return rows.filter((r) => isLeerling(r));
  if (toon === "monteurs") return rows.filter((r) => !isLeerling(r));
  return rows;
}

export interface GroepRij<T> { label: string; rows: T[] }

/** Groepeert rijen per rol of ploeg. Bij ploeg: `profiles.ploeg`, anders een gedeelde `planning_partner_ids`-set, anders "Zonder ploeg"; medewerkers die alleen uitleenplanning hebben vallen onder "Uitleen". */
export function groepeerRijen<T extends { id: string; role?: string | null; ploeg?: string | null; planning_partner_ids: string[] }>(
  rows: T[],
  mode: GroepMode,
  opties: { rolLabel: (rol: string | null) => string | null; isUitleenAlleen: (id: string) => boolean; naamVoor: (id: string) => string },
): GroepRij<T>[] {
  if (mode === "geen") return rows.length ? [{ label: "", rows }] : [];
  const ids = new Set(rows.map((r) => r.id));
  const key = (r: T): string => {
    if (mode === "rol") return opties.rolLabel(r.role ?? null) ?? "Monteurs";
    if (opties.isUitleenAlleen(r.id)) return "Uitleen";
    if (r.ploeg) return r.ploeg;
    if (r.planning_partner_ids?.length) {
      const partners = [r.id, ...r.planning_partner_ids].filter((id) => ids.has(id)).sort();
      return `Ploeg ${partners.map((id) => opties.naamVoor(id)).join(" & ")}`;
    }
    return "Zonder ploeg";
  };
  const groups = new Map<string, T[]>();
  rows.forEach((r) => { const k = key(r); groups.set(k, [...(groups.get(k) ?? []), r]); });
  return Array.from(groups.entries())
    .sort(([a], [b]) => (a === "Zonder ploeg" || a === "Uitleen" ? 1 : b === "Zonder ploeg" || b === "Uitleen" ? -1 : a.localeCompare(b, "nl")))
    .map(([label, rs]) => ({ label, rows: rs }));
}

export interface KlusBezetting { ingepland: number; nodig: number | null; status: "tekort" | "precies" | "meer" | "geen-norm" }

/** Per dag: ingepland tegen de norm (`projects.benodigd_per_dag`). null-norm = geen beoordeling. */
export function bezettingPerDag(ingepland: number, nodig: number | null): KlusBezetting {
  if (nodig == null) return { ingepland, nodig: null, status: "geen-norm" };
  if (ingepland < nodig) return { ingepland, nodig, status: "tekort" };
  if (ingepland === nodig) return { ingepland, nodig, status: "precies" };
  return { ingepland, nodig, status: "meer" };
}

/** Kopstatus voor een klus over de hele periode (alleen dagen binnen start/eind, indien gezet). */
export function klusKopstatus(dagen: KlusBezetting[]): string {
  const tekort = dagen.reduce((s, d) => s + (d.status === "tekort" && d.nodig != null ? d.nodig - d.ingepland : 0), 0);
  return tekort > 0 ? `Tekort ${tekort} mensdagen` : "Volledig bezet";
}

// ── Stap 3: fouten voorkomen (dubbele boeking, weekgrens) ──

export interface LiveRegel { project_id: string | null; starttijd: string; eindtijd: string }

/** Live regels (gepubliceerd min concepten, plus nieuwe/gewijzigde concepten) per medewerker+datum. */
export function bouwLiveRegels(
  planning: Array<{ id: string; medewerker_id: string; datum: string; project_id: string; starttijd: string; eindtijd: string }>,
  concepten: Array<{ medewerker_id: string; datum: string; project_id: string | null; starttijd: string | null; eindtijd: string | null; actie: string; planning_id: string | null }>,
): Map<string, LiveRegel[]> {
  const removed = new Set(concepten.filter((c) => c.planning_id && (c.actie === "verwijder" || c.actie === "wijzig")).map((c) => c.planning_id));
  const map = new Map<string, LiveRegel[]>();
  const push = (medewerker_id: string, datum: string, regel: LiveRegel) => {
    const key = `${medewerker_id}|${datum}`;
    map.set(key, [...(map.get(key) ?? []), regel]);
  };
  planning.forEach((p) => { if (!removed.has(p.id)) push(p.medewerker_id, p.datum, { project_id: p.project_id, starttijd: p.starttijd.slice(0, 5), eindtijd: p.eindtijd.slice(0, 5) }); });
  concepten.filter((c) => c.actie === "nieuw" || c.actie === "wijzig").forEach((c) => push(c.medewerker_id, c.datum, { project_id: c.project_id, starttijd: c.starttijd ?? "07:00", eindtijd: c.eindtijd ?? "16:00" }));
  return map;
}

/** Twee tijdblokken overlappen (halfopen interval). */
export function tijdenOverlappen(a: { starttijd: string; eindtijd: string }, b: { starttijd: string; eindtijd: string }): boolean {
  return a.starttijd < b.eindtijd && b.starttijd < a.eindtijd;
}

/** Tooltip-tekst voor een dubbele boeking door overlappende tijden, of null als er geen overlap is. */
export function dubbeleBoekingTekst(regels: Array<{ naam: string; starttijd: string; eindtijd: string }>): string | null {
  for (let i = 0; i < regels.length; i++) {
    for (let j = i + 1; j < regels.length; j++) {
      if (tijdenOverlappen(regels[i], regels[j])) {
        return `Dubbele boeking: ${regels[i].naam} ${regels[i].starttijd}–${regels[i].eindtijd} en ${regels[j].naam} ${regels[j].starttijd}–${regels[j].eindtijd} overlappen`;
      }
    }
  }
  return null;
}

/** Netto weekuren per medewerker, voor een set datums (meestal 5 werkdagen). */
export function berekenWeekUren<C extends { medewerker_id: string; datum: string; starttijd: string | null; eindtijd: string | null }>(
  cellen: C[],
  datums: string[],
  uren: (starttijd: string | null, eindtijd: string | null) => number,
): Map<string, number> {
  const set = new Set(datums);
  const m = new Map<string, number>();
  cellen.filter((c) => set.has(c.datum)).forEach((c) => m.set(c.medewerker_id, (m.get(c.medewerker_id) ?? 0) + uren(c.starttijd, c.eindtijd)));
  return m;
}

/** Waarschuwing (geen blokkade) als een medewerker door een nieuwe planning boven de weekgrens komt. */
export function weekgrensWaarschuwing(naam: string, bestaandeUren: number, toeTeVoegenUren: number, weeknummer: number, grens: number, format: (n: number) => string): string | null {
  const totaal = bestaandeUren + toeTeVoegenUren;
  if (totaal <= grens) return null;
  return `${naam} komt op ${format(totaal)} u in week ${weeknummer} (boven ${grens} u)`;
}

// ── Stap 5: na afloop (geboekt vs. gepland, lege dagen) ──

export type BoekVergelijking = "gelijk" | "afwijkend" | "niet-geboekt";

/** Vergelijkt geplande netto uren met geboekte uren voor een afgelopen dag. */
export function vergelijkBoeking(geplandUren: number, geboektUren: number): BoekVergelijking {
  if (geboektUren <= 0) return "niet-geboekt";
  if (Math.abs(geboektUren - geplandUren) < 0.01) return "gelijk";
  return "afwijkend";
}

/** Een werkdag is leeg als er geen planning en geen afwezigheid op staat. */
export function isLegeWerkdag(gevuld: boolean, afwezig: boolean): boolean {
  return !gevuld && !afwezig;
}

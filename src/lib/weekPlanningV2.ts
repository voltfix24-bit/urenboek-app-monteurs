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
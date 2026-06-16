/**
 * Helpers voor publiceren ("definitief maken") en terugzetten naar concept van
 * ProjectPlanning. Pure functies — géén IO. De UI/handler past ze toe op de
 * Supabase planning-tabel.
 *
 * Belangrijk:
 *   - Planning-regels die door TerreVolt Planner zijn aangemaakt of geadopteerd
 *     hebben external_source = 'terrevolt_planner'. Deze mogen NIET door
 *     ProjectPlanning gepubliceerd/herpubliceerd worden verwijderd.
 *   - Alleen handmatige/interne planningregels (external_source IS NULL of een
 *     andere bron) mogen worden opgeschoond.
 */

export const PLANNER_EXTERNAL_SOURCE = "terrevolt_planner" as const;

export interface PlanningRowLike {
  id: string;
  project_id: string;
  external_source?: string | null;
}

/** True als de regel afkomstig is van TerreVolt Planner en beschermd is. */
export function isExternePlannerRegel(r: { external_source?: string | null }): boolean {
  return r.external_source === PLANNER_EXTERNAL_SOURCE;
}

/** Filtert de regels die door ProjectPlanning verwijderd mogen worden. */
export function filterTeVerwijderenHandmatigeRegels<T extends { external_source?: string | null }>(
  regels: readonly T[],
): T[] {
  return regels.filter(r => !isExternePlannerRegel(r));
}

export interface ExternePlannerSamenvatting {
  totaal: number;
  perDatum: Array<{ datum: string; aantal: number }>;
}

/**
 * Telt externe Planner-regels per datum — voor het waarschuwingsdialoog
 * dat we de manager tonen vóór publiceren.
 */
export function vatExternePlannerRegelsSamen(
  regels: ReadonlyArray<{ external_source?: string | null; datum: string }>,
): ExternePlannerSamenvatting {
  const externe = regels.filter(isExternePlannerRegel);
  const map = new Map<string, number>();
  for (const r of externe) {
    map.set(r.datum, (map.get(r.datum) ?? 0) + 1);
  }
  const perDatum = Array.from(map.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([datum, aantal]) => ({ datum, aantal }));
  return { totaal: externe.length, perDatum };
}

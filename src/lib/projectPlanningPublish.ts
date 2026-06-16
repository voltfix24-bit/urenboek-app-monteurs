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
  sync_locked?: boolean | null;
}

/** True als de regel afkomstig is van TerreVolt Planner en beschermd is. */
export function isExternePlannerRegel(r: { external_source?: string | null }): boolean {
  return r.external_source === PLANNER_EXTERNAL_SOURCE;
}

/**
 * True als de regel sync-locked is. sync_locked = true beschermt een planning-
 * regel tegen verwijderen door interne publicatieflows, ook als external_source
 * (per ongeluk) leeg zou zijn.
 */
export function isSyncLockedRegel(r: { sync_locked?: boolean | null }): boolean {
  return r.sync_locked === true;
}

/**
 * Een regel is beschermd zodra hij óf een externe Planner-regel is, óf
 * sync_locked = true heeft. Beide condities beschermen tegen verwijderen
 * door ProjectPlanning.
 */
export function isBeschermdeRegel(
  r: { external_source?: string | null; sync_locked?: boolean | null },
): boolean {
  return isExternePlannerRegel(r) || isSyncLockedRegel(r);
}

/** Filtert de regels die door ProjectPlanning verwijderd mogen worden. */
export function filterTeVerwijderenHandmatigeRegels<
  T extends { external_source?: string | null; sync_locked?: boolean | null },
>(regels: readonly T[]): T[] {
  return regels.filter(r => !isBeschermdeRegel(r));
}

// ─── Insert-bescherming bij publiceren ───────────────────────────────────

export interface KandidaatInsertRegel {
  medewerker_id: string;
  datum: string;
}

export interface BeschermdeInsertSplitResultaat<T extends KandidaatInsertRegel> {
  /** Nieuw aan te maken regels — botsen niet met een externe Planner-regel. */
  toInsert: T[];
  /** Regels die zijn overgeslagen omdat (medewerker, datum) al een Planner-regel had. */
  geblokkeerd: Array<{ medewerker_id: string; datum: string }>;
}

/**
 * Verwijdert kandidaat-inserts die zouden botsen met een bestaande externe
 * Planner-regel op (medewerker_id, datum). Voorkomt dubbele planning voor
 * dezelfde monteur op dezelfde dag.
 *
 * Vergelijkt op exact (medewerker_id, datum) — Planner-regels staan vast op
 * 07:00–16:00, dus tijden hoeven hier niet meegewogen te worden.
 */
export function splitsKandidatenOpExternePlannerBotsing<T extends KandidaatInsertRegel>(
  kandidaten: readonly T[],
  externePlannerRegels: ReadonlyArray<{
    external_source?: string | null;
    sync_locked?: boolean | null;
    medewerker_id: string;
    datum: string;
  }>,
): BeschermdeInsertSplitResultaat<T> {
  const beschermdeSleutels = new Set<string>();
  for (const r of externePlannerRegels) {
    if (!isBeschermdeRegel(r)) continue;
    beschermdeSleutels.add(`${r.medewerker_id}|${r.datum}`);
  }
  const toInsert: T[] = [];
  const geblokkeerd: Array<{ medewerker_id: string; datum: string }> = [];
  for (const k of kandidaten) {
    const sleutel = `${k.medewerker_id}|${k.datum}`;
    if (beschermdeSleutels.has(sleutel)) {
      geblokkeerd.push({ medewerker_id: k.medewerker_id, datum: k.datum });
    } else {
      toInsert.push(k);
    }
  }
  return { toInsert, geblokkeerd };
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

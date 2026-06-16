/**
 * Forecast-relevantie helper.
 *
 * Niet elk project gebruikt forecast/calculatie. Sommige projecten draaien op
 * uren of zijn uitgesloten van forecastcontrole. Forecast-waarschuwingen of
 * lege forecastblokken mogen voor deze projecten niet als fout/actiepunt gelden.
 *
 * Een project is NIET forecast-relevant wanneer:
 *  - planner_sync_enabled === false (expliciet uitgesloten), of
 *  - de projectnaam/opdrachtgever matcht een bekend uren-/meeloop-type
 *    (Meeloopuren Van Gelder, Verlet, Heijmans, Fjodor, Hanab).
 *
 * Pure functie, géén IO.
 */

export interface ForecastRelevantInput {
  naam?: string | null;
  opdrachtgever_naam?: string | null;
  planner_sync_enabled?: boolean | null;
  planner_sync_exclusion_reason?: string | null;
}

// Bekende niet-forecast-relevante project-/opdrachtgevernamen (lowercase substrings).
export const NIET_FORECAST_RELEVANTE_TREFWOORDEN: readonly string[] = [
  "meeloopuren van gelder",
  "meeloop van gelder",
  "verlet",
  "heijmans",
  "fjodor",
  "hanab",
];

function bevatTrefwoord(haystack: string | null | undefined): boolean {
  if (!haystack) return false;
  const lc = haystack.toLowerCase();
  return NIET_FORECAST_RELEVANTE_TREFWOORDEN.some(t => lc.includes(t));
}

export function isProjectForecastRelevant(p: ForecastRelevantInput): boolean {
  // 1) Expliciete uitsluiting via planner_sync_enabled
  if (p.planner_sync_enabled === false) return false;
  // 2) Trefwoorden in projectnaam of opdrachtgevernaam
  if (bevatTrefwoord(p.naam)) return false;
  if (bevatTrefwoord(p.opdrachtgever_naam)) return false;
  return true;
}

/**
 * Hulpfunctie voor UI-meldingen: of een ontbrekende of lege forecast als
 * waarschuwing/actiepunt mag worden gemarkeerd voor dit project.
 */
export function moetForecastOntbreektWaarschuwen(p: ForecastRelevantInput): boolean {
  return isProjectForecastRelevant(p);
}

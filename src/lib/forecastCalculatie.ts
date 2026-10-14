/**
 * Eén bron voor de forecastopbrengst van een project.
 *
 * ForecastTab, de forecast-PDF en het financieel overzicht gebruiken alle drie
 * deze berekening. Er bestaat bewust geen tweede variant: "gebruik voor cases de
 * bestaande forecast-berekening" (FINANCIEN.md).
 */

export interface ForecastRegelBasis {
  type?: string | null;
  tarief?: number | string | null;
  aantal?: number | string | null;
  geplande_uren?: number | string | null;
  uurtarief_snap?: number | string | null;
}

export const STUKS_METHODEN = ["stuksprijzen", "intake"] as const;

export function isStuksmethode(methode: string | null | undefined): boolean {
  return !!methode && (STUKS_METHODEN as readonly string[]).includes(methode);
}

/**
 * Opbrengst van het project volgens de gekozen methode:
 * - stuksprijzen / intake: som van tarief × aantal per bestekregel;
 * - op uren: de handmatig ingevoerde verwachte omzet.
 */
export function forecastOmzet(
  methode: string | null | undefined,
  regels: ForecastRegelBasis[],
  verwachteOmzet: number | null | undefined
): number {
  if (isStuksmethode(methode)) {
    return regels.reduce((s, r) => s + (Number(r.tarief) || 0) * (Number(r.aantal ?? 1) || 0), 0);
  }
  return Number(verwachteOmzet) || 0;
}

/** Personeelskosten zoals de uren-methode die uit de regels haalt. */
export function forecastUrenKosten(regels: ForecastRegelBasis[]): number {
  return regels.reduce((s, r) => s + (Number(r.geplande_uren) || 0) * (Number(r.uurtarief_snap) || 0), 0);
}

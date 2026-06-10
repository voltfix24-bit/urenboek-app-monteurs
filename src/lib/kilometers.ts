/**
 * Centrale helper voor kilometer-afronding.
 * Kilometers worden ALTIJD opgeslagen, berekend en weergegeven als gehele getallen.
 */
export function roundKilometers(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

/**
 * Bereken vergoedbare km en bedrag op basis van retour en vrij.
 * - retour en vrij worden eerst afgerond op gehele km
 * - vergoedbare = max(0, retour - vrij)
 * - bedrag = vergoedbare × tarief, afgerond op 2 decimalen
 */
export function berekenReiskosten(
  retour: unknown,
  vrij: unknown,
  tarief: unknown,
): { retour_km: number; vrije_km: number; vergoedbare_km: number; bedrag: number } {
  const retour_km = roundKilometers(retour);
  const vrije_km = roundKilometers(vrij);
  const vergoedbare_km = Math.max(0, retour_km - vrije_km);
  const tariefNum = Number(tarief);
  const rawBedrag = vergoedbare_km * (Number.isFinite(tariefNum) ? tariefNum : 0);
  const bedrag = Math.round(rawBedrag * 100) / 100;
  return { retour_km, vrije_km, vergoedbare_km, bedrag };
}

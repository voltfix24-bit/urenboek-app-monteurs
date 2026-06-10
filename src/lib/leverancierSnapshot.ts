/**
 * Leverancier (onderaannemer/ZZP) bedrijfsgegevens-snapshot.
 *
 * Snapshots worden vastgelegd bij het aanmaken/verzenden van een inkooporder zodat
 * latere profielwijzigingen historische PDF's niet beïnvloeden.
 */

export interface LeverancierSnapshot {
  bedrijfsnaam: string | null;
  contactpersoon: string | null;
  factuuradres: string | null;
  kvk_nummer: string | null;
  btw_nummer: string | null;
  iban: string | null;
  telefoon: string | null;
  email: string | null;
  betalingstermijn: number | null;
}

/** Bouw een snapshot uit een profielrij. */
export function buildLeverancierSnapshot(prof: any): LeverancierSnapshot {
  return {
    bedrijfsnaam: prof?.bedrijfsnaam || null,
    contactpersoon: prof?.contactpersoon || prof?.full_name || null,
    factuuradres: prof?.factuuradres || prof?.adres || null,
    kvk_nummer: prof?.kvk_nummer || null,
    btw_nummer: prof?.btw_nummer || null,
    iban: prof?.iban || null,
    telefoon: prof?.telefoon || null,
    email: prof?.email || null,
    betalingstermijn: prof?.betalingstermijn ?? null,
  };
}

/**
 * Resolve de leverancier-gegevens voor PDF-rendering.
 * Voorkeur: snapshot op de order. Fallback: huidig profiel.
 */
export function resolveLeverancier(order: any, prof: any): LeverancierSnapshot {
  const snap = order?.leverancier_snapshot as LeverancierSnapshot | null | undefined;
  if (snap && (snap.bedrijfsnaam || snap.contactpersoon || snap.kvk_nummer || snap.iban)) {
    return {
      bedrijfsnaam: snap.bedrijfsnaam ?? null,
      contactpersoon: snap.contactpersoon ?? null,
      factuuradres: snap.factuuradres ?? null,
      kvk_nummer: snap.kvk_nummer ?? null,
      btw_nummer: snap.btw_nummer ?? null,
      iban: snap.iban ?? null,
      telefoon: snap.telefoon ?? null,
      email: snap.email ?? null,
      betalingstermijn: snap.betalingstermijn ?? null,
    };
  }
  return buildLeverancierSnapshot(prof);
}

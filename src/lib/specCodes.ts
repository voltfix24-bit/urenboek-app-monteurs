/**
 * Bestekcodes. LET OP: in deze client-code staan bewust GEEN tarieven.
 * Verkoopprijzen zijn vertrouwelijk en komen uitsluitend uit de manager-only
 * tabel `spec_code_tarieven` (RLS). Er is geen fallback naar vaste bedragen.
 */
export interface SpecCode {
  code: string;
  omschrijving: string;
  eenheid: string;
  tarief: number;
  groep: string;
  eigen_kosten?: number;
}

export type SpecCodeMeta = Omit<SpecCode, "tarief" | "eigen_kosten">;

export const GROEP_LABELS: Record<string, string> = {
  'R31x': 'R31x — Bouwkundig',
  'R32x': 'R32x — MS-installatie',
  'R33x': 'R33x — Trafoposten',
  'R34x': 'R34x — LS-installatie',
  'R35x': 'R35x — Aarding',
  'R36x': 'R36x — OV',
  'R37x': 'R37x — Overig',
  'R41x': 'R41x — MS moffen/eindsluit',
  'R42x': 'R42x — LS moffen/eindsluit',
  'R43x': 'R43x — Aansluitingen',
  'R44x': 'R44x — WV',
  'R50x': 'R50x — Revisie/oplevering',
  'R61x': 'R61x — Personeel',
};

/** Alleen metadata (code/omschrijving/eenheid/groep) — geen bedragen. */
export const SPEC_CODE_META: SpecCodeMeta[] = [
  { code: 'R310010', omschrijving: 'Boren gaten tbv doorvoeren', eenheid: 'st', groep: 'R31x' },
  { code: 'R310020', omschrijving: 'Dichtzetten doorvoeringen', eenheid: 'st', groep: 'R31x' },
  { code: 'R310030', omschrijving: 'GGI', eenheid: 'st', groep: 'R31x' },
  { code: 'R310040', omschrijving: 'Traanplaat', eenheid: 'st', groep: 'R31x' },
  { code: 'R320010', omschrijving: 'Basis MS-installatie', eenheid: 'st', groep: 'R32x' },
  { code: 'R320020', omschrijving: 'Extra MS-veld', eenheid: 'st', groep: 'R32x' },
  { code: 'R320030', omschrijving: 'Ombouw MS → iMS', eenheid: 'st', groep: 'R32x' },
  { code: 'R320040', omschrijving: 'Compactstation', eenheid: 'st', groep: 'R32x' },
  { code: 'R330010', omschrijving: 'Plaatsen transformator', eenheid: 'st', groep: 'R33x' },
  { code: 'R330020', omschrijving: 'Draaien transformator', eenheid: 'st', groep: 'R33x' },
  { code: 'R330030', omschrijving: 'Trafokabel betreedbaar', eenheid: 'st', groep: 'R33x' },
  { code: 'R330040', omschrijving: 'Trafokabel compact', eenheid: 'st', groep: 'R33x' },
  { code: 'R330050', omschrijving: 'Vrijschakelen trafo', eenheid: 'st', groep: 'R33x' },
  { code: 'R340010', omschrijving: 'LS-rek ≤630kVA', eenheid: 'st', groep: 'R34x' },
  { code: 'R340020', omschrijving: 'LS-rek >630kVA', eenheid: 'st', groep: 'R34x' },
  { code: 'R340030', omschrijving: 'Uitbreidingsrek', eenheid: 'st', groep: 'R34x' },
  { code: 'R340040', omschrijving: 'LS stroken', eenheid: 'st', groep: 'R34x' },
  { code: 'R340050', omschrijving: 'LS-kabel aansluiten', eenheid: 'st', groep: 'R34x' },
  { code: 'R340060', omschrijving: 'Zekeringen wisselen', eenheid: 'st', groep: 'R34x' },
  { code: 'R350010', omschrijving: 'Meten aardweerstand', eenheid: 'keer', groep: 'R35x' },
  { code: 'R350020', omschrijving: 'Vereffeningsleiding', eenheid: 'st', groep: 'R35x' },
  { code: 'R360010', omschrijving: 'OV kast', eenheid: 'st', groep: 'R36x' },
  { code: 'R360020', omschrijving: 'OV kWh-meter', eenheid: 'st', groep: 'R36x' },
  { code: 'R370010', omschrijving: 'Provisorium', eenheid: 'st', groep: 'R37x' },
  { code: 'R370020', omschrijving: 'LS kast', eenheid: 'st', groep: 'R37x' },
  { code: 'R370030', omschrijving: 'NSA coördinatie', eenheid: 'st', groep: 'R37x' },
  { code: 'R410010', omschrijving: 'MS mof', eenheid: 'st', groep: 'R41x' },
  { code: 'R410020', omschrijving: 'MS eindsluiting', eenheid: 'st', groep: 'R41x' },
  { code: 'R420010', omschrijving: 'LS mof', eenheid: 'st', groep: 'R42x' },
  { code: 'R420020', omschrijving: 'LS eindsluiting', eenheid: 'st', groep: 'R42x' },
  { code: 'R430010', omschrijving: 'Overzetten huisaansluiting', eenheid: 'st', groep: 'R43x' },
  { code: 'R430020', omschrijving: 'Verwijderen LS kast', eenheid: 'st', groep: 'R43x' },
  { code: 'R440010', omschrijving: 'WV-er', eenheid: 'uur', groep: 'R44x' },
  { code: 'R440020', omschrijving: 'WV-er io', eenheid: 'uur', groep: 'R44x' },
  { code: 'R440030', omschrijving: 'Vrijschakelen kabeldeel', eenheid: 'keer', groep: 'R44x' },
  { code: 'R500010', omschrijving: 'Revisiedossier volledig', eenheid: 'st', groep: 'R50x' },
  { code: 'R500020', omschrijving: 'Revisiedossier excl civiel', eenheid: 'st', groep: 'R50x' },
  { code: 'R610040', omschrijving: 'VP', eenheid: 'uur', groep: 'R61x' },
  { code: 'R610050', omschrijving: 'AVP distributie', eenheid: 'uur', groep: 'R61x' },
  { code: 'R610060', omschrijving: 'VOP', eenheid: 'uur', groep: 'R61x' },
];

export class TarievenNietBeschikbaarError extends Error {
  constructor(message = "Tarieven konden niet worden opgehaald. Alleen managers hebben toegang tot tarieven.") {
    super(message);
    this.name = "TarievenNietBeschikbaarError";
  }
}

/**
 * Laadt actieve tarieven uit de manager-only tabel. Gooit een
 * TarievenNietBeschikbaarError bij netwerkfout, geweigerde toegang of lege
 * resultaten (RLS geeft niet-managers 0 rijen). Nooit een vaste fallback.
 */
export async function loadSpecCodes(supabase: any): Promise<SpecCode[]> {
  let res: any;
  try {
    res = await supabase
      .from('spec_code_tarieven')
      .select('*')
      .eq('actief', true)
      .order('code');
  } catch (err) {
    throw new TarievenNietBeschikbaarError(`Tarieven ophalen mislukt: ${(err as Error)?.message ?? err}`);
  }
  if (res?.error) throw new TarievenNietBeschikbaarError(`Tarieven ophalen mislukt: ${res.error.message}`);
  const data = res?.data;
  if (!data || data.length === 0) throw new TarievenNietBeschikbaarError();
  return data.map((d: any) => ({
    code: d.code,
    omschrijving: d.omschrijving,
    eenheid: d.eenheid,
    tarief: Number(d.tarief),
    groep: d.groep,
    eigen_kosten: Number(d.eigen_kosten) || 0,
  }));
}

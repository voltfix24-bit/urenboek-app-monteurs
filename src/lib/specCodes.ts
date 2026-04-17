export interface SpecCode {
  code: string;
  omschrijving: string;
  eenheid: string;
  tarief: number;
  groep: string;
  eigen_kosten?: number;
}

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

export const SPEC_CODES: SpecCode[] = [
  { code: 'R310010', omschrijving: 'Boren gaten tbv doorvoeren', eenheid: 'st', tarief: 66.56, groep: 'R31x' },
  { code: 'R310020', omschrijving: 'Dichtzetten doorvoeringen', eenheid: 'st', tarief: 59.13, groep: 'R31x' },
  { code: 'R310030', omschrijving: 'GGI', eenheid: 'st', tarief: 235.99, groep: 'R31x' },
  { code: 'R310040', omschrijving: 'Traanplaat', eenheid: 'st', tarief: 302.66, groep: 'R31x' },
  { code: 'R320010', omschrijving: 'Basis MS-installatie', eenheid: 'st', tarief: 10733.98, groep: 'R32x' },
  { code: 'R320020', omschrijving: 'Extra MS-veld', eenheid: 'st', tarief: 1696.24, groep: 'R32x' },
  { code: 'R320030', omschrijving: 'Ombouw MS → iMS', eenheid: 'st', tarief: 813.27, groep: 'R32x' },
  { code: 'R320040', omschrijving: 'Compactstation', eenheid: 'st', tarief: 7271.82, groep: 'R32x' },
  { code: 'R330010', omschrijving: 'Plaatsen transformator', eenheid: 'st', tarief: 1504.04, groep: 'R33x' },
  { code: 'R330020', omschrijving: 'Draaien transformator', eenheid: 'st', tarief: 1241.86, groep: 'R33x' },
  { code: 'R330030', omschrijving: 'Trafokabel betreedbaar', eenheid: 'st', tarief: 821.25, groep: 'R33x' },
  { code: 'R330040', omschrijving: 'Trafokabel compact', eenheid: 'st', tarief: 810.46, groep: 'R33x' },
  { code: 'R330050', omschrijving: 'Vrijschakelen trafo', eenheid: 'st', tarief: 300.81, groep: 'R33x' },
  { code: 'R340010', omschrijving: 'LS-rek ≤630kVA', eenheid: 'st', tarief: 2460.94, groep: 'R34x' },
  { code: 'R340020', omschrijving: 'LS-rek >630kVA', eenheid: 'st', tarief: 2808.08, groep: 'R34x' },
  { code: 'R340030', omschrijving: 'Uitbreidingsrek', eenheid: 'st', tarief: 509.43, groep: 'R34x' },
  { code: 'R340040', omschrijving: 'LS stroken', eenheid: 'st', tarief: 101.89, groep: 'R34x' },
  { code: 'R340050', omschrijving: 'LS-kabel aansluiten', eenheid: 'st', tarief: 165.55, groep: 'R34x' },
  { code: 'R340060', omschrijving: 'Zekeringen wisselen', eenheid: 'st', tarief: 73.45, groep: 'R34x' },
  { code: 'R350010', omschrijving: 'Meten aardweerstand', eenheid: 'keer', tarief: 164.76, groep: 'R35x' },
  { code: 'R350020', omschrijving: 'Vereffeningsleiding', eenheid: 'st', tarief: 1253.70, groep: 'R35x' },
  { code: 'R360010', omschrijving: 'OV kast', eenheid: 'st', tarief: 487.61, groep: 'R36x' },
  { code: 'R360020', omschrijving: 'OV kWh-meter', eenheid: 'st', tarief: 106.02, groep: 'R36x' },
  { code: 'R370010', omschrijving: 'Provisorium', eenheid: 'st', tarief: 3875.16, groep: 'R37x' },
  { code: 'R370020', omschrijving: 'LS kast', eenheid: 'st', tarief: 815.10, groep: 'R37x' },
  { code: 'R370030', omschrijving: 'NSA coördinatie', eenheid: 'st', tarief: 601.62, groep: 'R37x' },
  { code: 'R410010', omschrijving: 'MS mof', eenheid: 'st', tarief: 610.93, groep: 'R41x' },
  { code: 'R410020', omschrijving: 'MS eindsluiting', eenheid: 'st', tarief: 494.74, groep: 'R41x' },
  { code: 'R420010', omschrijving: 'LS mof', eenheid: 'st', tarief: 141.35, groep: 'R42x' },
  { code: 'R420020', omschrijving: 'LS eindsluiting', eenheid: 'st', tarief: 115.15, groep: 'R42x' },
  { code: 'R430010', omschrijving: 'Overzetten huisaansluiting', eenheid: 'st', tarief: 314.88, groep: 'R43x' },
  { code: 'R430020', omschrijving: 'Verwijderen LS kast', eenheid: 'st', tarief: 442.16, groep: 'R43x' },
  { code: 'R440010', omschrijving: 'WV-er', eenheid: 'uur', tarief: 110.00, groep: 'R44x' },
  { code: 'R440020', omschrijving: 'WV-er io', eenheid: 'uur', tarief: 50.00, groep: 'R44x' },
  { code: 'R440030', omschrijving: 'Vrijschakelen kabeldeel', eenheid: 'keer', tarief: 300.81, groep: 'R44x' },
  { code: 'R500010', omschrijving: 'Revisiedossier volledig', eenheid: 'st', tarief: 1393.63, groep: 'R50x' },
  { code: 'R500020', omschrijving: 'Revisiedossier excl civiel', eenheid: 'st', tarief: 939.49, groep: 'R50x' },
  { code: 'R610040', omschrijving: 'VP', eenheid: 'uur', tarief: 70.00, groep: 'R61x' },
  { code: 'R610050', omschrijving: 'AVP distributie', eenheid: 'uur', tarief: 75.00, groep: 'R61x' },
  { code: 'R610060', omschrijving: 'VOP', eenheid: 'uur', tarief: 55.00, groep: 'R61x' },
];

export async function loadSpecCodes(supabase: any): Promise<SpecCode[]> {
  const { data } = await supabase
    .from('spec_code_tarieven')
    .select('*')
    .eq('actief', true)
    .order('code');
  if (!data || data.length === 0) return SPEC_CODES;
  return data.map((d: any) => ({
    code: d.code,
    omschrijving: d.omschrijving,
    eenheid: d.eenheid,
    tarief: Number(d.tarief),
    groep: d.groep,
    eigen_kosten: Number(d.eigen_kosten) || 0,
  }));
}

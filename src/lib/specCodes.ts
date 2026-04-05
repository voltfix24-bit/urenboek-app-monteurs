export interface SpecCode {
  code: string;
  omschrijving: string;
  tarief_terrevolt: number;
  tarief_inkoop: number;
  groep: string;
}

export const SPEC_CODE_GROEPEN: { label: string; prefix: string }[] = [
  { label: "R31x — Bouwkundig", prefix: "R31" },
  { label: "R32x — MS-installatie", prefix: "R32" },
  { label: "R33x — Trafoposten", prefix: "R33" },
  { label: "R34x — LS-rek", prefix: "R34" },
  { label: "R35x — Aarding", prefix: "R35" },
  { label: "R37x — Overig", prefix: "R37" },
  { label: "R44x — WV", prefix: "R44" },
  { label: "R50x — Revisie", prefix: "R50" },
];

export const SPEC_CODES: SpecCode[] = [
  // R31x — Bouwkundig
  { code: "R310010", omschrijving: "Boren/coördinatie", tarief_terrevolt: 134.96, tarief_inkoop: 47.54, groep: "R31" },
  { code: "R310020", omschrijving: "Dichtzetten", tarief_terrevolt: 92.21, tarief_inkoop: 49.70, groep: "R31" },
  { code: "R310030", omschrijving: "GGI", tarief_terrevolt: 440.22, tarief_inkoop: 182.85, groep: "R31" },
  { code: "R310040", omschrijving: "Traanplaat", tarief_terrevolt: 771.56, tarief_inkoop: 216.18, groep: "R31" },
  // R32x — MS-installatie
  { code: "R320010", omschrijving: "MS-installatie", tarief_terrevolt: 19130, tarief_inkoop: 7820, groep: "R32" },
  { code: "R320020", omschrijving: "Extra MS-veld", tarief_terrevolt: 2645, tarief_inkoop: 1524, groep: "R32" },
  { code: "R320030", omschrijving: "Ombouw MS→iMS", tarief_terrevolt: 1543, tarief_inkoop: 581, groep: "R32" },
  { code: "R320040", omschrijving: "Compactstation", tarief_terrevolt: 12603, tarief_inkoop: 5352, groep: "R32" },
  // R33x — Trafoposten
  { code: "R330010", omschrijving: "Plaatsen trafo", tarief_terrevolt: 2346, tarief_inkoop: 1088, groep: "R33" },
  { code: "R330020", omschrijving: "Draaien trafo", tarief_terrevolt: 2346, tarief_inkoop: 987, groep: "R33" },
  { code: "R330030", omschrijving: "Kabel betreedbaar", tarief_terrevolt: 1876, tarief_inkoop: 658, groep: "R33" },
  { code: "R330040", omschrijving: "Kabel compact", tarief_terrevolt: 1407, tarief_inkoop: 629, groep: "R33" },
  { code: "R330050", omschrijving: "Vrijschakelen", tarief_terrevolt: 469, tarief_inkoop: 216, groep: "R33" },
  // R34x — LS-rek
  { code: "R340010", omschrijving: "LS-rek ≤630kVA", tarief_terrevolt: 3838, tarief_inkoop: 2004, groep: "R34" },
  { code: "R340020", omschrijving: "LS-rek >630kVA", tarief_terrevolt: 4691, tarief_inkoop: 2276, groep: "R34" },
  { code: "R340030", omschrijving: "Uitbreidingsrek", tarief_terrevolt: 1379, tarief_inkoop: 364, groep: "R34" },
  { code: "R340040", omschrijving: "LS stroken", tarief_terrevolt: 441, tarief_inkoop: 73, groep: "R34" },
  { code: "R340050", omschrijving: "LS-kabel aansluiten", tarief_terrevolt: 220, tarief_inkoop: 146, groep: "R34" },
  { code: "R340060", omschrijving: "Zekeringen wisselen", tarief_terrevolt: 247, tarief_inkoop: 52, groep: "R34" },
  // R35x — Aarding
  { code: "R350010", omschrijving: "Meten aardweerstand", tarief_terrevolt: 220.44, tarief_inkoop: 144.72, groep: "R35" },
  { code: "R350020", omschrijving: "Vereffeningsleiding", tarief_terrevolt: 2352, tarief_inkoop: 966.93, groep: "R35" },
  // R37x — Overig
  { code: "R370010", omschrijving: "Provisorium", tarief_terrevolt: 3875, tarief_inkoop: 3279, groep: "R37" },
  { code: "R370020", omschrijving: "LS kast", tarief_terrevolt: 1352, tarief_inkoop: 582.21, groep: "R37" },
  { code: "R370030", omschrijving: "NSA", tarief_terrevolt: 938.23, tarief_inkoop: 480.45, groep: "R37" },
  // R44x — WV
  { code: "R440010", omschrijving: "WV-er", tarief_terrevolt: 136.43, tarief_inkoop: 90, groep: "R44" },
  { code: "R440020", omschrijving: "WV-er opleiding", tarief_terrevolt: 68.22, tarief_inkoop: 40, groep: "R44" },
  // R50x — Revisie
  { code: "R500010", omschrijving: "Revisie volledig", tarief_terrevolt: 2540, tarief_inkoop: 1138, groep: "R50" },
  { code: "R500020", omschrijving: "Revisie excl civiel", tarief_terrevolt: 1465, tarief_inkoop: 851.81, groep: "R50" },
];

import { SPEC_CODES } from "./specCodes";

export interface IntakeAnswers {
  rmu_vervangen: boolean | null;
  rmu_merk: string | null;
  rmu_configuratie_id: string | null;
  rmu_velden: number;
  trafo_situatie: "nieuw" | "draaien" | "geen" | null;
  ls_rek: "klein" | "groot" | "geen" | null;
  ls_stroken: number;
  ls_kabels: number;
  ms_eindsluitingen: number;
  ms_moffen: number;
  vereffeningsleiding: boolean;
  aardweerstand: boolean;
  ggi: boolean;
  boren: boolean;
  wv_uren: number;
  revisie: boolean;
}

export interface RmuConfiguratie {
  id: string;
  merk: string;
  code: string;
  velden: number;
  label: string;
  actief: boolean;
  volgorde: number;
}

export interface ForecastRegel {
  code: string;
  aantal: number;
  spec_omschrijving: string;
  tarief_terrevolt: number;
  tarief_inkoop: number;
}

export const defaultAnswers: IntakeAnswers = {
  rmu_vervangen: null,
  rmu_merk: null,
  rmu_configuratie_id: null,
  rmu_velden: 0,
  trafo_situatie: null,
  ls_rek: null,
  ls_stroken: 0,
  ls_kabels: 0,
  ms_eindsluitingen: 0,
  ms_moffen: 0,
  vereffeningsleiding: false,
  aardweerstand: false,
  ggi: false,
  boren: false,
  wv_uren: 0,
  revisie: true,
};

export function suggesteerEindsluitingen(rmuConfig: RmuConfiguratie | null): { eindsluitingen: number; moffen: number } {
  if (!rmuConfig) return { eindsluitingen: 0, moffen: 0 };
  const kabelvelden = rmuConfig.velden - 1;
  return { eindsluitingen: kabelvelden, moffen: kabelvelden };
}

export function berekenForecastRegels(
  answers: IntakeAnswers,
  caseType: string | null,
  rmuConfig: RmuConfiguratie | null
): ForecastRegel[] {
  const regels: { code: string; aantal: number }[] = [];

  // RMU / MS-installatie
  if (answers.rmu_vervangen) {
    if (caseType === "Compactstation") {
      regels.push({ code: "R320040", aantal: 1 });
    } else {
      regels.push({ code: "R320010", aantal: 1 });
    }
    const extra = Math.max(0, (rmuConfig?.velden || 3) - 3);
    if (extra > 0) regels.push({ code: "R320020", aantal: extra });
  }

  // Case type specifiek
  if (caseType === "NSA-case") regels.push({ code: "R370030", aantal: 1 });
  else if (caseType === "Provisorium") regels.push({ code: "R370010", aantal: 1 });

  // Trafo
  if (answers.trafo_situatie === "nieuw") regels.push({ code: "R330010", aantal: 1 });
  else if (answers.trafo_situatie === "draaien") regels.push({ code: "R330020", aantal: 1 });

  // LS
  if (answers.ls_rek === "klein") regels.push({ code: "R340010", aantal: 1 });
  else if (answers.ls_rek === "groot") regels.push({ code: "R340020", aantal: 1 });
  if (answers.ls_stroken > 0) regels.push({ code: "R340040", aantal: answers.ls_stroken });
  if (answers.ls_kabels > 0) regels.push({ code: "R340050", aantal: answers.ls_kabels });

  // MS kabels
  if (answers.ms_eindsluitingen > 0) regels.push({ code: "R410010", aantal: answers.ms_eindsluitingen });
  if (answers.ms_moffen > 0) regels.push({ code: "R410020", aantal: answers.ms_moffen });

  // Overig
  if (answers.vereffeningsleiding) regels.push({ code: "R350020", aantal: 1 });
  if (answers.aardweerstand) regels.push({ code: "R350010", aantal: 1 });
  if (answers.ggi) regels.push({ code: "R310030", aantal: 1 });
  if (answers.boren) regels.push({ code: "R310010", aantal: 1 });
  if (answers.revisie) regels.push({ code: "R500020", aantal: 1 });
  if (answers.wv_uren > 0) regels.push({ code: "R440010", aantal: answers.wv_uren });

  return regels.map(r => {
    const spec = SPEC_CODES.find(s => s.code === r.code);
    return {
      ...r,
      spec_omschrijving: spec?.omschrijving || r.code,
      tarief_terrevolt: spec?.tarief_terrevolt || 0,
      tarief_inkoop: spec?.tarief_inkoop || 0,
    };
  });
}

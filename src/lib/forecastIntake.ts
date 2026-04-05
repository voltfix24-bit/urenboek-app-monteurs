import { SPEC_CODES } from "./specCodes";

export interface IntakeAntwoorden {
  rmu_vervangen: boolean;
  rmu_configuratie_id: string | null;
  rmu_velden: number;
  trafo_situatie: "nieuw" | "draaien" | "geen";
  ls_rek: "klein" | "groot" | "geen";
  ls_stroken: number;
  ls_kabels: number;
  ms_eindsluitingen: number;
  ms_moffen: number;
  vereffeningsleiding: boolean;
  vereffeningsleiding_aantal: number;
  aardweerstand: boolean;
  ggi: boolean;
  ggi_aantal: number;
  boren: boolean;
  revisie: boolean;
  wv: boolean;
  wv_uren: number;
  wv_io: boolean;
  wv_io_uren: number;
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

export interface IntakeRegel {
  id: string;
  actief: boolean;
  volgorde: number;
  trigger_type: string;
  trigger_veld: string | null;
  trigger_waarde: string | null;
  spec_code: string;
  label: string;
  standaard_aantal: number;
  min_aantal: number;
  max_aantal: number;
  aanpasbaar: boolean;
  waarschuwing: string | null;
  hint: string | null;
  vereist_code: string | null;
  sluit_uit_code: string | null;
  sluit_uit_reden: string | null;
}

export interface BerekendeRegel {
  spec_code: string;
  label: string;
  aantal: number;
  aanpasbaar: boolean;
  min_aantal: number;
  max_aantal: number;
  waarschuwing: string | null;
  hint: string | null;
  tarief_terrevolt: number;
  tarief_inkoop: number;
}

export const defaultAntwoorden: IntakeAntwoorden = {
  rmu_vervangen: false,
  rmu_configuratie_id: null,
  rmu_velden: 0,
  trafo_situatie: "geen",
  ls_rek: "geen",
  ls_stroken: 0,
  ls_kabels: 0,
  ms_eindsluitingen: 0,
  ms_moffen: 0,
  vereffeningsleiding: false,
  vereffeningsleiding_aantal: 2,
  aardweerstand: false,
  ggi: false,
  ggi_aantal: 2,
  boren: false,
  revisie: false,
  wv: false,
  wv_uren: 16,
  wv_io: false,
  wv_io_uren: 16,
};

export function suggesteerEindsluitingen(rmuConfig: RmuConfiguratie | null): { eindsluitingen: number; moffen: number } {
  if (!rmuConfig) return { eindsluitingen: 0, moffen: 0 };
  const kabelvelden = rmuConfig.velden - 1;
  return { eindsluitingen: kabelvelden, moffen: kabelvelden };
}

function getSpec(code: string) {
  return SPEC_CODES.find(s => s.code === code);
}

export function berekenRegels(
  antwoorden: IntakeAntwoorden,
  caseType: string | null,
  dbRegels: IntakeRegel[]
): BerekendeRegel[] {
  const actief = new Map<string, BerekendeRegel>();
  const caseTypeLower = caseType?.toLowerCase() || "";

  const sortedRegels = [...dbRegels].sort((a, b) => a.volgorde - b.volgorde);

  for (const regel of sortedRegels) {
    if (!regel.actief) continue;

    let getriggerd = false;

    switch (regel.trigger_type) {
      case "altijd":
        getriggerd = true;
        break;

      case "case_type":
        getriggerd = caseTypeLower.includes(regel.trigger_waarde || "");
        break;

      case "antwoord": {
        const veld = regel.trigger_veld as keyof IntakeAntwoorden;
        const waarde = antwoorden[veld];
        if (regel.trigger_waarde === "ja") {
          getriggerd = waarde === true || (typeof waarde === "number" && waarde > 0);
        } else if (regel.trigger_waarde === "gt0") {
          getriggerd = Number(waarde) > 0;
        } else {
          getriggerd = String(waarde) === regel.trigger_waarde;
        }
        break;
      }

      case "rmu_velden_gt": {
        const drempel = Number(regel.trigger_waarde);
        const extra = antwoorden.rmu_velden - drempel;
        if (extra > 0 && antwoorden.rmu_vervangen) {
          const spec = getSpec(regel.spec_code);
          actief.set(regel.spec_code, {
            spec_code: regel.spec_code,
            label: regel.label,
            aantal: extra,
            aanpasbaar: regel.aanpasbaar,
            min_aantal: regel.min_aantal,
            max_aantal: regel.max_aantal,
            waarschuwing: regel.waarschuwing,
            hint: regel.hint,
            tarief_terrevolt: spec?.tarief_terrevolt || 0,
            tarief_inkoop: spec?.tarief_inkoop || 0,
          });
        }
        continue;
      }
    }

    if (!getriggerd) continue;

    // Check uitsluitingen
    if (regel.sluit_uit_code && actief.has(regel.sluit_uit_code)) {
      actief.delete(regel.sluit_uit_code);
    }

    // Add or merge
    if (actief.has(regel.spec_code)) {
      const bestaand = actief.get(regel.spec_code)!;
      if (regel.standaard_aantal > bestaand.aantal) {
        bestaand.aantal = regel.standaard_aantal;
      }
      if (regel.waarschuwing && !bestaand.waarschuwing) {
        bestaand.waarschuwing = regel.waarschuwing;
      }
    } else {
      const spec = getSpec(regel.spec_code);
      actief.set(regel.spec_code, {
        spec_code: regel.spec_code,
        label: regel.label || spec?.omschrijving || "",
        aantal: regel.standaard_aantal,
        aanpasbaar: regel.aanpasbaar,
        min_aantal: regel.min_aantal,
        max_aantal: regel.max_aantal,
        waarschuwing: regel.waarschuwing,
        hint: regel.hint,
        tarief_terrevolt: spec?.tarief_terrevolt || 0,
        tarief_inkoop: spec?.tarief_inkoop || 0,
      });
    }
  }

  // Override counts from user input
  if (actief.has("R440010")) {
    if (antwoorden.wv) actief.get("R440010")!.aantal = antwoorden.wv_uren;
    else actief.delete("R440010");
  }
  if (actief.has("R440020")) {
    if (antwoorden.wv_io) actief.get("R440020")!.aantal = antwoorden.wv_io_uren;
    else actief.delete("R440020");
  }
  if (actief.has("R410010") && antwoorden.ms_eindsluitingen > 0) {
    actief.get("R410010")!.aantal = antwoorden.ms_eindsluitingen;
  }
  if (actief.has("R410020") && antwoorden.ms_moffen > 0) {
    actief.get("R410020")!.aantal = antwoorden.ms_moffen;
  }
  if (actief.has("R350020") && antwoorden.vereffeningsleiding) {
    actief.get("R350020")!.aantal = antwoorden.vereffeningsleiding_aantal;
  }
  if (actief.has("R310030") && antwoorden.ggi) {
    actief.get("R310030")!.aantal = antwoorden.ggi_aantal;
  }
  // LS stroken/kabels
  if (actief.has("R340040")) actief.get("R340040")!.aantal = antwoorden.ls_stroken;
  if (actief.has("R340050")) actief.get("R340050")!.aantal = antwoorden.ls_kabels;

  return Array.from(actief.values())
    .filter(r => r.aantal > 0)
    .sort((a, b) => a.spec_code.localeCompare(b.spec_code));
}

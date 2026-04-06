import { SPEC_CODES } from "./specCodes";

export interface IntakeAntwoorden {
  // Stap 1 — RMU
  rmu_vervangen: boolean;
  rmu_merk: string | null;
  rmu_configuratie_id: string | null;
  rmu_velden: number;
  // Stap 2 — MS extra
  ims_ombouw: boolean;
  ims_aantal: number;
  trafokabel: boolean;
  // Stap 3 — Trafo
  trafo_situatie: "nieuw" | "draaien" | "vrijschakelen" | "geen";
  // Stap 4 — LS rek
  ls_rek: "klein" | "groot" | "uitbreiden" | "geen";
  ls_rek_aantal: number;
  ls_stroken: number;
  ls_kabels: number;
  zekeringen: number;
  // Stap 5 — Bouwkundig
  boren: number;
  dichtzetten: number;
  ggi: number;
  traanplaat: number;
  // Stap 6 — MS kabels
  ms_moffen: number;
  ms_eindsluitingen: number;
  // Stap 7 — LS kabels
  ls_moffen: number;
  ls_eindsluitingen: number;
  // Stap 8 — Aansluitingen & OV
  huisaansluitingen: number;
  ls_kast_verwijderen: number;
  ls_kast_aansluiten: number;
  ov_kast: number;
  ov_meter: number;
  // Stap 9 — Vrijschakelen
  kabeldeel_vrijschakelen: number;
  // Stap 10 — Aarding & revisie
  aardweerstand: boolean;
  vereffeningsleiding: number;
  revisie: "geen" | "volledig" | "excl_civiel";
  // Stap 11 — WV & personeel
  wv: boolean;
  wv_uren: number;
  wv_io: boolean;
  wv_io_uren: number;
  vp_uren: number;
  avp_uren: number;
  vop_uren: number;
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
  tarief: number;
  eigen_kosten: number;
  eenheid: string;
  groep: string;
  trigger_type?: string;
  trigger_veld?: string | null;
  trigger_waarde?: string | null;
}

export const LEGE_ANTWOORDEN: IntakeAntwoorden = {
  rmu_vervangen: false,
  rmu_merk: null,
  rmu_configuratie_id: null,
  rmu_velden: 3,
  ims_ombouw: false,
  ims_aantal: 1,
  trafokabel: false,
  trafo_situatie: "geen",
  ls_rek: "geen",
  ls_rek_aantal: 1,
  ls_stroken: 0,
  ls_kabels: 0,
  zekeringen: 0,
  boren: 0,
  dichtzetten: 0,
  ggi: 0,
  traanplaat: 0,
  ms_moffen: 0,
  ms_eindsluitingen: 0,
  ls_moffen: 0,
  ls_eindsluitingen: 0,
  huisaansluitingen: 0,
  ls_kast_verwijderen: 0,
  ls_kast_aansluiten: 0,
  ov_kast: 0,
  ov_meter: 0,
  kabeldeel_vrijschakelen: 0,
  aardweerstand: false,
  vereffeningsleiding: 0,
  revisie: "geen",
  wv: false,
  wv_uren: 0,
  wv_io: false,
  wv_io_uren: 0,
  vp_uren: 0,
  avp_uren: 0,
  vop_uren: 0,
};

export function initAntwoorden(
  caseType: string | null
): IntakeAntwoorden {
  const a = { ...LEGE_ANTWOORDEN };
  const ct = caseType?.toLowerCase() || "";

  if (ct.includes("nsa")) {
    a.rmu_vervangen = true;
    a.trafo_situatie = "nieuw";
    a.trafokabel = true;
    a.aardweerstand = true;
    a.vereffeningsleiding = 2;
    a.revisie = "excl_civiel";
    a.wv = true;
    a.wv_uren = 16;
    a.wv_io = true;
    a.wv_io_uren = 16;
  }

  if (ct.includes("compact")) {
    a.rmu_vervangen = true;
    a.trafokabel = true;
    a.aardweerstand = true;
    a.vereffeningsleiding = 2;
    a.revisie = "excl_civiel";
    a.wv = true;
    a.wv_uren = 16;
    a.wv_io = true;
    a.wv_io_uren = 16;
  }

  if (ct.includes("provisorium")) {
    a.rmu_vervangen = true;
    a.rmu_merk = "Magnefix";
    a.rmu_velden = 3;
    a.wv = true;
    a.wv_uren = 32;
    a.wv_io = true;
    a.wv_io_uren = 32;
  }

  return a;
}

export function suggesteerEindsluitingen(rmuConfig: RmuConfiguratie | null): { moffen: number; eindsluitingen: number } {
  if (!rmuConfig) return { moffen: 0, eindsluitingen: 0 };
  const kabelvelden = rmuConfig.velden - 1;
  return { moffen: kabelvelden, eindsluitingen: kabelvelden };
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
    let overschrijfAantal: number | null = null;

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
          if (getriggerd) {
            overschrijfAantal = Number(waarde);
          }
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
            tarief: spec?.tarief || 0,
            eigen_kosten: 0,
            eenheid: spec?.eenheid || "st",
            groep: spec?.groep || "",
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

    if (actief.has(regel.spec_code)) {
      const bestaand = actief.get(regel.spec_code)!;
      const nieuwAantal = overschrijfAantal ?? regel.standaard_aantal;
      if (nieuwAantal > bestaand.aantal) {
        bestaand.aantal = nieuwAantal;
      }
      if (regel.waarschuwing && !bestaand.waarschuwing) {
        bestaand.waarschuwing = regel.waarschuwing;
      }
    } else {
      const spec = getSpec(regel.spec_code);
      actief.set(regel.spec_code, {
        spec_code: regel.spec_code,
        label: regel.label || spec?.omschrijving || "",
        aantal: overschrijfAantal ?? regel.standaard_aantal,
        aanpasbaar: regel.aanpasbaar,
        min_aantal: regel.min_aantal,
        max_aantal: regel.max_aantal,
        waarschuwing: regel.waarschuwing,
        hint: regel.hint,
        tarief: spec?.tarief || 0,
        eigen_kosten: 0,
        eenheid: spec?.eenheid || "st",
        groep: spec?.groep || "",
      });
    }
  }

  // Override WV uren
  if (actief.has("R440010")) {
    if (antwoorden.wv) actief.get("R440010")!.aantal = antwoorden.wv_uren;
    else actief.delete("R440010");
  }
  if (actief.has("R440020")) {
    if (antwoorden.wv_io) actief.get("R440020")!.aantal = antwoorden.wv_io_uren;
    else actief.delete("R440020");
  }

  // Override MS moffen/eindsluitingen
  if (actief.has("R410010") && antwoorden.ms_moffen > 0) {
    actief.get("R410010")!.aantal = antwoorden.ms_moffen;
  }
  if (actief.has("R410020") && antwoorden.ms_eindsluitingen > 0) {
    actief.get("R410020")!.aantal = antwoorden.ms_eindsluitingen;
  }

  // Override LS stroken/kabels/zekeringen
  if (actief.has("R340040")) actief.get("R340040")!.aantal = antwoorden.ls_stroken;
  if (actief.has("R340050")) actief.get("R340050")!.aantal = antwoorden.ls_kabels;

  // Override vereffeningsleiding
  if (actief.has("R350020") && antwoorden.vereffeningsleiding > 0) {
    actief.get("R350020")!.aantal = antwoorden.vereffeningsleiding;
  }

  // Override GGI
  if (actief.has("R310030") && antwoorden.ggi > 0) {
    actief.get("R310030")!.aantal = antwoorden.ggi;
  }

  // Override VP/AVP/VOP
  if (actief.has("R610040")) actief.get("R610040")!.aantal = antwoorden.vp_uren;
  if (actief.has("R610050")) actief.get("R610050")!.aantal = antwoorden.avp_uren;
  if (actief.has("R610060")) actief.get("R610060")!.aantal = antwoorden.vop_uren;

  return Array.from(actief.values())
    .filter(r => r.aantal > 0)
    .sort((a, b) => a.spec_code.localeCompare(b.spec_code));
}

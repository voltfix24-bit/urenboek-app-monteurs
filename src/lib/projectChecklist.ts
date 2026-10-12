/** Checklist "Klaar voor uitvoering" voor een project (desktop /projecten). */
export interface ChecklistProject {
  straat: string | null;
  postcode: string | null;
  stad: string | null;
  projectjaar: number | null;
  opdrachtgever_id: string | null;
  intake_gedaan: boolean;
}

export type ChecklistKey = "adres" | "projectjaar" | "opdrachtgever" | "intake";

export interface ChecklistPunt { key: ChecklistKey; label: string; klaar: boolean }

export function projectChecklist(p: ChecklistProject): ChecklistPunt[] {
  return [
    { key: "adres", label: "Adres compleet", klaar: !!(p.straat?.trim() && p.postcode?.trim() && p.stad?.trim()) },
    { key: "projectjaar", label: "Projectjaar ingevuld", klaar: p.projectjaar != null },
    { key: "opdrachtgever", label: "Opdrachtgever gekoppeld", klaar: !!p.opdrachtgever_id },
    { key: "intake", label: "Forecast-intake gedaan", klaar: !!p.intake_gedaan },
  ];
}

export const openPunten = (p: ChecklistProject) => projectChecklist(p).filter((x) => !x.klaar).length;

/** Lopend = niet gesloten en niet gearchiveerd. */
export const isLopend = (p: { status?: string | null; active: boolean }) => p.active && (p.status || "nieuw") !== "gesloten";

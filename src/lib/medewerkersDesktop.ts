// Helpers voor de desktop Medewerkers-pagina (Stap 3).
// Mobiel gebruikt deze helpers niet; mobiele flows blijven ongewijzigd.
import { differenceInCalendarDays, parseISO, addYears, format } from "date-fns";
import { nl } from "date-fns/locale";

export const DESKTOP_CERT_TYPES = ["VCA", "BEI_BLS", "BEI_BHS", "BHV", "VWLW", "ASBEST"] as const;
export type DesktopCertType = typeof DESKTOP_CERT_TYPES[number];

export const DESKTOP_CERT_LABELS: Record<DesktopCertType, string> = {
  VCA: "VCA VOL",
  BEI_BLS: "Stipel BEI BLS",
  BEI_BHS: "Stipel BEI BHS",
  BHV: "BHV",
  VWLW: "Veilig Werken Langs de Weg",
  ASBEST: "Asbest",
};

export const ASBEST_MODULES = ["module_1", "module_2", "module_4"] as const;
export const ASBEST_MODULE_LABELS: Record<string, string> = {
  module_1: "Module 1",
  module_2: "Module 2",
  module_4: "Module 4",
};

export const VERPLICHTE_CERT_TYPES: DesktopCertType[] = ["VCA"];

export function vervalStatus(datum: string | null | undefined, drempelDagen = 60): { status: "ontbreekt" | "verlopen" | "binnenkort" | "geldig"; dagen: number | null } {
  if (!datum) return { status: "ontbreekt", dagen: null };
  const dagen = differenceInCalendarDays(parseISO(datum), new Date());
  if (dagen < 0) return { status: "verlopen", dagen };
  if (dagen <= drempelDagen) return { status: "binnenkort", dagen };
  return { status: "geldig", dagen };
}

export function fmtDatum(d: string | null | undefined): string {
  if (!d) return "—";
  try { return format(parseISO(d), "d MMM yyyy", { locale: nl }); } catch { return "—"; }
}

// ── DBA ────────────────────────────────────────────────────────────────
export interface DbaVraag { key: string; tekst: string; }
export const DBA_VRAGEN: DbaVraag[] = [
  { key: "andere_opdrachtgevers", tekst: "Werkt hij/zij ook voor andere opdrachtgevers?" },
  { key: "zelf_werkwijze", tekst: "Bepaalt hij/zij zelf hoe het werk wordt uitgevoerd?" },
  { key: "mag_weigeren", tekst: "Mag hij/zij een opdracht weigeren zonder gevolgen?" },
  { key: "eigen_middelen", tekst: "Gebruikt hij/zij eigen gereedschap/materiaal waar mogelijk?" },
  { key: "ondernemersrisico", tekst: "Loopt hij/zij ondernemersrisico (bijv. geen betaling bij afkeuring)?" },
  { key: "ander_werk", tekst: "Kan hij/zij ook ander werk/andere klussen aannemen?" },
  { key: "vervangbaar", tekst: "Mag hij/zij zich laten vervangen door iemand anders?" },
];

export const DBA_SIGNALEN_TEKST =
  "Signalen, geen oordeel. De Belastingdienst kijkt naar alle omstandigheden samen. Twijfel je, vraag dan je adviseur of gebruik de keuzehulp van de Belastingdienst.";

export function volgendeDbaCheck(laatsteOp: string | null): string | null {
  if (!laatsteOp) return null;
  return format(addYears(parseISO(laatsteOp), 1), "d MMM yyyy", { locale: nl });
}

// Stipel certificaat type dat hoort bij een BEI-norm
export function stipelTypeVoorNorm(norm: string): DesktopCertType | null {
  if (norm === "BEI BLS") return "BEI_BLS";
  if (norm === "BEI BHS") return "BEI_BHS";
  return null;
}

export interface PlanningSignaal {
  wekenAchtereen: number;
  vasteStarttijd: string | null;
  werktAlleenVoorOns: boolean | null;
}

// Telt aaneengesloten volle weken (>=5 geplande dagen) tot vandaag.
export function berekenVolleWekenAchtereen(planningDatums: string[]): number {
  if (planningDatums.length === 0) return 0;
  const perWeek = new Map<string, Set<string>>();
  for (const d of planningDatums) {
    const dt = parseISO(d);
    const jaar = dt.getUTCFullYear();
    const weekKey = `${jaar}-${isoWeek(dt)}`;
    if (!perWeek.has(weekKey)) perWeek.set(weekKey, new Set());
    perWeek.get(weekKey)!.add(d);
  }
  // sorteer weken aflopend vanaf huidige week
  const nu = new Date();
  let weken = 0;
  let cursor = new Date(nu);
  for (let i = 0; i < 104; i++) {
    const key = `${cursor.getUTCFullYear()}-${isoWeek(cursor)}`;
    const dagen = perWeek.get(key)?.size || 0;
    if (i === 0) {
      // huidige week telt mee zolang die al >=5 dagen heeft gehad tot nu, anders start bij vorige week
    }
    if (dagen >= 5) { weken++; } else if (i > 0) { break; }
    cursor = new Date(cursor.getTime() - 7 * 86400000);
  }
  return weken;
}

function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function vasteStarttijd(starttijden: string[]): string | null {
  const unieke = Array.from(new Set(starttijden.filter(Boolean)));
  if (unieke.length === 1) return unieke[0];
  return null;
}

// ── Bewaar t/m jaar+7 ──
export function bewaarTotTekst(uitDienstOp: string | null): string {
  if (!uitDienstOp) return "—";
  const jaar = parseISO(uitDienstOp).getFullYear() + 7;
  return `Bewaard t/m 31 dec ${jaar}`;
}

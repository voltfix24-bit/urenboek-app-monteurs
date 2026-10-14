// Afgeleide data/berekeningen voor de desktop Medewerkers-pagina.
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { DesktopProfiel } from "@/hooks/useMedewerkersDesktop";
import { stipelTypeVoorNorm, vervalStatus } from "@/lib/medewerkersDesktop";

export interface Issue {
  key: string;
  tab: "overzicht" | "dossier" | "dba" | "bevoegdheden";
  tekst: string;
  waar: string;
  actie: string;
}

export function certsVan(empId: string, certificaten: any[]) {
  return certificaten.filter((c) => c.medewerker_id === empId);
}
export function aanwijzingenVan(empId: string, aanwijzingen: any[]) {
  return aanwijzingen.filter((a) => a.medewerker_id === empId);
}
export function contractVan(empId: string, contracten: any[]) {
  const rijen = contracten.filter((c) => c.profiel_id === empId);
  return rijen.sort((a, b) => (b.startdatum || "").localeCompare(a.startdatum || ""))[0] || null;
}
export function laatsteDbaCheck(empId: string, dbaChecks: any[]) {
  return dbaChecks.find((d) => d.medewerker_id === empId) || null;
}

export function heeftGeldigeVca(empId: string, certificaten: any[]): boolean {
  const vca = certsVan(empId, certificaten).filter((c) => c.type === "VCA");
  return vca.some((c) => vervalStatus(c.vervaldatum).status !== "verlopen" && vervalStatus(c.vervaldatum).status !== "ontbreekt");
}

export function heeftGeldigeAanwijzing(empId: string, aanwijzingen: any[]): boolean {
  const rijen = aanwijzingenVan(empId, aanwijzingen);
  return rijen.some((a) => differenceInCalendarDays(parseISO(a.geldig_tot), new Date()) >= 0);
}

export function stipelOntbreektVoorAanwijzing(a: any, certificaten: any[]): boolean {
  const stipelType = stipelTypeVoorNorm(a.norm);
  if (!stipelType) return false;
  const certs = certificaten.filter((c) => c.medewerker_id === a.medewerker_id && c.type === stipelType);
  if (certs.length === 0) return true;
  return !certs.some((c) => vervalStatus(c.vervaldatum).status === "geldig" || vervalStatus(c.vervaldatum).status === "binnenkort");
}

export function computeIssues(
  emp: DesktopProfiel,
  certificaten: any[],
  aanwijzingen: any[],
  contracten: any[],
): Issue[] {
  const issues: Issue[] = [];
  if (emp.account_status === "uit_dienst") return issues;
  const isZzp = !emp.is_onderaannemer;

  // Dossier
  if (isZzp) {
    if (!emp.kvk_nummer) issues.push({ key: "kvk", tab: "dossier", tekst: "KvK-nummer ontbreekt", waar: "Dossier", actie: "Aanvullen" });
    if (!emp.btw_nummer) issues.push({ key: "btw", tab: "dossier", tekst: "BTW-nummer ontbreekt", waar: "Dossier", actie: "Aanvullen" });
    if (!emp.iban) issues.push({ key: "iban", tab: "dossier", tekst: "IBAN ontbreekt", waar: "Dossier", actie: "Aanvullen" });
    const contract = contractVan(emp.id, contracten);
    if (!contract || contract.status !== "ondertekend_beiden") {
      issues.push({ key: "contract", tab: "dossier", tekst: "Overeenkomst van opdracht niet (volledig) ondertekend", waar: "Dossier", actie: "Bekijken" });
    } else if (contract.einddatum) {
      const dagen = differenceInCalendarDays(parseISO(contract.einddatum), new Date());
      if (dagen <= 60) issues.push({ key: "contract_verloopt", tab: "dossier", tekst: `Overeenkomst loopt af over ${dagen} dagen`, waar: "Dossier", actie: "Bekijken" });
    }
    if (emp.avb_polis_tot) {
      const dagen = differenceInCalendarDays(parseISO(emp.avb_polis_tot), new Date());
      if (dagen < 0) issues.push({ key: "avb", tab: "dossier", tekst: "AVB-polis verlopen", waar: "Dossier", actie: "Aanvullen" });
    }
  } else {
    if (!emp.g_rekening) issues.push({ key: "grek", tab: "dossier", tekst: "G-rekening ontbreekt", waar: "Dossier", actie: "Aanvullen" });
    if (emp.verklaring_betalingsgedrag_op) {
      const dagen = differenceInCalendarDays(new Date(), parseISO(emp.verklaring_betalingsgedrag_op));
      if (dagen > 90) issues.push({ key: "verklaring", tab: "dossier", tekst: "Verklaring betalingsgedrag ouder dan 90 dagen", waar: "Dossier", actie: "Vernieuwen" });
    } else {
      issues.push({ key: "verklaring_mist", tab: "dossier", tekst: "Verklaring betalingsgedrag ontbreekt", waar: "Dossier", actie: "Aanvullen" });
    }
    if (!emp.kvk_uittreksel_op) issues.push({ key: "kvku", tab: "dossier", tekst: "KvK-uittreksel ontbreekt", waar: "Dossier", actie: "Aanvullen" });
  }

  // Certificaten (vallen onder tab bevoegdheden)
  if (!heeftGeldigeVca(emp.id, certificaten)) {
    issues.push({ key: "vca", tab: "bevoegdheden", tekst: "VCA VOL ontbreekt of is verlopen", waar: "Bevoegdheden", actie: "Toevoegen" });
  }

  // Aanwijzingen
  const rijen = aanwijzingenVan(emp.id, aanwijzingen);
  for (const a of rijen) {
    if (stipelOntbreektVoorAanwijzing(a, certificaten)) {
      issues.push({ key: `stipel-${a.id}`, tab: "bevoegdheden", tekst: `${a.norm}: Stipel-certificaat ontbreekt of is verlopen`, waar: "Bevoegdheden", actie: "Bekijken" });
    }
    const dagen = differenceInCalendarDays(parseISO(a.geldig_tot), new Date());
    if (dagen < 0) issues.push({ key: `verval-${a.id}`, tab: "bevoegdheden", tekst: `Aanwijzing ${a.norm} is verlopen`, waar: "Bevoegdheden", actie: "Verlengen" });
    else if (dagen <= 60) issues.push({ key: `vervalbin-${a.id}`, tab: "bevoegdheden", tekst: `Aanwijzing ${a.norm} verloopt over ${dagen} dagen`, waar: "Bevoegdheden", actie: "Verlengen" });
  }

  // DBA
  if (isZzp) {
    const laatste = laatsteDbaCheck(emp.id, []);
  }

  return issues;
}

export function dbaCheckVerlopen(dbaRow: any | null): boolean {
  if (!dbaRow) return true;
  return differenceInCalendarDays(new Date(), parseISO(dbaRow.vastgelegd_op)) > 365;
}

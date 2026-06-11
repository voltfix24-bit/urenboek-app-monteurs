import type { RolPermissies } from "./permissions";

export interface SearchPage {
  label: string;
  path: string;
  check: (p: RolPermissies) => boolean;
  keywords?: string[];
}

/**
 * Statische app-pagina's die in de globale zoekfunctie verschijnen.
 * Volgorde en labels komen overeen met de zichtbare menustructuur.
 * Iedere pagina heeft een `check` die op de permissiematrix valideert.
 */
export const SEARCH_PAGES: SearchPage[] = [
  { label: "Dashboard", path: "/dashboard", check: (p) => p.zietDashboard, keywords: ["overzicht", "start"] },
  { label: "Berichten", path: "/mededelingen", check: (p) => p.zietMededelingen, keywords: ["chat", "mededeling"] },

  { label: "Weekplanning", path: "/planning", check: (p) => p.zietPlanning, keywords: ["agenda", "rooster"] },
  { label: "Manager Planning", path: "/manager-planning", check: (p) => p.zietManagerPlanning },
  { label: "Projecten", path: "/projecten", check: (p) => p.zietProjecten, keywords: ["werk", "klus"] },
  { label: "Opdrachtgevers", path: "/opdrachtgevers", check: (p) => p.magTeamBeheren, keywords: ["klant"] },

  { label: "Goedkeuring", path: "/goedkeuring", check: (p) => p.zietGoedkeuring, keywords: ["uren", "keuren"] },
  { label: "Overuren", path: "/overuren", check: (p) => p.zietOveruren },
  { label: "Rapportage", path: "/rapportage", check: (p) => p.zietRapportage, keywords: ["rapport", "export"] },

  { label: "Inkooporders", path: "/inkooporders", check: (p) => p.zietAlleInkooporders, keywords: ["facturatie", "order"] },
  { label: "Mijn orders", path: "/mijn-orders", check: (p) => p.zietInkooporders && !p.zietAlleInkooporders, keywords: ["eigen order"] },
  { label: "Tarieven", path: "/beheer/tarieven", check: (p) => p.zietBeheer, keywords: ["spec code", "prijs"] },

  { label: "Medewerkers", path: "/medewerkers", check: (p) => p.zietTeam, keywords: ["monteur", "personeel"] },
  { label: "Onderaannemers", path: "/onderaannemers", check: (p) => p.zietTeam, keywords: ["zzp", "subcontractor"] },
  { label: "Kandidaten", path: "/kandidaten", check: (p) => p.zietKandidaten, keywords: ["sollicitant"] },

  { label: "Intake-instellingen", path: "/beheer/intake-regels", check: (p) => p.zietBeheer, keywords: ["regelmotor", "intake"] },
  { label: "Bedrijfsgegevens", path: "/beheer/bedrijf", check: (p) => p.zietBeheer, keywords: ["kvk", "btw", "iban"] },

  { label: "Profiel", path: "/profiel", check: (p) => p.zietProfiel, keywords: ["account", "instellingen"] },
];

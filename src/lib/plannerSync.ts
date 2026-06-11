/**
 * Helpers voor verzending van masterdata (projecten + monteurs) naar
 * de TerreVolt Planner. Bevat alleen pure functies — geen IO.
 *
 * Belangrijk:
 * - Geen tarieven, contracten, financiën, bankgegevens of inkooporderdata.
 * - Onderaannemer-bedrijfsaccounts (is_onderaannemer=true) worden uitgesloten.
 * - Monteurs gekoppeld via onderaannemer_id worden wél meegestuurd.
 * - vaste_vrije_dagen volgt JS-conventie: 0=Zondag, 1=Maandag, ... 6=Zaterdag.
 */

export type AppRole = "monteur" | "schakelmonteur" | "manager" | "uitvoerder" | "wv";

export type PlannerMonteurType = "montagemonteur" | "schakelmonteur";

export interface PlannerProjectPayload {
  urenapp_project_id: string;
  nummer: string;
  naam: string;
  stationsnaam: string | null;
  straat: string | null;
  postcode: string | null;
  stad: string | null;
  jaar: number;
  actief: boolean;
}

export interface PlannerMonteurPayload {
  urenapp_profile_id: string;
  naam: string;
  type: PlannerMonteurType;
  actief: boolean;
  werkdagen: number[]; // 1=Ma .. 5=Vr
}

export interface PlannerResponse {
  planner_id: string;
  urenapp_id: string;
  action: "created" | "updated";
}

// ─── PROJECT ──────────────────────────────────────────────────────────────

export interface ProjectSyncInput {
  id: string;
  nummer: string;
  naam: string;
  stationsnaam: string | null;
  straat: string | null;
  postcode: string | null;
  stad: string | null;
  active: boolean;
  projectjaar: number | null;
}

export function projectjaarOntbreekt(p: { projectjaar: number | null | undefined }): boolean {
  return p.projectjaar == null;
}

export function magProjectSynchroniseren(p: ProjectSyncInput): boolean {
  return p.projectjaar != null && p.projectjaar >= 2000 && p.projectjaar <= 2100;
}

export function buildProjectPayload(p: ProjectSyncInput): PlannerProjectPayload {
  if (!magProjectSynchroniseren(p)) {
    throw new Error(`Project ${p.nummer} heeft geen geldig projectjaar`);
  }
  return {
    urenapp_project_id: p.id,
    nummer: p.nummer,
    naam: p.naam,
    stationsnaam: p.stationsnaam,
    straat: p.straat,
    postcode: p.postcode,
    stad: p.stad,
    jaar: p.projectjaar as number,
    actief: p.active,
  };
}

// ─── MONTEUR ──────────────────────────────────────────────────────────────

export interface MonteurSyncInput {
  id: string;
  full_name: string;
  account_status: string;
  is_onderaannemer: boolean;
  vaste_vrije_dagen: number[]; // JS getDay() conventie
  roles: string[];
}

/**
 * Bepaalt of een profiel als monteur naar Planner gestuurd mag worden.
 * - Onderaannemer-bedrijfsaccounts: nooit.
 * - Rol moet monteur of schakelmonteur bevatten.
 * - Profielen die óók manager zijn worden uitgesloten van automatische sync.
 */
export function isPlanbareMonteur(m: MonteurSyncInput): boolean {
  if (m.is_onderaannemer) return false;
  if (m.roles.includes("manager")) return false;
  return m.roles.includes("monteur") || m.roles.includes("schakelmonteur");
}

export function mapMonteurType(roles: string[]): PlannerMonteurType | null {
  // schakelmonteur > monteur (hoogste vakrol wint)
  if (roles.includes("schakelmonteur")) return "schakelmonteur";
  if (roles.includes("monteur")) return "montagemonteur";
  return null;
}

/**
 * Werkdagen: standaard Ma t/m Vr = [1,2,3,4,5], minus vaste_vrije_dagen.
 * Input gebruikt JS getDay()-nummering (1=Maandag .. 5=Vrijdag).
 * Output is oplopend gesorteerd.
 */
export function berekenWerkdagen(vaste_vrije_dagen: number[]): number[] {
  const basis = [1, 2, 3, 4, 5];
  const vrij = new Set(vaste_vrije_dagen ?? []);
  return basis.filter(d => !vrij.has(d));
}

export function buildMonteurPayload(m: MonteurSyncInput): PlannerMonteurPayload {
  const type = mapMonteurType(m.roles);
  if (!type) throw new Error(`Profiel ${m.full_name} heeft geen monteur-rol`);
  if (!isPlanbareMonteur(m)) throw new Error(`Profiel ${m.full_name} is niet planbaar`);
  return {
    urenapp_profile_id: m.id,
    naam: m.full_name,
    type,
    actief: m.account_status === "active",
    werkdagen: berekenWerkdagen(m.vaste_vrije_dagen),
  };
}

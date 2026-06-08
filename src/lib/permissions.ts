export interface RolPermissies {
  zietDashboard: boolean;
  zietUren: boolean;
  zietAlleUren: boolean;
  zietGoedkeuring: boolean;
  zietOveruren: boolean;
  zietPlanning: boolean;
  zietManagerPlanning: boolean;
  zietProjecten: boolean;
  zietProjectFinancien: boolean;
  zietRapportage: boolean;
  zietTeam: boolean;
  zietMededelingen: boolean;
  zietProfiel: boolean;
  zietInkooporders: boolean;
  zietAlleInkooporders: boolean;
  zietBeheer: boolean;
  zietKandidaten: boolean;
  magContractenBeheren: boolean;
  zietEigenContract: boolean;
  magPlanningWijzigen: boolean;
  magUrenGoedkeuren: boolean;
  magProjectenWijzigen: boolean;
  magTeamBeheren: boolean;
  magMededelingenVersturen: boolean;
}

export type Rol = "manager" | "uitvoerder" | "wv" | "monteur" | "schakelmonteur";

export const PERMISSIES: Record<Rol, RolPermissies> = {
  manager: {
    zietDashboard: true, zietUren: true, zietAlleUren: true, zietGoedkeuring: true,
    zietOveruren: true, zietPlanning: true, zietManagerPlanning: true, zietProjecten: true,
    zietProjectFinancien: true, zietRapportage: true, zietTeam: true, zietMededelingen: true,
    zietProfiel: true, zietInkooporders: true, zietAlleInkooporders: true, zietBeheer: true,
    zietKandidaten: true, magContractenBeheren: true, zietEigenContract: true,
    magPlanningWijzigen: true, magUrenGoedkeuren: true, magProjectenWijzigen: true,
    magTeamBeheren: true, magMededelingenVersturen: true,
  },
  uitvoerder: {
    zietDashboard: true, zietUren: true, zietAlleUren: false, zietGoedkeuring: false,
    zietOveruren: false, zietPlanning: true, zietManagerPlanning: true, zietProjecten: true,
    zietProjectFinancien: false, zietRapportage: false, zietTeam: false, zietMededelingen: true,
    zietProfiel: true, zietInkooporders: true, zietAlleInkooporders: false, zietBeheer: false,
    zietKandidaten: false, magContractenBeheren: false, zietEigenContract: true,
    magPlanningWijzigen: true, magUrenGoedkeuren: false, magProjectenWijzigen: false,
    magTeamBeheren: false, magMededelingenVersturen: false,
  },
  wv: {
    zietDashboard: true, zietUren: true, zietAlleUren: false, zietGoedkeuring: false,
    zietOveruren: false, zietPlanning: true, zietManagerPlanning: true, zietProjecten: true,
    zietProjectFinancien: false, zietRapportage: false, zietTeam: false, zietMededelingen: true,
    zietProfiel: true, zietInkooporders: true, zietAlleInkooporders: false, zietBeheer: false,
    zietKandidaten: false, magContractenBeheren: false, zietEigenContract: true,
    magPlanningWijzigen: true, magUrenGoedkeuren: false, magProjectenWijzigen: false,
    magTeamBeheren: false, magMededelingenVersturen: false,
  },
  monteur: {
    zietDashboard: false, zietUren: true, zietAlleUren: false, zietGoedkeuring: false,
    zietOveruren: false, zietPlanning: true, zietManagerPlanning: false, zietProjecten: false,
    zietProjectFinancien: false, zietRapportage: false, zietTeam: false, zietMededelingen: true,
    zietProfiel: true, zietInkooporders: true, zietAlleInkooporders: false, zietBeheer: false,
    zietKandidaten: false, magContractenBeheren: false, zietEigenContract: true,
    magPlanningWijzigen: false, magUrenGoedkeuren: false, magProjectenWijzigen: false,
    magTeamBeheren: false, magMededelingenVersturen: false,
  },
  schakelmonteur: {
    zietDashboard: false, zietUren: true, zietAlleUren: false, zietGoedkeuring: false,
    zietOveruren: false, zietPlanning: true, zietManagerPlanning: false, zietProjecten: false,
    zietProjectFinancien: false, zietRapportage: false, zietTeam: false, zietMededelingen: true,
    zietProfiel: true, zietInkooporders: true, zietAlleInkooporders: false, zietBeheer: false,
    zietKandidaten: false, magContractenBeheren: false, zietEigenContract: true,
    magPlanningWijzigen: false, magUrenGoedkeuren: false, magProjectenWijzigen: false,
    magTeamBeheren: false, magMededelingenVersturen: false,
  },
};

export function getPermissies(roles: string[]): RolPermissies {
  if (roles.includes("manager")) return PERMISSIES.manager;
  if (roles.includes("uitvoerder")) return PERMISSIES.uitvoerder;
  if (roles.includes("wv")) return PERMISSIES.wv;
  if (roles.includes("schakelmonteur")) return PERMISSIES.schakelmonteur;
  return PERMISSIES.monteur;
}

export function getRolLabel(roles: string[]): string {
  if (roles.includes("manager")) return "Manager";
  if (roles.includes("uitvoerder")) return "Uitvoerder";
  if (roles.includes("wv")) return "Werkvoorbereider";
  if (roles.includes("schakelmonteur")) return "Schakelmonteur";
  return "Monteur";
}

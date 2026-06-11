import type { RolPermissies } from "./permissions";

export type AccessCheck = (p: RolPermissies) => boolean;

/**
 * Centrale toegangsregels per route. Houdt App.tsx vrij van inline lambda's
 * en geeft één plek waar route-permissies te controleren / te testen zijn.
 */
export const ROUTE_ACCESS: Record<string, AccessCheck> = {
  "/planning": (p) => p.zietPlanning,
  "/mededelingen": (p) => p.zietMededelingen,
  "/mijn-orders": (p) => p.zietInkooporders,

  "/dashboard": (p) => p.zietDashboard,
  "/goedkeuring": (p) => p.zietGoedkeuring,
  "/overuren": (p) => p.zietOveruren,
  "/rapportage": (p) => p.zietRapportage,
  "/manager-planning": (p) => p.zietManagerPlanning,

  "/projecten": (p) => p.zietProjecten,
  "/projecten/:projectId/planning": (p) => p.zietProjecten,

  "/opdrachtgevers": (p) => p.magTeamBeheren,
  "/medewerkers": (p) => p.zietTeam,
  "/onderaannemers": (p) => p.zietTeam,
  "/inkooporders": (p) => p.zietAlleInkooporders,

  "/beheer/intake-regels": (p) => p.zietBeheer,
  "/beheer/tarieven": (p) => p.zietBeheer,
  "/beheer/bedrijf": (p) => p.zietBeheer,
  "/beheer/planner-koppeling": (p) => p.zietBeheer,

  "/kandidaten": (p) => p.zietKandidaten,
  "/kandidaten/:kandidaatId/contract": (p) => p.magContractenBeheren,
};

// Centrale definitie van Planner-sync-uitsluitingsredenen.
// Géén hardcoded projectnummers — uitsluiting komt uit de database
// (projects.planner_sync_enabled / planner_sync_exclusion_reason).

export type PlannerExclusionReason = "urenregistratie" | "historisch_afgerond" | "anders";

export const PLANNER_EXCLUSION_REASONS: PlannerExclusionReason[] = [
  "urenregistratie",
  "historisch_afgerond",
  "anders",
];

export const PLANNER_EXCLUSION_LABEL: Record<PlannerExclusionReason, string> = {
  urenregistratie: "Interne urenregistratie (geen planning nodig)",
  historisch_afgerond: "Historisch afgerond — alleen voor archief",
  anders: "Anders",
};

export function isValidExclusionReason(v: unknown): v is PlannerExclusionReason {
  return typeof v === "string" && (PLANNER_EXCLUSION_REASONS as string[]).includes(v);
}

export function exclusionLabel(r: string | null | undefined): string {
  if (!r) return "Onbekend";
  return isValidExclusionReason(r) ? PLANNER_EXCLUSION_LABEL[r] : r;
}

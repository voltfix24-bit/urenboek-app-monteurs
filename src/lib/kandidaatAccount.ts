import type { Kandidaat } from "@/types/app";

export function kanKandidaatUitnodigen(kandidaat: Pick<Kandidaat, "status" | "profiel_id">): boolean {
  return !kandidaat.profiel_id && kandidaat.status !== "afgewezen" && kandidaat.status !== "on_hold";
}
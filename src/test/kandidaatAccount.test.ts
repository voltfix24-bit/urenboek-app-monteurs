import { describe, expect, it } from "vitest";
import { kanKandidaatUitnodigen } from "@/lib/kandidaatAccount";

describe("account uitnodigen onafhankelijk van digitaal contract", () => {
  it.each(["gesprek", "tarief_afgesproken", "uitgenodigd", "gecontracteerd"] as const)(
    "%s vereist geen digitale handtekening",
    status => expect(kanKandidaatUitnodigen({ status, profiel_id: null })).toBe(true),
  );
  it("nodigt een gekoppeld account niet opnieuw uit", () => {
    expect(kanKandidaatUitnodigen({ status: "gesprek", profiel_id: "bestaand-profiel" })).toBe(false);
  });
  it.each(["afgewezen", "on_hold"] as const)("nodigt %s niet uit", status => {
    expect(kanKandidaatUitnodigen({ status, profiel_id: null })).toBe(false);
  });
});
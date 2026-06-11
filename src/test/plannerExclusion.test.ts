import { describe, it, expect } from "vitest";
import {
  isValidExclusionReason,
  exclusionLabel,
  PLANNER_EXCLUSION_REASONS,
  type PlannerExclusionReason,
} from "@/lib/plannerExclusion";
import {
  magProjectSynchroniseren,
  isProjectUitgesloten,
  type ProjectSyncInput,
} from "@/lib/plannerSync";

// Spiegelt de DB-CHECK projects_planner_sync_reason_chk in TS,
// zodat de UI dezelfde regels afdwingt vóór een schrijfactie.
function valideerExclusion(enabled: boolean, reason: string | null | undefined): { ok: true } | { ok: false; reden: string } {
  if (enabled) {
    if (reason != null) return { ok: false, reden: "Bij ingeschakelde sync moet reden leeg zijn" };
    return { ok: true };
  }
  if (!reason || !isValidExclusionReason(reason)) {
    return { ok: false, reden: "Bij uitgeschakelde sync is een geldige reden verplicht" };
  }
  return { ok: true };
}

const baseProject = (over: Partial<ProjectSyncInput> = {}): ProjectSyncInput => ({
  id: "p1", nummer: "001", naam: "Test", stationsnaam: null,
  straat: null, postcode: null, stad: null, active: true, projectjaar: 2026,
  planner_sync_enabled: true, planner_sync_exclusion_reason: null,
  ...over,
});

describe("PlannerExclusion redenen", () => {
  it("accepteert alleen de drie afgesproken waarden", () => {
    expect(PLANNER_EXCLUSION_REASONS).toEqual(["urenregistratie", "historisch_afgerond", "anders"]);
    expect(isValidExclusionReason("urenregistratie")).toBe(true);
    expect(isValidExclusionReason("historisch_afgerond")).toBe(true);
    expect(isValidExclusionReason("anders")).toBe(true);
    expect(isValidExclusionReason("iets_anders")).toBe(false);
    expect(isValidExclusionReason("")).toBe(false);
    expect(isValidExclusionReason(null)).toBe(false);
  });

  it("toont Nederlandse labels", () => {
    expect(exclusionLabel("urenregistratie")).toMatch(/urenregistratie/i);
    expect(exclusionLabel("historisch_afgerond")).toMatch(/historisch/i);
    expect(exclusionLabel("anders")).toBe("Anders");
    expect(exclusionLabel(null)).toBe("Onbekend");
  });
});

describe("valideerExclusion (DB-CHECK gespiegeld)", () => {
  it("uitschakelen vereist een geldige reden", () => {
    expect(valideerExclusion(false, null).ok).toBe(false);
    expect(valideerExclusion(false, "").ok).toBe(false);
    expect(valideerExclusion(false, "fantasie").ok).toBe(false);
    expect(valideerExclusion(false, "urenregistratie").ok).toBe(true);
  });

  it("opnieuw inschakelen vereist dat de reden wordt leeggemaakt", () => {
    expect(valideerExclusion(true, "urenregistratie" as PlannerExclusionReason).ok).toBe(false);
    expect(valideerExclusion(true, null).ok).toBe(true);
  });
});

describe("magProjectSynchroniseren", () => {
  it("uitgesloten project mag niet sync, ook met geldig projectjaar", () => {
    const p = baseProject({ planner_sync_enabled: false, planner_sync_exclusion_reason: "urenregistratie" });
    expect(isProjectUitgesloten(p)).toBe(true);
    expect(magProjectSynchroniseren(p)).toBe(false);
  });

  it("projectjaar is voor uitgesloten projecten niet verplicht (mag null zijn)", () => {
    const p = baseProject({ projectjaar: null, planner_sync_enabled: false, planner_sync_exclusion_reason: "historisch_afgerond" });
    // Geldigheid voor sync: blijft false (uitgesloten), maar de ontbrekende jaar mag de UI niet als blokker tonen voor uitsluitsverwerking.
    expect(magProjectSynchroniseren(p)).toBe(false);
    expect(isProjectUitgesloten(p)).toBe(true);
  });

  it("ingeschakeld project met geldig jaar mag sync", () => {
    expect(magProjectSynchroniseren(baseProject())).toBe(true);
  });
});

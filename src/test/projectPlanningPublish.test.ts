import { describe, it, expect } from "vitest";
import {
  isExternePlannerRegel,
  filterTeVerwijderenHandmatigeRegels,
  vatExternePlannerRegelsSamen,
  PLANNER_EXTERNAL_SOURCE,
} from "@/lib/projectPlanningPublish";

const handmatig = (id: string, datum = "2026-06-22") => ({
  id, project_id: "p1", datum, external_source: null as string | null,
});
const extern = (id: string, datum = "2026-06-22") => ({
  id, project_id: "p1", datum, external_source: PLANNER_EXTERNAL_SOURCE,
});
const andereBron = (id: string, datum = "2026-06-22") => ({
  id, project_id: "p1", datum, external_source: "iets_anders",
});

describe("isExternePlannerRegel", () => {
  it("herkent terrevolt_planner als externe regel", () => {
    expect(isExternePlannerRegel({ external_source: "terrevolt_planner" })).toBe(true);
  });
  it("null/andere bron → niet extern", () => {
    expect(isExternePlannerRegel({ external_source: null })).toBe(false);
    expect(isExternePlannerRegel({ external_source: undefined })).toBe(false);
    expect(isExternePlannerRegel({ external_source: "iets_anders" })).toBe(false);
  });
});

describe("filterTeVerwijderenHandmatigeRegels", () => {
  it("behoudt externe Planner-regels bij publiceren ProjectPlanning", () => {
    const rows = [handmatig("h1"), extern("e1"), handmatig("h2"), extern("e2")];
    const teVerw = filterTeVerwijderenHandmatigeRegels(rows);
    const ids = teVerw.map(r => r.id);
    expect(ids).toEqual(["h1", "h2"]);
    expect(ids).not.toContain("e1");
    expect(ids).not.toContain("e2");
  });

  it("regels van andere external_source (bv. legacy import) zijn géén Planner-regels en mogen mee worden opgeruimd", () => {
    const rows = [extern("e1"), andereBron("x1"), handmatig("h1")];
    expect(filterTeVerwijderenHandmatigeRegels(rows).map(r => r.id)).toEqual(["x1", "h1"]);
  });

  it("leeg in → leeg uit", () => {
    expect(filterTeVerwijderenHandmatigeRegels([])).toEqual([]);
  });

  it("alleen externe Planner-regels → niets verwijderen", () => {
    expect(filterTeVerwijderenHandmatigeRegels([extern("e1"), extern("e2")])).toEqual([]);
  });
});

describe("vatExternePlannerRegelsSamen — voor waarschuwingsdialoog", () => {
  it("telt en groepeert per datum", () => {
    const sam = vatExternePlannerRegelsSamen([
      handmatig("h1", "2026-06-22"),
      extern("e1", "2026-06-22"),
      extern("e2", "2026-06-22"),
      extern("e3", "2026-06-23"),
      handmatig("h2", "2026-06-24"),
    ]);
    expect(sam.totaal).toBe(3);
    expect(sam.perDatum).toEqual([
      { datum: "2026-06-22", aantal: 2 },
      { datum: "2026-06-23", aantal: 1 },
    ]);
  });

  it("geen externe regels → totaal 0", () => {
    const sam = vatExternePlannerRegelsSamen([handmatig("h1")]);
    expect(sam.totaal).toBe(0);
    expect(sam.perDatum).toEqual([]);
  });
});

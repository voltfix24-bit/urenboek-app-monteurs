import { describe, it, expect } from "vitest";
import {
  isExternePlannerRegel,
  isSyncLockedRegel,
  isBeschermdeRegel,
  filterTeVerwijderenHandmatigeRegels,
  splitsKandidatenOpExternePlannerBotsing,
  vatExternePlannerRegelsSamen,
  PLANNER_EXTERNAL_SOURCE,
} from "@/lib/projectPlanningPublish";

const handmatig = (id: string, datum = "2026-06-22") => ({
  id, project_id: "p1", datum, external_source: null as string | null, sync_locked: false as boolean | null,
});
const extern = (id: string, datum = "2026-06-22") => ({
  id, project_id: "p1", datum, external_source: PLANNER_EXTERNAL_SOURCE, sync_locked: true as boolean | null,
});
const andereBron = (id: string, datum = "2026-06-22") => ({
  id, project_id: "p1", datum, external_source: "iets_anders", sync_locked: false as boolean | null,
});
const syncLockedHandmatig = (id: string, datum = "2026-06-22") => ({
  // Edge case: regel zonder external_source maar wél sync_locked = true.
  id, project_id: "p1", datum, external_source: null as string | null, sync_locked: true as boolean | null,
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

describe("isSyncLockedRegel", () => {
  it("true → beschermd", () => {
    expect(isSyncLockedRegel({ sync_locked: true })).toBe(true);
  });
  it("false/null/undefined → niet beschermd", () => {
    expect(isSyncLockedRegel({ sync_locked: false })).toBe(false);
    expect(isSyncLockedRegel({ sync_locked: null })).toBe(false);
    expect(isSyncLockedRegel({ sync_locked: undefined })).toBe(false);
  });
});

describe("isBeschermdeRegel — combineert externe bron en sync_locked", () => {
  it("externe Planner-regel is beschermd", () => {
    expect(isBeschermdeRegel({ external_source: PLANNER_EXTERNAL_SOURCE })).toBe(true);
  });
  it("sync_locked zonder external_source is óók beschermd", () => {
    expect(isBeschermdeRegel({ external_source: null, sync_locked: true })).toBe(true);
  });
  it("handmatige onbeschermde regel mag verwijderd worden", () => {
    expect(isBeschermdeRegel({ external_source: null, sync_locked: false })).toBe(false);
    expect(isBeschermdeRegel({})).toBe(false);
  });
});

describe("filterTeVerwijderenHandmatigeRegels", () => {
  it("behoudt externe Planner-regels bij publiceren ProjectPlanning", () => {
    const rows = [handmatig("h1"), extern("e1"), handmatig("h2"), extern("e2")];
    const ids = filterTeVerwijderenHandmatigeRegels(rows).map(r => r.id);
    expect(ids).toEqual(["h1", "h2"]);
    expect(ids).not.toContain("e1");
    expect(ids).not.toContain("e2");
  });

  it("behoudt sync_locked-regels — ook als external_source NULL is", () => {
    const rows = [handmatig("h1"), syncLockedHandmatig("locked1"), handmatig("h2")];
    const ids = filterTeVerwijderenHandmatigeRegels(rows).map(r => r.id);
    expect(ids).toEqual(["h1", "h2"]);
    expect(ids).not.toContain("locked1");
  });

  it("regels van andere external_source (legacy import) mogen wel opgeruimd worden", () => {
    const rows = [extern("e1"), andereBron("x1"), handmatig("h1")];
    expect(filterTeVerwijderenHandmatigeRegels(rows).map(r => r.id)).toEqual(["x1", "h1"]);
  });

  it("leeg in → leeg uit", () => {
    expect(filterTeVerwijderenHandmatigeRegels([])).toEqual([]);
  });

  it("alleen beschermde regels → niets verwijderen", () => {
    expect(filterTeVerwijderenHandmatigeRegels([extern("e1"), syncLockedHandmatig("l1")])).toEqual([]);
  });
});

describe("splitsKandidatenOpExternePlannerBotsing", () => {
  const k = (medewerker_id: string, datum: string, extra: Record<string, unknown> = {}) =>
    ({ medewerker_id, datum, project_id: "p1", ...extra }) as { medewerker_id: string; datum: string; project_id: string };

  it("kandidaat zonder botsing → in toInsert", () => {
    const res = splitsKandidatenOpExternePlannerBotsing(
      [k("m1", "2026-06-22"), k("m2", "2026-06-23")],
      [],
    );
    expect(res.toInsert.length).toBe(2);
    expect(res.geblokkeerd).toEqual([]);
  });

  it("kandidaat botst met externe Planner-regel op (medewerker, datum) → geblokkeerd, geen dubbele planning", () => {
    const externe = [
      { external_source: PLANNER_EXTERNAL_SOURCE, sync_locked: true, medewerker_id: "m1", datum: "2026-06-22" },
    ];
    const res = splitsKandidatenOpExternePlannerBotsing(
      [k("m1", "2026-06-22"), k("m2", "2026-06-22"), k("m1", "2026-06-23")],
      externe,
    );
    expect(res.toInsert.map(t => `${t.medewerker_id}|${t.datum}`)).toEqual([
      "m2|2026-06-22",
      "m1|2026-06-23",
    ]);
    expect(res.geblokkeerd).toEqual([{ medewerker_id: "m1", datum: "2026-06-22" }]);
  });

  it("sync_locked handmatige regel beschermt óók tegen botsing", () => {
    const beschermd = [
      { external_source: null, sync_locked: true, medewerker_id: "m1", datum: "2026-06-22" },
    ];
    const res = splitsKandidatenOpExternePlannerBotsing([k("m1", "2026-06-22")], beschermd);
    expect(res.toInsert).toEqual([]);
    expect(res.geblokkeerd).toEqual([{ medewerker_id: "m1", datum: "2026-06-22" }]);
  });

  it("regels met andere bron (geen Planner, niet locked) blokkeren NIET", () => {
    const andere = [
      { external_source: "iets_anders", sync_locked: false, medewerker_id: "m1", datum: "2026-06-22" },
    ];
    const res = splitsKandidatenOpExternePlannerBotsing([k("m1", "2026-06-22")], andere);
    expect(res.toInsert.length).toBe(1);
    expect(res.geblokkeerd).toEqual([]);
  });

  it("herhaalbaarheid: meerdere botsingen worden allemaal gemeld", () => {
    const externe = [
      { external_source: PLANNER_EXTERNAL_SOURCE, sync_locked: true, medewerker_id: "m1", datum: "2026-06-22" },
      { external_source: PLANNER_EXTERNAL_SOURCE, sync_locked: true, medewerker_id: "m2", datum: "2026-06-22" },
    ];
    const res = splitsKandidatenOpExternePlannerBotsing(
      [k("m1", "2026-06-22"), k("m2", "2026-06-22"), k("m3", "2026-06-22")],
      externe,
    );
    expect(res.toInsert.map(t => t.medewerker_id)).toEqual(["m3"]);
    expect(res.geblokkeerd.length).toBe(2);
  });

  it("regressie: handmatige planning zonder externe regels werkt onveranderd", () => {
    const res = splitsKandidatenOpExternePlannerBotsing(
      [k("m1", "2026-06-22"), k("m1", "2026-06-23")],
      [],
    );
    expect(res.toInsert.length).toBe(2);
    expect(res.geblokkeerd).toEqual([]);
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


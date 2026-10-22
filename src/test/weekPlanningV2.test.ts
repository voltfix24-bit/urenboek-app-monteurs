import { describe, it, expect } from "vitest";
import {
  isLeerling, filterToon, bezettingPerDag, klusKopstatus, wijzigingenOpDag, groepeerRijen, roosterRijen, copyDays, transferTargets,
  bouwLiveRegels, tijdenOverlappen, dubbeleBoekingTekst, berekenWeekUren, weekgrensWaarschuwing, vergelijkBoeking, isLegeWerkdag,
} from "@/lib/weekPlanningV2";
import { bouwCellen, celKey } from "@/lib/weekPlanning";

describe("weekPlanningV2 helpers", () => {
  it.each(["rol", "ploeg", "geen"] as const)("gebruikt de zichtbare %s-volgorde voor selectie, clipboard en verplaatsen", (mode) => {
    const rows = [
      { id: "a", full_name: "A", role: "wv", ploeg: "A", planning_partner_ids: [], vaste_vrije_dagen: [] },
      { id: "b", full_name: "B", role: "monteur", ploeg: "B", planning_partner_ids: [], vaste_vrije_dagen: [] },
      { id: "c", full_name: "C", role: "wv", ploeg: "A", planning_partner_ids: [], vaste_vrije_dagen: [] },
      { id: "d", full_name: "D", role: "monteur", ploeg: "B", planning_partner_ids: [], vaste_vrije_dagen: [] },
    ];
    const groups = groepeerRijen(rows, mode, { rolLabel: (r) => r, isUitleenAlleen: () => false, naamVoor: (id) => id });
    const visible = roosterRijen(groups);
    const expected = mode === "geen" ? ["a", "b", "c", "d"] : mode === "ploeg" ? ["a", "c", "b", "d"] : ["b", "d", "a", "c"];
    expect(visible.map((r) => r.id)).toEqual(expected);
    const dates = ["2026-10-19", "2026-10-20"];
    const cells = bouwCellen(visible.slice(0, 2).map((r) => ({ id: `p-${r.id}`, medewerker_id: r.id, datum: dates[0], project_id: "project", starttijd: "07:00", eindtijd: "16:00", notitie: r.id })), []);
    const selected = new Set(visible.slice(0, 2).map((r) => celKey(r.id, dates[0])));
    expect([...selected]).toEqual(expected.slice(0, 2).map((id) => `${id}|2026-10-19`));
    const copied = copyDays(selected, visible, dates, cells);
    expect(copied.map((c) => c.row)).toEqual([0, 1]);
    const moved = transferTargets(copied, { row: 1, day: 1 }, visible, dates, cells, [], true);
    expect(moved.targets.map((t) => t.medewerker_id)).toEqual(expected.slice(1, 3));
    expect(moved.targets.map((t) => t.source.waarden.notitie)).toEqual(expected.slice(0, 2));
    expect(moved.skipped).toEqual([]);
  });

  it("isLeerling detecteert leerling ongeacht hoofdletters", () => {
    expect(isLeerling({ ploeg: "Leerling" })).toBe(true);
    expect(isLeerling({ ploeg: "Monteurs" })).toBe(false);
    expect(isLeerling({ ploeg: null })).toBe(false);
  });

  it("filterToon filtert op monteurs/leerlingen", () => {
    const rows = [{ id: "1", ploeg: "Leerling" }, { id: "2", ploeg: "Monteurs" }];
    expect(filterToon(rows, "leerlingen")).toEqual([rows[0]]);
    expect(filterToon(rows, "monteurs")).toEqual([rows[1]]);
    expect(filterToon(rows, "iedereen")).toEqual(rows);
  });

  it("bezettingPerDag bepaalt status", () => {
    expect(bezettingPerDag(2, 4).status).toBe("tekort");
    expect(bezettingPerDag(4, 4).status).toBe("precies");
    expect(bezettingPerDag(5, 4).status).toBe("meer");
    expect(bezettingPerDag(2, null).status).toBe("geen-norm");
  });

  it("klusKopstatus telt het tekort op", () => {
    const dagen = [bezettingPerDag(2, 4), bezettingPerDag(4, 4)];
    expect(klusKopstatus(dagen)).toBe("Tekort 2 mensdagen");
    expect(klusKopstatus([bezettingPerDag(4, 4)])).toBe("Volledig bezet");
  });

  it("wijzigingenOpDag telt concepten op een datum", () => {
    const concepten = [{ datum: "2024-01-01" }, { datum: "2024-01-01" }, { datum: "2024-01-02" }];
    expect(wijzigingenOpDag(concepten, "2024-01-01")).toBe(2);
  });

  it("tijdenOverlappen herkent overlap en halfopen grenzen", () => {
    expect(tijdenOverlappen({ starttijd: "07:00", eindtijd: "12:00" }, { starttijd: "11:00", eindtijd: "16:00" })).toBe(true);
    expect(tijdenOverlappen({ starttijd: "07:00", eindtijd: "12:00" }, { starttijd: "12:00", eindtijd: "16:00" })).toBe(false);
  });

  it("dubbeleBoekingTekst geeft tooltip bij overlap, anders null", () => {
    const regels = [{ naam: "Koppoelln", starttijd: "07:00", eindtijd: "12:00" }, { naam: "Stationsplein", starttijd: "11:00", eindtijd: "16:00" }];
    expect(dubbeleBoekingTekst(regels)).toBe("Dubbele boeking: Koppoelln 07:00–12:00 en Stationsplein 11:00–16:00 overlappen");
    expect(dubbeleBoekingTekst([regels[0]])).toBeNull();
  });

  it("bouwLiveRegels combineert gepubliceerde planning met concepten, zonder verwijderde/gewijzigde planning-ids", () => {
    const planning = [{ id: "p1", medewerker_id: "m1", datum: "2024-01-01", project_id: "proj1", starttijd: "07:00:00", eindtijd: "12:00:00" }];
    const concepten = [
      { medewerker_id: "m1", datum: "2024-01-01", project_id: "proj2", starttijd: "11:00", eindtijd: "16:00", actie: "nieuw", planning_id: null },
      { medewerker_id: "m2", datum: "2024-01-01", project_id: "proj3", starttijd: "07:00", eindtijd: "16:00", actie: "wijzig", planning_id: "p2" },
    ];
    const regels = bouwLiveRegels(planning, concepten);
    expect(regels.get("m1|2024-01-01")).toEqual([
      { project_id: "proj1", starttijd: "07:00", eindtijd: "12:00" },
      { project_id: "proj2", starttijd: "11:00", eindtijd: "16:00" },
    ]);
    expect(regels.get("m2|2024-01-01")).toEqual([{ project_id: "proj3", starttijd: "07:00", eindtijd: "16:00" }]);
  });

  it("berekenWeekUren telt netto uren per medewerker op, alleen voor de opgegeven datums", () => {
    const cellen = [
      { medewerker_id: "m1", datum: "2024-01-01", starttijd: "07:00", eindtijd: "12:00" },
      { medewerker_id: "m1", datum: "2024-01-08", starttijd: "07:00", eindtijd: "16:00" },
    ];
    const uren = (s: string | null, e: string | null) => (s && e ? 5 : 0);
    const result = berekenWeekUren(cellen, ["2024-01-01"], uren);
    expect(result.get("m1")).toBe(5);
  });

  it("weekgrensWaarschuwing waarschuwt alleen boven de grens", () => {
    const fmt = (n: number) => String(n);
    expect(weekgrensWaarschuwing("Jan Bakker", 40, 9, 42, 40, fmt)).toBe("Jan Bakker komt op 49 u in week 42 (boven 40 u)");
    expect(weekgrensWaarschuwing("Jan Bakker", 30, 5, 42, 40, fmt)).toBeNull();
  });

  it("vergelijkBoeking bepaalt gelijk/afwijkend/niet-geboekt", () => {
    expect(vergelijkBoeking(8, 8)).toBe("gelijk");
    expect(vergelijkBoeking(8, 6.5)).toBe("afwijkend");
    expect(vergelijkBoeking(8, 0)).toBe("niet-geboekt");
  });

  it("isLegeWerkdag is waar zonder planning en zonder afwezigheid", () => {
    expect(isLegeWerkdag(false, false)).toBe(true);
    expect(isLegeWerkdag(true, false)).toBe(false);
    expect(isLegeWerkdag(false, true)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { copyDays, transferTargets, repeatDates, repeatEnd } from "@/lib/weekPlanningV2";
import { bouwCellen, type PlanningRij } from "@/lib/weekPlanning";

const employees = [{ id: "a", full_name: "A", vaste_vrije_dagen: [], planning_partner_ids: [] }, { id: "b", full_name: "B", vaste_vrije_dagen: [3], planning_partner_ids: [] }];
const dates = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];
const row: PlanningRij = { id: "p", medewerker_id: "a", project_id: "project", datum: dates[0], starttijd: "07:00", eindtijd: "16:00", notitie: "Hal 3", activiteit: null, activiteit_kleur: null, planning_group_id: "group", collega_ids: ["b"], external_source: null, sync_locked: false, werklocatie: "Utrecht", contactpersoon: "Contact", contact_telefoon: "test" };
describe("desktop quick planning", () => {
  it("copies sparse days relative to top-left and preserves lending fields", () => {
    const cells = bouwCellen([row, { ...row, id: "q", datum: dates[4] }], []);
    const copied = copyDays(new Set([`a|${dates[0]}`, `a|${dates[4]}`]), employees, dates, cells);
    expect(copied.map((d) => d.day)).toEqual([0, 4]);
    expect(copied[0].waarden).toMatchObject({ werklocatie: "Utrecht", contactpersoon: "Contact", notitie: "Hal 3" });
  });
  it("skips occupied targets, fixed days, leave and outside-grid targets", () => {
    const cells = bouwCellen([row], []);
    const copied = copyDays(new Set([`a|${dates[0]}`]), employees, dates, cells);
    expect(transferTargets(copied, { row: 0, day: 0 }, employees, dates, cells, []).targets).toHaveLength(0);
    expect(transferTargets(copied, { row: 1, day: 2 }, employees, dates, cells, []).skipped).toEqual(["vrij"]);
    expect(transferTargets(copied, { row: 2, day: 0 }, employees, dates, cells, []).skipped).toEqual(["buiten het rooster"]);
    expect(transferTargets(copied, { row: 0, day: 1 }, employees, dates, cells, [{ medewerker_id: "a", datum_van: dates[1], datum_tot: dates[1], type: "ziek", status: "goedgekeurd" }]).skipped).toEqual(["ziek"]);
  });
  it("never moves protected Planner rows but permits copying their contents", () => {
    const cells = bouwCellen([{ ...row, sync_locked: true }], []);
    const copied = copyDays(new Set([`a|${dates[0]}`]), employees, dates, cells);
    expect(transferTargets(copied, { row: 0, day: 1 }, employees, dates, cells, [], true).skipped).toEqual(["Planner-koppeling"]);
    expect(transferTargets(copied, { row: 0, day: 1 }, employees, dates, cells, []).targets).toHaveLength(1);
  });
  it("repeats selected weekdays every other week and includes the end date", () => {
    expect(repeatDates(new Date(2026, 9, 12), new Date(2026, 9, 30), [0, 4], 2)).toEqual(["2026-10-12", "2026-10-16", "2026-10-26", "2026-10-30"]);
    expect(repeatEnd(new Date(2026, 9, 12), 2).getFullYear()).toBe(2027);
  });
});
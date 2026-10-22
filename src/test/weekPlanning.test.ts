import { describe, it, expect } from "vitest";
import {
  bouwCellen, celKey, bepaalAfwezigheid, blokkeertInplannen, bepaalDoelen, bouwNieuwConcepten, actieVoorBewerken, actieVoorVerwijderen,
  berekenUren, parseWeekParam, telConcepten, type PlanningRij, type ConceptRij,
} from "@/lib/weekPlanning";

const pl = (id: string, med: string, datum: string, extra: Partial<PlanningRij> = {}): PlanningRij => ({
  id, medewerker_id: med, project_id: "p1", datum, starttijd: "07:00:00", eindtijd: "16:00:00", notitie: "",
  activiteit: null, activiteit_kleur: null, planning_group_id: null, collega_ids: null, external_source: null, sync_locked: false, ...extra,
});
const co = (id: string, actie: ConceptRij["actie"], med: string, datum: string, extra: Partial<ConceptRij> = {}): ConceptRij => ({
  id, actie, planning_id: null, medewerker_id: med, datum, project_id: "p2", starttijd: "07:30:00", eindtijd: "16:30:00",
  notitie: "", activiteit: null, activiteit_kleur: null, planning_group_id: null, collega_ids: null, ...extra,
});
const meds = [
  { id: "m1", full_name: "Jan", vaste_vrije_dagen: [], planning_partner_ids: [] },
  { id: "m2", full_name: "Piet", vaste_vrije_dagen: [3], planning_partner_ids: [] }, // vrij op woensdag
];

describe("bouwCellen", () => {
  it("concept gaat vóór gepubliceerde regel", () => {
    const c = bouwCellen([pl("a", "m1", "2026-10-12")], [co("c1", "wijzig", "m1", "2026-10-12", { planning_id: "a" })]);
    const cel = c.get(celKey("m1", "2026-10-12"))!;
    expect(cel.status).toBe("gewijzigd");
    expect(cel.project_id).toBe("p2");
    expect(cel.planning?.id).toBe("a");
  });
  it("verwijder-concept houdt gepubliceerde waarden maar markeert verwijderd", () => {
    const c = bouwCellen([pl("a", "m1", "2026-10-12")], [co("c1", "verwijder", "m1", "2026-10-12", { planning_id: "a", project_id: null })]);
    const cel = c.get(celKey("m1", "2026-10-12"))!;
    expect(cel.status).toBe("verwijderd");
    expect(cel.project_id).toBe("p1");
  });
  it("Planner-regel is beschermd", () => {
    const c = bouwCellen([pl("a", "m1", "2026-10-12", { external_source: "terrevolt_planner", sync_locked: true })], []);
    expect(c.get(celKey("m1", "2026-10-12"))!.beschermd).toBe(true);
  });
});

describe("bepaalDoelen", () => {
  it("slaat bezette dagen en verlof over, maar laat vaste vrije dagen toe", () => {
    const cellen = bouwCellen([pl("a", "m1", "2026-10-12")], []);
    const besch = [{ medewerker_id: "m1", datum_van: "2026-10-13", datum_tot: "2026-10-13", type: "vakantie", status: "goedgekeurd" }];
    const r = bepaalDoelen(["m1", "m2"], ["2026-10-12", "2026-10-13", "2026-10-14"], cellen, meds, besch);
    expect(r.doelen).toEqual([
      { medewerker_id: "m2", datum: "2026-10-12" },
      { medewerker_id: "m2", datum: "2026-10-13" },
      { medewerker_id: "m1", datum: "2026-10-14" },
      { medewerker_id: "m2", datum: "2026-10-14" },
    ]);
    expect(r.overgeslagen.map((o) => o.reden)).toEqual(["al ingepland", "verlof"]);
  });
});

describe("bouwNieuwConcepten", () => {
  it("maakt een ploeg per dag bij meerdere medewerkers", () => {
    let n = 0;
    const rows = bouwNieuwConcepten(
      [{ medewerker_id: "m1", datum: "d1" }, { medewerker_id: "m2", datum: "d1" }, { medewerker_id: "m1", datum: "d2" }],
      { project_id: "p1", starttijd: "07:00", eindtijd: "16:00", notitie: "" }, "me", () => `g${++n}`,
    );
    expect(rows[0].planning_group_id).toBe("g1");
    expect(rows[0].collega_ids).toEqual(["m2"]);
    expect(rows[2].planning_group_id).toBeNull();
    expect(rows.every((r) => r.actie === "nieuw")).toBe(true);
  });
});

describe("bewerken/verwijderen", () => {
  const waarden = { project_id: "p3", starttijd: "08:00", eindtijd: "17:00", notitie: "x" };
  it("nieuw-concept wordt bijgewerkt, niet gekopieerd", () => {
    const cel = bouwCellen([], [co("c1", "nieuw", "m1", "d")]).get(celKey("m1", "d"))!;
    expect(actieVoorBewerken(cel, waarden, "me").type).toBe("update-concept");
    expect(actieVoorVerwijderen(cel, "me")).toEqual({ type: "delete-concept", id: "c1" });
  });
  it("gepubliceerde regel wordt wijzig/verwijder-concept", () => {
    const cel = bouwCellen([pl("a", "m1", "d")], []).get(celKey("m1", "d"))!;
    const b = actieVoorBewerken(cel, waarden, "me");
    expect(b.type === "upsert" && b.rij.actie).toBe("wijzig");
    const v = actieVoorVerwijderen(cel, "me");
    expect(v.type === "upsert" && v.rij.actie).toBe("verwijder");
  });
  it("beschermde Planner-regel wordt nooit aangeraakt", () => {
    const cel = bouwCellen([pl("a", "m1", "d", { sync_locked: true })], []).get(celKey("m1", "d"))!;
    expect(actieVoorBewerken(cel, waarden, "me").type).toBe("beschermd");
    expect(actieVoorVerwijderen(cel, "me").type).toBe("beschermd");
  });
});

describe("overig", () => {
  it("berekenUren: 60 min pauze, halve uren", () => {
    expect(berekenUren("07:00", "16:00")).toBe(8);
    expect(berekenUren("07:00", "16:30")).toBe(8.5);
  });
  it("parseWeekParam", () => {
    const nu = new Date("2026-10-12T12:00:00");
    expect(parseWeekParam("2026-10-14", nu)?.getDate()).toBe(12);
    expect(parseWeekParam("2026-W42", nu)?.getDate()).toBe(12);
    expect(parseWeekParam("42", nu)?.getDate()).toBe(12);
    expect(parseWeekParam("abc", nu)).toBeNull();
  });
  it("telConcepten", () => {
    expect(telConcepten([co("1", "nieuw", "m", "d"), co("2", "verwijder", "m", "e")])).toEqual({ nieuw: 1, gewijzigd: 0, verwijderd: 1 });
  });
});

 describe("vaste vrije dagen als waarschuwing", () => {
  const samir = { id: "samir", full_name: "Samir", vaste_vrije_dagen: [3], planning_partner_ids: [] };
  it("houdt Samirs woensdag informatief en planbaar", () => {
    const afw = bepaalAfwezigheid(samir, "2026-10-21", []);
    expect(afw).toBe("vrij");
    expect(blokkeertInplannen(afw)).toBe(false);
    expect(bepaalDoelen([samir.id], ["2026-10-21"], new Map(), [samir], []).doelen).toEqual([{ medewerker_id: "samir", datum: "2026-10-21" }]);
  });
  it.each(["vakantie", "ziek", "elders"])("blijft expliciete %s op woensdag blokkeren", (type) => {
    const absence = [{ medewerker_id: samir.id, datum_van: "2026-10-21", datum_tot: "2026-10-21", type, status: "goedgekeurd" }];
    expect(blokkeertInplannen(bepaalAfwezigheid(samir, "2026-10-21", absence))).toBe(true);
    expect(bepaalDoelen([samir.id], ["2026-10-21"], new Map(), [samir], absence).doelen).toEqual([]);
  });
});

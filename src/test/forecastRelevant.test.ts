import { describe, it, expect } from "vitest";
import {
  isProjectForecastRelevant,
  moetForecastOntbreektWaarschuwen,
} from "@/lib/forecastRelevant";

describe("isProjectForecastRelevant", () => {
  it("standaard case/stuksprijsproject → relevant", () => {
    expect(isProjectForecastRelevant({ naam: "Nieuweweg 13A Hattem", opdrachtgever_naam: "Liander" })).toBe(true);
  });

  it("planner_sync_enabled=false → niet relevant", () => {
    expect(isProjectForecastRelevant({
      naam: "Project X", planner_sync_enabled: false, planner_sync_exclusion_reason: "urenregistratie",
    })).toBe(false);
  });

  it("Meeloopuren Van Gelder → niet relevant", () => {
    expect(isProjectForecastRelevant({ naam: "Meeloopuren Van Gelder week 25" })).toBe(false);
    expect(isProjectForecastRelevant({ opdrachtgever_naam: "Meeloopuren Van Gelder" })).toBe(false);
  });

  it("Verlet → niet relevant", () => {
    expect(isProjectForecastRelevant({ naam: "Verlet algemeen" })).toBe(false);
  });

  it("Heijmans → niet relevant", () => {
    expect(isProjectForecastRelevant({ opdrachtgever_naam: "Heijmans Infra" })).toBe(false);
    expect(isProjectForecastRelevant({ naam: "Heijmans onderhoud Q3" })).toBe(false);
  });

  it("Fjodor → niet relevant", () => {
    expect(isProjectForecastRelevant({ naam: "Fjodor uren mei" })).toBe(false);
  });

  it("Hanab → niet relevant", () => {
    expect(isProjectForecastRelevant({ opdrachtgever_naam: "Hanab" })).toBe(false);
  });

  it("hoofdletters/spaties maken niet uit", () => {
    expect(isProjectForecastRelevant({ naam: "  HANAB extra  " })).toBe(false);
    expect(isProjectForecastRelevant({ naam: "MEELOOPUREN VAN GELDER" })).toBe(false);
  });

  it("naam zonder trefwoord → relevant (substring 'verlet' matcht niet in 'verleden')", () => {
    expect(isProjectForecastRelevant({ naam: "Verleden tijd" })).toBe(true);
  });

  it("leeg/null → relevant (geen reden om uit te sluiten)", () => {
    expect(isProjectForecastRelevant({})).toBe(true);
    expect(isProjectForecastRelevant({ naam: null, opdrachtgever_naam: null })).toBe(true);
  });
});

describe("moetForecastOntbreektWaarschuwen", () => {
  it("uitgesloten project → géén waarschuwing", () => {
    expect(moetForecastOntbreektWaarschuwen({ naam: "Fjodor uren" })).toBe(false);
    expect(moetForecastOntbreektWaarschuwen({ naam: "X", planner_sync_enabled: false })).toBe(false);
    expect(moetForecastOntbreektWaarschuwen({ opdrachtgever_naam: "Hanab" })).toBe(false);
    expect(moetForecastOntbreektWaarschuwen({ naam: "Heijmans week 14" })).toBe(false);
    expect(moetForecastOntbreektWaarschuwen({ naam: "Verlet algemeen" })).toBe(false);
    expect(moetForecastOntbreektWaarschuwen({ naam: "Meeloopuren Van Gelder" })).toBe(false);
  });

  it("regulier case-project → wél waarschuwing", () => {
    expect(moetForecastOntbreektWaarschuwen({ naam: "Nieuweweg 13A Hattem", opdrachtgever_naam: "Liander" })).toBe(true);
  });
});

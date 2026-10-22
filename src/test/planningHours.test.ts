import { describe, it, expect } from "vitest";
import { urenTijdblok, pasPlanningUrenAan, boekingsRuimte, magGeplandeDagBoeken } from "@/lib/planningHours";
import { berekenUren } from "@/lib/weekPlanning";

describe("planninguren en boekingsruimte", () => {
  it("een geplande dag vandaag mag geboekt worden zonder projectstatus", () => {
    expect(magGeplandeDagBoeken("2026-10-22", "2026-10-22")).toBe(true);
  });
  it("een geplande dag in het verleden mag geboekt worden", () => {
    expect(magGeplandeDagBoeken("2026-10-21", "2026-10-22")).toBe(true);
  });
  it("een geplande dag in de toekomst mag niet geboekt worden", () => {
    expect(magGeplandeDagBoeken("2026-10-23", "2026-10-22")).toBe(false);
  });
  it("8 uur behoudt de vaste pauze", () => {
    expect(urenTijdblok(8)).toEqual(["07:00", "16:00"]);
  });
  it("4 uur plus 1 is 5 netto uren", () => {
    const [s, e] = urenTijdblok(4);
    const tijd = pasPlanningUrenAan(s, e, 1);
    expect(tijd).toEqual(["07:00", "13:00"]);
    expect(berekenUren(...tijd)).toBe(5);
  });
  it("5 uur min 1 corrigeert naar 4", () => {
    expect(pasPlanningUrenAan("07:00", "13:00", -1)).toEqual(["07:00", "12:00"]);
  });
  it("5 geplande uren geeft maximaal 5 boekbare uren", () => {
    expect(boekingsRuimte(5, 0)).toBe(5);
    expect(boekingsRuimte(5, 4)).toBe(1);
    expect(boekingsRuimte(5, 6)).toBe(0);
  });
});
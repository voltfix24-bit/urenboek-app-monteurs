import { describe, it, expect } from "vitest";
import { projectChecklist, openPunten, isLopend } from "@/lib/projectChecklist";
import { volgendeFase, terugzetFasen } from "@/lib/projectStatus";

const basis = { straat: "Kerkstraat 1", postcode: "1234 AB", stad: "Amsterdam", projectjaar: 2026, opdrachtgever_id: "og", intake_gedaan: true };

describe("projectChecklist", () => {
  it("compleet project heeft 0 open punten", () => {
    expect(openPunten(basis)).toBe(0);
  });
  it("telt ontbrekend adres, jaar, opdrachtgever en intake", () => {
    expect(openPunten({ ...basis, stad: " ", projectjaar: null, opdrachtgever_id: null, intake_gedaan: false })).toBe(4);
    expect(projectChecklist({ ...basis, projectjaar: null }).find((p) => !p.klaar)?.key).toBe("projectjaar");
  });
  it("lopend = actief en niet gesloten", () => {
    expect(isLopend({ active: true, status: "gepland" })).toBe(true);
    expect(isLopend({ active: true, status: "gesloten" })).toBe(false);
    expect(isLopend({ active: false, status: "nieuw" })).toBe(false);
  });
});

describe("fasen", () => {
  it("volgende fase volgt de transities", () => {
    expect(volgendeFase("nieuw")).toBe("gepland");
    expect(volgendeFase("gefactureerd")).toBe("gesloten");
    expect(volgendeFase("gesloten")).toBeNull();
  });
  it("terugzetten alleen naar eerdere toegestane fasen", () => {
    expect(terugzetFasen("in_uitvoering")).toEqual(["gepland"]);
    expect(terugzetFasen("nieuw")).toEqual([]);
    expect(terugzetFasen("gesloten")).toEqual(["nieuw"]);
  });
});

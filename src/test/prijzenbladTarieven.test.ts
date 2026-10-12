import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { loadTariefMap, isDefecteMsMofRij, vulPrijzenblad } from "@/lib/prijzenbladExcel";
import { SPEC_CODE_META, TarievenNietBeschikbaarError, loadSpecCodes } from "@/lib/specCodes";
import * as specModule from "@/lib/specCodes";

const client = (res: any, fail = false) => ({
  from: () => ({ select: () => ({ eq: () => ({ order: async () => {
    if (fail) throw new TypeError("Failed to fetch");
    return res;
  } }) }) }),
});

const TEMPLATE = resolve(__dirname, "../../public/templates/prijzenblad-template.xlsx");

async function loadTemplate() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(TEMPLATE) as any);
  return wb.worksheets[0];
}

describe("tarieven zijn niet client-side aanwezig", () => {
  it("SPEC_CODE_META bevat geen bedragen en er is geen SPEC_CODES-export meer", () => {
    expect(SPEC_CODE_META.length).toBe(40);
    for (const m of SPEC_CODE_META) expect(m).not.toHaveProperty("tarief");
    expect((specModule as any).SPEC_CODES).toBeUndefined();
  });

  it("publieke template bevat geen prijzen in kolom D en verder", async () => {
    const ws = await loadTemplate();
    const getallen: string[] = [];
    ws.eachRow((row) => row.eachCell((c, col) => {
      if (col >= 4 && typeof c.value === "number" && c.value !== 0) getallen.push(c.address);
      if (col >= 4 && typeof c.value === "string" && /\d,\d\d/.test(c.value)) getallen.push(c.address);
    }));
    expect(getallen).toEqual([]);
  });
});

describe("loadTariefMap / loadSpecCodes (manager-only, geen fallback)", () => {
  it("gebruikt database-tarieven afgerond op centen", async () => {
    const m = await loadTariefMap(client({ data: [{ code: "R310040", omschrijving: "x", eenheid: "st", tarief: "302.658", groep: "R31x" }] }));
    expect(m.get("R310040")).toBe(302.66);
  });
  it("netwerkfout → fout, geen fallback", async () => {
    await expect(loadTariefMap(client(null, true))).rejects.toBeInstanceOf(TarievenNietBeschikbaarError);
  });
  it("ongeautoriseerd (RLS geeft 0 rijen) → fout", async () => {
    await expect(loadTariefMap(client({ data: [] }))).rejects.toBeInstanceOf(TarievenNietBeschikbaarError);
  });
  it("permission denied error → fout", async () => {
    await expect(loadSpecCodes(client({ data: null, error: { message: "permission denied", code: "42501" } })))
      .rejects.toBeInstanceOf(TarievenNietBeschikbaarError);
  });
});

describe("vulPrijzenblad", () => {
  it("vult kolom E uit DB-map, F met aantal en SUMPRODUCT-totaal", async () => {
    const ws = await loadTemplate();
    const tarieven = new Map([["R310040", 302.66], ["R320010", 10733.98], ["R410010", 610.93]]);
    const aantallen = new Map([["R310040", 2], ["R410010", 3]]);
    const { ontbrekend } = vulPrijzenblad(ws, tarieven, aantallen);
    expect(ontbrekend).toEqual([]);
    expect(ws.getCell("E9").value).toBe(302.66);
    expect(ws.getCell("F9").value).toBe(2);
    expect(ws.getCell("E12").value).toBe(10733.98);
    expect(ws.getCell("E65").value).toBe(610.93);
    expect(ws.getCell("F65").value).toBe(3);
    expect(ws.getCell("E3").value).toBeNull();
    expect(String((ws.getCell("E102").value as any).formula)).toMatch(/^SUMPRODUCT\(E3:E\d+,F3:F\d+\)$/);
  });
  it("meldt codes met aantal maar zonder tarief", async () => {
    const ws = await loadTemplate();
    const { ontbrekend } = vulPrijzenblad(ws, new Map(), new Map([["R370030", 1]]));
    expect(ontbrekend).toEqual(["R370030"]);
  });
  it("herkent alleen de exacte defecte MS-mofrij", () => {
    expect(isDefecteMsMofRij("Monteren MS mof (verbindings-, eind- of overgangsmof).")).toBe(true);
    expect(isDefecteMsMofRij("Monteren MS eindsluiting.")).toBe(false);
  });
});

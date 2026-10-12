import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { loadTariefMap, isDefecteMsMofRij } from "@/lib/prijzenbladExcel";
import { SPEC_CODES } from "@/lib/specCodes";

const client = (data: any, fail = false) => ({
  from: () => ({ select: () => ({ eq: () => ({ order: async () => {
    if (fail) throw new Error("netwerk");
    return { data };
  } }) }) }),
});

describe("prijzenblad tarieven", () => {
  it("R370030 fallback is 500", () => {
    expect(SPEC_CODES.find(s => s.code === "R370030")!.tarief).toBe(500);
  });
  it("gebruikt database-tarieven afgerond op centen", async () => {
    const m = await loadTariefMap(client([{ code: "R310040", omschrijving: "x", eenheid: "st", tarief: "302.658", groep: "R31x" }]));
    expect(m.get("R310040")).toBe(302.66);
  });
  it("valt terug op SPEC_CODES bij lege data", async () => {
    const m = await loadTariefMap(client([]));
    expect(m.get("R370030")).toBe(500);
    expect(m.size).toBe(SPEC_CODES.length);
  });
  it("valt terug op SPEC_CODES bij fout", async () => {
    const m = await loadTariefMap(client(null, true));
    expect(m.get("R320010")).toBe(10733.98);
  });
  it("herkent alleen de exacte defecte MS-mofrij", () => {
    expect(isDefecteMsMofRij("Monteren MS mof (verbindings-, eind- of overgangsmof).")).toBe(true);
    expect(isDefecteMsMofRij("Monteren MS eindsluiting.")).toBe(false);
  });
});

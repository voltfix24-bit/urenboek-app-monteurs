import { describe, it, expect } from "vitest";
import { isLeerling, filterToon, bezettingPerDag, klusKopstatus, wijzigingenOpDag } from "@/lib/weekPlanningV2";

describe("weekPlanningV2 helpers", () => {
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
});

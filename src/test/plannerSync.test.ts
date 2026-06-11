import { describe, it, expect } from "vitest";
import {
  berekenWerkdagen,
  mapMonteurType,
  isPlanbareMonteur,
  buildMonteurPayload,
  buildProjectPayload,
  magProjectSynchroniseren,
  projectjaarOntbreekt,
  type MonteurSyncInput,
  type ProjectSyncInput,
} from "@/lib/plannerSync";

const baseMonteur = (over: Partial<MonteurSyncInput> = {}): MonteurSyncInput => ({
  id: "m1",
  full_name: "Test Monteur",
  account_status: "active",
  is_onderaannemer: false,
  vaste_vrije_dagen: [],
  roles: ["monteur"],
  ...over,
});

const baseProject = (over: Partial<ProjectSyncInput> = {}): ProjectSyncInput => ({
  id: "p1",
  nummer: "001",
  naam: "Test",
  stationsnaam: "STN",
  straat: "Straat 1",
  postcode: "1234 AB",
  stad: "Amsterdam",
  active: true,
  projectjaar: 2026,
  ...over,
});

describe("berekenWerkdagen (JS getDay-conventie, 1=Ma..5=Vr)", () => {
  it("geen vrije dagen → Ma t/m Vr", () => {
    expect(berekenWerkdagen([])).toEqual([1, 2, 3, 4, 5]);
  });
  it("maandag (1) vrij → maandag valt weg", () => {
    expect(berekenWerkdagen([1])).toEqual([2, 3, 4, 5]);
    expect(berekenWerkdagen([1])).not.toContain(1);
  });
  it("vrijdag (5) vrij → vrijdag valt weg", () => {
    expect(berekenWerkdagen([5])).toEqual([1, 2, 3, 4]);
    expect(berekenWerkdagen([5])).not.toContain(5);
  });
  it("woensdag (3) vrij", () => {
    expect(berekenWerkdagen([3])).toEqual([1, 2, 4, 5]);
  });
  it("weekend (0=zo, 6=za) heeft geen effect — die staan al niet in werkdagen", () => {
    expect(berekenWerkdagen([0, 6])).toEqual([1, 2, 3, 4, 5]);
  });
  it("alle werkdagen vrij → leeg", () => {
    expect(berekenWerkdagen([1, 2, 3, 4, 5])).toEqual([]);
  });
  it("undefined/null safe", () => {
    expect(berekenWerkdagen(undefined as unknown as number[])).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("mapMonteurType", () => {
  it("monteur → montagemonteur", () => {
    expect(mapMonteurType(["monteur"])).toBe("montagemonteur");
  });
  it("schakelmonteur → schakelmonteur", () => {
    expect(mapMonteurType(["schakelmonteur"])).toBe("schakelmonteur");
  });
  it("schakelmonteur wint van monteur", () => {
    expect(mapMonteurType(["monteur", "schakelmonteur"])).toBe("schakelmonteur");
  });
  it("manager / uitvoerder / wv → null", () => {
    expect(mapMonteurType(["manager"])).toBeNull();
    expect(mapMonteurType(["uitvoerder"])).toBeNull();
    expect(mapMonteurType(["wv"])).toBeNull();
  });
});

describe("isPlanbareMonteur", () => {
  it("standaard monteur → planbaar", () => {
    expect(isPlanbareMonteur(baseMonteur())).toBe(true);
  });
  it("onderaannemer-bedrijfsaccount → niet planbaar", () => {
    expect(isPlanbareMonteur(baseMonteur({ is_onderaannemer: true }))).toBe(false);
  });
  it("monteur met onderaannemer_id maar zelf geen bedrijf → planbaar (is_onderaannemer=false)", () => {
    expect(isPlanbareMonteur(baseMonteur({ is_onderaannemer: false }))).toBe(true);
  });
  it("ook-manager → uitgesloten", () => {
    expect(isPlanbareMonteur(baseMonteur({ roles: ["monteur", "manager"] }))).toBe(false);
  });
  it("uitvoerder of wv zonder monteur-rol → niet planbaar", () => {
    expect(isPlanbareMonteur(baseMonteur({ roles: ["uitvoerder"] }))).toBe(false);
    expect(isPlanbareMonteur(baseMonteur({ roles: ["wv"] }))).toBe(false);
  });
});

describe("buildMonteurPayload", () => {
  it("stuurt alleen operationele velden, geen e-mail/telefoon/financiën", () => {
    const payload = buildMonteurPayload(baseMonteur({ vaste_vrije_dagen: [5] }));
    expect(payload).toEqual({
      urenapp_profile_id: "m1",
      naam: "Test Monteur",
      type: "montagemonteur",
      actief: true,
      werkdagen: [1, 2, 3, 4],
    });
    expect(Object.keys(payload)).not.toContain("email");
    expect(Object.keys(payload)).not.toContain("telefoon");
    expect(Object.keys(payload)).not.toContain("rijbewijs");
    expect(Object.keys(payload)).not.toContain("uurtarief");
    expect(Object.keys(payload)).not.toContain("iban");
    expect(Object.keys(payload)).not.toContain("onderaannemer_id");
    expect(Object.keys(payload)).not.toContain("bedrijfsnaam");
  });
  it("inactief account → actief=false", () => {
    expect(buildMonteurPayload(baseMonteur({ account_status: "inactive" })).actief).toBe(false);
  });
  it("gooit fout voor niet-planbare rol", () => {
    expect(() => buildMonteurPayload(baseMonteur({ roles: ["uitvoerder"] }))).toThrow();
  });
});

describe("project synchronisatie-poort", () => {
  it("projectjaar null → ontbreekt + mag niet sync", () => {
    const p = baseProject({ projectjaar: null });
    expect(projectjaarOntbreekt(p)).toBe(true);
    expect(magProjectSynchroniseren(p)).toBe(false);
    expect(() => buildProjectPayload(p)).toThrow();
  });
  it("projectjaar 1999 → buiten bereik", () => {
    expect(magProjectSynchroniseren(baseProject({ projectjaar: 1999 }))).toBe(false);
  });
  it("projectjaar 2101 → buiten bereik", () => {
    expect(magProjectSynchroniseren(baseProject({ projectjaar: 2101 }))).toBe(false);
  });
  it("projectjaar 2026 → ok, payload bevat alleen toegestane velden", () => {
    const payload = buildProjectPayload(baseProject());
    expect(payload).toEqual({
      urenapp_project_id: "p1",
      nummer: "001",
      naam: "Test",
      stationsnaam: "STN",
      straat: "Straat 1",
      postcode: "1234 AB",
      stad: "Amsterdam",
      jaar: 2026,
      actief: true,
    });
    expect(Object.keys(payload)).not.toContain("opdrachtgever_id");
    expect(Object.keys(payload)).not.toContain("contactpersoon_naam");
    expect(Object.keys(payload)).not.toContain("contactpersoon_tel");
    expect(Object.keys(payload)).not.toContain("case_type");
  });
});

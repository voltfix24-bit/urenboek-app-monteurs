import { describe, it, expect } from "vitest";
import { getPermissies, getRolLabel } from "@/lib/permissions";
import { ROUTE_ACCESS } from "@/lib/routeAccess";

const allow = (route: string, roles: string[]) =>
  ROUTE_ACCESS[route](getPermissies(roles));

describe("getRolLabel", () => {
  it("geeft juiste label per rol (manager wint)", () => {
    expect(getRolLabel(["manager", "monteur"])).toBe("Manager");
    expect(getRolLabel(["uitvoerder"])).toBe("Uitvoerder");
    expect(getRolLabel(["wv"])).toBe("Werkvoorbereider");
    expect(getRolLabel(["schakelmonteur"])).toBe("Schakelmonteur");
    expect(getRolLabel(["monteur"])).toBe("Monteur");
    expect(getRolLabel([])).toBe("Monteur");
  });
});

describe("monteur — minimale toegang", () => {
  const roles = ["monteur"];
  it.each([
    "/dashboard", "/goedkeuring", "/rapportage", "/manager-planning",
    "/projecten", "/projecten/:projectId/planning",
    "/medewerkers", "/onderaannemers", "/kandidaten", "/inkooporders",
    "/beheer/intake-regels", "/beheer/tarieven", "/beheer/bedrijf", "/beheer/planner-koppeling",
  ])("geen toegang tot %s", (r) => expect(allow(r, roles)).toBe(false));

  it.each(["/planning", "/mededelingen", "/mijn-orders"])(
    "wel toegang tot %s", (r) => expect(allow(r, roles)).toBe(true),
  );
});

describe("schakelmonteur — gedraagt zich als monteur qua toegang", () => {
  const roles = ["schakelmonteur"];
  it.each([
    "/dashboard", "/goedkeuring", "/rapportage", "/manager-planning",
    "/projecten", "/medewerkers", "/onderaannemers", "/kandidaten",
    "/inkooporders", "/beheer/intake-regels", "/beheer/tarieven", "/beheer/bedrijf",
  ])("geen toegang tot %s", (r) => expect(allow(r, roles)).toBe(false));

  it.each(["/planning", "/mededelingen", "/mijn-orders"])(
    "wel toegang tot %s", (r) => expect(allow(r, roles)).toBe(true),
  );
});

describe("uitvoerder — operationeel, geen beheer", () => {
  const roles = ["uitvoerder"];
  it.each([
    "/dashboard", "/manager-planning", "/projecten",
    "/projecten/:projectId/planning", "/planning", "/mededelingen", "/mijn-orders",
  ])("wel toegang tot %s", (r) => expect(allow(r, roles)).toBe(true));

  it.each([
    "/beheer/intake-regels", "/beheer/tarieven", "/beheer/bedrijf",
    "/medewerkers", "/onderaannemers", "/kandidaten",
    "/inkooporders", "/goedkeuring", "/rapportage",
  ])("geen toegang tot %s", (r) => expect(allow(r, roles)).toBe(false));
});

describe("wv (werkvoorbereider) — zelfde scope als uitvoerder", () => {
  const roles = ["wv"];
  it.each([
    "/dashboard", "/manager-planning", "/projecten",
    "/projecten/:projectId/planning",
  ])("wel toegang tot %s", (r) => expect(allow(r, roles)).toBe(true));

  it.each([
    "/beheer/intake-regels", "/beheer/tarieven", "/beheer/bedrijf",
    "/medewerkers", "/onderaannemers", "/kandidaten",
    "/inkooporders", "/goedkeuring", "/rapportage",
  ])("geen toegang tot %s", (r) => expect(allow(r, roles)).toBe(false));
});

describe("manager — alles toegestaan", () => {
  const roles = ["manager"];
  it.each(Object.keys(ROUTE_ACCESS))(
    "wel toegang tot %s", (r) => expect(allow(r, roles)).toBe(true),
  );
});

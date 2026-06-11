import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  matchMonteurs,
  matchProjecten,
  normalizeNummer,
  normalizeText,
  type PlannerMonteur,
  type PlannerProject,
  type UrenappMonteur,
  type UrenappProject,
} from "./matcher.ts";

const P = (o: Partial<UrenappProject>): UrenappProject => ({
  id: "u1", nummer: "", naam: "", projectjaar: null, planner_project_id: null, ...o,
});
const PP = (o: Partial<PlannerProject>): PlannerProject => ({
  planner_id: "p1", urenapp_project_id: null, nummer: "", naam: "", locatie: null, jaar: null, ...o,
});
const M = (o: Partial<UrenappMonteur>): UrenappMonteur => ({
  id: "m1", full_name: "", planner_monteur_id: null, type: null, ...o,
});
const PM = (o: Partial<PlannerMonteur>): PlannerMonteur => ({
  planner_id: "pm1", urenapp_profile_id: null, naam: "", type: null, actief: true, ...o,
});

Deno.test("normalize: numeric strips leading zeros", () => {
  assertEquals(normalizeNummer("0295591"), "295591");
  assertEquals(normalizeNummer("295591"), "295591");
  assertEquals(normalizeNummer("00000"), "0");
  assertEquals(normalizeNummer("TV-123"), "tv-123");
});

Deno.test("normalize: text lowercases, strips accents, collapses spaces", () => {
  assertEquals(normalizeText("  José  van der   Berg "), "jose van der berg");
  assertEquals(normalizeText("É"), "e");
});

Deno.test("project: exact match via leading-zero numeric (0295591)", () => {
  const r = matchProjecten(
    [P({ id: "u", nummer: "0295591", naam: "Station Zuid", projectjaar: 2025, planner_project_id: "p" })],
    [PP({ planner_id: "p", urenapp_project_id: "u", nummer: "295591", naam: "Station Zuid", jaar: 2025 })],
  );
  assertEquals(r[0].status, "exact");
  assertEquals(r[0].afwijkingen.length, 0);
});

Deno.test("project: uppercase nummer matches lowercase", () => {
  const r = matchProjecten(
    [P({ nummer: "TV-ABC", naam: "X" })],
    [PP({ nummer: "tv-abc", naam: "X" })],
  );
  assertEquals(r[0].status, "exact");
});

Deno.test("project: duplicate normalized nummer → conflict", () => {
  const r = matchProjecten(
    [P({ nummer: "0123", naam: "A" })],
    [PP({ planner_id: "a", nummer: "123" }), PP({ planner_id: "b", nummer: "0123" })],
  );
  assertEquals(r[0].status, "conflict");
});

Deno.test("project: bestaande verschillende koppeling → conflict", () => {
  const r = matchProjecten(
    [P({ id: "u", nummer: "100", planner_project_id: "other" })],
    [PP({ planner_id: "p", nummer: "100" })],
  );
  assertEquals(r[0].status, "conflict");
});

Deno.test("project: planner al gekoppeld aan andere urenapp → conflict", () => {
  const r = matchProjecten(
    [P({ id: "u", nummer: "100" })],
    [PP({ planner_id: "p", urenapp_project_id: "ander", nummer: "100" })],
  );
  assertEquals(r[0].status, "conflict");
});

Deno.test("project: alleen unieke naamovereenkomst → waarschijnlijk", () => {
  const r = matchProjecten(
    [P({ nummer: "999", naam: "Onderstation Noord" })],
    [PP({ nummer: "111", naam: "Onderstation Noord" })],
  );
  assertEquals(r[0].status, "waarschijnlijk");
});

Deno.test("project: niets → geen_match", () => {
  const r = matchProjecten([P({ nummer: "X", naam: "Y" })], [PP({ nummer: "Z", naam: "Q" })]);
  assertEquals(r[0].status, "geen_match");
});

Deno.test("project: accenten in naam tellen mee als gelijk", () => {
  const r = matchProjecten(
    [P({ nummer: "1", naam: "José" })],
    [PP({ nummer: "2", naam: "Jose" })],
  );
  assertEquals(r[0].status, "waarschijnlijk");
});

Deno.test("project: jaarverschil staat in afwijkingen", () => {
  const r = matchProjecten(
    [P({ nummer: "1", naam: "A", projectjaar: 2024 })],
    [PP({ nummer: "1", naam: "A", jaar: 2025 })],
  );
  assertEquals(r[0].status, "exact");
  assertEquals(r[0].afwijkingen.some((d) => d.veld === "jaar"), true);
});

Deno.test("monteur: unieke naam + zelfde type → exact", () => {
  const r = matchMonteurs(
    [M({ full_name: "Jan de Vries", type: "monteur" })],
    [PM({ naam: "Jan de Vries", type: "monteur" })],
  );
  assertEquals(r[0].status, "exact");
});

Deno.test("monteur: unieke naam, typeverschil → waarschijnlijk", () => {
  const r = matchMonteurs(
    [M({ full_name: "Jan", type: "monteur" })],
    [PM({ naam: "Jan", type: "schakelmonteur" })],
  );
  assertEquals(r[0].status, "waarschijnlijk");
});

Deno.test("monteur: dubbele naam in Planner → conflict", () => {
  const r = matchMonteurs(
    [M({ full_name: "Jan" })],
    [PM({ planner_id: "a", naam: "Jan" }), PM({ planner_id: "b", naam: "JAN" })],
  );
  assertEquals(r[0].status, "conflict");
});

Deno.test("monteur: bestaande afwijkende koppeling → conflict", () => {
  const r = matchMonteurs(
    [M({ id: "u", full_name: "Jan", planner_monteur_id: "other" })],
    [PM({ planner_id: "p", naam: "Jan" })],
  );
  assertEquals(r[0].status, "conflict");
});

Deno.test("monteur: geen match → geen_match", () => {
  const r = matchMonteurs([M({ full_name: "Jan" })], [PM({ naam: "Piet" })]);
  assertEquals(r[0].status, "geen_match");
});

Deno.test("monteur: accenten gelijkgesteld", () => {
  const r = matchMonteurs(
    [M({ full_name: "José", type: "monteur" })],
    [PM({ naam: "Jose", type: "monteur" })],
  );
  assertEquals(r[0].status, "exact");
});

// ── Regressietests fase 1.1 ─────────────────────────────────────────────────

Deno.test("project: wederzijdse ID-koppeling → exact, ook bij afwijkend nummer", () => {
  const r = matchProjecten(
    [P({ id: "u1", nummer: "0295591", naam: "Clakenweg", planner_project_id: "p1" })],
    [PP({ planner_id: "p1", urenapp_project_id: "u1", nummer: "TOTAAL-ANDERS", naam: "x" })],
  );
  assertEquals(r[0].status, "exact");
  assertEquals(r[0].reden, "Wederzijdse ID-koppeling");
});

Deno.test("project: eenzijdige ID (urenapp→Planner), Planner-kant leeg → exact (herstel)", () => {
  const r = matchProjecten(
    [P({ id: "u1", nummer: "100", planner_project_id: "p1" })],
    [PP({ planner_id: "p1", urenapp_project_id: null, nummer: "100" })],
  );
  assertEquals(r[0].status, "exact");
});

Deno.test("project: eenzijdige ID (Planner→urenapp), urenapp-kant leeg → exact (herstel)", () => {
  const r = matchProjecten(
    [P({ id: "u1", nummer: "100", planner_project_id: null })],
    [PP({ planner_id: "p1", urenapp_project_id: "u1", nummer: "100" })],
  );
  assertEquals(r[0].status, "exact");
});

Deno.test("project: afwijkende ID-koppeling (planner wijst naar andere urenapp) → conflict", () => {
  const r = matchProjecten(
    [P({ id: "u1", nummer: "100", planner_project_id: "p1" })],
    [PP({ planner_id: "p1", urenapp_project_id: "ander", nummer: "100" })],
  );
  assertEquals(r[0].status, "conflict");
});

Deno.test("project: urenapp.planner_project_id verwijst naar onbekend Planner-record → conflict", () => {
  const r = matchProjecten(
    [P({ id: "u1", nummer: "100", planner_project_id: "ontbreekt" })],
    [PP({ planner_id: "p1", nummer: "100" })],
  );
  assertEquals(r[0].status, "conflict");
});

Deno.test("project: DTO-veldnamen (nummer/naam/locatie/jaar) worden gebruikt — niet case_nummer", () => {
  // Als de matcher DB-kolomnamen zou lezen zou nummer "" zijn → geen match.
  // Hier valideren we dat een correcte DTO matched op nummer.
  const r = matchProjecten(
    [P({ nummer: "0295591", naam: "Clakenweg" })],
    [PP({ planner_id: "p1", nummer: "295591", naam: "Clakenweg", locatie: "Elburg", jaar: 2026 })],
  );
  assertEquals(r[0].status, "exact");
});

Deno.test("monteur: rolmapping — urenapp 'montagemonteur' matched Planner 'montagemonteur' exact (Ali Sabri)", () => {
  const r = matchMonteurs(
    [M({ full_name: "Ali Sabri", type: "montagemonteur" })],
    [PM({ naam: "Ali Sabri", type: "montagemonteur" })],
  );
  assertEquals(r[0].status, "exact");
});

Deno.test("monteur: rolmapping — urenapp 'schakelmonteur' bij Planner 'schakelmonteur' → exact", () => {
  const r = matchMonteurs(
    [M({ full_name: "Yazan Jaber", type: "schakelmonteur" })],
    [PM({ naam: "Yazan Jaber", type: "schakelmonteur" })],
  );
  assertEquals(r[0].status, "exact");
});

Deno.test("monteur: typeverschil montagemonteur vs schakelmonteur → waarschijnlijk", () => {
  const r = matchMonteurs(
    [M({ full_name: "Mohammed Aamarou", type: "montagemonteur" })],
    [PM({ naam: "Mohammed Aamarou", type: "schakelmonteur" })],
  );
  assertEquals(r[0].status, "waarschijnlijk");
});

Deno.test("monteur: wederzijdse ID-koppeling → exact, ook bij naamverschil", () => {
  const r = matchMonteurs(
    [M({ id: "u1", full_name: "Jan", planner_monteur_id: "p1" })],
    [PM({ planner_id: "p1", urenapp_profile_id: "u1", naam: "Jan-Anders" })],
  );
  assertEquals(r[0].status, "exact");
});

Deno.test("monteur: eenzijdige ID (Planner→urenapp) → exact (herstel)", () => {
  const r = matchMonteurs(
    [M({ id: "u1", full_name: "Jan" })],
    [PM({ planner_id: "p1", urenapp_profile_id: "u1", naam: "Jan" })],
  );
  assertEquals(r[0].status, "exact");
});

Deno.test("matcher emit nooit status 'uitgesloten' (filtering vóór matcher)", () => {
  const r = matchProjecten(
    [{ id: "u1", nummer: "001", naam: "Test", projectjaar: 2026, planner_project_id: null }],
    [{ planner_id: "p1", urenapp_project_id: null, nummer: "001", naam: "Test", locatie: null, jaar: 2026 }],
  );
  for (const item of r) {
    if (item.status === "uitgesloten") throw new Error("matcher mag geen 'uitgesloten' produceren");
  }
});

Deno.test("matcher geeft geen_match alleen op basis van urenapp-input (uitgesloten worden vooraf gefilterd)", () => {
  // Simuleer dat het project NIET als urenapp-input wordt aangeboden (omdat uitgesloten).
  // Resultaat: geen rij in matcher-output → kan dus niet als geen_match worden geteld.
  const r = matchProjecten([], [{ planner_id: "p1", urenapp_project_id: null, nummer: "999", naam: "X", locatie: null, jaar: 2026 }]);
  assertEquals(r.length, 0);
});

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

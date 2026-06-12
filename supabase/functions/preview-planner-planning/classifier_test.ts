import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classify, parseDateRange, type BestaandePlanningRow, type PlannerPlanningItem, type ProfileMini, type ProjectMini } from "./classifier.ts";

const proj: ProjectMini = { id: "P1", nummer: "0001", naam: "Alpha", planner_project_id: "pp1", planner_sync_enabled: true, planner_sync_exclusion_reason: null };
const projUit: ProjectMini = { id: "P2", nummer: "0002", naam: "Beta", planner_project_id: "pp2", planner_sync_enabled: false, planner_sync_exclusion_reason: "historisch_afgerond" };
const monteur: ProfileMini = { id: "M1", full_name: "Ali", planner_monteur_id: "pm1" };
const monteur2: ProfileMini = { id: "M2", full_name: "Bea", planner_monteur_id: "pm2" };

function pItem(over: Partial<PlannerPlanningItem> = {}): PlannerPlanningItem {
  return {
    external_id: "ext-1",
    planning_cel_id: "cel-1",
    planner_project_id: "pp1",
    planner_monteur_id: "pm1",
    urenapp_project_id: "P1",
    urenapp_profile_id: "M1",
    datum: "2026-06-15",
    activiteit: "Montage",
    kleur: "c1",
    notitie: "",
    ...over,
  };
}
function bRow(over: Partial<BestaandePlanningRow> = {}): BestaandePlanningRow {
  return {
    id: "R1", datum: "2026-06-15", starttijd: "07:00:00", eindtijd: "16:00:00",
    notitie: "", project_id: "P1", medewerker_id: "M1",
    activiteit: "Montage", activiteit_kleur: "c1",
    external_source: "terrevolt_planner", external_id: "ext-1",
    ...over,
  };
}

Deno.test("nieuw als geen bestaande externe regel", () => {
  const res = classify({ datum_vanaf:"2026-06-15", datum_tot:"2026-06-15", planner:[pItem()], uitgesloten:[], bestaande:[], projecten:[proj], profielen:[monteur] });
  assertEquals(res.regels[0].status, "nieuw");
  assertEquals(res.aantallen.nieuw, 1);
});

Deno.test("ongewijzigd bij gelijke velden", () => {
  const res = classify({ datum_vanaf:"2026-06-15", datum_tot:"2026-06-15", planner:[pItem()], uitgesloten:[], bestaande:[bRow()], projecten:[proj], profielen:[monteur] });
  assertEquals(res.regels[0].status, "ongewijzigd");
  assertEquals(res.regels[0].verschillen.length, 0);
});

Deno.test("gewijzigd bij andere activiteit", () => {
  const res = classify({ datum_vanaf:"2026-06-15", datum_tot:"2026-06-15", planner:[pItem({ activiteit:"Schakelen" })], uitgesloten:[], bestaande:[bRow()], projecten:[proj], profielen:[monteur] });
  assertEquals(res.regels[0].status, "gewijzigd");
  assertEquals(res.regels[0].verschillen.some(v => v.veld === "activiteit"), true);
});

Deno.test("conflict bij overlap handmatige planning", () => {
  const handmatig = bRow({ id:"H1", external_source:null, external_id:null, project_id:"P1", medewerker_id:"M1" });
  const res = classify({ datum_vanaf:"2026-06-15", datum_tot:"2026-06-15", planner:[pItem()], uitgesloten:[], bestaande:[handmatig], projecten:[proj], profielen:[monteur] });
  assertEquals(res.regels[0].status, "conflict");
  assertEquals(res.regels[0].conflict_redenen.includes("overlap_handmatige_planning"), true);
});

Deno.test("conflict bij dubbele external_id binnen planner", () => {
  const res = classify({ datum_vanaf:"2026-06-15", datum_tot:"2026-06-15",
    planner:[pItem(), pItem({ datum:"2026-06-16" })], uitgesloten:[], bestaande:[], projecten:[proj], profielen:[monteur] });
  assertEquals(res.regels.every(r => r.status === "conflict"), true);
  assertEquals(res.regels.every(r => r.conflict_redenen.includes("dubbele_external_id_in_planner")), true);
});

Deno.test("conflict bij monteur op meerdere projecten zelfde datum", () => {
  const proj2: ProjectMini = { id:"P3", nummer:"0003", naam:"Gamma", planner_project_id:"pp3", planner_sync_enabled:true, planner_sync_exclusion_reason:null };
  const a = pItem({ external_id:"e-a", planner_project_id:"pp1", urenapp_project_id:"P1" });
  const b = pItem({ external_id:"e-b", planner_project_id:"pp3", urenapp_project_id:"P3" });
  const res = classify({ datum_vanaf:"2026-06-15", datum_tot:"2026-06-15", planner:[a,b], uitgesloten:[], bestaande:[], projecten:[proj, proj2], profielen:[monteur] });
  assertEquals(res.regels.every(r => r.conflict_redenen.includes("monteur_meerdere_projecten_zelfde_datum")), true);
});

Deno.test("conflict bij uitgesloten project", () => {
  const it = pItem({ planner_project_id:"pp2", urenapp_project_id:"P2" });
  const res = classify({ datum_vanaf:"2026-06-15", datum_tot:"2026-06-15", planner:[it], uitgesloten:[], bestaande:[], projecten:[projUit], profielen:[monteur] });
  assertEquals(res.regels[0].status, "conflict");
  assertEquals(res.regels[0].conflict_redenen.some(r => r.startsWith("uitgesloten_project")), true);
});

Deno.test("conflict bij ontbrekend urenapp-profiel", () => {
  const it = pItem({ planner_monteur_id:"pm-onbekend", urenapp_profile_id:null });
  const res = classify({ datum_vanaf:"2026-06-15", datum_tot:"2026-06-15", planner:[it], uitgesloten:[], bestaande:[], projecten:[proj], profielen:[] });
  assertEquals(res.regels[0].status, "conflict");
  assertEquals(res.regels[0].conflict_redenen.includes("ontbrekend_urenapp_profiel"), true);
});

Deno.test("verwijderd_in_planner alleen binnen datumbereik", () => {
  const oud = bRow({ id:"R2", external_id:"weg-1", datum:"2026-06-20" });
  const buiten = bRow({ id:"R3", external_id:"weg-2", datum:"2026-08-01" });
  const res = classify({ datum_vanaf:"2026-06-15", datum_tot:"2026-06-30", planner:[], uitgesloten:[], bestaande:[oud, buiten], projecten:[proj], profielen:[monteur] });
  assertEquals(res.regels.length, 1);
  assertEquals(res.regels[0].status, "verwijderd_in_planner");
  assertEquals(res.regels[0].external_id, "weg-1");
});

Deno.test("uitgesloten Planner-items tellen apart, geen foutstatus", () => {
  const res = classify({
    datum_vanaf:"2026-06-15", datum_tot:"2026-06-15",
    planner:[pItem()], uitgesloten:[
      { planner_monteur_id:"pm-x", planning_cel_id:"cel-x", datum:"2026-06-15", reden:"sporadisch_ingehuurd" },
      { planner_monteur_id:"pm-y", planning_cel_id:"cel-y", datum:"2026-06-15", reden:"sporadisch_ingehuurd" },
    ],
    bestaande:[], projecten:[proj], profielen:[monteur],
  });
  assertEquals(res.aantallen.uitgesloten_info, 2);
  assertEquals(res.aantallen.conflict, 0);
});

Deno.test("parseDateRange: grenzen", () => {
  assertEquals(parseDateRange({ datum_vanaf:"2026-06-15", datum_tot:"2026-06-15" }).ok, true);
  // 93 dagen inclusief = end - start = 92
  const ok93 = parseDateRange({ datum_vanaf:"2026-01-01", datum_tot:"2026-04-03" });
  assertEquals(ok93.ok, true);
  // 94 dagen → fout
  const tooBig = parseDateRange({ datum_vanaf:"2026-01-01", datum_tot:"2026-04-04" });
  assertEquals(tooBig.ok, false);
  // omgekeerde volgorde
  assertEquals(parseDateRange({ datum_vanaf:"2026-06-20", datum_tot:"2026-06-15" }).ok, false);
  // ongeldig formaat
  assertEquals(parseDateRange({ datum_vanaf:"15-06-2026", datum_tot:"2026-06-20" }).ok, false);
  // missend veld
  assertEquals(parseDateRange({ datum_vanaf:"2026-06-15" }).ok, false);
});

Deno.test("monteur2 ongebruikt blijft niet hangen", () => {
  // dummy om TS unused-warning te onderdrukken
  assertEquals(monteur2.id, "M2");
});

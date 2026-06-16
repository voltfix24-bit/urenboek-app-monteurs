// Pure classifier voor planning-preview. Geen Supabase, geen fetch.
// Vergelijkt Planner-respons met bestaande public.planning binnen een datumbereik.

export interface PlannerPlanningItem {
  external_id: string;
  planning_cel_id: string;
  planner_project_id: string;
  planner_monteur_id: string;
  urenapp_project_id: string | null;
  urenapp_profile_id: string | null;
  datum: string; // YYYY-MM-DD
  activiteit: string | null;
  kleur: string | null;
  notitie: string | null;
}

export interface PlannerUitgeslotenItem {
  planner_monteur_id: string;
  planning_cel_id: string;
  datum: string;
  reden: string;
}

export interface BestaandePlanningRow {
  id: string;
  datum: string;
  starttijd: string; // HH:MM:SS
  eindtijd: string;
  notitie: string;
  project_id: string;
  medewerker_id: string;
  activiteit: string | null;
  activiteit_kleur: string | null;
  external_source: string | null;
  external_id: string | null;
  external_deleted_at?: string | null;
}

export interface ProjectMini {
  id: string;
  nummer: string;
  naam: string;
  planner_project_id: string | null;
  planner_sync_enabled: boolean;
  planner_sync_exclusion_reason: string | null;
}
export interface ProfileMini {
  id: string;
  full_name: string;
  planner_monteur_id: string | null;
}

export type PreviewStatus =
  | "nieuw"
  | "ongewijzigd"
  | "gewijzigd"
  | "conflict"
  | "verwijderd_in_planner";

export interface VerschilVeld {
  veld: string;
  huidig: unknown;
  voorgesteld: unknown;
}

export interface PreviewRegel {
  status: PreviewStatus;
  external_id: string;
  datum: string;
  planner_project_id: string;
  planner_monteur_id: string;
  urenapp_project_id: string | null;
  urenapp_profile_id: string | null;
  project_label: string | null;
  monteur_label: string | null;
  activiteit: string | null;
  kleur: string | null;
  notitie: string;
  voorgesteld: { starttijd: string; eindtijd: string };
  conflict_redenen: string[];
  verschillen: VerschilVeld[];
  bestaande_row: {
    id: string;
    datum: string;
    starttijd: string;
    eindtijd: string;
    activiteit: string | null;
    activiteit_kleur: string | null;
    notitie: string;
    project_id: string;
    medewerker_id: string;
  } | null;
}

export interface ClassifyResult {
  datum_vanaf: string;
  datum_tot: string;
  aantallen: {
    totaal_planner: number;
    nieuw: number;
    ongewijzigd: number;
    gewijzigd: number;
    conflict: number;
    verwijderd_in_planner: number;
    uitgesloten_info: number;
    bestaande_handmatig: number;
    bestaande_extern: number;
  };
  regels: PreviewRegel[];
  uitgesloten_info: PlannerUitgeslotenItem[];
}

export const VOORGESTELDE_START = "07:00";
export const VOORGESTELDE_EIND = "16:00";

function norm(s: string | null | undefined): string {
  return (s ?? "").trim();
}
function hhmm(t: string): string {
  // accepteer "07:00" of "07:00:00"
  return t.slice(0, 5);
}

export interface ClassifyInput {
  datum_vanaf: string;
  datum_tot: string;
  planner: PlannerPlanningItem[];
  uitgesloten: PlannerUitgeslotenItem[];
  bestaande: BestaandePlanningRow[];
  projecten: ProjectMini[];
  profielen: ProfileMini[];
}

export function classify(input: ClassifyInput): ClassifyResult {
  const { datum_vanaf, datum_tot, planner, uitgesloten, bestaande, projecten, profielen } = input;

  // Lookups
  const projByPlannerId = new Map<string, ProjectMini>();
  for (const p of projecten) if (p.planner_project_id) projByPlannerId.set(p.planner_project_id, p);
  const profByPlannerId = new Map<string, ProfileMini>();
  for (const p of profielen) if (p.planner_monteur_id) profByPlannerId.set(p.planner_monteur_id, p);
  const projById = new Map(projecten.map(p => [p.id, p]));
  const profById = new Map(profielen.map(p => [p.id, p]));

  // Bestaande externe regels by external_id (binnen datumbereik)
  const externByExternalId = new Map<string, BestaandePlanningRow[]>();
  for (const r of bestaande) {
    if (r.external_source === "terrevolt_planner" && r.external_id) {
      const arr = externByExternalId.get(r.external_id) ?? [];
      arr.push(r);
      externByExternalId.set(r.external_id, arr);
    }
  }

  // Handmatige regels per (medewerker_id, datum) voor overlap-detectie
  const handmatigPerMonteurDatum = new Map<string, BestaandePlanningRow[]>();
  for (const r of bestaande) {
    if (r.external_source !== "terrevolt_planner") {
      const k = `${r.medewerker_id}|${r.datum}`;
      const arr = handmatigPerMonteurDatum.get(k) ?? [];
      arr.push(r);
      handmatigPerMonteurDatum.set(k, arr);
    }
  }

  // Dubbele external_id binnen Planner-respons
  const externalIdTeller = new Map<string, number>();
  for (const it of planner) externalIdTeller.set(it.external_id, (externalIdTeller.get(it.external_id) ?? 0) + 1);

  // (Bewust verwijderd: monteur_meerdere_projecten_zelfde_datum)
  // Planner mag een monteur op meerdere cellen of projecten op dezelfde dag plannen.
  // Idempotentie wordt afgedwongen via de unieke combinatie external_source + external_id.

  const regels: PreviewRegel[] = [];

  for (const it of planner) {
    const conflict: string[] = [];
    const verschillen: VerschilVeld[] = [];

    // Resolve urenapp-records (gebruik mapping van planner_id naar lokaal record; fallback op hint uit Planner)
    let proj = projByPlannerId.get(it.planner_project_id) ?? null;
    if (!proj && it.urenapp_project_id) proj = projById.get(it.urenapp_project_id) ?? null;
    let prof = profByPlannerId.get(it.planner_monteur_id) ?? null;
    if (!prof && it.urenapp_profile_id) prof = profById.get(it.urenapp_profile_id) ?? null;

    if (!proj) conflict.push("ontbrekend_urenapp_project");
    if (!prof) conflict.push("ontbrekend_urenapp_profiel");
    if (proj && proj.planner_sync_enabled === false) {
      conflict.push(`uitgesloten_project:${proj.planner_sync_exclusion_reason ?? "anders"}`);
    }
    if ((externalIdTeller.get(it.external_id) ?? 0) > 1) conflict.push("dubbele_external_id_in_planner");


    // Overlap met handmatige planning op dezelfde monteur+datum
    if (prof) {
      const handmatig = handmatigPerMonteurDatum.get(`${prof.id}|${it.datum}`) ?? [];
      if (handmatig.length > 0) {
        conflict.push("overlap_handmatige_planning");
      }
    }

    // Bestaande externe regel met dezelfde external_id?
    const bestaandeMatches = externByExternalId.get(it.external_id) ?? [];
    const bestaande_row = bestaandeMatches[0] ?? null;

    let status: PreviewStatus;
    if (conflict.length > 0) {
      status = "conflict";
    } else if (!bestaande_row) {
      status = "nieuw";
    } else {
      // Vergelijk velden
      if (proj && bestaande_row.project_id !== proj.id) {
        verschillen.push({ veld: "project_id", huidig: bestaande_row.project_id, voorgesteld: proj.id });
      }
      if (prof && bestaande_row.medewerker_id !== prof.id) {
        verschillen.push({ veld: "medewerker_id", huidig: bestaande_row.medewerker_id, voorgesteld: prof.id });
      }
      if (bestaande_row.datum !== it.datum) {
        verschillen.push({ veld: "datum", huidig: bestaande_row.datum, voorgesteld: it.datum });
      }
      if (hhmm(bestaande_row.starttijd) !== VOORGESTELDE_START) {
        verschillen.push({ veld: "starttijd", huidig: hhmm(bestaande_row.starttijd), voorgesteld: VOORGESTELDE_START });
      }
      if (hhmm(bestaande_row.eindtijd) !== VOORGESTELDE_EIND) {
        verschillen.push({ veld: "eindtijd", huidig: hhmm(bestaande_row.eindtijd), voorgesteld: VOORGESTELDE_EIND });
      }
      if (norm(bestaande_row.activiteit) !== norm(it.activiteit)) {
        verschillen.push({ veld: "activiteit", huidig: bestaande_row.activiteit, voorgesteld: it.activiteit });
      }
      if (norm(bestaande_row.activiteit_kleur) !== norm(it.kleur)) {
        verschillen.push({ veld: "kleur", huidig: bestaande_row.activiteit_kleur, voorgesteld: it.kleur });
      }
      if (norm(bestaande_row.notitie) !== norm(it.notitie)) {
        verschillen.push({ veld: "notitie", huidig: bestaande_row.notitie, voorgesteld: it.notitie ?? "" });
      }
      status = verschillen.length === 0 ? "ongewijzigd" : "gewijzigd";
    }

    regels.push({
      status,
      external_id: it.external_id,
      datum: it.datum,
      planner_project_id: it.planner_project_id,
      planner_monteur_id: it.planner_monteur_id,
      urenapp_project_id: proj?.id ?? null,
      urenapp_profile_id: prof?.id ?? null,
      project_label: proj ? `${proj.nummer} — ${proj.naam}` : null,
      monteur_label: prof?.full_name ?? null,
      activiteit: it.activiteit,
      kleur: it.kleur,
      notitie: it.notitie ?? "",
      voorgesteld: { starttijd: VOORGESTELDE_START, eindtijd: VOORGESTELDE_EIND },
      conflict_redenen: conflict,
      verschillen,
      bestaande_row: bestaande_row
        ? {
            id: bestaande_row.id,
            datum: bestaande_row.datum,
            starttijd: hhmm(bestaande_row.starttijd),
            eindtijd: hhmm(bestaande_row.eindtijd),
            activiteit: bestaande_row.activiteit,
            activiteit_kleur: bestaande_row.activiteit_kleur,
            notitie: bestaande_row.notitie,
            project_id: bestaande_row.project_id,
            medewerker_id: bestaande_row.medewerker_id,
          }
        : null,
    });
  }

  // Verwijderd_in_planner: externe regels in datumbereik wiens external_id niet in Planner staat
  const plannerExternalIds = new Set(planner.map(p => p.external_id));
  for (const r of bestaande) {
    if (r.external_source !== "terrevolt_planner" || !r.external_id) continue;
    if (r.datum < datum_vanaf || r.datum > datum_tot) continue;
    if (plannerExternalIds.has(r.external_id)) continue;
    const proj = projById.get(r.project_id) ?? null;
    const prof = profById.get(r.medewerker_id) ?? null;
    regels.push({
      status: "verwijderd_in_planner",
      external_id: r.external_id,
      datum: r.datum,
      planner_project_id: proj?.planner_project_id ?? "",
      planner_monteur_id: prof?.planner_monteur_id ?? "",
      urenapp_project_id: r.project_id,
      urenapp_profile_id: r.medewerker_id,
      project_label: proj ? `${proj.nummer} — ${proj.naam}` : null,
      monteur_label: prof?.full_name ?? null,
      activiteit: r.activiteit,
      kleur: r.activiteit_kleur,
      notitie: r.notitie,
      voorgesteld: { starttijd: VOORGESTELDE_START, eindtijd: VOORGESTELDE_EIND },
      conflict_redenen: [],
      verschillen: [],
      bestaande_row: {
        id: r.id,
        datum: r.datum,
        starttijd: hhmm(r.starttijd),
        eindtijd: hhmm(r.eindtijd),
        activiteit: r.activiteit,
        activiteit_kleur: r.activiteit_kleur,
        notitie: r.notitie,
        project_id: r.project_id,
        medewerker_id: r.medewerker_id,
      },
    });
  }

  const tel = (s: PreviewStatus) => regels.filter(r => r.status === s).length;
  const bestaandeHandmatig = bestaande.filter(r => r.external_source !== "terrevolt_planner").length;
  const bestaandeExtern = bestaande.filter(r => r.external_source === "terrevolt_planner").length;

  return {
    datum_vanaf,
    datum_tot,
    aantallen: {
      totaal_planner: planner.length,
      nieuw: tel("nieuw"),
      ongewijzigd: tel("ongewijzigd"),
      gewijzigd: tel("gewijzigd"),
      conflict: tel("conflict"),
      verwijderd_in_planner: tel("verwijderd_in_planner"),
      uitgesloten_info: uitgesloten.length,
      bestaande_handmatig: bestaandeHandmatig,
      bestaande_extern: bestaandeExtern,
    },
    regels,
    uitgesloten_info: uitgesloten,
  };
}

// ─── Input-validatie ──────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ParsedRange { datum_vanaf: string; datum_tot: string }
export type RangeError =
  | { ok: false; error: string };
export type RangeOk = { ok: true; value: ParsedRange };

export function parseDateRange(body: any): RangeOk | RangeError {
  if (!body || typeof body !== "object") return { ok: false, error: "Ongeldige body" };
  const { datum_vanaf, datum_tot } = body;
  if (typeof datum_vanaf !== "string" || !DATE_RE.test(datum_vanaf)) return { ok: false, error: "Ongeldige datum_vanaf" };
  if (typeof datum_tot !== "string" || !DATE_RE.test(datum_tot)) return { ok: false, error: "Ongeldige datum_tot" };
  const a = Date.parse(datum_vanaf + "T00:00:00Z");
  const b = Date.parse(datum_tot + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { ok: false, error: "Ongeldige datum" };
  if (b < a) return { ok: false, error: "datum_tot moet na datum_vanaf liggen" };
  const dagen = Math.round((b - a) / 86_400_000) + 1;
  if (dagen > 93) return { ok: false, error: "Maximaal 93 dagen toegestaan" };
  return { ok: true, value: { datum_vanaf, datum_tot } };
}

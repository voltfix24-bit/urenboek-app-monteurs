/**
 * Pure helpers voor de desktop-weekplanning met conceptmodus.
 * Weergavemodel: per (medewerker, datum) een cel. Een concept gaat vóór de gepubliceerde regel.
 * Wijzigt niets aan de tabel `planning`; schrijfacties gaan naar `planning_concept`.
 */
import { addWeeks, format, setISOWeek, startOfISOWeek } from "date-fns";
import { isBeschermdeRegel } from "@/lib/projectPlanningPublish";

export interface PlanningRij {
  id: string;
  medewerker_id: string;
  project_id: string;
  datum: string;
  starttijd: string;
  eindtijd: string;
  notitie: string;
  activiteit: string | null;
  activiteit_kleur: string | null;
  planning_group_id: string | null;
  collega_ids: string[] | null;
  external_source: string | null;
  sync_locked: boolean | null;
  werklocatie?: string | null;
  contactpersoon?: string | null;
  contact_telefoon?: string | null;
}

export type ConceptActie = "nieuw" | "wijzig" | "verwijder";

export interface ConceptRij {
  id: string;
  actie: ConceptActie;
  planning_id: string | null;
  medewerker_id: string;
  datum: string;
  project_id: string | null;
  starttijd: string | null;
  eindtijd: string | null;
  notitie: string | null;
  activiteit: string | null;
  activiteit_kleur: string | null;
  planning_group_id: string | null;
  collega_ids: string[] | null;
  werklocatie?: string | null;
  contactpersoon?: string | null;
  contact_telefoon?: string | null;
}

export type CelStatus = "leeg" | "pub" | "nieuw" | "gewijzigd" | "verwijderd";

export interface Cel {
  medewerker_id: string;
  datum: string;
  status: CelStatus;
  project_id: string | null;
  starttijd: string | null;
  eindtijd: string | null;
  notitie: string;
  activiteit: string | null;
  activiteit_kleur: string | null;
  planning_group_id: string | null;
  collega_ids: string[] | null;
  planning: PlanningRij | null;
  concept: ConceptRij | null;
  beschermd: boolean;
  werklocatie?: string | null;
  contactpersoon?: string | null;
  contact_telefoon?: string | null;
}

export interface MedewerkerBasis {
  id: string;
  full_name: string;
  vaste_vrije_dagen: number[];
  planning_partner_ids: string[];
}

export interface BeschikbaarheidBasis {
  id?: string;
  medewerker_id: string;
  datum_van: string;
  datum_tot: string;
  type: string;
  status: string;
}

/** "elders" = zzp'er werkt die dag voor een andere opdrachtgever (door manager ingevoerd). */
export type Afwezigheid = "verlof" | "ziek" | "vrij" | "elders";
export const ELDERS_TYPE = "elders";

export const PAUZE_MINUTEN = 60;
export const TIJDBLOKKEN: Array<[string, string]> = [["07:00", "16:00"], ["07:30", "16:30"], ["08:00", "17:00"]];

export const celKey = (medewerkerId: string, datum: string) => `${medewerkerId}|${datum}`;
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

/** Gelijk aan berekenUren in ManagerPlanning: klokuren − 60 min pauze, afgerond op halve uren. */
export function berekenUren(starttijd: string | null, eindtijd: string | null): number {
  const s = starttijd ? parseInt(starttijd.split(":")[0]) + parseFloat(starttijd.split(":")[1] || "0") / 60 : 7;
  const e = eindtijd ? parseInt(eindtijd.split(":")[0]) + parseFloat(eindtijd.split(":")[1] || "0") / 60 : s + 9;
  const productief = Math.max(0, e - s - 1);
  return Math.round(productief * 2) / 2;
}

export function bouwCellen(planning: PlanningRij[], concepten: ConceptRij[]): Map<string, Cel> {
  const cellen = new Map<string, Cel>();
  const perId = new Map(planning.map((p) => [p.id, p]));

  for (const p of planning) {
    const key = celKey(p.medewerker_id, p.datum);
    if (cellen.has(key)) continue;
    cellen.set(key, {
      medewerker_id: p.medewerker_id,
      datum: p.datum,
      status: "pub",
      project_id: p.project_id,
      starttijd: hhmm(p.starttijd),
      eindtijd: hhmm(p.eindtijd),
      notitie: p.notitie || "",
      activiteit: p.activiteit,
      activiteit_kleur: p.activiteit_kleur,
      planning_group_id: p.planning_group_id,
      collega_ids: p.collega_ids,
      planning: p,
      concept: null,
      beschermd: isBeschermdeRegel(p),
      werklocatie: p.werklocatie ?? null,
      contactpersoon: p.contactpersoon ?? null,
      contact_telefoon: p.contact_telefoon ?? null,
    });
  }

  for (const c of concepten) {
    const key = celKey(c.medewerker_id, c.datum);
    const doel = c.planning_id ? perId.get(c.planning_id) ?? cellen.get(key)?.planning ?? null : null;
    if (c.actie === "verwijder") {
      const basis = cellen.get(key);
      cellen.set(key, {
        ...(basis ?? {
          medewerker_id: c.medewerker_id, datum: c.datum, project_id: doel?.project_id ?? null,
          starttijd: hhmm(doel?.starttijd ?? null), eindtijd: hhmm(doel?.eindtijd ?? null), notitie: doel?.notitie ?? "",
          activiteit: doel?.activiteit ?? null, activiteit_kleur: doel?.activiteit_kleur ?? null,
          planning_group_id: doel?.planning_group_id ?? null, collega_ids: doel?.collega_ids ?? null,
          planning: doel, beschermd: doel ? isBeschermdeRegel(doel) : false,
        }),
        status: "verwijderd",
        concept: c,
      } as Cel);
      continue;
    }
    cellen.set(key, {
      medewerker_id: c.medewerker_id,
      datum: c.datum,
      status: c.actie === "nieuw" ? "nieuw" : "gewijzigd",
      project_id: c.project_id,
      starttijd: hhmm(c.starttijd),
      eindtijd: hhmm(c.eindtijd),
      notitie: c.notitie || "",
      activiteit: c.activiteit,
      activiteit_kleur: c.activiteit_kleur,
      planning_group_id: c.planning_group_id,
      collega_ids: c.collega_ids,
      planning: c.actie === "wijzig" ? doel : null,
      concept: c,
      beschermd: doel ? isBeschermdeRegel(doel) : false,
      werklocatie: c.werklocatie ?? null,
      contactpersoon: c.contactpersoon ?? null,
      contact_telefoon: c.contact_telefoon ?? null,
    });
  }
  return cellen;
}

/** Telt mee in uren/totalen (wat na publiceren zichtbaar is). */
export const celTelt = (cel: Cel | undefined): cel is Cel =>
  !!cel && (cel.status === "pub" || cel.status === "nieuw" || cel.status === "gewijzigd");

/** Bezet = er staat iets op deze dag (ook een te verwijderen regel). */
export const celBezet = (cel: Cel | undefined) => !!cel && cel.status !== "leeg";

export function bepaalAfwezigheid(med: MedewerkerBasis | undefined, datum: string, beschikbaarheid: BeschikbaarheidBasis[]): Afwezigheid | null {
  if (!med) return null;
  const b = beschikbaarheid.find((x) => x.medewerker_id === med.id && x.status === "goedgekeurd" && datum >= x.datum_van && datum <= x.datum_tot);
  if (b) return b.type === "ziek" ? "ziek" : b.type === ELDERS_TYPE ? "elders" : "verlof";
  const dag = new Date(`${datum}T12:00:00`).getDay();
  if (med.vaste_vrije_dagen?.includes(dag)) return "vrij";
  return null;
}

/** Vaste vrije dagen zijn informatief; expliciete afwezigheid blokkeert inplannen. */
export const blokkeertInplannen = (afwezigheid: Afwezigheid | null): boolean =>
  afwezigheid !== null && afwezigheid !== "vrij";

export const AFWEZIG_LABEL: Record<Afwezigheid, string> = { verlof: "verlof", ziek: "ziek", vrij: "vaste vrije dag", elders: "andere opdracht" };

export interface Doel { medewerker_id: string; datum: string }
export interface Overgeslagen extends Doel { reden: string }

export function bepaalDoelen(
  medewerkerIds: string[],
  datums: string[],
  cellen: Map<string, Cel>,
  medewerkers: MedewerkerBasis[],
  beschikbaarheid: BeschikbaarheidBasis[],
): { doelen: Doel[]; overgeslagen: Overgeslagen[] } {
  const doelen: Doel[] = [];
  const overgeslagen: Overgeslagen[] = [];
  const medMap = new Map(medewerkers.map((m) => [m.id, m]));
  for (const datum of [...datums].sort()) {
    for (const medewerker_id of medewerkerIds) {
      const afw = bepaalAfwezigheid(medMap.get(medewerker_id), datum, beschikbaarheid);
      if (afw && blokkeertInplannen(afw)) { overgeslagen.push({ medewerker_id, datum, reden: AFWEZIG_LABEL[afw] }); continue; }
      if (celBezet(cellen.get(celKey(medewerker_id, datum)))) { overgeslagen.push({ medewerker_id, datum, reden: "al ingepland" }); continue; }
      doelen.push({ medewerker_id, datum });
    }
  }
  return { doelen, overgeslagen };
}

export interface PlanWaarden {
  project_id: string; starttijd: string; eindtijd: string; notitie: string;
  /** Alleen bij uitleen-projecten; optioneel en zonder validatie. */
  werklocatie?: string | null; contactpersoon?: string | null; contact_telefoon?: string | null;
}

/** Uitleenvelden alleen meenemen als ze in de waarden staan (houdt bestaande rijen ongewijzigd). */
const uitleenVelden = (w: PlanWaarden) =>
  "werklocatie" in w || "contactpersoon" in w || "contact_telefoon" in w
    ? { werklocatie: w.werklocatie ?? null, contactpersoon: w.contactpersoon ?? null, contact_telefoon: w.contact_telefoon ?? null }
    : {};

/** Concept-rijen (actie nieuw). Meerdere medewerkers op één dag = één ploeg (gedeelde group id + collega_ids). */
export function bouwNieuwConcepten(doelen: Doel[], waarden: PlanWaarden, createdBy: string, uuid: () => string = () => crypto.randomUUID()) {
  const perDatum = new Map<string, string[]>();
  doelen.forEach((d) => perDatum.set(d.datum, [...(perDatum.get(d.datum) ?? []), d.medewerker_id]));
  return Array.from(perDatum.entries()).flatMap(([datum, meds]) => {
    const groupId = meds.length > 1 ? uuid() : null;
    return meds.map((medewerker_id) => ({
      actie: "nieuw" as const,
      planning_id: null,
      medewerker_id,
      datum,
      project_id: waarden.project_id,
      starttijd: waarden.starttijd,
      eindtijd: waarden.eindtijd,
      notitie: waarden.notitie,
      planning_group_id: groupId,
      collega_ids: meds.filter((m) => m !== medewerker_id),
      created_by: createdBy,
      ...uitleenVelden(waarden),
    }));
  });
}

export type BewerkActie =
  | { type: "update-concept"; id: string; patch: PlanWaarden }
  | { type: "upsert"; rij: Record<string, unknown> }
  | { type: "beschermd" }
  | { type: "niets" };

export function actieVoorBewerken(cel: Cel, waarden: PlanWaarden, createdBy: string): BewerkActie {
  if (cel.beschermd) return { type: "beschermd" };
  if (cel.status === "nieuw" && cel.concept) {
    return { type: "update-concept", id: cel.concept.id, patch: { ...waarden } };
  }
  if ((cel.status === "pub" || cel.status === "gewijzigd" || cel.status === "verwijderd") && cel.planning) {
    return {
      type: "upsert",
      rij: {
        actie: "wijzig", planning_id: cel.planning.id, medewerker_id: cel.medewerker_id, datum: cel.datum,
        project_id: waarden.project_id, starttijd: waarden.starttijd, eindtijd: waarden.eindtijd, notitie: waarden.notitie,
        activiteit: cel.activiteit, activiteit_kleur: cel.activiteit_kleur,
        planning_group_id: cel.planning_group_id, collega_ids: cel.collega_ids, created_by: createdBy,
        werklocatie: cel.werklocatie ?? null, contactpersoon: cel.contactpersoon ?? null, contact_telefoon: cel.contact_telefoon ?? null,
        ...uitleenVelden(waarden),
      },
    };
  }
  return { type: "niets" };
}

export function actieVoorVerwijderen(cel: Cel, createdBy: string): BewerkActie | { type: "delete-concept"; id: string } {
  if (cel.status === "leeg" || cel.status === "verwijderd") return { type: "niets" };
  if (cel.status === "nieuw" && cel.concept) return { type: "delete-concept", id: cel.concept.id };
  if (cel.beschermd) return { type: "beschermd" };
  if (!cel.planning) return { type: "niets" };
  return {
    type: "upsert",
    rij: {
      actie: "verwijder", planning_id: cel.planning.id, medewerker_id: cel.medewerker_id, datum: cel.datum,
      project_id: null, starttijd: null, eindtijd: null, notitie: "", activiteit: null, activiteit_kleur: null,
      planning_group_id: null, collega_ids: null, created_by: createdBy,
    },
  };
}

export function telConcepten(concepten: ConceptRij[]) {
  return {
    nieuw: concepten.filter((c) => c.actie === "nieuw").length,
    gewijzigd: concepten.filter((c) => c.actie === "wijzig").length,
    verwijderd: concepten.filter((c) => c.actie === "verwijder").length,
  };
}

/** ?week= accepteert een maandag-datum (yyyy-MM-dd), "2026-W42" of een los weeknummer (huidig jaar). */
export function parseWeekParam(waarde: string | null, nu: Date = new Date()): Date | null {
  if (!waarde) return null;
  const v = waarde.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : startOfISOWeek(d);
  }
  const iso = v.match(/^(\d{4})-?W(\d{1,2})$/i);
  const los = v.match(/^(\d{1,2})$/);
  const jaar = iso ? Number(iso[1]) : nu.getFullYear();
  const week = iso ? Number(iso[2]) : los ? Number(los[1]) : NaN;
  if (!Number.isFinite(week) || week < 1 || week > 53) return null;
  // 4 januari valt altijd in ISO-week 1.
  return startOfISOWeek(setISOWeek(new Date(jaar, 0, 4, 12), week));
}

export const isoDatum = (d: Date) => format(d, "yyyy-MM-dd");
export const volgendeWeek = (d: Date, n = 1) => addWeeks(d, n);

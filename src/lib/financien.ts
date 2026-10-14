/**
 * Rekenlaag voor het financieel overzicht (stap 4 van FINANCIEN.md).
 *
 * Tarieven staan NOOIT in deze code. Alles komt uit de tabellen
 * verkooptarieven / kostentarieven / detacheringen, met een ingangsdatum.
 * De tariefbepaling hieronder is dezelfde regel als de databasefuncties
 * verkooptarief() en kostentarief(): eerst de exacte rol, daarna rol is null,
 * steeds met de hoogste geldig_vanaf die <= datum is.
 */

export type Soort = "project" | "uitleen";

export interface VerkooptariefRij {
  id?: string;
  opdrachtgever_id: string;
  rol: string | null;
  uurtarief: number;
  g_rekening_pct: number;
  geldig_vanaf: string; // yyyy-mm-dd
  notitie?: string | null;
}

export interface KostentariefRij {
  id?: string;
  medewerker_id: string;
  uurtarief: number;
  geldig_vanaf: string;
}

export interface DetacheringRij {
  id: string;
  medewerker_id: string;
  opdrachtgever_id: string;
  project_id: string | null;
  rol: string;
  van: string;
  tot: string | null;
  uren_per_week: number | null;
  tarief_override: number | null;
  notitie?: string | null;
}

export interface ProjectInfo {
  id: string;
  naam: string;
  nummer: string;
  soort: Soort;
  opdrachtgever_id: string | null;
}

export interface PersoonInfo {
  id: string;
  full_name: string;
  is_eigenaar: boolean;
  fictief_uurtarief: number | null;
}

/** Geboekte of geplande uren. `verwachte` = nog alleen planning (week loopt nog). */
export interface UrenRij {
  medewerker_id: string;
  project_id: string;
  datum: string;
  uren: number;
  verwachte: boolean;
}

/**
 * Rol uit de BEI-aanwijzing, gekoppeld aan een opdrachtgever op naam.
 * aanwijs_partijen is een eigen lijst; de koppeling naar opdrachtgevers loopt
 * over de genormaliseerde naam.
 */
export interface AanwijzingRol {
  medewerker_id: string;
  opdrachtgever_id: string;
  rol: string;
  geldig_tot: string;
}

export interface CaseForecast {
  project_id: string;
  /** Totale forecastopbrengst van het project, zoals ForecastTab die berekent. */
  omzet: number;
  /** Alle uren die aan het project te delen zijn (geboekt, anders gepland). */
  totaal_uren: number;
}

export interface FinancienInput {
  van: string;
  tot: string;
  uren: UrenRij[];
  projecten: ProjectInfo[];
  personen: PersoonInfo[];
  verkooptarieven: VerkooptariefRij[];
  kostentarieven: KostentariefRij[];
  detacheringen: DetacheringRij[];
  aanwijzingsrollen: AanwijzingRol[];
  caseForecasts: CaseForecast[];
  reiskosten: number;
  vasteKosten: number;
  opdrachtgevers: { id: string; naam: string }[];
}

export interface TariefResultaat {
  uurtarief: number;
  g_rekening_pct: number;
  rol: string | null;
  geldig_vanaf: string;
}

/** Eerst de exacte rol, daarna rol is null; steeds de nieuwste geldig_vanaf <= datum. */
export function bepaalVerkooptarief(
  rijen: VerkooptariefRij[],
  opdrachtgever_id: string | null,
  rol: string | null,
  datum: string
): TariefResultaat | null {
  if (!opdrachtgever_id) return null;
  const kandidaten = rijen.filter(
    (r) => r.opdrachtgever_id === opdrachtgever_id && r.geldig_vanaf <= datum
      && (rol === null || r.rol === rol || r.rol === null)
  );
  if (kandidaten.length === 0) return null;
  const metRol = rol !== null ? kandidaten.filter((r) => r.rol === rol) : kandidaten;
  const pool = metRol.length > 0 ? metRol : kandidaten.filter((r) => r.rol === null);
  if (pool.length === 0) return null;
  const gekozen = pool.reduce((best, r) => (r.geldig_vanaf > best.geldig_vanaf ? r : best));
  return {
    uurtarief: Number(gekozen.uurtarief),
    g_rekening_pct: Number(gekozen.g_rekening_pct),
    rol: gekozen.rol,
    geldig_vanaf: gekozen.geldig_vanaf,
  };
}

/** Hoogste geldig_vanaf <= datum; eigenaren kosten altijd €0. */
export function bepaalKostentarief(
  rijen: KostentariefRij[],
  is_eigenaar: boolean,
  medewerker_id: string,
  datum: string
): number | null {
  if (is_eigenaar) return 0;
  const rijenVoorPersoon = rijen
    .filter((r) => r.medewerker_id === medewerker_id && r.geldig_vanaf <= datum)
    .sort((a, b) => a.geldig_vanaf.localeCompare(b.geldig_vanaf));
  if (rijenVoorPersoon.length === 0) return null;
  return Number(rijenVoorPersoon[rijenVoorPersoon.length - 1].uurtarief);
}

export function isActieveDetachering(d: DetacheringRij, datum: string): boolean {
  return d.van <= datum && (d.tot === null || d.tot >= datum);
}

export function detacheringVoor(
  detacheringen: DetacheringRij[],
  medewerker_id: string,
  opdrachtgever_id: string,
  datum: string
): DetacheringRij | null {
  const kandidaten = detacheringen
    .filter((d) => d.medewerker_id === medewerker_id && d.opdrachtgever_id === opdrachtgever_id && isActieveDetachering(d, datum))
    .sort((a, b) => a.van.localeCompare(b.van));
  return kandidaten.length > 0 ? kandidaten[kandidaten.length - 1] : null;
}

export function rolVoorUur(
  detacheringen: DetacheringRij[],
  aanwijzingsrollen: AanwijzingRol[],
  medewerker_id: string,
  opdrachtgever_id: string,
  datum: string
): { rol: string | null; bron: "detachering" | "aanwijzing" | "geen" } {
  const d = detacheringVoor(detacheringen, medewerker_id, opdrachtgever_id, datum);
  if (d) return { rol: d.rol, bron: "detachering" };
  const aanw = aanwijzingsrollen
    .filter((a) => a.medewerker_id === medewerker_id && a.opdrachtgever_id === opdrachtgever_id && a.geldig_tot >= datum)
    .sort((a, b) => b.geldig_tot.localeCompare(a.geldig_tot));
  if (aanw.length > 0) return { rol: aanw[0].rol, bron: "aanwijzing" };
  return { rol: null, bron: "geen" };
}

export interface RegelRegel {
  project_id: string;
  project_naam: string;
  project_nummer: string;
  soort: Soort;
  opdrachtgever_id: string | null;
  opdrachtgever_naam: string;
  uren: number;
  verwachte_uren: number;
  omzet: number;
  g_rekening: number;
  kosten: number;
  marge: number;
  tarief_onbekend: boolean;
  kosten_onbekend: boolean;
}

export interface PersoonRegel {
  medewerker_id: string;
  naam: string;
  is_eigenaar: boolean;
  uren: number;
  verwachte_uren: number;
  kostentarief: number | null;
  kosten: number;
  omzet: number;
  bijdrage: number;
  fictief_uurtarief: number | null;
}

export interface Waarschuwing {
  type: "geen_verkooptarief" | "geen_kostentarief";
  boodschap: string;
  medewerker_id?: string;
  project_id?: string;
  opdrachtgever_id?: string;
}

export interface FinancienUitkomst {
  van: string;
  tot: string;
  omzet: number;
  omzet_cases: number;
  omzet_uitleen: number;
  kosten: number;
  kosten_uren: number;
  reiskosten: number;
  g_rekening: number;
  g_rekening_uitleen: number;
  marge: number;
  marge_pct: number;
  regels: RegelRegel[];
  personen: PersoonRegel[];
  eigenaren: PersoonRegel[];
  waarschuwingen: Waarschuwing[];
  uitbetaling: {
    ruimte: number;
    eigen_uren: number;
    fictief_tarief: number | null;
    fictief_kosten: number;
  };
}

export function berekenFinannen(input: FinancienInput): FinancienUitkomst {
  const {
    van, tot, uren, projecten, personen, verkooptarieven, kostentarieven,
    detacheringen, aanwijzingsrollen, caseForecasts, reiskosten, vasteKosten, opdrachtgevers,
  } = input;

  const projectMap = new Map(projecten.map((p) => [p.id, p]));
  const persoonMap = new Map(personen.map((p) => [p.id, p]));
  const ogNaam = new Map(opdrachtgevers.map((o) => [o.id, o.naam]));
  const forecastMap = new Map(caseForecasts.map((f) => [f.project_id, f]));

  const perProject = new Map<string, RegelRegel>();
  const perPersoon = new Map<string, PersoonRegel>();
  const waarschuwingen: Waarschuwing[] = [];
  const gemeldeTariefProjecten = new Set<string>();
  const gemeldeKostenPersonen = new Set<string>();

  function projectRegel(p: ProjectInfo): RegelRegel {
    const bestaand = perProject.get(p.id);
    if (bestaand) return bestaand;
    const nieuw: RegelRegel = {
      project_id: p.id,
      project_naam: p.naam,
      project_nummer: p.nummer,
      soort: p.soort,
      opdrachtgever_id: p.opdrachtgever_id,
      opdrachtgever_naam: (p.opdrachtgever_id && ogNaam.get(p.opdrachtgever_id)) || "—",
      uren: 0,
      verwachte_uren: 0,
      omzet: 0,
      g_rekening: 0,
      kosten: 0,
      marge: 0,
      tarief_onbekend: false,
      kosten_onbekend: false,
    };
    perProject.set(p.id, nieuw);
    return nieuw;
  }

  function persoonRegel(id: string): PersoonRegel {
    const bestaand = perPersoon.get(id);
    if (bestaand) return bestaand;
    const info = persoonMap.get(id);
    const nieuw: PersoonRegel = {
      medewerker_id: id,
      naam: info?.full_name || "Onbekend",
      is_eigenaar: !!info?.is_eigenaar,
      uren: 0,
      verwachte_uren: 0,
      kostentarief: null,
      kosten: 0,
      omzet: 0,
      bijdrage: 0,
      fictief_uurtarief: info?.fictief_uurtarief ?? null,
    };
    perPersoon.set(id, nieuw);
    return nieuw;
  }

  // Cases: forecastopbrengst verdelen naar rato van de uren in deze week.
  const caseUren = new Map<string, number>();
  for (const u of uren) {
    const p = projectMap.get(u.project_id);
    if (!p || p.soort !== "project") continue;
    caseUren.set(u.project_id, (caseUren.get(u.project_id) || 0) + u.uren);
  }

  for (const u of uren) {
    const p = projectMap.get(u.project_id);
    if (!p) continue;
    const persoon = persoonMap.get(u.medewerker_id);
    const prRegel = projectRegel(p);
    const peRegel = persoonRegel(u.medewerker_id);

    prRegel.uren += u.uren;
    peRegel.uren += u.uren;
    if (u.verwachte) {
      prRegel.verwachte_uren += u.uren;
      peRegel.verwachte_uren += u.uren;
    }

    const kostentarief = bepaalKostentarief(kostentarieven, !!persoon?.is_eigenaar, u.medewerker_id, u.datum);
    if (kostentarief === null) {
      prRegel.kosten_onbekend = true;
      if (!gemeldeKostenPersonen.has(u.medewerker_id)) {
        gemeldeKostenPersonen.add(u.medewerker_id);
        waarschuwingen.push({
          type: "geen_kostentarief",
          medewerker_id: u.medewerker_id,
          boodschap: `${persoon?.full_name || "Medewerker"} heeft geen kostentarief per ${u.datum}.`,
        });
      }
    } else {
      const kosten = u.uren * kostentarief;
      prRegel.kosten += kosten;
      peRegel.kosten += kosten;
      peRegel.kostentarief = kostentarief;
    }

    if (p.soort === "uitleen") {
      const { rol } = rolVoorUur(detacheringen, aanwijzingsrollen, u.medewerker_id, p.opdrachtgever_id || "", u.datum);
      const d = detacheringVoor(detacheringen, u.medewerker_id, p.opdrachtgever_id || "", u.datum);
      const tarief = bepaalVerkooptarief(
        verkooptarieven, p.opdrachtgever_id, rol, u.datum
      );
      const perUur = d?.tarief_override != null ? Number(d.tarief_override) : tarief?.uurtarief ?? null;
      if (perUur === null) {
        prRegel.tarief_onbekend = true;
        if (!gemeldeTariefProjecten.has(p.id)) {
          gemeldeTariefProjecten.add(p.id);
          waarschuwingen.push({
            type: "geen_verkooptarief",
            project_id: p.id,
            opdrachtgever_id: p.opdrachtgever_id || undefined,
            boodschap: `Uitleen-uren bij ${prRegel.opdrachtgever_naam} hebben geen geldig verkooptarief${rol ? ` voor rol ${rol}` : ""}.`,
          });
        }
      } else {
        const omzet = u.uren * perUur;
        const gPct = tarief?.g_rekening_pct ?? 0;
        prRegel.omzet += omzet;
        prRegel.g_rekening += (omzet * gPct) / 100;
        peRegel.omzet += omzet;
      }
    }
  }

  // Cases: forecast verdelen over de weken naar rato van geboekte/geplande uren.
  for (const [projectId, weekUren] of caseUren) {
    const forecast = forecastMap.get(projectId);
    if (!forecast || forecast.totaal_uren <= 0 || forecast.omzet <= 0) continue;
    const p = projectMap.get(projectId)!;
    const deel = Math.min(1, weekUren / forecast.totaal_uren);
    const omzet = forecast.omzet * deel;
    const regel = projectRegel(p);
    regel.omzet += omzet;
    for (const u of uren) {
      if (u.project_id !== projectId) continue;
      persoonRegel(u.medewerker_id).omzet += omzet * (u.uren / weekUren);
    }
  }

  const regels = Array.from(perProject.values()).map((r) => ({ ...r, marge: r.omzet - r.kosten }));
  const personenUitkomst = Array.from(perPersoon.values()).map((p) => ({ ...p, bijdrage: p.omzet - p.kosten }));

  const omzetCases = regels.filter((r) => r.soort === "project").reduce((s, r) => s + r.omzet, 0);
  const omzetUitleen = regels.filter((r) => r.soort === "uitleen").reduce((s, r) => s + r.omzet, 0);
  const gRekening = regels.reduce((s, r) => s + r.g_rekening, 0);
  const gRekeningUitleen = regels.filter((r) => r.soort === "uitleen").reduce((s, r) => s + r.g_rekening, 0);
  const kostenUren = regels.reduce((s, r) => s + r.kosten, 0);
  const kosten = kostenUren + (reiskosten || 0);
  const omzet = omzetCases + omzetUitleen;
  const marge = omzet - kosten;
  const margePct = omzet > 0 ? (marge / omzet) * 100 : 0;

  const eigenaren = personenUitkomst.filter((p) => p.is_eigenaar);
  const nietEigenaren = personenUitkomst.filter((p) => !p.is_eigenaar);
  const eigenUren = eigenaren.reduce((s, p) => s + p.uren, 0);
  const fictiefTarief = eigenaren.find((p) => p.fictief_uurtarief != null)?.fictief_uurtarief ?? null;
  const ruimte = marge - gRekening - (vasteKosten || 0);

  return {
    van,
    tot,
    omzet,
    omzet_cases: omzetCases,
    omzet_uitleen: omzetUitleen,
    kosten,
    kosten_uren: kostenUren,
    reiskosten: reiskosten || 0,
    g_rekening: gRekening,
    g_rekening_uitleen: gRekeningUitleen,
    marge,
    marge_pct: margePct,
    regels: regels.sort((a, b) => b.omzet - a.omzet),
    personen: nietEigenaren.sort((a, b) => b.uren - a.uren),
    eigenaren: eigenaren.sort((a, b) => b.uren - a.uren),
    waarschuwingen,
    uitbetaling: {
      ruimte,
      eigen_uren: eigenUren,
      fictief_tarief: fictiefTarief,
      fictief_kosten: fictiefTarief != null ? fictiefTarief * eigenUren : 0,
    },
  };
}

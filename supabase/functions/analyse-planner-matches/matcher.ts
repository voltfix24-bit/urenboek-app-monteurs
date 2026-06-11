// Pure matcher module — geen IO, geen DB, geen netwerk.
// Vergelijkt urenapp-data met Planner-data en produceert voorstellen.
// Normalisatie alleen voor vergelijking; opgeslagen data wordt nooit gewijzigd.

export type MatchStatus = "exact" | "waarschijnlijk" | "conflict" | "geen_match";

export interface UrenappProject {
  id: string;
  nummer: string;
  naam: string;
  projectjaar: number | null;
  planner_project_id: string | null;
  locatie?: string | null;
}
export interface PlannerProject {
  planner_id: string;
  urenapp_project_id: string | null;
  nummer: string;
  naam: string;
  locatie: string | null;
  jaar: number | null;
}
export interface UrenappMonteur {
  id: string;
  full_name: string;
  planner_monteur_id: string | null;
  type: string | null; // bv. "monteur" | "schakelmonteur"
}
export interface PlannerMonteur {
  planner_id: string;
  urenapp_profile_id: string | null;
  naam: string;
  type: string | null;
  actief: boolean;
}

export interface MatchResult<U, C> {
  urenapp: U;
  status: MatchStatus;
  reden: string;
  kandidaat: C | null;
  bestaande_koppeling_urenapp?: string | null;
  bestaande_koppeling_planner?: string | null;
  afwijkingen: { veld: string; urenapp: unknown; planner: unknown }[];
}

export function normalizeText(s: string | null | undefined): string {
  if (s == null) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeNummer(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  if (t === "") return "";
  // Volledig numeriek → voorloopnullen negeren
  if (/^\d+$/.test(t)) return t.replace(/^0+/, "") || "0";
  return t.toLowerCase();
}

function groupBy<T>(arr: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item);
    if (!k) continue;
    const a = m.get(k) ?? [];
    a.push(item);
    m.set(k, a);
  }
  return m;
}

function diffsProject(u: UrenappProject, c: PlannerProject) {
  const out: { veld: string; urenapp: unknown; planner: unknown }[] = [];
  if (normalizeText(u.naam) !== normalizeText(c.naam))
    out.push({ veld: "naam", urenapp: u.naam, planner: c.naam });
  if ((u.projectjaar ?? null) !== (c.jaar ?? null))
    out.push({ veld: "jaar", urenapp: u.projectjaar, planner: c.jaar });
  if (normalizeNummer(u.nummer) !== normalizeNummer(c.nummer))
    out.push({ veld: "nummer", urenapp: u.nummer, planner: c.nummer });
  return out;
}

export function matchProjecten(
  urenapp: UrenappProject[],
  planner: PlannerProject[],
): MatchResult<UrenappProject, PlannerProject>[] {
  const byNum = groupBy(planner, (p) => normalizeNummer(p.nummer));
  const byName = groupBy(planner, (p) => normalizeText(p.naam));

  return urenapp.map((u) => {
    const normNum = normalizeNummer(u.nummer);
    const numMatches = (normNum ? byNum.get(normNum) : []) ?? [];

    if (numMatches.length > 1) {
      const c = numMatches[0];
      return {
        urenapp: u,
        status: "conflict",
        reden: `Meerdere Planner-projecten met nummer "${u.nummer}" (${numMatches.length})`,
        kandidaat: c,
        bestaande_koppeling_urenapp: u.planner_project_id,
        bestaande_koppeling_planner: c.urenapp_project_id,
        afwijkingen: diffsProject(u, c),
      };
    }

    if (numMatches.length === 1) {
      const c = numMatches[0];
      const urenappMismatch = u.planner_project_id && u.planner_project_id !== c.planner_id;
      const plannerMismatch = c.urenapp_project_id && c.urenapp_project_id !== u.id;
      if (urenappMismatch || plannerMismatch) {
        return {
          urenapp: u,
          status: "conflict",
          reden: urenappMismatch
            ? "Urenapp-project is al gekoppeld aan een ander Planner-record"
            : "Planner-project is al gekoppeld aan een ander urenapp-record",
          kandidaat: c,
          bestaande_koppeling_urenapp: u.planner_project_id,
          bestaande_koppeling_planner: c.urenapp_project_id,
          afwijkingen: diffsProject(u, c),
        };
      }
      return {
        urenapp: u,
        status: "exact",
        reden: "Exact projectnummer",
        kandidaat: c,
        bestaande_koppeling_urenapp: u.planner_project_id,
        bestaande_koppeling_planner: c.urenapp_project_id,
        afwijkingen: diffsProject(u, c),
      };
    }

    // Geen nummer-match → probeer unieke naam
    const normName = normalizeText(u.naam);
    const nameMatches = (normName ? byName.get(normName) : []) ?? [];
    if (nameMatches.length === 1) {
      const c = nameMatches[0];
      const urenappMismatch = u.planner_project_id && u.planner_project_id !== c.planner_id;
      const plannerMismatch = c.urenapp_project_id && c.urenapp_project_id !== u.id;
      if (urenappMismatch || plannerMismatch) {
        return {
          urenapp: u,
          status: "conflict",
          reden: "Naamovereenkomst maar bestaande afwijkende koppeling",
          kandidaat: c,
          bestaande_koppeling_urenapp: u.planner_project_id,
          bestaande_koppeling_planner: c.urenapp_project_id,
          afwijkingen: diffsProject(u, c),
        };
      }
      return {
        urenapp: u,
        status: "waarschijnlijk",
        reden: "Sterke naamovereenkomst zonder nummermatch",
        kandidaat: c,
        bestaande_koppeling_urenapp: u.planner_project_id,
        bestaande_koppeling_planner: c.urenapp_project_id,
        afwijkingen: diffsProject(u, c),
      };
    }

    return {
      urenapp: u,
      status: "geen_match",
      reden: "Geen Planner-record met overeenkomstig nummer of naam",
      kandidaat: null,
      bestaande_koppeling_urenapp: u.planner_project_id,
      bestaande_koppeling_planner: null,
      afwijkingen: [],
    };
  });
}

function diffsMonteur(u: UrenappMonteur, c: PlannerMonteur) {
  const out: { veld: string; urenapp: unknown; planner: unknown }[] = [];
  if (normalizeText(u.full_name) !== normalizeText(c.naam))
    out.push({ veld: "naam", urenapp: u.full_name, planner: c.naam });
  if (normalizeText(u.type ?? "") !== normalizeText(c.type ?? ""))
    out.push({ veld: "type", urenapp: u.type, planner: c.type });
  return out;
}

export function matchMonteurs(
  urenapp: UrenappMonteur[],
  planner: PlannerMonteur[],
): MatchResult<UrenappMonteur, PlannerMonteur>[] {
  const byName = groupBy(planner, (p) => normalizeText(p.naam));

  return urenapp.map((u) => {
    const normName = normalizeText(u.full_name);
    const matches = (normName ? byName.get(normName) : []) ?? [];

    if (matches.length > 1) {
      const c = matches[0];
      return {
        urenapp: u,
        status: "conflict",
        reden: `Meerdere Planner-monteurs met naam "${u.full_name}" (${matches.length})`,
        kandidaat: c,
        bestaande_koppeling_urenapp: u.planner_monteur_id,
        bestaande_koppeling_planner: c.urenapp_profile_id,
        afwijkingen: diffsMonteur(u, c),
      };
    }

    if (matches.length === 1) {
      const c = matches[0];
      const urenappMismatch = u.planner_monteur_id && u.planner_monteur_id !== c.planner_id;
      const plannerMismatch = c.urenapp_profile_id && c.urenapp_profile_id !== u.id;
      if (urenappMismatch || plannerMismatch) {
        return {
          urenapp: u,
          status: "conflict",
          reden: urenappMismatch
            ? "Urenapp-monteur is al gekoppeld aan een ander Planner-record"
            : "Planner-monteur is al gekoppeld aan een ander urenapp-record",
          kandidaat: c,
          bestaande_koppeling_urenapp: u.planner_monteur_id,
          bestaande_koppeling_planner: c.urenapp_profile_id,
          afwijkingen: diffsMonteur(u, c),
        };
      }
      const typesGelijk = normalizeText(u.type ?? "") === normalizeText(c.type ?? "");
      return {
        urenapp: u,
        status: typesGelijk ? "exact" : "waarschijnlijk",
        reden: typesGelijk ? "Unieke naam en passend type" : "Unieke naam, maar typeverschil",
        kandidaat: c,
        bestaande_koppeling_urenapp: u.planner_monteur_id,
        bestaande_koppeling_planner: c.urenapp_profile_id,
        afwijkingen: diffsMonteur(u, c),
      };
    }

    return {
      urenapp: u,
      status: "geen_match",
      reden: "Geen Planner-monteur met overeenkomstige naam",
      kandidaat: null,
      bestaande_koppeling_urenapp: u.planner_monteur_id,
      bestaande_koppeling_planner: null,
      afwijkingen: [],
    };
  });
}

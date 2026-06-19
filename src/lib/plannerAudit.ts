// Helpers voor Planner sync-audit weergave.
// Pure functies — testbaar zonder UI.

export interface AuditRow {
  id: string;
  created_at: string;
  manager_user_id: string;
  manager_naam: string | null;
  external_id: string;
  datum: string;
  planning_id: string | null;
  uitkomst: string;
  fout_reden: string | null;
  project_nummer: string | null;
  project_naam: string | null;
  monteur_naam: string | null;
}

export type ActieType =
  | "import" | "update" | "verwijdering" | "markering_verwijderd"
  | "herstel" | "keuze" | "sync";
export type AuditStatus = "geslaagd" | "deels" | "mislukt";

export interface Bucket {
  key: string;
  ts: string;
  manager_naam: string | null;
  manager_user_id: string;
  type: ActieType;
  status: AuditStatus;
  tellers: {
    aangemaakt: number;
    bijgewerkt: number;
    verwijderd: number;
    gemarkeerd: number;
    hersteld: number;
    overgeslagen: number;
    geweigerd: number;
    fout: number;
    keuze: number;
  };
  rows: AuditRow[];
}

export const SUCCES_UITKOMSTEN = new Set([
  "gesynchroniseerd", "reeds_gesynchroniseerd",
  "geadopteerd", "reeds_geadopteerd",
  "bijgewerkt", "overgeslagen",
  "verwijderd", "gemarkeerd_verwijderd",
  "hersteld", "reeds_actief",
  "keuze_terrevolt", "keuze_planner", "keuze_overslaan",
]);
export const FAIL_UITKOMSTEN = new Set(["geweigerd", "fout"]);

export function bucketKey(r: AuditRow): string {
  const min = new Date(r.created_at);
  min.setSeconds(0, 0);
  return `${r.manager_user_id}|${min.toISOString()}`;
}

export function aggregateAudit(rows: AuditRow[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const r of rows) {
    const key = bucketKey(r);
    let b = map.get(key);
    if (!b) {
      b = {
        key, ts: r.created_at,
        manager_naam: r.manager_naam, manager_user_id: r.manager_user_id,
        type: "sync", status: "geslaagd",
        tellers: { aangemaakt: 0, bijgewerkt: 0, verwijderd: 0, gemarkeerd: 0, hersteld: 0, overgeslagen: 0, geweigerd: 0, fout: 0, keuze: 0 },
        rows: [],
      };
      map.set(key, b);
    }
    b.rows.push(r);
    if (new Date(r.created_at) > new Date(b.ts)) b.ts = r.created_at;
    switch (r.uitkomst) {
      case "gesynchroniseerd":
      case "geadopteerd": b.tellers.aangemaakt++; break;
      case "reeds_gesynchroniseerd":
      case "reeds_geadopteerd":
      case "overgeslagen":
      case "reeds_actief": b.tellers.overgeslagen++; break;
      case "bijgewerkt": b.tellers.bijgewerkt++; break;
      case "verwijderd": b.tellers.verwijderd++; break;
      case "gemarkeerd_verwijderd": b.tellers.gemarkeerd++; break;
      case "hersteld": b.tellers.hersteld++; break;
      case "geweigerd": b.tellers.geweigerd++; break;
      case "fout": b.tellers.fout++; break;
      case "keuze_terrevolt":
      case "keuze_planner":
      case "keuze_overslaan": b.tellers.keuze++; break;
    }
  }
  for (const b of map.values()) {
    const t = b.tellers;
    if (t.hersteld > 0 && t.verwijderd === 0 && t.gemarkeerd === 0) b.type = "herstel";
    else if (t.verwijderd > 0 && t.gemarkeerd === 0) b.type = "verwijdering";
    else if (t.gemarkeerd > 0 && t.verwijderd === 0) b.type = "markering_verwijderd";
    else if (t.verwijderd > 0 || t.gemarkeerd > 0) b.type = "verwijdering";
    else if (t.bijgewerkt > 0) b.type = "update";
    else if (t.aangemaakt > 0) b.type = "import";
    else if (t.keuze > 0) b.type = "keuze";
    else b.type = "sync";

    let okCount = 0, badCount = 0;
    for (const r of b.rows) {
      if (FAIL_UITKOMSTEN.has(r.uitkomst)) badCount++;
      else if (SUCCES_UITKOMSTEN.has(r.uitkomst)) okCount++;
    }
    if (badCount === 0) b.status = "geslaagd";
    else if (okCount === 0) b.status = "mislukt";
    else b.status = "deels";
  }
  return Array.from(map.values()).sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

export const ACTIE_LABEL: Record<ActieType, string> = {
  import: "Import",
  update: "Update",
  verwijdering: "Verwijdering",
  markering_verwijderd: "Markering verwijderd",
  herstel: "Herstel",
  keuze: "Conflict-keuze",
  sync: "Sync",
};

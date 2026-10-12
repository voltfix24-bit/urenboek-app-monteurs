import { Search, X } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { openPunten } from "@/lib/projectChecklist";

interface Project {
  id: string; nummer: string; naam: string; active: boolean;
  case_type: string | null; stationsnaam: string | null;
  opdrachtgever_id: string | null; straat: string | null; postcode?: string | null; stad: string | null;
  status?: string; projectjaar?: number | null; intake_gedaan?: boolean;
}

interface Props {
  projects: Project[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedId: string | null;
  onSelect: (p: Project) => void;
  margeMap: Map<string, { omzet: number; kosten: number; marge: number }>;
  toonMarge: boolean;
  loading: boolean;
}

/** Desktop projectlijst: naam, "nummer · case type · stad", fasepill en open punten of marge. */
export function DesktopProjectLijst({ projects, searchQuery, setSearchQuery, selectedId, onSelect, margeMap, toonMarge, loading }: Props) {
  return (
    <div className="pj-list">
      <div className="pj-search">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} aria-label="Zoek project"
            placeholder="Zoek op naam, casenummer, stad of station" className="w-full rounded-[10px] py-2 pl-9 pr-9 text-sm"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }} />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} aria-label="Zoekopdracht wissen" className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} /></div>
      ) : projects.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>Geen projecten gevonden</p>
      ) : projects.map((p) => {
        const open = openPunten({ straat: p.straat, postcode: p.postcode ?? null, stad: p.stad, projectjaar: p.projectjaar ?? null, opdrachtgever_id: p.opdrachtgever_id, intake_gedaan: !!p.intake_gedaan });
        const marge = margeMap.get(p.id);
        return (
          <button key={p.id} type="button" onClick={() => onSelect(p)} aria-current={selectedId === p.id} className={`pj-row ${p.active ? "" : "is-archived"}`}>
            <span className="min-w-0">
              <strong title={p.naam}>{p.naam}</strong>
              <small><span className="pj-mono">{p.nummer}</span>{p.case_type ? ` · ${p.case_type}` : ""}{p.stad ? ` · ${p.stad}` : ""}{!p.active ? " · Gearchiveerd" : ""}</small>
            </span>
            <span className="pj-right">
              <StatusBadge status={p.status || "nieuw"} size="sm" />
              {open > 0 && p.active && (p.status || "nieuw") !== "gesloten"
                ? <span className="pj-open">{open} {open === 1 ? "punt" : "punten"} open</span>
                : toonMarge && marge?.omzet ? <span className="pj-marge">marge {Math.round(marge.marge)}%</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

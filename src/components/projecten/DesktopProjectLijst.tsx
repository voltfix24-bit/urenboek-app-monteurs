import { useMemo, useState } from "react";
import { Search, X, AlertTriangle, ArrowUpDown } from "lucide-react";

interface Project {
  id: string; nummer: string; naam: string; active: boolean;
  case_type: string | null; stationsnaam: string | null;
  opdrachtgever_id: string | null; straat: string | null; stad: string | null;
  status?: string;
  projectjaar?: number | null;
}

const STATUS_LABELS: Record<string, string> = {
  nieuw: "Nieuw", gepland: "Gepland", in_uitvoering: "In uitvoering",
  opgeleverd: "Opgeleverd", gefactureerd: "Gefactureerd", gesloten: "Gesloten",
};

const STATUS_TINT: Record<string, { bg: string; color: string }> = {
  nieuw: { bg: "rgba(110,155,255,0.12)", color: "var(--info)" },
  gepland: { bg: "rgba(110,155,255,0.12)", color: "var(--info)" },
  in_uitvoering: { bg: "var(--warn-light)", color: "var(--warn-text)" },
  opgeleverd: { bg: "var(--accent-light)", color: "var(--accent-dark)" },
  gefactureerd: { bg: "var(--accent-light)", color: "var(--accent-dark)" },
  gesloten: { bg: "var(--bg-surface-2)", color: "var(--text-muted)" },
};

function StatusPill({ status }: { status: string }) {
  const tint = STATUS_TINT[status] || STATUS_TINT.nieuw;
  return (
    <span className="inline-flex items-center rounded-full" style={{
      background: tint.bg, color: tint.color, fontSize: 12, fontWeight: 500,
      padding: "2px 10px", lineHeight: "18px", whiteSpace: "nowrap",
    }}>
      {STATUS_LABELS[status] || STATUS_LABELS.nieuw}
    </span>
  );
}

const GRID = "minmax(0,1fr) 104px 96px 52px";

function Row({ project, ogNaam, selected, onClick, marge }: {
  project: Project; ogNaam: string | null; selected: boolean; onClick: () => void;
  marge?: { omzet: number; kosten: number; marge: number };
}) {
  const status = project.status || "nieuw";
  const meta = [project.nummer, project.case_type, project.stationsnaam].filter(Boolean).join(" · ");
  return (
    <button onClick={onClick} className="w-full text-left grid items-center gap-3 px-2 py-2 transition-colors"
      style={{
        gridTemplateColumns: GRID,
        background: selected ? "var(--bg-surface-2)" : "transparent",
        borderBottom: "1px solid var(--planning-border-soft)",
        cursor: "pointer",
      }}>
      <div style={{ minWidth: 0 }}>
        <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
          <span className="truncate" style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{project.naam}</span>
          {project.projectjaar == null && (
            <span title="Jaartal ontbreekt" className="shrink-0" aria-label="Jaartal ontbreekt">
              <AlertTriangle style={{ width: 14, height: 14, color: "var(--warn-text)" }} />
            </span>
          )}
        </div>
        <p className="truncate" style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)", marginTop: 2 }}>
          {meta || "—"}
        </p>
      </div>
      <div><StatusPill status={status} /></div>
      <div className="truncate" style={{ fontSize: 12, color: "var(--text-muted)" }}>{ogNaam || "—"}</div>
      <div style={{ fontSize: 12, textAlign: "right", color: marge ? "var(--text-primary)" : "var(--text-muted)" }}>
        {marge ? `${Math.round(marge.marge)}%` : "—"}
      </div>
    </button>
  );
}

interface Props {
  activeProjects: Project[];
  inactiveProjects: Project[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedId: string | null;
  onSelect: (p: Project) => void;
  margeMap: Map<string, { omzet: number; kosten: number; marge: number }>;
  getOgNaam: (id: string | null) => string | null;
  loading: boolean;
  statusFilter?: string;
  onStatusFilter?: (s: string) => void;
  statusCounts?: Record<string, number>;
}

type SortKey = "naam" | "status" | "opdrachtgever";

export function DesktopProjectLijst({ activeProjects, inactiveProjects, searchQuery, setSearchQuery, selectedId, onSelect, margeMap, getOgNaam, loading, statusFilter, onStatusFilter, statusCounts }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("naam");
  const [sortOpen, setSortOpen] = useState(false);
  const [onlyMissingYear, setOnlyMissingYear] = useState(false);

  const sort = (list: Project[]) => [...list].sort((a, b) => {
    if (sortKey === "status") return (a.status || "nieuw").localeCompare(b.status || "nieuw") || a.naam.localeCompare(b.naam, "nl");
    if (sortKey === "opdrachtgever") return (getOgNaam(a.opdrachtgever_id) || "zzz").localeCompare(getOgNaam(b.opdrachtgever_id) || "zzz", "nl") || a.naam.localeCompare(b.naam, "nl");
    return a.naam.localeCompare(b.naam, "nl");
  });

  const rows = useMemo(() => {
    let all = [...activeProjects, ...inactiveProjects];
    if (onlyMissingYear) all = all.filter(p => p.projectjaar == null);
    return sort(all);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjects, inactiveProjects, sortKey, onlyMissingYear]);

  const missingYear = [...activeProjects, ...inactiveProjects].filter(p => p.projectjaar == null).length;

  const filters = ["alle", "nieuw", "gepland", "in_uitvoering", "opgeleverd", "gefactureerd", "gesloten"];
  const sortLabels: Record<SortKey, string> = { naam: "Naam", status: "Status", opdrachtgever: "Opdrachtgever" };

  return (
    <div className="flex-shrink-0 overflow-y-auto pr-4" style={{ width: "40%", borderRight: "1px solid var(--planning-border-soft)" }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--text-muted)" }} />
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Zoek op naam of casenummer..." className="w-full pl-9 pr-9 py-2 rounded-[10px] text-sm"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }} />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} aria-label="Zoekopdracht wissen" className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="relative">
          <button onClick={() => setSortOpen(o => !o)} title={`Sorteren op ${sortLabels[sortKey].toLowerCase()}`} aria-label="Sorteren"
            className="flex items-center gap-1.5 px-3 py-2 rounded-[10px]"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)", color: "var(--text-muted)", fontSize: 12, fontWeight: 500 }}>
            <ArrowUpDown className="h-3.5 w-3.5" /> {sortLabels[sortKey]}
          </button>
          {sortOpen && (
            <div className="absolute right-0 mt-1 rounded-[10px] z-20 overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)", minWidth: 150 }}>
              {(Object.keys(sortLabels) as SortKey[]).map(k => (
                <button key={k} onClick={() => { setSortKey(k); setSortOpen(false); }} className="block w-full text-left px-3 py-2"
                  style={{ fontSize: 12, fontWeight: sortKey === k ? 500 : 400, color: sortKey === k ? "var(--text-primary)" : "var(--text-muted)", background: "transparent" }}>
                  {sortLabels[k]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {statusFilter !== undefined && onStatusFilter && (
        <div className="flex flex-wrap gap-1 mb-3">
          {filters.map(s => {
            const active = statusFilter === s;
            const count = statusCounts?.[s];
            return (
              <button key={s} onClick={() => onStatusFilter(s)} className="px-2.5 py-1 rounded-full transition-colors"
                style={{ fontSize: 12, fontWeight: active ? 500 : 400, background: active ? "var(--accent-light)" : "var(--bg-surface-2)", color: active ? "var(--accent-dark)" : "var(--text-muted)", border: active ? "1px solid var(--accent-border)" : "1px solid var(--planning-border-soft)" }}>
                {s === "alle" ? "Alle" : STATUS_LABELS[s]}{count != null ? ` ${count}` : ""}
              </button>
            );
          })}
        </div>
      )}

      {missingYear > 0 && (
        <div className="flex items-center justify-between gap-3 mb-3 px-3 py-2 rounded-[10px]"
          style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
          <span style={{ fontSize: 12, color: "var(--warn-text)" }}>
            {missingYear} {missingYear === 1 ? "project mist" : "projecten missen"} een jaartal
          </span>
          <button onClick={() => setOnlyMissingYear(v => !v)} className="px-2.5 py-1 rounded-full"
            style={{ fontSize: 12, fontWeight: 500, color: "var(--warn-text)", background: "transparent", border: "1px solid var(--warn-border)" }}>
            {onlyMissingYear ? "Toon alle" : "Invullen"}
          </button>
        </div>
      )}

      <div className="grid gap-3 px-2 pb-1.5" style={{ gridTemplateColumns: GRID, borderBottom: "1px solid var(--planning-border-soft)" }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)" }}>Project</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)" }}>Status</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)" }}>Opdrachtgever</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", textAlign: "right" }}>Marge</span>
      </div>

      {loading ? (
        <div className="text-center py-8"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} /></div>
      ) : rows.length === 0 ? (
        <p className="text-center py-8" style={{ fontSize: 12, color: "var(--text-muted)" }}>Geen projecten gevonden</p>
      ) : (
        <div>
          {rows.map(p => (
            <Row key={p.id} project={p} ogNaam={getOgNaam(p.opdrachtgever_id)} selected={selectedId === p.id} onClick={() => onSelect(p)} marge={margeMap.get(p.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

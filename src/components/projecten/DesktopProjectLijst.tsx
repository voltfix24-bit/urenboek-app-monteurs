import { Search, X, AlertTriangle } from "lucide-react";
import { CaseTypeBadge } from "./CaseTypeBadge";
import { StatusBadge } from "@/components/StatusBadge";
import type { ProjectStatus } from "@/lib/projectStatus";

interface Project {
  id: string; nummer: string; naam: string; active: boolean;
  case_type: string | null; stationsnaam: string | null;
  opdrachtgever_id: string | null; straat: string | null; stad: string | null;
  status?: string;
}

function DesktopListCard({ project, ogNaam, selected, onClick, marge }: {
  project: Project; ogNaam: string | null; selected: boolean; onClick: () => void;
  marge?: { omzet: number; kosten: number; marge: number };
}) {
  const margeColor = (m: number) => m >= 30 ? "#10b981" : m >= 15 ? "#d97706" : "#dc2626";
  const margeBg = (m: number) => m >= 30 ? "#ecfdf5" : m >= 15 ? "rgba(254,179,0,0.1)" : "rgba(255,113,108,0.1)";
  return (
    <button onClick={onClick} className="w-full text-left p-2.5 rounded-xl mb-1.5 transition-colors cursor-pointer"
      style={{ background: selected ? "#ecfdf5" : "#ffffff", border: selected ? "1.5px solid #10b981" : "1px solid #e5e7eb" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold truncate" style={{ color: "#1f2937" }}>
          {project.naam}
          {(!project.straat || !project.stad) && <span title="Adres onvolledig"><AlertTriangle className="h-3 w-3 inline ml-1" style={{ color: "#d97706" }} /></span>}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          {marge && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: margeBg(marge.marge), color: margeColor(marge.marge), fontFamily: "DM Mono, monospace" }}>
              {marge.marge.toFixed(1)}%
            </span>
          )}
          <CaseTypeBadge type={project.case_type} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <span className="text-[11px] font-mono" style={{ color: "#10b981" }}>{project.nummer}</span>
        <div className="flex items-center gap-1.5">
          {project.status && <StatusBadge status={(project.status as ProjectStatus)} size="sm" />}
          {ogNaam && <span className="text-[11px] truncate" style={{ color: "#6b7280" }}>{ogNaam}</span>}
        </div>
      </div>
      {project.stationsnaam && <p className="text-[11px] mt-0.5" style={{ color: "#6b7280" }}>{project.stationsnaam}</p>}
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
}

export function DesktopProjectLijst({ activeProjects, inactiveProjects, searchQuery, setSearchQuery, selectedId, onSelect, margeMap, getOgNaam, loading, statusFilter, onStatusFilter }: Props) {
  return (
    <div className="flex-shrink-0 overflow-y-auto pr-4" style={{ width: "40%", borderRight: "1px solid #e5e7eb" }}>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#6b7280" }} />
        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          placeholder="Zoek op naam of casenummer..." className="w-full pl-9 pr-9 py-2 rounded-[10px] text-sm"
          style={{ background: "#ffffff", border: "1px solid #e5e7eb", color: "#1f2937" }} />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "#6b7280", background: "none", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {statusFilter !== undefined && onStatusFilter && (
        <div className="flex flex-wrap gap-1 mb-3">
          {["alle", "nieuw", "gepland", "in_uitvoering", "opgeleverd", "gefactureerd", "gesloten"].map(s => {
            const labels: Record<string, string> = { alle: "Alle", nieuw: "Nieuw", gepland: "Gepland", in_uitvoering: "In uitvoering", opgeleverd: "Opgeleverd", gefactureerd: "Gefactureerd", gesloten: "Gesloten" };
            const active = statusFilter === s;
            return (
              <button key={s} onClick={() => onStatusFilter(s)} className="px-2 py-1 rounded-full text-[10px] font-semibold transition-colors"
                style={{ background: active ? "#ecfdf5" : "#ffffff", color: active ? "#10b981" : "#6b7280", border: active ? "1px solid #a7f3d0" : "1px solid #e5e7eb" }}>
                {labels[s]}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "#10b981", borderTopColor: "transparent" }} /></div>
      ) : (
        <>
          {activeProjects.length > 0 && (
            <div className="space-y-1.5 mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider px-1" style={{ color: "#6b7280" }}>Actief ({activeProjects.length})</p>
              {activeProjects.map(p => (
                <DesktopListCard key={p.id} project={p} ogNaam={getOgNaam(p.opdrachtgever_id)} selected={selectedId === p.id} onClick={() => onSelect(p)} marge={margeMap.get(p.id)} />
              ))}
            </div>
          )}
          {inactiveProjects.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider px-1" style={{ color: "#6b7280" }}>Inactief ({inactiveProjects.length})</p>
              {inactiveProjects.map(p => (
                <DesktopListCard key={p.id} project={p} ogNaam={getOgNaam(p.opdrachtgever_id)} selected={selectedId === p.id} onClick={() => onSelect(p)} marge={margeMap.get(p.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

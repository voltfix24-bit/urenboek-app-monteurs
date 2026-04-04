import { useProjects } from "@/hooks/useProjects";
import { TimeEntry } from "@/hooks/useTimesheet";

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  concept: { bg: "#DFE8D6", text: "#5A7A42", dot: "#8AAD6E", label: "Concept" },
  ingediend: { bg: "#FFF3CD", text: "#8B6914", dot: "#D4A017", label: "Ingediend" },
  goedgekeurd: { bg: "#D4EDD8", text: "#2D7A3A", dot: "#2D7A3A", label: "Goedgekeurd" },
  afgekeurd: { bg: "#FDECEA", text: "#C0392B", dot: "#C0392B", label: "Afgekeurd" },
};

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

interface EntryCardProps {
  entry: TimeEntry;
  onSubmit?: (id: string) => void;
  onRemove?: (id: string) => void;
  onRevertToConcept?: (id: string) => void;
  showDate?: boolean;
}

export function EntryCard({ entry, onSubmit, onRemove, onRevertToConcept, showDate = false }: EntryCardProps) {
  const { getByNummer } = useProjects();
  const proj = getByNummer(entry.projectNumber);
  const s = STATUS_CONFIG[entry.status] || STATUS_CONFIG.concept;
  const dateObj = new Date(entry.date + "T12:00:00");
  const dayIdx = dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1;

  return (
    <div className="rounded-2xl p-4 transition-transform active:scale-[0.985]" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
      {showDate && (
        <p className="text-xs font-medium mb-2" style={{ color: "#8AAD6E" }}>
          {DAGEN[dayIdx]} {dateObj.getDate()} {MAANDEN[dateObj.getMonth()]}
        </p>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" style={{ color: "#2D4A1E" }}>{proj?.naam || entry.projectNumber}</p>
          <p className="text-xs mt-0.5" style={{ color: "#8AAD6E" }}>
            {proj?.nummer || entry.projectNumber}
            {entry.description && ` · ${entry.description}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold" style={{ color: "#2D4A1E" }}>{entry.hours}u</span>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: s.bg, color: s.text }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
            {s.label}
          </span>
        </div>
      </div>
      {entry.status === "concept" && onSubmit && (
        <button onClick={() => onSubmit(entry.id)} className="mt-3 w-full py-2 rounded-xl text-xs font-semibold transition-colors" style={{ background: "#D4EDD8", border: "1px solid #8DC99A", color: "#2D7A3A" }}>
          Indienen ter goedkeuring →
        </button>
      )}
      {entry.status === "afgekeurd" && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] italic" style={{ color: "#C0392B" }}>✕ Afgekeurd — pas aan en dien opnieuw in.</p>
          {onRevertToConcept && (
            <button onClick={() => onRevertToConcept(entry.id)} className="w-full py-2 rounded-xl text-xs font-semibold transition-colors" style={{ background: "#FFF3CD", border: "1px solid #E8D070", color: "#8B6914" }}>
              ✏️ Aanpassen en opnieuw indienen
            </button>
          )}
          {onRemove && (
            <button onClick={() => onRemove(entry.id)} className="w-full py-1.5 rounded-lg text-[11px] font-medium transition-colors" style={{ color: "#8AAD6E" }}>
              Verwijderen
            </button>
          )}
        </div>
      )}
      {onRemove && entry.status === "concept" && (
        <button onClick={() => onRemove(entry.id)} className="mt-2 w-full py-1.5 rounded-lg text-[11px] font-medium transition-colors" style={{ color: "#8AAD6E" }}>
          Verwijderen
        </button>
      )}
    </div>
  );
}

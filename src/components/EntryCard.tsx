import { useProjects } from "@/hooks/useProjects";
import { TimeEntry } from "@/hooks/useTimesheet";
import { X, Pencil } from "lucide-react";

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  concept: { bg: "var(--bg-surface-2)", text: "var(--text-secondary)", dot: "var(--text-muted)", label: "Concept" },
  ingediend: { bg: "var(--warn-light)", text: "var(--warn-text)", dot: "var(--warn-dot)", label: "Ingediend" },
  goedgekeurd: { bg: "var(--success-light)", text: "var(--success)", dot: "var(--success)", label: "Goedgekeurd" },
  afgekeurd: { bg: "var(--danger-light)", text: "var(--danger)", dot: "var(--danger)", label: "Afgekeurd" },
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
    <div className="rounded-2xl p-4 transition-transform active:scale-[0.985]" style={{ background: "var(--bg-surface)", border: "1px solid #C5D4B2" }}>
      {showDate && (
        <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>
          {DAGEN[dayIdx]} {dateObj.getDate()} {MAANDEN[dateObj.getMonth()]}
        </p>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{proj?.naam || entry.projectNumber || "Onbekend project"}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {proj?.nummer || entry.projectNumber}
            {entry.description && ` · ${entry.description}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{entry.hours}u</span>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: s.bg, color: s.text }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
            {s.label}
          </span>
        </div>
      </div>
      {entry.status === "concept" && onSubmit && (
        <button onClick={() => onSubmit(entry.id)} className="mt-3 w-full py-2 rounded-xl text-xs font-semibold transition-colors" style={{ background: "var(--success-light)", border: "1px solid #8DC99A", color: "var(--success)" }}>
          Indienen ter goedkeuring →
        </button>
      )}
      {entry.status === "afgekeurd" && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] italic flex items-center gap-1" style={{ color: "var(--danger)" }}><X className="h-3 w-3" /> Afgekeurd — pas aan en dien opnieuw in.</p>
          {onRevertToConcept && (
            <button onClick={() => onRevertToConcept(entry.id)} className="w-full py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1" style={{ background: "var(--warn-light)", border: "1px solid #E8D070", color: "var(--warn-text)" }}>
              <Pencil className="h-3 w-3" /> Aanpassen en opnieuw indienen
            </button>
          )}
          {onRemove && (
            <button onClick={() => onRemove(entry.id)} className="w-full py-1.5 rounded-lg text-[11px] font-medium transition-colors" style={{ color: "var(--text-muted)" }}>
              Verwijderen
            </button>
          )}
        </div>
      )}
      {onRemove && entry.status === "concept" && (
        <button onClick={() => onRemove(entry.id)} className="mt-2 w-full py-1.5 rounded-lg text-[11px] font-medium transition-colors" style={{ color: "var(--text-muted)" }}>
          Verwijderen
        </button>
      )}
    </div>
  );
}

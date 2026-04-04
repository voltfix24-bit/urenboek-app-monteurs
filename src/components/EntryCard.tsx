import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { getProjectByNummer } from "@/lib/projects";
import { TimeEntry } from "@/types/timesheet";

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  concept: { bg: "rgba(100,116,139,0.15)", text: "#94a3b8", dot: "#64748b", label: "Concept" },
  ingediend: { bg: "rgba(251,191,36,0.12)", text: "#fbbf24", dot: "#f59e0b", label: "Ingediend" },
  goedgekeurd: { bg: "rgba(52,211,153,0.12)", text: "#34d399", dot: "#10b981", label: "Goedgekeurd" },
  afgekeurd: { bg: "rgba(248,113,113,0.12)", text: "#f87171", dot: "#ef4444", label: "Afgekeurd" },
};

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

interface EntryCardProps {
  entry: TimeEntry;
  onSubmit?: (id: string) => void;
  onRemove?: (id: string) => void;
  showDate?: boolean;
}

export function EntryCard({ entry, onSubmit, onRemove, showDate = false }: EntryCardProps) {
  const proj = getProjectByNummer(entry.projectNumber);
  const s = STATUS_CONFIG[entry.status] || STATUS_CONFIG.concept;
  const dateObj = new Date(entry.date + "T12:00:00");
  const dayIdx = dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1;

  return (
    <div
      className="rounded-2xl border border-border/60 p-4 transition-transform active:scale-[0.985]"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      {showDate && (
        <p className="text-xs font-medium text-muted-foreground mb-2">
          {DAGEN[dayIdx]} {dateObj.getDate()} {MAANDEN[dateObj.getMonth()]}
        </p>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">
            {proj?.naam || entry.projectNumber}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {proj?.nummer || entry.projectNumber}
            {entry.description && ` · ${entry.description}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold text-foreground">{entry.hours}u</span>
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1"
            style={{ background: s.bg, color: s.text }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
            {s.label}
          </span>
        </div>
      </div>

      {entry.status === "concept" && onSubmit && (
        <button
          onClick={() => onSubmit(entry.id)}
          className="mt-3 w-full py-2 rounded-xl text-xs font-semibold transition-colors"
          style={{
            background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.2)",
            color: "#22c55e",
          }}
        >
          Indienen ter goedkeuring →
        </button>
      )}

      {entry.status === "afgekeurd" && (
        <p className="mt-2 text-[11px] text-destructive/70 italic">
          Neem contact op met je manager voor toelichting.
        </p>
      )}

      {onRemove && entry.status === "concept" && (
        <button
          onClick={() => onRemove(entry.id)}
          className="mt-2 w-full py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-destructive transition-colors"
        >
          Verwijderen
        </button>
      )}
    </div>
  );
}

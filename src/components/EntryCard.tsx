import { useState, useEffect } from "react";
import { useProjects } from "@/hooks/useProjects";
import { TimeEntry } from "@/hooks/useTimesheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Pencil, AlertTriangle, CheckCircle } from "lucide-react";

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  concept: { bg: "var(--bg-surface-2)", text: "var(--text-secondary)", dot: "var(--text-muted)", label: "Concept" },
  ingediend: { bg: "var(--warn-light)", text: "var(--warn-text)", dot: "var(--warn-dot)", label: "Ingediend" },
  goedgekeurd: { bg: "var(--success-light)", text: "var(--success)", dot: "var(--success)", label: "Goedgekeurd" },
  afgekeurd: { bg: "var(--danger-light)", text: "var(--danger)", dot: "var(--danger)", label: "Afgekeurd" },
};

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

interface OverurenMelding {
  id: string;
  type: string;
  geboekte_uren: number;
  limiet_uren: number;
  ingeplande_uren: number | null;
  toelichting: string | null;
  status: string;
}

function getMeldingText(m: OverurenMelding, datum: string) {
  const d = new Date(datum + "T12:00:00");
  const formatted = `${d.getDate()} ${MAANDEN[d.getMonth()]}`;
  if (m.type === "dag_overschrijding") return `Je hebt ${m.geboekte_uren}u geboekt op ${formatted}. Meer dan 8u per dag.`;
  if (m.type === "week_overschrijding") return `Je hebt ${m.geboekte_uren}u geboekt deze week. Meer dan 40u per week.`;
  if (m.type === "meer_dan_ingepland") return `Je hebt ${m.geboekte_uren}u geboekt, maar was ${m.ingeplande_uren}u ingepland op dit project.`;
  return "";
}

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

  const [melding, setMelding] = useState<OverurenMelding | null>(null);
  const [toelichting, setToelichting] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!entry.date || entry.status === "concept") return;
    (async () => {
      // Check for overuren meldingen for this entry's medewerker + datum
      const { data } = await supabase
        .from("overuren_meldingen")
        .select("id, type, geboekte_uren, limiet_uren, ingeplande_uren, toelichting, status")
        .eq("datum", entry.date)
        .limit(5);
      if (data && data.length > 0) {
        // Find matching melding
        const match = data.find((m: any) => m.status === "open" || m.status === "goedgekeurd" || m.status === "afgekeurd");
        if (match) {
          setMelding({
            ...match,
            geboekte_uren: Number(match.geboekte_uren),
            limiet_uren: Number(match.limiet_uren),
            ingeplande_uren: match.ingeplande_uren != null ? Number(match.ingeplande_uren) : null,
          });
          if (match.toelichting) setSent(true);
        }
      }
    })();
  }, [entry.date, entry.status]);

  const handleSendToelichting = async () => {
    if (!melding || !toelichting.trim()) return;
    const { error } = await supabase.from("overuren_meldingen").update({ toelichting: toelichting.trim() }).eq("id", melding.id);
    if (error) { toast.error("Fout bij versturen"); return; }
    toast.success("Toelichting verstuurd ✓");
    setSent(true);
    setMelding(prev => prev ? { ...prev, toelichting: toelichting.trim() } : null);
  };

  return (
    <div className="rounded-2xl p-4 transition-transform active:scale-[0.985]" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
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

      {/* Overuren waarschuwingsblok */}
      {melding && melding.status === "open" && !sent && (
        <div style={{ background: "var(--warn-bg)", border: "1px solid var(--warn-border)", borderRadius: 10, padding: "10px 12px", marginTop: 10 }}>
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--warn-text)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--warn-text)" }}>Overuren gedetecteerd</span>
          </div>
          <p className="text-[11px] mt-1" style={{ color: "var(--warn-text)" }}>{getMeldingText(melding, entry.date)}</p>
          <p className="text-[11px] font-medium mt-2" style={{ color: "var(--warn-text)" }}>Toelichting voor manager:</p>
          <textarea
            value={toelichting}
            onChange={e => setToelichting(e.target.value)}
            placeholder="Geef een verklaring voor de extra uren..."
            style={{
              background: "var(--bg-base)", border: "1px solid var(--warn-border)", borderRadius: 8,
              padding: "8px 10px", fontSize: 12, width: "100%", minHeight: 60, resize: "none", marginTop: 6,
              color: "var(--text-primary)",
            }}
          />
          <button onClick={handleSendToelichting} disabled={!toelichting.trim()} style={{
            background: "var(--warn-text)", color: "#fff", borderRadius: 8, padding: "7px 14px",
            fontSize: 12, fontWeight: 600, marginTop: 6, width: "100%", border: "none", cursor: "pointer",
            opacity: toelichting.trim() ? 1 : 0.5,
          }}>
            Versturen
          </button>
        </div>
      )}
      {melding && melding.status === "open" && (sent || melding.toelichting) && (
        <p className="text-[11px] font-medium mt-2.5" style={{ color: "var(--warn-text)" }}>
          ✓ Toelichting verstuurd — wacht op beoordeling manager
        </p>
      )}
      {melding && melding.status === "goedgekeurd" && (
        <div className="flex items-center gap-1.5 mt-2.5 px-3 py-2 rounded-xl" style={{ background: "var(--success-light)", border: "1px solid var(--success-border)" }}>
          <CheckCircle className="h-3.5 w-3.5" style={{ color: "var(--success)" }} />
          <span className="text-[11px] font-medium" style={{ color: "var(--success)" }}>Overuren goedgekeurd door manager</span>
        </div>
      )}
      {melding && melding.status === "afgekeurd" && (
        <div className="flex items-center gap-1.5 mt-2.5 px-3 py-2 rounded-xl" style={{ background: "var(--danger-light)", border: "1px solid var(--danger-border)" }}>
          <X className="h-3.5 w-3.5" style={{ color: "var(--danger)" }} />
          <span className="text-[11px] font-medium" style={{ color: "var(--danger)" }}>Overuren afgekeurd — neem contact op met je manager</span>
        </div>
      )}

      {entry.status === "concept" && onSubmit && (
        <button onClick={() => onSubmit(entry.id)} className="mt-3 w-full py-2 rounded-xl text-xs font-semibold transition-colors" style={{ background: "var(--success-light)", border: "1px solid var(--success-border)", color: "var(--success)" }}>
          Indienen ter goedkeuring →
        </button>
      )}
      {entry.status === "afgekeurd" && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] italic flex items-center gap-1" style={{ color: "var(--danger)" }}><X className="h-3 w-3" /> Afgekeurd — pas aan en dien opnieuw in.</p>
          {onRevertToConcept && (
            <button onClick={() => onRevertToConcept(entry.id)} className="w-full py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)", color: "var(--warn-text)" }}>
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

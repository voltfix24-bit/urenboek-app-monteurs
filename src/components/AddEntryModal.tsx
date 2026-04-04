import { useState, useRef, useCallback } from "react";
import { format } from "date-fns";
import { useProjects } from "@/hooks/useProjects";

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function dateKey(date: Date) {
  return date.toISOString().split("T")[0];
}

interface AddEntryModalProps {
  weekDays: Date[];
  onClose: () => void;
  onSubmit: (entry: { date: string; projectNumber: string; description: string; hours: number }) => void;
  initialDate?: Date | null;
}

export function AddEntryModal({ weekDays, onClose, onSubmit, initialDate }: AddEntryModalProps) {
  const { projects, loading } = useProjects();
  const [step, setStep] = useState(initialDate ? 2 : 1);
  const [selectedDate, setSelectedDate] = useState<Date | null>(initialDate || null);
  const [form, setForm] = useState({ projectNummer: null as string | null, werkzaamheden: null as string | null, uren: 8 });
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    setDragY(Math.max(0, dy));
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    if (dragY > 120) {
      onClose();
    } else {
      setDragY(0);
    }
  }, [dragY, onClose]);

  const proj = projects.find((p) => p.nummer === form.projectNummer);
  const today = dateKey(new Date());

  function handleSubmit() {
    if (!selectedDate || !proj || !form.werkzaamheden) return;
    onSubmit({
      date: format(selectedDate, "yyyy-MM-dd"),
      projectNumber: proj.nummer,
      description: form.werkzaamheden,
      hours: form.uren,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", opacity: isDragging ? Math.max(0.2, 1 - dragY / 300) : 1 }}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[430px] mx-auto animate-sheet-up"
        style={{
          background: "#13131f",
          borderRadius: "24px 24px 0 0",
          padding: "20px 20px 40px",
          border: "1px solid rgba(255,255,255,0.08)",
          minHeight: 360,
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? "none" : "transform 0.3s ease",
        }}
      >
        <div
          className="flex justify-center mb-5 py-2 cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.25)" }} />
        </div>

        <div className="flex gap-1.5 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="h-1 flex-1 rounded-full transition-all duration-300" style={{ background: step >= s ? "#22c55e" : "rgba(255,255,255,0.08)" }} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-foreground">Kies een dag</h3>
              <p className="text-xs text-muted-foreground mt-1">Voor welke dag wil je uren boeken?</p>
            </div>
            <div className="space-y-2">
              {weekDays.map((d, i) => {
                const isToday = dateKey(d) === today;
                return (
                  <button key={i} onClick={() => { setSelectedDate(d); setStep(2); }} className="w-full flex items-center justify-between transition-colors active:scale-[0.97]" style={{ padding: "14px 16px", borderRadius: 14, background: isToday ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.04)", border: isToday ? "1px solid rgba(34,197,94,0.25)" : "1px solid rgba(255,255,255,0.07)", color: "#f1f5f9", fontSize: 14, fontWeight: 500 }}>
                    <span>{DAGEN[i]} {d.getDate()} {MAANDEN[d.getMonth()]}</span>
                    {isToday && <span className="text-[11px] font-medium" style={{ color: "#22c55e" }}>Vandaag</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setStep(1)} className="text-lg text-muted-foreground" style={{ background: "none" }}>←</button>
              <h3 className="text-base font-bold text-foreground">Kies project</h3>
            </div>
            {selectedDate && (
              <p className="text-xs text-muted-foreground">
                {DAGEN[selectedDate.getDay() === 0 ? 6 : selectedDate.getDay() - 1]} {selectedDate.getDate()} {MAANDEN[selectedDate.getMonth()]}
              </p>
            )}
            <div className="space-y-2">
              {loading ? (
                <p className="text-xs text-muted-foreground text-center py-4">Laden...</p>
              ) : (
                projects.map((p) => (
                  <button key={p.id} onClick={() => { setForm((f) => ({ ...f, projectNummer: p.nummer })); setStep(3); }} className="w-full text-left transition-colors active:scale-[0.97]" style={{ padding: "14px 16px", borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "#f1f5f9" }}>
                    <p className="text-sm font-semibold">{p.naam}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.nummer}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <button onClick={() => setStep(2)} className="text-lg text-muted-foreground" style={{ background: "none" }}>←</button>
              <h3 className="text-base font-bold text-foreground">Uren invullen</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {proj?.naam} · {selectedDate && `${selectedDate.getDate()} ${MAANDEN[selectedDate.getMonth()]}`}
            </p>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Soort werkzaamheden</label>
              <div className="flex gap-2">
                {["schakelen", "monteren"].map((w) => (
                  <button key={w} onClick={() => setForm((f) => ({ ...f, werkzaamheden: w }))} className="flex-1 py-3 rounded-xl text-sm font-semibold capitalize transition-colors" style={{ background: form.werkzaamheden === w ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)", border: form.werkzaamheden === w ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(255,255,255,0.07)", color: form.werkzaamheden === w ? "#22c55e" : "#64748b" }}>
                    {w}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Aantal uren</label>
              <div className="flex items-center justify-center gap-6">
                <button onClick={() => setForm((f) => ({ ...f, uren: Math.max(0.5, f.uren - 0.5) }))} className="w-10 h-10 rounded-xl flex items-center justify-center text-xl text-muted-foreground" style={{ background: "rgba(255,255,255,0.06)" }}>−</button>
                <span className="text-3xl font-bold text-foreground tabular-nums">{form.uren}u</span>
                <button onClick={() => setForm((f) => ({ ...f, uren: Math.min(24, f.uren + 0.5) }))} className="w-10 h-10 rounded-xl flex items-center justify-center text-xl text-muted-foreground" style={{ background: "rgba(255,255,255,0.06)" }}>+</button>
              </div>
              <div className="flex justify-center gap-2 mt-2">
                {[4, 6, 8, 9, 10].map((h) => (
                  <button key={h} onClick={() => setForm((f) => ({ ...f, uren: h }))} className="px-3 py-1 rounded-lg text-xs font-medium transition-colors" style={{ background: form.uren === h ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)", border: form.uren === h ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.07)", color: form.uren === h ? "#22c55e" : "#475569" }}>
                    {h}u
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleSubmit} disabled={!form.werkzaamheden} className="w-full py-3.5 rounded-2xl text-sm font-bold transition-all disabled:opacity-40" style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", boxShadow: "0 8px 24px rgba(34,197,94,0.3)" }}>
              Opslaan als concept
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

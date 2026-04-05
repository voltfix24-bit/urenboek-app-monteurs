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
  onSubmit: (entry: { date: string; projectId: string; description: string; hours: number }) => void;
  initialDate?: Date | null;
}

export function AddEntryModal({ weekDays, onClose, onSubmit, initialDate }: AddEntryModalProps) {
  const { projects, loading } = useProjects();
  const [step, setStep] = useState(initialDate ? 2 : 1);
  const [selectedDate, setSelectedDate] = useState<Date | null>(initialDate || null);
  const [form, setForm] = useState({ projectId: null as string | null, werkzaamheden: null as string | null, uren: 8 });
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

  const proj = projects.find((p) => p.id === form.projectId);
  const today = dateKey(new Date());

  function handleSubmit() {
    if (!selectedDate || !proj || !form.werkzaamheden) return;
    onSubmit({
      date: format(selectedDate, "yyyy-MM-dd"),
      projectId: proj.id,
      description: form.werkzaamheden,
      hours: form.uren,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in"
      style={{ background: "rgba(45,74,30,0.35)", backdropFilter: "blur(6px)", opacity: isDragging ? Math.max(0.2, 1 - dragY / 300) : 1 }}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[430px] mx-auto animate-sheet-up"
        style={{
          background: "#EBF0E4",
          borderRadius: "24px 24px 0 0",
          padding: "20px 20px 48px",
          border: "1px solid #C5D4B2",
          borderBottom: "none",
          minHeight: 360,
          maxHeight: "85vh",
          overflowY: "auto" as const,
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
          <div className="w-10 h-1 rounded-full" style={{ background: "#C5D4B2" }} />
        </div>

        <div className="flex gap-1.5 mb-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="h-1 flex-1 rounded-full transition-all duration-300" style={{ background: step >= s ? "#4A7C2F" : "#C5D4B2" }} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-bold" style={{ color: "#2D4A1E" }}>Kies een dag</h3>
              <p className="text-xs mt-1" style={{ color: "#8AAD6E" }}>Voor welke dag wil je uren boeken?</p>
            </div>
            <div className="space-y-2">
              {weekDays.map((d, i) => {
                const isToday = dateKey(d) === today;
                return (
                  <button key={i} onClick={() => { setSelectedDate(d); setStep(2); }} className="w-full flex items-center justify-between transition-colors active:scale-[0.97]" style={{ padding: "14px 16px", borderRadius: 14, background: isToday ? "#D4E8C2" : "#F5F7F0", border: isToday ? "1px solid #9DC87A" : "1px solid #C5D4B2", color: "#2D4A1E", fontSize: 14, fontWeight: 500 }}>
                    <span>{DAGEN[i]} {d.getDate()} {MAANDEN[d.getMonth()]}</span>
                    {isToday && <span className="text-[11px] font-medium" style={{ color: "#4A7C2F" }}>Vandaag</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setStep(1)} className="text-lg" style={{ background: "none", color: "#8AAD6E" }}>←</button>
              <h3 className="text-base font-bold" style={{ color: "#2D4A1E" }}>Kies project</h3>
            </div>
            {selectedDate && (
              <p className="text-xs" style={{ color: "#8AAD6E" }}>
                {DAGEN[selectedDate.getDay() === 0 ? 6 : selectedDate.getDay() - 1]} {selectedDate.getDate()} {MAANDEN[selectedDate.getMonth()]}
              </p>
            )}
            <div className="space-y-2">
              {loading ? (
                <p className="text-xs text-center py-4" style={{ color: "#8AAD6E" }}>Laden...</p>
              ) : (
                projects.map((p) => (
                  <button key={p.id} onClick={() => { setForm((f) => ({ ...f, projectId: p.id })); setStep(3); }} className="w-full text-left transition-colors active:scale-[0.97]" style={{ padding: "14px 16px", borderRadius: 14, background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#2D4A1E" }}>
                    <p className="text-sm font-semibold">{p.naam}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#8AAD6E" }}>{p.nummer}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <button onClick={() => setStep(2)} className="text-lg" style={{ background: "none", color: "#8AAD6E" }}>←</button>
              <h3 className="text-base font-bold" style={{ color: "#2D4A1E" }}>Uren invullen</h3>
            </div>
            <p className="text-xs" style={{ color: "#8AAD6E" }}>
              {proj?.naam} · {selectedDate && `${selectedDate.getDate()} ${MAANDEN[selectedDate.getMonth()]}`}
            </p>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#8AAD6E" }}>Soort werkzaamheden</label>
              <div className="flex gap-2">
                {["schakelen", "monteren"].map((w) => (
                  <button key={w} onClick={() => setForm((f) => ({ ...f, werkzaamheden: w }))} className="flex-1 py-3 rounded-xl text-sm font-semibold capitalize transition-colors" style={{ background: form.werkzaamheden === w ? "#D4E8C2" : "#F5F7F0", border: form.werkzaamheden === w ? "1px solid #9DC87A" : "1px solid #C5D4B2", color: form.werkzaamheden === w ? "#4A7C2F" : "#8AAD6E" }}>
                    {w}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#8AAD6E" }}>Aantal uren</label>
              <div className="flex items-center justify-center gap-6">
                <button onClick={() => setForm((f) => ({ ...f, uren: Math.max(0.5, f.uren - 0.5) }))} className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "#DFE8D6", color: "#5A7A42" }}>−</button>
                <span className="text-3xl font-bold tabular-nums" style={{ color: "#2D4A1E" }}>{form.uren}u</span>
                <button onClick={() => setForm((f) => ({ ...f, uren: Math.min(24, f.uren + 0.5) }))} className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "#DFE8D6", color: "#5A7A42" }}>+</button>
              </div>
              <div className="flex justify-center gap-2 mt-2">
                {[4, 6, 8, 9, 10].map((h) => (
                  <button key={h} onClick={() => setForm((f) => ({ ...f, uren: h }))} className="px-3 py-1 rounded-lg text-xs font-medium transition-colors" style={{ background: form.uren === h ? "#D4E8C2" : "#F5F7F0", border: form.uren === h ? "1px solid #9DC87A" : "1px solid #C5D4B2", color: form.uren === h ? "#4A7C2F" : "#8AAD6E" }}>
                    {h}u
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleSubmit} disabled={!form.werkzaamheden} className="w-full py-3.5 rounded-2xl text-sm font-bold transition-all disabled:opacity-40" style={{ background: "linear-gradient(135deg, #4A7C2F, #3D6826)", color: "#fff", boxShadow: "0 8px 24px rgba(74,124,47,0.3)" }}>
              Opslaan als concept
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

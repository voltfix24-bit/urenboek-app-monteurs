import { useState, useRef, useCallback } from "react";
import { format } from "date-fns";
import { useProjects } from "@/hooks/useProjects";
import { valideer, urenBoekingSchema } from "@/lib/validatie";

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
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
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
    if (!selectedDate) return;
    const vResult = valideer(urenBoekingSchema, {
      projectId: form.projectId || "",
      werkzaamheden: form.werkzaamheden || "",
      uren: form.uren,
    });
    if (!vResult.success) {
      setFormErrors(vResult.errors);
      return;
    }
    setFormErrors({});
    onSubmit({
      date: format(selectedDate, "yyyy-MM-dd"),
      projectId: form.projectId!,
      description: form.werkzaamheden!,
      hours: form.uren,
    });
    onClose();
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'rgba(10,26,48,0.97)',
          backdropFilter: 'blur(24px)',
          borderRadius: '40px 40px 0 0',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          maxHeight: '90vh',
          overflowY: 'auto',
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s ease',
          paddingBottom: 40,
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 8px' }}>
          <div style={{ width: 48, height: 6, borderRadius: 9999, background: 'rgba(255,255,255,0.2)' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px 24px' }}>
          <span style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 28, color: '#dae6ff' }}>
            Uren registreren
          </span>
          <button
            onClick={onClose}
            style={{
              width: 40, height: 40, borderRadius: '50%', background: '#142640',
              border: 'none', color: '#a0abc3', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        <div style={{ padding: '0 24px' }}>
          {/* SECTION 1 — DAG SELECTEREN */}
          <div style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a0abc3', marginBottom: 12 }}>
              Dag selecteren
            </p>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none', position: 'relative' }}>
              {weekDays.slice(0, 5).map((day, i) => {
                const DAGEN_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr'];
                const dateStr = day.toISOString().split('T')[0];
                const isSelected = selectedDate?.toISOString().split('T')[0] === dateStr;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(day)}
                    style={{
                      minWidth: 68, height: 56, borderRadius: 16,
                      border: isSelected ? '2px solid #3fff8b' : '1px solid rgba(255,255,255,0.07)',
                      background: isSelected ? '#3fff8b' : '#102038',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, flexShrink: 0,
                      boxShadow: isSelected ? '0 0 12px rgba(63,255,139,0.3)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Inter', color: isSelected ? '#005d2c' : '#a0abc3' }}>
                      {DAGEN_SHORT[i]}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'Inter', color: isSelected ? '#004820' : 'rgba(160,171,195,0.6)' }}>
                      {day.getDate()} {['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][day.getMonth()]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION 2 — PROJECT SELECTEREN */}
          <div style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a0abc3', marginBottom: 12 }}>
              Project selecteren
            </p>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#a0abc3', fontSize: 13 }}>Projecten laden...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {projects.map((project) => {
                  const isActive = form.projectId === project.id;
                  return (
                    <button
                      key={project.id}
                      onClick={() => setForm(f => ({ ...f, projectId: project.id }))}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderRadius: 16,
                        border: isActive ? '2px solid #3fff8b' : '1px solid rgba(255,255,255,0.05)',
                        background: isActive ? 'rgba(63,255,139,0.05)' : '#061327',
                        cursor: 'pointer', boxShadow: isActive ? '0 0 20px rgba(63,255,139,0.1)' : 'none',
                        opacity: isActive ? 1 : 0.7, textAlign: 'left', width: '100%',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                          width: 48, height: 48, borderRadius: 12,
                          background: isActive ? 'rgba(63,255,139,0.2)' : '#142640',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 22, color: isActive ? '#3fff8b' : '#a0abc3' }}>factory</span>
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Inter', color: isActive ? '#3fff8b' : '#dae6ff', marginBottom: 4 }}>
                            {project.naam || project.nummer}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: '#a0abc3', fontFamily: 'Inter' }}>0u geboekt vandaag</span>
                            <span style={{ fontSize: 10, color: '#a0abc3', opacity: 0.4 }}>•</span>
                            <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#a0abc3' }}>location_on</span>
                            <span style={{ fontSize: 11, color: '#a0abc3', fontFamily: 'Inter' }}>{project.stad || project.adres || ''}</span>
                          </div>
                        </div>
                      </div>
                      {isActive && (
                        <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#3fff8b', fontVariationSettings: "'FILL' 1", flexShrink: 0 }}>check_circle</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {formErrors.projectId && (
              <p style={{ fontSize: 11, color: '#ff716c', marginTop: 6, fontFamily: 'Inter' }}>{formErrors.projectId}</p>
            )}
          </div>

          {/* SECTION 3 — AANTAL UREN */}
          <div style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a0abc3', marginBottom: 24, textAlign: 'center' }}>
              Aantal uren
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, marginBottom: 24 }}>
              <button
                onClick={() => setForm(f => ({ ...f, uren: Math.max(0.5, f.uren - 0.5) }))}
                style={{
                  width: 64, height: 64, borderRadius: '50%', background: '#142640',
                  border: '2px solid rgba(255,113,108,0.3)', color: '#dae6ff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 28,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 28 }}>remove</span>
              </button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 96, color: '#dae6ff', lineHeight: 1 }}>{form.uren}</div>
                <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Inter', color: '#3fff8b', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: -8 }}>UUR</div>
              </div>
              <button
                onClick={() => setForm(f => ({ ...f, uren: Math.min(24, f.uren + 0.5) }))}
                style={{
                  width: 64, height: 64, borderRadius: '50%', background: 'rgba(63,255,139,0.2)',
                  border: '2px solid rgba(63,255,139,0.3)', color: '#3fff8b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  boxShadow: '0 0 20px rgba(63,255,139,0.15)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 28 }}>add</span>
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              {[4, 6, 8, 10].map((h) => {
                const isActive = form.uren === h;
                return (
                  <button
                    key={h}
                    onClick={() => setForm(f => ({ ...f, uren: h }))}
                    style={{
                      padding: '10px 20px', borderRadius: 9999,
                      border: isActive ? '2px solid #3fff8b' : '1px solid rgba(255,255,255,0.07)',
                      background: isActive ? 'rgba(63,255,139,0.1)' : '#061327',
                      color: isActive ? '#3fff8b' : '#dae6ff',
                      fontFamily: 'Manrope', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                      boxShadow: isActive ? '0 0 10px rgba(63,255,139,0.1)' : 'none',
                    }}
                  >
                    {h}u
                  </button>
                );
              })}
            </div>
            {formErrors.uren && (
              <p style={{ fontSize: 11, color: '#ff716c', marginTop: 8, textAlign: 'center', fontFamily: 'Inter' }}>{formErrors.uren}</p>
            )}
          </div>

          {/* SECTION 4 — OPMERKINGEN */}
          <div style={{ marginBottom: 24 }}>
            <button
              onClick={() => setForm(f => ({ ...f, werkzaamheden: f.werkzaamheden === null ? '' : null }))}
              style={{
                width: '100%', padding: '16px 20px', borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.07)', background: '#061327',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#a0abc3' }}>notes</span>
                <span style={{ fontSize: 13, fontFamily: 'Inter', color: '#a0abc3', fontStyle: 'italic' }}>
                  {form.werkzaamheden !== null ? (form.werkzaamheden || 'Typ opmerkingen...') : 'Opmerkingen toevoegen...'}
                </span>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#a0abc3' }}>
                {form.werkzaamheden !== null ? 'expand_less' : 'expand_more'}
              </span>
            </button>
            {form.werkzaamheden !== null && (
              <textarea
                value={form.werkzaamheden}
                onChange={(e) => setForm(f => ({ ...f, werkzaamheden: e.target.value }))}
                placeholder="Beschrijf de werkzaamheden..."
                rows={3}
                style={{
                  width: '100%', marginTop: 8, padding: '12px 16px', borderRadius: 16,
                  border: '1px solid rgba(63,255,139,0.3)', background: '#061327',
                  color: '#dae6ff', fontFamily: 'Inter', fontSize: 14, resize: 'none', outline: 'none', boxSizing: 'border-box',
                }}
              />
            )}
          </div>

          {/* OPSLAAN BUTTON */}
          <button
            onClick={handleSubmit}
            style={{
              width: '100%', height: 64, borderRadius: 16, background: '#3fff8b', color: '#005d2c',
              fontFamily: 'Manrope', fontWeight: 800, fontSize: 18, textTransform: 'uppercase', letterSpacing: '0.1em',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: '0 8px 32px rgba(63,255,139,0.2)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>save</span>
            OPSLAAN
          </button>
        </div>
      </div>
    </div>
  );
}

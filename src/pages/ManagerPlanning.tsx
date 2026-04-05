import { useState, useEffect, useCallback, useMemo } from "react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { PullToRefresh } from "@/components/PullToRefresh";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { ChevronLeft, ChevronRight, Plus, X, AlertTriangle } from "lucide-react";
import { format, startOfISOWeek, addDays, addWeeks, getISOWeek } from "date-fns";
import { nl } from "date-fns/locale";

interface PlanningEntry { id: string; medewerker_id: string; project_id: string; datum: string; starttijd: string; eindtijd: string; notitie: string; }
interface MedewerkerInfo { id: string; full_name: string; vaste_vrije_dagen: number[]; }
interface ProjectInfo { id: string; naam: string; nummer: string; }
interface BeschikbaarheidItem { medewerker_id: string; datum_van: string; datum_tot: string; type: string; status: string; }

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr"];
const DAG_MAP = [1, 2, 3, 4, 5];
const AVATAR_COLORS = ['var(--accent)', 'var(--accent-mid)', 'var(--info-dark)', 'var(--warn-text)', 'var(--purple)'];

function getConflicts(medId: string, dateStr: string, dayIndex: number, entries: PlanningEntry[], medewerkers: MedewerkerInfo[], beschikbaarheid: BeschikbaarheidItem[], currentEditId: string | null, weekDateStrings?: string[]): string[] {
  const conflicts: string[] = [];
  const med = medewerkers.find(m => m.id === medId);
  const jsDayNum = DAG_MAP[dayIndex];
  if (med?.vaste_vrije_dagen?.includes(jsDayNum)) conflicts.push("Vaste vrije dag");
  const dubbel = entries.filter(e => e.medewerker_id === medId && e.datum === dateStr && e.id !== currentEditId);
  if (dubbel.length > 0) conflicts.push("Al ingepland");
  const verlof = beschikbaarheid.find(b => b.medewerker_id === medId && b.status === "goedgekeurd" && dateStr >= b.datum_van && dateStr <= b.datum_tot);
  if (verlof) conflicts.push(verlof.type === "ziek" ? "Ziekmelding" : "Op vakantie/verlof");
  if (weekDateStrings) {
    const uniqueDays = new Set(entries.filter(e => e.medewerker_id === medId && e.id !== currentEditId && weekDateStrings.includes(e.datum)).map(e => e.datum));
    uniqueDays.add(dateStr);
    if (uniqueDays.size > 5) conflicts.push("Meer dan 5 dagen ingepland deze week");
  }
  return conflicts;
}

function getOverplannedMedewerkers(entries: PlanningEntry[], medewerkers: MedewerkerInfo[], weekDateStrings: string[]): { id: string; name: string; days: number }[] {
  const result: { id: string; name: string; days: number }[] = [];
  for (const med of medewerkers) {
    const uniqueDays = new Set(entries.filter(e => e.medewerker_id === med.id && weekDateStrings.includes(e.datum)).map(e => e.datum));
    if (uniqueDays.size > 5) result.push({ id: med.id, name: med.full_name, days: uniqueDays.size });
  }
  return result;
}

function getModalStatus(medId: string, dateStr: string, medewerkers: MedewerkerInfo[], beschikbaarheid: BeschikbaarheidItem[], dateObj: Date): { label: string; color: string; bg: string } | null {
  const med = medewerkers.find(m => m.id === medId);
  const verlof = beschikbaarheid.find(b => b.medewerker_id === medId && b.status === "goedgekeurd" && dateStr >= b.datum_van && dateStr <= b.datum_tot);
  if (verlof) return { label: "Op vakantie", color: "var(--danger)", bg: "var(--danger-light)" };
  const jsDay = dateObj.getDay();
  if (med?.vaste_vrije_dagen?.includes(jsDay)) return { label: "Vaste vrije dag", color: "var(--warn-text)", bg: "var(--warn-bg)" };
  return { label: "Beschikbaar", color: "var(--success)", bg: "var(--success-light)" };
}

export default function ManagerPlanning() {
  const { isManager, user } = useAuth();
  const { profileId: myProfileId } = useProfile();
  const [weekStart, setWeekStart] = useState(() => startOfISOWeek(new Date()));
  const [entries, setEntries] = useState<PlanningEntry[]>([]);
  const [medewerkers, setMedewerkers] = useState<MedewerkerInfo[]>([]);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [beschikbaarheid, setBeschikbaarheid] = useState<BeschikbaarheidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalForm, setModalForm] = useState({ medewerker_id: "", project_id: "", datum: "", starttijd: "07:00", eindtijd: "16:00", notitie: "" });
  const [editId, setEditId] = useState<string | null>(null);

  const weekNumber = getISOWeek(weekStart);
  const weekDates = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
  const weekDateStrings = useMemo(() => weekDates.map(d => format(d, "yyyy-MM-dd")), [weekStart]);
  const overplanned = useMemo(() => getOverplannedMedewerkers(entries, medewerkers, weekDateStrings), [entries, medewerkers, weekDateStrings]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const startStr = format(weekStart, "yyyy-MM-dd");
    const endStr = format(addDays(weekStart, 4), "yyyy-MM-dd");
    const [{ data: planData }, { data: profData }, { data: projData }, { data: beschData }] = await Promise.all([
      supabase.from("planning").select("*").gte("datum", startStr).lte("datum", endStr),
      supabase.from("profiles").select("id, full_name, vaste_vrije_dagen").order("full_name"),
      supabase.from("projects").select("id, naam, nummer").eq("active", true).order("nummer"),
      supabase.from("beschikbaarheid").select("medewerker_id, datum_van, datum_tot, type, status").eq("status", "goedgekeurd").lte("datum_van", endStr).gte("datum_tot", startStr),
    ]);
    setEntries((planData ?? []).map((d: any) => ({ id: d.id, medewerker_id: d.medewerker_id, project_id: d.project_id, datum: d.datum, starttijd: d.starttijd?.slice(0, 5), eindtijd: d.eindtijd?.slice(0, 5), notitie: d.notitie || "" })));
    setMedewerkers((profData ?? []) as any);
    setProjects((projData ?? []) as any);
    setBeschikbaarheid((beschData ?? []) as any);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { fetchAll(); }, [fetchAll]);



  const openAddModal = (medewerker_id: string, datum: string) => {
    const existing = entries.find(e => e.medewerker_id === medewerker_id && e.datum === datum);
    if (existing) {
      setEditId(existing.id);
      setModalForm({ medewerker_id: existing.medewerker_id, project_id: existing.project_id, datum: existing.datum, starttijd: existing.starttijd, eindtijd: existing.eindtijd, notitie: existing.notitie });
    } else {
      setEditId(null);
      setModalForm({ medewerker_id, project_id: projects[0]?.id || "", datum, starttijd: "07:00", eindtijd: "16:00", notitie: "" });
    }
    setShowModal(true);
  };

  const savePlanning = async () => {
    if (!myProfileId) return;
    if (editId) {
      if (!await mutate(supabase.from("planning").update({ project_id: modalForm.project_id, starttijd: modalForm.starttijd, eindtijd: modalForm.eindtijd, notitie: modalForm.notitie } as any).eq("id", editId))) return;
      toast.success("Planning bijgewerkt"); setShowModal(false); fetchAll();
    } else {
      if (!await mutate(supabase.from("planning").insert({ medewerker_id: modalForm.medewerker_id, project_id: modalForm.project_id, datum: modalForm.datum, starttijd: modalForm.starttijd, eindtijd: modalForm.eindtijd, notitie: modalForm.notitie, created_by: myProfileId } as any))) return;
      toast.success("Ingepland!"); setShowModal(false); fetchAll();
    }
  };

  const deletePlanning = async () => {
    if (!editId) return;
    if (!await mutate(supabase.from("planning").delete().eq("id", editId))) return;
    toast.success("Verwijderd"); setShowModal(false); fetchAll();
  };

  const projMap = new Map(projects.map(p => [p.id, p]));
  const medName = (id: string) => medewerkers.find(m => m.id === id)?.full_name || "?";

  const modalStatus = useMemo(() => {
    if (!modalForm.medewerker_id || !modalForm.datum) return null;
    const dateObj = new Date(modalForm.datum + "T12:00:00");
    return getModalStatus(modalForm.medewerker_id, modalForm.datum, medewerkers, beschikbaarheid, dateObj);
  }, [modalForm.medewerker_id, modalForm.datum, medewerkers, beschikbaarheid]);

  const modalConflicts = useMemo(() => {
    if (!modalForm.medewerker_id || !modalForm.datum) return [];
    const dayIndex = weekDates.findIndex(d => format(d, "yyyy-MM-dd") === modalForm.datum);
    if (dayIndex < 0) return [];
    return getConflicts(modalForm.medewerker_id, modalForm.datum, dayIndex, entries, medewerkers, beschikbaarheid, editId, weekDateStrings);
  }, [modalForm.medewerker_id, modalForm.datum, entries, medewerkers, beschikbaarheid, editId, weekDates]);

  if (!isManager) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}><p style={{ color: "var(--text-muted)" }}>Alleen managers hebben toegang.</p></div>;
  }

  const gridContent = (
    <main className="px-4 py-4 space-y-4">
      <div className="flex items-center justify-between rounded-2xl p-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <button onClick={() => setWeekStart(p => addWeeks(p, -1))} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>Week {weekNumber}</p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {format(weekStart, "d MMM", { locale: nl })} – {format(addDays(weekStart, 4), "d MMM", { locale: nl })}
          </p>
        </div>
        <button onClick={() => setWeekStart(p => addWeeks(p, 1))} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} /></div>
      ) : (
        <>
          {/* Project legend strip */}
          {(() => {
            const projectDays = new Map<string, { name: string; days: number }>();
            entries.forEach(e => {
              const p = projMap.get(e.project_id);
              if (!p) return;
              const cur = projectDays.get(e.project_id) || { name: p.naam, days: 0 };
              cur.days++;
              projectDays.set(e.project_id, cur);
            });
            if (projectDays.size === 0) return null;
            return (
              <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                {Array.from(projectDays.entries()).map(([id, { name, days }]) => (
                  <span key={id} className="shrink-0 px-2.5 py-1 rounded-full whitespace-nowrap" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: 11, fontWeight: 500 }}>
                    {name.length > 12 ? name.slice(0, 12) + "…" : name} · {days}d
                  </span>
                ))}
              </div>
            );
          })()}

          <div className="flex gap-1">
            <div className="w-16 lg:w-40 shrink-0" />
            {weekDates.map((d, i) => (
              <div key={i} className="flex-1 text-center">
                <p className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>{DAGEN[i]}</p>
                <p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{d.getDate()}</p>
              </div>
            ))}
          </div>


          {overplanned.length > 0 && (
            <div className="rounded-xl px-3 py-2.5 flex items-start gap-2" style={{ background: "var(--warn-bg)", border: "1px solid var(--warn-border)" }}>
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--warn-text)" }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--warn-text)" }}>Overplanning</p>
                {overplanned.map(m => (
                  <p key={m.id} className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    {m.name}: {m.days} dagen ingepland
                  </p>
                ))}
              </div>
            </div>
          )}

          {medewerkers.map((med, mi) => (
            <div key={med.id} className="flex gap-1 items-stretch">
              <div className="w-16 shrink-0 flex items-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ background: AVATAR_COLORS[mi % AVATAR_COLORS.length], color: "#fff" }}>
                    {med.full_name.charAt(0)}
                  </div>
                  <span className="text-[10px] font-medium truncate max-w-[44px]" style={{ color: "var(--text-primary)" }}>{med.full_name.split(" ")[0]}</span>
                </div>
              </div>
              {weekDates.map((d, i) => {
                const dateStr = format(d, "yyyy-MM-dd");
                const entry = entries.find(e => e.medewerker_id === med.id && e.datum === dateStr);
                const proj = entry ? projMap.get(entry.project_id) : null;
                const conflicts = getConflicts(med.id, dateStr, i, entries, medewerkers, beschikbaarheid, null, weekDateStrings);
                const hasConflict = conflicts.length > 0;

                return (
                  <button key={i} onClick={() => openAddModal(med.id, dateStr)} className="flex-1 rounded-xl p-1 min-h-[52px] flex flex-col items-center justify-center text-center transition-colors active:scale-95" style={{
                    background: hasConflict && !entry ? "var(--danger-light)" : entry ? "var(--accent-light)" : "var(--bg-base)",
                    border: hasConflict ? "1px solid var(--danger-border)" : entry ? "1px solid var(--accent-border)" : "1px solid var(--bg-surface-2)",
                  }}>
                    {entry ? (
                      <>
                        <span className="text-[8px] font-bold truncate w-full" style={{ color: "var(--text-primary)" }}>{proj?.nummer?.slice(-3) || "?"}</span>
                        <span className="text-[7px]" style={{ color: "var(--text-muted)" }}>{entry.starttijd}</span>
                      </>
                    ) : hasConflict ? (
                      <AlertTriangle className="h-3 w-3" style={{ color: "var(--danger)", opacity: 0.6 }} />
                    ) : (
                      <Plus className="h-3 w-3" style={{ color: "var(--border)" }} />
                    )}
                    {hasConflict && entry && (
                      <AlertTriangle className="h-2.5 w-2.5 mt-0.5" style={{ color: "var(--danger)" }} />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </>
      )}
    </main>
  );

  return (
    <PageShell>
      <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
        <div className="px-4 py-3 flex items-center gap-2.5">
          <HeaderLogo />
          <span className="text-base font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Planning</span>
        </div>
      </header>

      <div className="lg:hidden">
        <PullToRefresh onRefresh={async () => { await fetchAll(); }}>
          {gridContent}
        </PullToRefresh>
      </div>
      <div className="hidden lg:block" style={{ maxWidth: "none" }}>
        {gridContent}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowModal(false)}>
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--text-primary) 35%, transparent)", backdropFilter: "blur(6px)" }} />
          <div className="relative w-full animate-sheet-up rounded-t-3xl p-5 space-y-4" style={{ maxWidth: 430, maxHeight: "85vh", overflowY: "auto", background: "var(--bg-surface)", border: "1px solid var(--border)", borderBottom: "none", paddingBottom: 40 }} onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto" style={{ background: "var(--border)" }} />
            <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
              {editId ? "Planning bewerken" : "Inplannen"} · {medName(modalForm.medewerker_id)}
            </h2>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{modalForm.datum}</p>

            {modalStatus && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: modalStatus.bg, border: `1px solid ${modalStatus.color}33` }}>
                <span className="text-xs font-semibold" style={{ color: modalStatus.color }}>{modalStatus.label}</span>
              </div>
            )}

            {modalConflicts.length > 0 && (
              <div className="space-y-1.5">
                {modalConflicts.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "var(--danger-light)", border: "1px solid var(--danger-border)" }}>
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--danger)" }} />
                    <span className="text-xs font-medium" style={{ color: "var(--danger)" }}>Conflict: {c}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Project</label>
                <select value={modalForm.project_id} onChange={e => setModalForm({ ...modalForm, project_id: e.target.value })} className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.nummer} – {p.naam}</option>)}
                </select>
              </div>

              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px]" style={{ color: "var(--text-muted)" }}>Start</label>
                  <input type="time" value={modalForm.starttijd} onChange={e => setModalForm({ ...modalForm, starttijd: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)", colorScheme: "light" }} />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[10px]" style={{ color: "var(--text-muted)" }}>Eind</label>
                  <input type="time" value={modalForm.eindtijd} onChange={e => setModalForm({ ...modalForm, eindtijd: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)", colorScheme: "light" }} />
                </div>
              </div>

              <input value={modalForm.notitie} onChange={e => setModalForm({ ...modalForm, notitie: e.target.value })} placeholder="Notitie (optioneel)" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />

              <button onClick={savePlanning} className="w-full py-3 rounded-2xl text-sm font-bold" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", color: "#fff" }}>
                {editId ? "Bijwerken" : "Inplannen"}
              </button>

              {editId && (
                <button onClick={deletePlanning} className="w-full py-3 rounded-2xl text-sm font-bold" style={{ background: "var(--danger-light)", border: "1px solid var(--danger-border)", color: "var(--danger)" }}>
                  Verwijderen
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </PageShell>
  );
}

import { useState, useEffect, useCallback, useMemo } from "react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { MobileHeader } from "@/components/MobileHeader";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { PullToRefresh } from "@/components/PullToRefresh";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { ChevronLeft, ChevronRight, Plus, X, AlertTriangle, MapPin } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { volledigAdres } from "@/lib/utils";
import { format, startOfISOWeek, addDays, addWeeks, getISOWeek } from "date-fns";
import { nl } from "date-fns/locale";

interface PlanningEntry { id: string; medewerker_id: string; project_id: string; datum: string; starttijd: string; eindtijd: string; notitie: string; activiteit: string | null; activiteit_kleur: string | null; }
interface MedewerkerInfo { id: string; full_name: string; vaste_vrije_dagen: number[]; }
interface ProjectInfo { id: string; naam: string; nummer: string; straat?: string | null; postcode?: string | null; stad?: string | null; adres?: string | null; }
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
      supabase.from("planning").select("*, activiteit, activiteit_kleur").gte("datum", startStr).lte("datum", endStr),
      supabase.from("profiles").select("id, full_name, vaste_vrije_dagen").eq("account_status", "active").order("full_name"),
      supabase.from("projects").select("id, naam, nummer, straat, postcode, stad, adres").eq("active", true).order("nummer"),
      supabase.from("beschikbaarheid").select("medewerker_id, datum_van, datum_tot, type, status").eq("status", "goedgekeurd").lte("datum_van", endStr).gte("datum_tot", startStr),
    ]);
    setEntries((planData ?? []).map((d: any) => ({ id: d.id, medewerker_id: d.medewerker_id, project_id: d.project_id, datum: d.datum, starttijd: d.starttijd?.slice(0, 5), eindtijd: d.eindtijd?.slice(0, 5), notitie: d.notitie || "", activiteit: d.activiteit || null, activiteit_kleur: d.activiteit_kleur || null })));
    setMedewerkers((profData ?? []) as any);
    setProjects((projData ?? []) as any);
    setBeschikbaarheid((beschData ?? []) as any);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel('manager-planning-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'planning' }, fetchAll).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);



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
        <Spinner padding="py-16" />
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
              <div className="w-16 lg:w-40 shrink-0 flex items-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ background: AVATAR_COLORS[mi % AVATAR_COLORS.length], color: "#fff" }}>
                    {med.full_name.charAt(0)}
                  </div>
                  <span className="text-[10px] lg:text-xs font-medium truncate max-w-[44px] lg:max-w-[120px]" style={{ color: "var(--text-primary)" }}>{med.full_name.split(" ")[0]}<span className="hidden lg:inline"> {med.full_name.split(" ").slice(1).join(" ")}</span></span>
                </div>
              </div>
              {weekDates.map((d, i) => {
                const dateStr = format(d, "yyyy-MM-dd");
                const entry = entries.find(e => e.medewerker_id === med.id && e.datum === dateStr);
                const proj = entry ? projMap.get(entry.project_id) : null;
                const conflicts = getConflicts(med.id, dateStr, i, entries, medewerkers, beschikbaarheid, null, weekDateStrings);
                const hasConflict = conflicts.length > 0;

                return (
                  <button key={i} onClick={() => openAddModal(med.id, dateStr)} className="flex-1 rounded-xl p-1 min-h-[52px] lg:min-h-[64px] flex flex-col items-center justify-center text-center transition-colors active:scale-95 relative" style={{
                    background: hasConflict && !entry ? "var(--danger-light)" : entry ? (entry.activiteit_kleur ? `${entry.activiteit_kleur}18` : "var(--accent-light)") : "var(--bg-base)",
                    border: hasConflict ? "1px solid var(--danger-border)" : entry ? `1px solid ${entry.activiteit_kleur || "var(--accent)"}44` : "1px solid var(--bg-surface-2)",
                  }}>
                    {entry ? (
                      <>
                        <span className="text-[8px] lg:text-[11px] font-bold truncate lg:whitespace-normal w-full" style={{ color: "var(--text-primary)" }}>
                          <span className="lg:hidden">{proj?.nummer?.slice(-3) || "?"}</span>
                          <span className="hidden lg:inline">{proj?.naam || proj?.nummer || "?"}</span>
                        </span>
                        {entry.activiteit && (
                          <span className="text-[7px] lg:text-[9px] truncate w-full block" style={{ color: "var(--text-muted)", marginTop: 1 }}>
                            {entry.activiteit}
                          </span>
                        )}
                        <span className="text-[7px] lg:text-[10px]" style={{ color: "var(--text-muted)" }}>{entry.starttijd}–{entry.eindtijd}</span>
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
      <PullToRefresh onRefresh={fetchAll}>
      <div style={{ background: "#030e20", minHeight: "100dvh", paddingBottom: 160 }}>
        {/* HEADER */}
        <MobileHeader initials={user?.user_metadata?.full_name?.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase() || "M"} />

        <main style={{ padding: "24px 20px" }}>
          {/* WEEK SELECTOR */}
          <section style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.2em", color: "#3fff8b", marginBottom: 4 }}>
                TEAM PLANNING
              </p>
              <h2 style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 26, color: "#dae6ff", lineHeight: 1, marginBottom: 4 }}>
                Week {weekNumber}
              </h2>
              <p style={{ fontSize: 12, color: "#a0abc3", fontFamily: "Inter" }}>
                {format(weekStart, "EEE d MMM", { locale: nl })} t/m {format(addDays(weekStart, 4), "EEE d MMM", { locale: nl })}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setWeekStart(w => addWeeks(w, -1))} style={{ width: 44, height: 44, borderRadius: 12, background: "#102038", border: "1px solid rgba(255,255,255,0.07)", color: "#dae6ff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <ChevronLeft size={20} />
              </button>
              <button onClick={() => setWeekStart(w => addWeeks(w, 1))} style={{ width: 44, height: 44, borderRadius: 12, background: "#102038", border: "1px solid rgba(255,255,255,0.07)", color: "#dae6ff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <ChevronRight size={20} />
              </button>
            </div>
          </section>

          {/* PROJECT FILTER CHIPS */}
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 24, scrollbarWidth: "none", marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20 }}>
            <button style={{ padding: "8px 16px", borderRadius: 9999, background: "#3fff8b", border: "none", color: "#005d2c", fontFamily: "Inter", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 0 12px rgba(63,255,139,0.3)" }}>
              Alle projecten
            </button>
            {projects.slice(0, 3).map(p => (
              <button key={p.id} style={{ padding: "8px 16px", borderRadius: 9999, background: "#152640", border: "none", color: "#a0abc3", fontFamily: "Inter", fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                {p.naam || p.nummer}
              </button>
            ))}
          </div>

          {/* DAY HEADERS */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, paddingRight: 4 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, width: 168 }}>
              {["Ma", "Di", "Wo", "Do", "Vr"].map(d => (
                <span key={d} style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.1em", color: "#a0abc3", textAlign: "center" }}>{d}</span>
              ))}
            </div>
          </div>

          {/* LOADING */}
          {loading && (
            <div style={{ textAlign: "center", padding: 40, color: "#a0abc3" }}>Planning laden...</div>
          )}

          {/* OVERPLANNING WARNING */}
          {overplanned.length > 0 && (
            <div style={{ background: "rgba(254,179,0,0.08)", border: "1px solid rgba(254,179,0,0.3)", borderRadius: 16, padding: "14px 16px", marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 12 }}>
              <AlertTriangle size={16} style={{ color: "#feb300", marginTop: 2, flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#feb300", fontFamily: "Inter", marginBottom: 4 }}>Overplanning</p>
                {overplanned.map(m => (
                  <p key={m.id} style={{ fontSize: 11, color: "#a0abc3", fontFamily: "Inter" }}>{m.name}: {m.days} dagen ingepland</p>
                ))}
              </div>
            </div>
          )}

          {/* MONTEUR ROWS */}
          {!loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {medewerkers.map((med) => {
                const initials = med.full_name?.split(" ").map(n => n[0]).slice(0, 2).join("") || "XX";
                return (
                  <div key={med.id} style={{ background: "#061327", borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    {/* Avatar + name */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: "#142640", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope", fontWeight: 700, fontSize: 12, color: "#3fff8b", border: "1px solid rgba(63,255,139,0.15)", flexShrink: 0 }}>
                        {initials}
                      </div>
                      <div>
                        <p style={{ fontFamily: "Manrope", fontWeight: 700, fontSize: 13, color: "#dae6ff", lineHeight: 1.2 }}>
                          {med.full_name?.split(" ")[0]} {med.full_name?.split(" ").slice(-1)[0]?.[0]}.
                        </p>
                        <p style={{ fontSize: 9, color: "#a0abc3", fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.1em" }}>Monteur</p>
                      </div>
                    </div>

                    {/* Day blocks */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                      {weekDates.map((date, i) => {
                        const dateStr = format(date, "yyyy-MM-dd");
                        const entry = entries.find(e => e.medewerker_id === med.id && e.datum === dateStr);
                        const heeftEntry = !!entry;
                        const verlof = beschikbaarheid.find(b => b.medewerker_id === med.id && b.status === "goedgekeurd" && dateStr >= b.datum_van && dateStr <= b.datum_tot);
                        const bgColor = verlof ? "#152640" : !heeftEntry ? "rgba(61,72,93,0.3)" : entry?.activiteit_kleur || "#3fff8b";
                        return (
                          <div key={i} onClick={() => openAddModal(med.id, dateStr)} style={{
                            width: 28, height: 36, borderRadius: 8, background: bgColor, cursor: "pointer",
                            boxShadow: heeftEntry ? `0 0 8px ${bgColor}50` : "none",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {verlof && <span className="material-symbols-outlined" style={{ fontSize: 12, color: "#a0abc3" }}>beach_access</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* CAPACITEIT CARD */}
          {!loading && (
            <div style={{ marginTop: 24, background: "#000000", borderRadius: 16, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid rgba(61,72,93,0.2)" }}>
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.2em", color: "#a0abc3", marginBottom: 4 }}>Capaciteit</p>
                <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 28, color: "#3fff8b" }}>
                  {medewerkers.length > 0 ? `${Math.round((entries.filter(e => weekDateStrings.includes(e.datum)).length / (medewerkers.length * 5)) * 100)}%` : "—"}
                </span>
              </div>
              <div style={{ height: 4, width: 80, background: "#152640", borderRadius: 9999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${medewerkers.length > 0 ? Math.min(100, Math.round((entries.filter(e => weekDateStrings.includes(e.datum)).length / (medewerkers.length * 5)) * 100)) : 0}%`, background: "#3fff8b" }} />
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: 9, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.2em", color: "#a0abc3", marginBottom: 4 }}>Incidenten</p>
                <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 28, color: overplanned.length > 0 ? "#ff716c" : "#3fff8b" }}>{overplanned.length}</span>
              </div>
            </div>
          )}
        </main>

        {/* FAB */}
        <button onClick={() => setShowModal(true)} style={{
          position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", zIndex: 40,
          background: "#3fff8b", color: "#005d2c", border: "none", borderRadius: 9999,
          height: 56, padding: "0 32px", display: "flex", alignItems: "center", gap: 8,
          fontFamily: "Manrope", fontWeight: 800, fontSize: 14, textTransform: "uppercase",
          letterSpacing: "0.1em", cursor: "pointer", boxShadow: "0 8px 24px rgba(63,255,139,0.3)", whiteSpace: "nowrap",
        }}>
          <Plus size={20} /> Inplannen
        </button>
      </div>
      </PullToRefresh>

      {/* MODAL */}
      {showModal && (() => {
        const modalBody = (
          <>
            <div style={{ width: 48, height: 6, borderRadius: 9999, background: "rgba(255,255,255,0.2)", margin: "0 auto 20px" }} />
            <h2 style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 20, color: "#dae6ff", marginBottom: 4 }}>
              {editId ? "Planning bewerken" : "Inplannen"} · {medName(modalForm.medewerker_id)}
            </h2>
            <p style={{ fontSize: 12, color: "#a0abc3", fontFamily: "Inter", marginBottom: 16 }}>{modalForm.datum}</p>
            {modalStatus && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, background: modalStatus.bg, border: `1px solid ${modalStatus.color}33`, marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: modalStatus.color, fontFamily: "Inter" }}>{modalStatus.label}</span>
              </div>
            )}
            {modalConflicts.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {modalConflicts.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, background: "rgba(255,113,108,0.08)", border: "1px solid rgba(255,113,108,0.3)", marginBottom: 6 }}>
                    <AlertTriangle size={14} style={{ color: "#ff716c", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: "#ff716c", fontFamily: "Inter" }}>Conflict: {c}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.1em", color: "#a0abc3", display: "block", marginBottom: 6 }}>Project</label>
                <select value={modalForm.project_id} onChange={e => setModalForm({ ...modalForm, project_id: e.target.value })} style={{ width: "100%", padding: "12px 14px", borderRadius: 12, fontSize: 14, background: "#030e20", border: "1px solid rgba(61,72,93,0.4)", color: "#dae6ff", fontFamily: "Inter", outline: "none" }}>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.nummer} – {p.naam}</option>)}
                </select>
                {(() => {
                  const selProj = projects.find(p => p.id === modalForm.project_id);
                  if (!selProj) return null;
                  const addr = volledigAdres(selProj);
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, marginTop: 6, background: "#061327", border: "1px solid rgba(61,72,93,0.2)" }}>
                      <MapPin size={12} style={{ color: "#a0abc3", flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: addr ? "#a0abc3" : "#feb300", fontFamily: "Inter" }}>{addr || "⚠ Geen adres ingevuld"}</span>
                    </div>
                  );
                })()}
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.1em", color: "#a0abc3", display: "block", marginBottom: 6 }}>Start</label>
                  <input type="time" value={modalForm.starttijd} onChange={e => setModalForm({ ...modalForm, starttijd: e.target.value })} style={{ width: "100%", padding: "12px 14px", borderRadius: 12, fontSize: 14, background: "#030e20", border: "1px solid rgba(61,72,93,0.4)", color: "#dae6ff", fontFamily: "Inter", outline: "none" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.1em", color: "#a0abc3", display: "block", marginBottom: 6 }}>Eind</label>
                  <input type="time" value={modalForm.eindtijd} onChange={e => setModalForm({ ...modalForm, eindtijd: e.target.value })} style={{ width: "100%", padding: "12px 14px", borderRadius: 12, fontSize: 14, background: "#030e20", border: "1px solid rgba(61,72,93,0.4)", color: "#dae6ff", fontFamily: "Inter", outline: "none" }} />
                </div>
              </div>
              <input value={modalForm.notitie} onChange={e => setModalForm({ ...modalForm, notitie: e.target.value })} placeholder="Notitie (optioneel)" style={{ width: "100%", padding: "12px 14px", borderRadius: 12, fontSize: 14, background: "#030e20", border: "1px solid rgba(61,72,93,0.4)", color: "#dae6ff", fontFamily: "Inter", outline: "none" }} />
              <button onClick={savePlanning} style={{ width: "100%", height: 52, borderRadius: 14, background: "#3fff8b", border: "none", color: "#005d2c", fontFamily: "Manrope", fontWeight: 800, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", boxShadow: "0 4px 16px rgba(63,255,139,0.2)" }}>
                {editId ? "Bijwerken" : "Inplannen"}
              </button>
              {editId && (
                <button onClick={deletePlanning} style={{ width: "100%", height: 48, borderRadius: 14, background: "transparent", border: "1px solid rgba(255,113,108,0.4)", color: "#ff716c", fontFamily: "Inter", fontWeight: 700, fontSize: 13, textTransform: "uppercase", cursor: "pointer" }}>
                  Verwijderen
                </button>
              )}
            </div>
          </>
        );
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onClick={() => setShowModal(false)}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
            <div style={{ position: "relative", background: "#0a1a30", borderRadius: "40px 40px 0 0", padding: "24px 24px 48px", borderTop: "1px solid rgba(255,255,255,0.1)", maxHeight: "85vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
              {modalBody}
            </div>
          </div>
        );
      })()}
    </PageShell>
  );
}

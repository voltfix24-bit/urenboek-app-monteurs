import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { format, startOfISOWeek, addDays, addWeeks, getISOWeek } from "date-fns";
import { nl } from "date-fns/locale";

interface PlanningEntry {
  id: string;
  medewerker_id: string;
  project_id: string;
  datum: string;
  starttijd: string;
  eindtijd: string;
  notitie: string;
}

interface MedewerkerInfo {
  id: string;
  full_name: string;
}

interface ProjectInfo {
  id: string;
  naam: string;
  nummer: string;
}

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr"];

export default function ManagerPlanning() {
  const { isManager, user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => startOfISOWeek(new Date()));
  const [entries, setEntries] = useState<PlanningEntry[]>([]);
  const [medewerkers, setMedewerkers] = useState<MedewerkerInfo[]>([]);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalForm, setModalForm] = useState({
    medewerker_id: "",
    project_id: "",
    datum: "",
    starttijd: "07:00",
    eindtijd: "16:00",
    notitie: "",
  });
  const [editId, setEditId] = useState<string | null>(null);

  const weekNumber = getISOWeek(weekStart);
  const weekDates = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const startStr = format(weekStart, "yyyy-MM-dd");
    const endStr = format(addDays(weekStart, 4), "yyyy-MM-dd");

    const [{ data: planData }, { data: profData }, { data: projData }] = await Promise.all([
      supabase.from("planning").select("*").gte("datum", startStr).lte("datum", endStr),
      supabase.from("profiles").select("id, full_name").order("full_name"),
      supabase.from("projects").select("id, naam, nummer").eq("active", true).order("nummer"),
    ]);

    setEntries((planData ?? []).map((d: any) => ({
      id: d.id, medewerker_id: d.medewerker_id, project_id: d.project_id,
      datum: d.datum, starttijd: d.starttijd?.slice(0, 5), eindtijd: d.eindtijd?.slice(0, 5), notitie: d.notitie || "",
    })));
    setMedewerkers(profData ?? []);
    setProjects((projData ?? []) as any);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const getProfileId = useCallback(async () => {
    if (!user) return null;
    const { data } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
    return data?.id || null;
  }, [user]);

  const openAddModal = (medewerker_id: string, datum: string) => {
    const existing = entries.find(e => e.medewerker_id === medewerker_id && e.datum === datum);
    if (existing) {
      setEditId(existing.id);
      setModalForm({
        medewerker_id: existing.medewerker_id,
        project_id: existing.project_id,
        datum: existing.datum,
        starttijd: existing.starttijd,
        eindtijd: existing.eindtijd,
        notitie: existing.notitie,
      });
    } else {
      setEditId(null);
      setModalForm({ medewerker_id, project_id: projects[0]?.id || "", datum, starttijd: "07:00", eindtijd: "16:00", notitie: "" });
    }
    setShowModal(true);
  };

  const savePlanning = async () => {
    const profileId = await getProfileId();
    if (!profileId) return;

    if (editId) {
      const { error } = await supabase.from("planning").update({
        project_id: modalForm.project_id,
        starttijd: modalForm.starttijd,
        eindtijd: modalForm.eindtijd,
        notitie: modalForm.notitie,
      } as any).eq("id", editId);
      if (error) toast.error("Fout bij bijwerken");
      else { toast.success("Planning bijgewerkt"); setShowModal(false); fetchAll(); }
    } else {
      const { error } = await supabase.from("planning").insert({
        medewerker_id: modalForm.medewerker_id,
        project_id: modalForm.project_id,
        datum: modalForm.datum,
        starttijd: modalForm.starttijd,
        eindtijd: modalForm.eindtijd,
        notitie: modalForm.notitie,
        created_by: profileId,
      } as any);
      if (error) toast.error("Fout bij aanmaken");
      else { toast.success("Ingepland!"); setShowModal(false); fetchAll(); }
    }
  };

  const deletePlanning = async () => {
    if (!editId) return;
    const { error } = await supabase.from("planning").delete().eq("id", editId);
    if (error) toast.error("Fout bij verwijderen");
    else { toast.success("Verwijderd"); setShowModal(false); fetchAll(); }
  };

  const projMap = new Map(projects.map(p => [p.id, p]));
  const medName = (id: string) => medewerkers.find(m => m.id === id)?.full_name || "?";

  if (!isManager) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Alleen managers hebben toegang.</p></div>;
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden" style={{ maxWidth: 430, margin: "0 auto", paddingBottom: 80 }}>
      <header className="sticky top-0 z-30" style={{ background: "rgba(10,10,15,0.95)", backdropFilter: "blur(12px)" }}>
        <div className="px-4 py-3 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>⚡</div>
          <span className="text-base font-bold text-foreground tracking-tight">Planning</span>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {/* Week nav */}
        <div className="flex items-center justify-between rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={() => setWeekStart(p => addWeeks(p, -1))} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
            <ChevronLeft className="h-4 w-4 text-foreground" />
          </button>
          <div className="text-center">
            <p className="text-lg font-extrabold text-foreground">Week {weekNumber}</p>
            <p className="text-[11px] text-muted-foreground">
              {format(weekStart, "d MMM", { locale: nl })} – {format(addDays(weekStart, 4), "d MMM", { locale: nl })}
            </p>
          </div>
          <button onClick={() => setWeekStart(p => addWeeks(p, 1))} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
            <ChevronRight className="h-4 w-4 text-foreground" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-10"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : (
          <>
            {/* Day headers */}
            <div className="flex gap-1">
              <div className="w-16 shrink-0" />
              {weekDates.map((d, i) => (
                <div key={i} className="flex-1 text-center">
                  <p className="text-[10px] font-semibold text-muted-foreground">{DAGEN[i]}</p>
                  <p className="text-xs font-bold text-foreground">{d.getDate()}</p>
                </div>
              ))}
            </div>

            {/* Grid rows per medewerker */}
            {medewerkers.map(med => (
              <div key={med.id} className="flex gap-1 items-stretch">
                <div className="w-16 shrink-0 flex items-center">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold" style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)", color: "#fff" }}>
                      {med.full_name.charAt(0)}
                    </div>
                    <span className="text-[10px] font-medium text-foreground truncate max-w-[44px]">{med.full_name.split(" ")[0]}</span>
                  </div>
                </div>
                {weekDates.map((d, i) => {
                  const dateStr = format(d, "yyyy-MM-dd");
                  const entry = entries.find(e => e.medewerker_id === med.id && e.datum === dateStr);
                  const proj = entry ? projMap.get(entry.project_id) : null;
                  return (
                    <button
                      key={i}
                      onClick={() => openAddModal(med.id, dateStr)}
                      className="flex-1 rounded-xl p-1.5 min-h-[52px] flex flex-col items-center justify-center text-center transition-colors active:scale-95"
                      style={{
                        background: entry ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.02)",
                        border: entry ? "1px solid rgba(99,102,241,0.2)" : "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      {entry ? (
                        <>
                          <span className="text-[8px] font-bold text-foreground truncate w-full">{proj?.nummer?.slice(-3) || "?"}</span>
                          <span className="text-[7px] text-muted-foreground">{entry.starttijd}</span>
                        </>
                      ) : (
                        <Plus className="h-3 w-3 text-muted-foreground/30" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowModal(false)}>
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.6)" }} />
          <div className="relative w-full animate-sheet-up rounded-t-3xl p-5 space-y-4" style={{ maxWidth: 430, background: "#111118", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none" }} onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto" style={{ background: "rgba(255,255,255,0.15)" }} />
            <h2 className="text-base font-bold text-foreground">
              {editId ? "Planning bewerken" : "Inplannen"} · {medName(modalForm.medewerker_id)}
            </h2>
            <p className="text-xs text-muted-foreground">{modalForm.datum}</p>

            <div className="space-y-3">
              {/* Project select */}
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground font-medium">Project</label>
                <select value={modalForm.project_id} onChange={e => setModalForm({ ...modalForm, project_id: e.target.value })} className="w-full px-3 py-2.5 rounded-xl text-sm text-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.nummer} – {p.naam}</option>)}
                </select>
              </div>

              {/* Times */}
              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] text-muted-foreground">Start</label>
                  <input type="time" value={modalForm.starttijd} onChange={e => setModalForm({ ...modalForm, starttijd: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm text-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", colorScheme: "dark" }} />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] text-muted-foreground">Eind</label>
                  <input type="time" value={modalForm.eindtijd} onChange={e => setModalForm({ ...modalForm, eindtijd: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm text-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", colorScheme: "dark" }} />
                </div>
              </div>

              <input value={modalForm.notitie} onChange={e => setModalForm({ ...modalForm, notitie: e.target.value })} placeholder="Notitie (optioneel)" className="w-full px-3 py-2.5 rounded-xl text-sm text-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />

              <button onClick={savePlanning} className="w-full py-3 rounded-2xl text-sm font-bold" style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff" }}>
                {editId ? "Bijwerken" : "Inplannen"}
              </button>

              {editId && (
                <button onClick={deletePlanning} className="w-full py-3 rounded-2xl text-sm font-bold" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}>
                  Verwijderen
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

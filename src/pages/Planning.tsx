import { useState, useEffect, useCallback } from "react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { PullToRefresh } from "@/components/PullToRefresh";
import { ChevronLeft, ChevronRight, Lock, CalendarDays, ThermometerSun, Palmtree, MessageSquare, Clock, Check } from "lucide-react";
import { format, startOfISOWeek, addDays, addWeeks, getISOWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";

interface PlanningItem { id: string; datum: string; starttijd: string; eindtijd: string; notitie: string; project_naam: string; project_nummer: string; project_id: string; is_definitief: boolean; }
interface BeschikbaarheidItem { id: string; type: string; datum_van: string; datum_tot: string; status: string; }
interface ExistingBoeking { id: string; uren: number; status: string; }

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

export default function Planning() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => startOfISOWeek(new Date()));
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [beschikbaarheid, setBeschikbaarheid] = useState<BeschikbaarheidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [existingBoekingen, setExistingBoekingen] = useState<Map<string, ExistingBoeking>>(new Map());
  const [showUrenModal, setShowUrenModal] = useState(false);
  const [modalItem, setModalItem] = useState<PlanningItem | null>(null);
  const [urenForm, setUrenForm] = useState({ werkzaamheden: "monteren" as string, uren: 8 });
  const weekNumber = getISOWeek(weekStart);

  const fetchPlanning = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
    if (!profile) { setLoading(false); return; }
    setProfileId(profile.id);
    const startStr = format(weekStart, "yyyy-MM-dd");
    const endStr = format(addDays(weekStart, 6), "yyyy-MM-dd");

    const [{ data }, { data: beschData }, { data: boekData }] = await Promise.all([
      supabase.from("planning").select("id, datum, starttijd, eindtijd, notitie, project_id").eq("medewerker_id", profile.id).gte("datum", startStr).lte("datum", endStr).order("datum"),
      supabase.from("beschikbaarheid").select("id, type, datum_van, datum_tot, status").eq("medewerker_id", profile.id).eq("status", "goedgekeurd").lte("datum_van", endStr).gte("datum_tot", startStr),
      supabase.from("uren_boekingen").select("id, datum, project_id, uren, status").eq("medewerker_id", profile.id).gte("datum", startStr).lte("datum", endStr),
    ]);
    setBeschikbaarheid((beschData ?? []) as any);

    // Map existing boekingen by datum+project_id
    const boekMap = new Map<string, ExistingBoeking>();
    (boekData ?? []).forEach((b: any) => {
      boekMap.set(`${b.datum}|${b.project_id}`, { id: b.id, uren: Number(b.uren), status: b.status });
    });
    setExistingBoekingen(boekMap);

    if (data) {
      const projectIds = [...new Set(data.map((d: any) => d.project_id))];
      let projMap = new Map();
      let statusMap = new Map<string, boolean>();
      if (projectIds.length > 0) {
        const [{ data: projects }, { data: statuses }] = await Promise.all([
          supabase.from("projects").select("id, naam, nummer").in("id", projectIds),
          supabase.from("project_planning_status").select("project_id, is_definitief").in("project_id", projectIds),
        ]);
        projMap = new Map(projects?.map((p: any) => [p.id, p]) ?? []);
        (statuses || []).forEach((s: any) => statusMap.set(s.project_id, s.is_definitief));
      }
      setItems(data.map((d: any) => {
        const proj = projMap.get(d.project_id) || { naam: "Onbekend", nummer: "" };
        return { id: d.id, datum: d.datum, starttijd: d.starttijd?.slice(0, 5) || "07:00", eindtijd: d.eindtijd?.slice(0, 5) || "16:00", notitie: d.notitie || "", project_naam: (proj as any).naam, project_nummer: (proj as any).nummer, project_id: d.project_id, is_definitief: statusMap.get(d.project_id) ?? false };
      }));
    }
    setLoading(false);
  }, [user, weekStart]);

  useEffect(() => { fetchPlanning(); }, [fetchPlanning]);

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = format(new Date(), "yyyy-MM-dd");

  function getBeschikbaarheidForDate(dateStr: string): BeschikbaarheidItem | null {
    return beschikbaarheid.find(b => dateStr >= b.datum_van && dateStr <= b.datum_tot) || null;
  }

  function calcDefaultUren(starttijd: string, eindtijd: string): number {
    const [sh, sm] = starttijd.split(":").map(Number);
    const [eh, em] = eindtijd.split(":").map(Number);
    const diff = (eh * 60 + em - sh * 60 - sm) / 60;
    return Math.max(0.5, Math.round(diff * 2) / 2);
  }

  function openUrenModal(item: PlanningItem) {
    setModalItem(item);
    setUrenForm({ werkzaamheden: "monteren", uren: calcDefaultUren(item.starttijd, item.eindtijd) });
    setShowUrenModal(true);
  }

  const saveUren = async (submitDirect: boolean) => {
    if (!profileId || !modalItem) return;
    const { error } = await supabase.from("uren_boekingen").insert({
      medewerker_id: profileId,
      project_id: modalItem.project_id,
      datum: modalItem.datum,
      uren: urenForm.uren,
      type: urenForm.werkzaamheden,
      beschrijving: urenForm.werkzaamheden,
      status: submitDirect ? "ingediend" : "concept",
    });
    if (error) { toast.error("Fout bij opslaan"); return; }
    toast.success("Uren geboekt ✓");
    setShowUrenModal(false);
    fetchPlanning();
  };

  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    concept: { bg: "var(--bg-surface-2)", text: "var(--text-secondary)", label: "Concept" },
    ingediend: { bg: "var(--warn-light)", text: "var(--warn-text)", label: "Ingediend" },
    goedgekeurd: { bg: "var(--success-light)", text: "var(--success)", label: "Goedgekeurd" },
    afgekeurd: { bg: "var(--danger-light)", text: "var(--danger)", label: "Afgekeurd" },
  };

  const definitiefItems = items.filter(it => it.is_definitief);
  const allConcept = items.length > 0 && definitiefItems.length === 0;

  const content = (
    <main className="px-4 py-4 space-y-4">
      <div className="flex items-center justify-between rounded-2xl p-3" style={{ background: "var(--bg-surface)", border: "1px solid #C5D4B2" }}>
        <button onClick={() => setWeekStart(p => addWeeks(p, -1))} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="text-lg font-extrabold" style={{ color: "var(--text-primary)" }}>Week {weekNumber}</p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {format(weekStart, "d MMM", { locale: nl })} – {format(addDays(weekStart, 6), "d MMM", { locale: nl })}
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
          {weekDates.map((date, i) => {
            const dateStr = format(date, "yyyy-MM-dd");
            const dayItems = items.filter(it => it.datum === dateStr);
            const besch = getBeschikbaarheidForDate(dateStr);
            if (!dayItems.length && !besch) return null;
            const isToday = dateStr === today;

            return (
              <div key={dateStr} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: isToday ? "var(--accent)" : "var(--text-muted)" }}>
                  {DAGEN[i]} {format(date, "d MMM", { locale: nl })} {isToday && "· Vandaag"}
                </p>

                {besch && (
                  <div className="rounded-2xl p-4 flex items-center gap-3" style={{
                    background: besch.type === "ziek" ? "var(--danger-light)" : "var(--warn-light)",
                    border: besch.type === "ziek" ? "1px solid #E8A09A" : "1px solid #E8D070",
                  }}>
                    <span className="text-xl flex items-center justify-center">{besch.type === "ziek" ? <ThermometerSun className="h-5 w-5" style={{ color: "var(--danger)" }} /> : <Palmtree className="h-5 w-5" style={{ color: "var(--warn-text)" }} />}</span>
                    <div>
                      <p className="text-sm font-bold" style={{ color: besch.type === "ziek" ? "var(--danger)" : "var(--warn-text)" }}>
                        {besch.type === "ziek" ? "Ziekmelding geregistreerd" : "Vakantie goedgekeurd"}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{besch.datum_van} → {besch.datum_tot}</p>
                    </div>
                  </div>
                )}

                {dayItems.map(item => {
                  const boekingKey = `${item.datum}|${item.project_id}`;
                  const existing = existingBoekingen.get(boekingKey);
                  const sc = existing ? (statusConfig[existing.status] || statusConfig.concept) : null;

                  return (
                    <div key={item.id} className="rounded-2xl p-4 space-y-2" style={{
                      background: "var(--bg-surface)",
                      border: isToday ? "1px solid #9DC87A" : "1px solid #C5D4B2",
                      opacity: item.is_definitief ? 1 : 0.5,
                    }}>
                      {!item.is_definitief && (
                        <div className="flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-lg mb-1" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>
                          <Lock className="h-3 w-3" /> {item.project_naam} — Planning nog concept
                        </div>
                      )}
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{item.project_naam}</p>
                          <p className="text-[11px] font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>{item.project_nummer}</p>
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                          {item.starttijd} – {item.eindtijd}
                        </span>
                      </div>
                      {item.notitie && (
                        <p className="text-xs flex items-center gap-1" style={{ background: "var(--warn-bg)", border: "1px solid #E8D070", color: "var(--warn-text)", padding: "6px 10px", borderRadius: 10 }}>
                          <MessageSquare className="h-3 w-3 shrink-0" /> {item.notitie}
                        </p>
                      )}

                      {/* Uren boeken section */}
                      {item.is_definitief && (
                        existing ? (
                          <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl" style={{ background: sc!.bg, border: `1px solid ${sc!.text}33` }}>
                            <Check className="h-3.5 w-3.5" style={{ color: sc!.text }} />
                            <span className="text-xs font-semibold" style={{ color: sc!.text }}>
                              {existing.uren}u geboekt
                            </span>
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full ml-auto" style={{ background: sc!.bg, color: sc!.text }}>
                              {sc!.label}
                            </span>
                          </div>
                        ) : (
                          <button onClick={() => openUrenModal(item)} className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-colors active:scale-[0.98]" style={{ background: "var(--accent-light)", border: "1px solid #9DC87A", color: "var(--text-primary)" }}>
                            <Clock className="h-3.5 w-3.5" /> Uren boeken voor deze dag →
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {items.length === 0 && beschikbaarheid.length === 0 && (
            <div className="text-center py-12 rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid #C5D4B2" }}>
              <Lock className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Geen bevestigde planning deze week</p>
              <p className="text-xs mt-1 px-6" style={{ color: "var(--text-muted)" }}>Je manager heeft de planning nog niet gepubliceerd voor deze week.</p>
            </div>
          )}

          {allConcept && beschikbaarheid.length === 0 && (
            <div className="text-center py-12 rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid #C5D4B2" }}>
              <Lock className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Planning in voorbereiding</p>
              <p className="text-xs mt-1 px-6" style={{ color: "var(--text-muted)" }}>Je manager werkt nog aan de planning voor deze week. Je ziet hem zodra deze definitief is gemaakt.</p>
            </div>
          )}
        </>
      )}
    </main>
  );

  return (
    <PageShell>
      <header className="sticky top-0 z-30" style={{ background: "rgba(235,240,228,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid #C5D4B2" }}>
        <div className="px-4 py-3 flex items-center gap-2.5">
          <HeaderLogo />
          <span className="text-base font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Mijn planning</span>
        </div>
      </header>

      <div className="lg:hidden">
        <PullToRefresh onRefresh={async () => { await fetchPlanning(); }}>
          {content}
        </PullToRefresh>
      </div>
      <div className="hidden lg:block">
        {content}
      </div>

      {/* Uren boeken modal */}
      {showUrenModal && modalItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowUrenModal(false)}>
          <div className="absolute inset-0" style={{ background: "rgba(45,74,30,0.35)", backdropFilter: "blur(6px)" }} />
          <div className="relative w-full animate-sheet-up rounded-t-3xl p-5 space-y-4" style={{ maxWidth: 430, background: "var(--bg-surface)", border: "1px solid #C5D4B2", borderBottom: "none", paddingBottom: 40 }} onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto" style={{ background: "var(--border)" }} />
            <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Uren boeken</h2>

            <div className="space-y-1 rounded-xl p-3" style={{ background: "var(--bg-base)", border: "1px solid #C5D4B2" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{modalItem.project_naam}</p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {format(new Date(modalItem.datum + "T12:00:00"), "EEEE d MMMM", { locale: nl })} · {modalItem.starttijd} – {modalItem.eindtijd}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Werkzaamheden</label>
              <div className="flex gap-2">
                {["schakelen", "monteren"].map(w => (
                  <button key={w} onClick={() => setUrenForm(f => ({ ...f, werkzaamheden: w }))} className="flex-1 py-3 rounded-xl text-sm font-semibold capitalize transition-colors" style={{
                    background: urenForm.werkzaamheden === w ? "var(--accent-light)" : "var(--bg-base)",
                    border: urenForm.werkzaamheden === w ? "1px solid #9DC87A" : "1px solid #C5D4B2",
                    color: urenForm.werkzaamheden === w ? "var(--accent)" : "var(--text-muted)",
                  }}>
                    {w}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Aantal uren</label>
              <div className="flex items-center justify-center gap-6">
                <button onClick={() => setUrenForm(f => ({ ...f, uren: Math.max(0.5, f.uren - 0.5) }))} className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>−</button>
                <span className="text-3xl font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{urenForm.uren}u</span>
                <button onClick={() => setUrenForm(f => ({ ...f, uren: Math.min(24, f.uren + 0.5) }))} className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>+</button>
              </div>
              <div className="flex justify-center gap-2 mt-2">
                {[4, 6, 8, 9, 10].map(h => (
                  <button key={h} onClick={() => setUrenForm(f => ({ ...f, uren: h }))} className="px-3 py-1 rounded-lg text-xs font-medium transition-colors" style={{
                    background: urenForm.uren === h ? "var(--accent-light)" : "var(--bg-base)",
                    border: urenForm.uren === h ? "1px solid #9DC87A" : "1px solid #C5D4B2",
                    color: urenForm.uren === h ? "var(--accent)" : "var(--text-muted)",
                  }}>
                    {h}u
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => saveUren(false)} className="flex-1 py-3 rounded-2xl text-sm font-bold" style={{ background: "linear-gradient(135deg, #4A7C2F, #3D6826)", color: "#fff" }}>
                Opslaan als concept
              </button>
              <button onClick={() => saveUren(true)} className="flex-1 py-3 rounded-2xl text-sm font-bold" style={{ background: "var(--bg-surface)", border: "1.5px solid #4A7C2F", color: "var(--accent)" }}>
                Direct indienen
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

import { useState, useEffect, useCallback } from "react";
import { useTimesheet } from "@/hooks/useTimesheet";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useSwipe } from "@/hooks/useSwipe";
import { EntryCard } from "@/components/EntryCard";
import { AddEntryModal } from "@/components/AddEntryModal";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { FolderOpen, Building2, ArrowRight } from "lucide-react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, startOfWeek, addDays } from "date-fns";

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function dateKey(d: Date) {
  return d.toISOString().split("T")[0];
}

function fmt(date: Date) {
  return `${date.getDate()} ${MAANDEN[date.getMonth()]}`;
}

function isFridayAfternoon(): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Amsterdam",
      weekday: "short",
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const weekday = parts.find(p => p.type === "weekday")?.value;
    const hour = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
    return weekday === "Fri" && hour >= 16;
  } catch {
    const now = new Date();
    return now.getDay() === 5 && now.getHours() >= 16;
  }
}

const AVATAR_COLORS = ['#4A7C2F', '#6B9E4A', '#2D6B8A', '#8B6914', '#5A4A7C'];

const Index = () => {
  const { user, profile, isManager } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"week" | "overzicht">("week");
  const [showModal, setShowModal] = useState(false);
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [showFridayBanner, setShowFridayBanner] = useState(false);
  const [submittingAll, setSubmittingAll] = useState(false);

  const {
    weekDates, weekEntries, allEntries, addEntry, removeEntry, submitEntry,
    revertToConcept, goToPreviousWeek, goToNextWeek, totalHours, currentWeekStart,
  } = useTimesheet();

  const swipeHandlers = useSwipe({ onSwipeLeft: goToNextWeek, onSwipeRight: goToPreviousWeek });

  const conceptEntries = weekEntries.filter(e => e.status === "concept");
  const conceptHours = conceptEntries.reduce((s, e) => s + e.hours, 0);

  useEffect(() => {
    const now = new Date();
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const viewingCurrentWeek = format(currentWeekStart, "yyyy-MM-dd") === format(thisWeekStart, "yyyy-MM-dd");
    setShowFridayBanner(isFridayAfternoon() && viewingCurrentWeek && conceptEntries.length > 0);
  }, [conceptEntries.length, currentWeekStart]);

  const submitAllConcepts = useCallback(async () => {
    if (!user || conceptEntries.length === 0) return;
    setSubmittingAll(true);
    const ids = conceptEntries.map(e => e.id);
    const { error } = await supabase.from("time_entries").update({ status: "ingediend" }).in("id", ids);
    if (error) { toast.error("Fout bij indienen"); }
    else { toast.success(`${ids.length} uren ingediend!`); setShowFridayBanner(false); window.location.reload(); }
    setSubmittingAll(false);
  }, [user, conceptEntries]);

  const today = dateKey(new Date());
  const weekLabel = `${fmt(weekDates[0])} – ${fmt(weekDates[6])}`;

  function openModal(date?: Date) {
    setModalDate(date || null);
    setShowModal(true);
  }

  const goedgekeurdUren = allEntries.filter((e) => e.status === "goedgekeurd").reduce((a, b) => a + b.hours, 0);
  const ingediendCount = allEntries.filter((e) => e.status === "ingediend").length;
  const afgekeurdCount = allEntries.filter((e) => e.status === "afgekeurd").length;

  return (
    <PageShell>
    <div {...swipeHandlers} style={{ position: "relative" }}>
      {/* Header */}
      <header className="sticky top-0 z-30" style={{ background: "rgba(235,240,228,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid #C5D4B2" }}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <HeaderLogo />

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: "#D4E8C2", border: "1px solid #9DC87A" }}>
                <span className="text-lg font-extrabold" style={{ color: "#4A7C2F" }}>{totalHours}</span>
                <span className="text-[10px] font-semibold" style={{ color: "#8AAD6E" }}>uur</span>
              </div>

              <div className="hidden sm:flex items-center gap-1.5">
                {isManager && (
                  <>
                    {[
                      { path: "/goedkeuring", label: "Goedkeuren" },
                      { path: "/rapportage", label: "Rapportage" },
                      { path: "/medewerkers", label: "Medewerkers" },
                      { path: "/projecten", label: "Projecten" },
                      { path: "/opdrachtgevers", label: "Opdrachtgevers" },
                    ].map(n => (
                      <button key={n.path} onClick={() => navigate(n.path)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2", color: "#5A7A42" }}>
                        {n.label}
                      </button>
                    ))}
                  </>
                )}
              </div>

              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: AVATAR_COLORS[0], color: "#fff" }}>
                {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
              </div>
            </div>
          </div>

          {isManager && (
            <div className="flex gap-1.5 mt-2.5 sm:hidden overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              <button onClick={() => navigate("/projecten")} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium shrink-0" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2", color: "#5A7A42" }}>
                <FolderOpen className="h-3 w-3" /> Projecten
              </button>
              <button onClick={() => navigate("/opdrachtgevers")} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium shrink-0" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2", color: "#5A7A42" }}>
                <Building2 className="h-3 w-3" /> Opdrachtgevers
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex mt-2.5" style={{ borderBottom: "1px solid #C5D4B2" }}>
            {([["week", "Deze week"], ["overzicht", "Overzicht"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as "week" | "overzicht")}
                className="flex-1 py-2.5 text-sm font-medium transition-colors"
                style={{
                  color: activeTab === key ? "#4A7C2F" : "#8AAD6E",
                  borderBottom: activeTab === key ? "2px solid #4A7C2F" : "2px solid transparent",
                  background: "transparent",
                  marginBottom: -1,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Friday afternoon banner */}
      {showFridayBanner && (
        <div className="mx-4 mt-3 flex items-center justify-between gap-2 px-4 py-3 rounded-2xl" style={{ background: "#FFF8DC", border: "1px solid #E8D070" }}>
          <p className="text-xs font-medium" style={{ color: "#8B6914" }}>
            ⚠️ Je hebt nog {conceptHours}u niet ingediend deze week.
          </p>
          <button
            onClick={submitAllConcepts}
            disabled={submittingAll}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0 transition-colors disabled:opacity-50"
            style={{ background: "#4A7C2F", color: "#fff" }}
          >
            Alles indienen <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Week tab */}
      {activeTab === "week" && (
        <div className="px-4 py-4 space-y-4 animate-fade-in">
          {/* Week navigation */}
          <div className="flex items-center justify-between">
            <button onClick={goToPreviousWeek} className="w-8 h-8 rounded-full flex items-center justify-center text-base" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2", color: "#5A7A42" }}>
              ‹
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold" style={{ color: "#2D4A1E" }}>{weekLabel}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "#8AAD6E" }}>
                {totalHours}u geboekt deze week
              </p>
            </div>
            <button onClick={goToNextWeek} className="w-8 h-8 rounded-full flex items-center justify-center text-base" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2", color: "#5A7A42" }}>
              ›
            </button>
          </div>

          {/* Week strip */}
          <div className="flex gap-1.5">
            {weekDates.map((d, i) => {
              const key = dateKey(d);
              const dayEntries = weekEntries.filter((e) => e.date === key);
              const isToday = key === today;
              const hasEntries = dayEntries.length > 0;
              const dayHours = dayEntries.reduce((a, b) => a + b.hours, 0);
              return (
                <button
                  key={i}
                  onClick={() => openModal(d)}
                  className="flex-1 flex flex-col items-center gap-1 transition-colors active:scale-[0.94]"
                  style={{
                    padding: "10px 0",
                    borderRadius: 12,
                    background: isToday ? "#D4E8C2" : "#EBF0E4",
                    border: isToday ? "1px solid #9DC87A" : "1px solid #C5D4B2",
                  }}
                >
                  <span className="text-[10px] font-medium" style={{ color: "#8AAD6E" }}>{DAGEN[i]}</span>
                  <span className={`text-sm font-bold`} style={{ color: isToday ? "#4A7C2F" : "#2D4A1E" }}>
                    {d.getDate()}
                  </span>
                  {hasEntries ? (
                    <div className="flex items-center gap-1">
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          background: dayEntries.some((e) => e.status === "afgekeurd")
                            ? "#C0392B"
                            : dayEntries.some((e) => e.status === "goedgekeurd")
                            ? "#2D7A3A"
                            : "#D4A017",
                        }}
                      />
                      <span className="text-[9px] font-bold" style={{ color: "#8AAD6E" }}>{dayHours}u</span>
                    </div>
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#C5D4B2" }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Week entries by day */}
          <div className="space-y-3">
            {weekDates.map((d, i) => {
              const key = dateKey(d);
              const dayEntries = weekEntries.filter((e) => e.date === key);
              if (dayEntries.length === 0) return null;
              return (
                <div key={key} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: "#8AAD6E" }}>
                    {DAGEN[i]} {d.getDate()} {MAANDEN[d.getMonth()]}
                  </p>
                  {dayEntries.map((entry) => (
                    <EntryCard key={entry.id} entry={entry} onSubmit={submitEntry} onRemove={removeEntry} onRevertToConcept={revertToConcept} />
                  ))}
                </div>
              );
            })}
            {weekEntries.length === 0 && (
              <div className="text-center py-12">
                <ClipboardList className="h-8 w-8 mx-auto mb-2" style={{ color: "#8AAD6E" }} />
                <p className="text-sm font-medium" style={{ color: "#2D4A1E" }}>Geen uren geboekt</p>
                <p className="text-xs mt-1" style={{ color: "#8AAD6E" }}>Druk op + om uren toe te voegen</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Overzicht tab */}
      {activeTab === "overzicht" && (
        <div className="px-4 py-4 space-y-4 animate-fade-in">
          <div className="flex gap-2">
            {[
              { label: "Goedgekeurd", value: goedgekeurdUren + "u", color: "#2D7A3A" },
              { label: "In behandeling", value: String(ingediendCount), color: "#D4A017" },
              { label: "Afgekeurd", value: String(afgekeurdCount), color: "#C0392B" },
            ].map((s, i) => (
              <div key={i} className="flex-1 rounded-2xl p-3 text-center" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
                <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] mt-0.5 font-medium" style={{ color: "#8AAD6E" }}>{s.label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {allEntries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} showDate onSubmit={submitEntry} onRemove={removeEntry} onRevertToConcept={revertToConcept} />
            ))}
            {allEntries.length === 0 && (
              <div className="text-center py-12">
                <p className="text-sm" style={{ color: "#8AAD6E" }}>Nog geen uren geregistreerd</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => openModal()}
        className="fixed z-40 flex items-center justify-center active:scale-[0.93] transition-transform sm:bottom-8"
        style={{
          bottom: 90,
          right: "max(24px, calc(50% - 215px + 24px))",
          width: 56, height: 56, borderRadius: "50%",
          background: "linear-gradient(135deg, #4A7C2F, #3D6826)",
          color: "#fff", fontSize: 26, fontWeight: 300,
          boxShadow: "0 8px 28px rgba(74,124,47,0.35)",
        }}
      >
        +
      </button>

      {showModal && (
        <AddEntryModal weekDays={weekDates} onClose={() => setShowModal(false)} onSubmit={addEntry} initialDate={modalDate} />
      )}
    </div>
    </PageShell>
  );
};

export default Index;

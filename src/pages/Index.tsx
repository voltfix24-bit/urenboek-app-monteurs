import { useState, useEffect, useCallback } from "react";
import { useTimesheet } from "@/hooks/useTimesheet";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useSwipe } from "@/hooks/useSwipe";
import { EntryCard } from "@/components/EntryCard";
import { AddEntryModal } from "@/components/AddEntryModal";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { PullToRefresh } from "@/components/PullToRefresh";
import { FolderOpen, Building2, ArrowRight, ClipboardList, AlertTriangle, WifiOff } from "lucide-react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, startOfWeek, addDays } from "date-fns";
import { queueOfflineEntry, syncOfflineEntries, getPendingCount } from "@/lib/offlineQueue";

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

const AVATAR_COLORS = ['var(--accent)', 'var(--accent-mid)', 'var(--info-dark)', 'var(--warn-text)', 'var(--purple)'];

const Index = () => {
  const { user, profile, isManager } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"week" | "overzicht">("week");
  const [showModal, setShowModal] = useState(false);
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [showFridayBanner, setShowFridayBanner] = useState(false);
  const [submittingAll, setSubmittingAll] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingOffline, setPendingOffline] = useState(0);

  // Track online/offline status
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      syncOfflineEntries().then(() => getPendingCount().then(setPendingOffline));
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    getPendingCount().then(setPendingOffline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  const {
    weekDates, weekEntries, allEntries, addEntry, removeEntry, submitEntry, submitAll,
    revertToConcept, goToPreviousWeek, goToNextWeek, totalHours, currentWeekStart,
    loading, profileId,
  } = useTimesheet();

  const swipeHandlers = useSwipe({ onSwipeLeft: goToNextWeek, onSwipeRight: goToPreviousWeek });

  const conceptEntries = weekEntries.filter(e => e.status === "concept");
  const conceptHours = conceptEntries.reduce((s, e) => s + e.hours, 0);

  // Onboarding check
  useEffect(() => {
    if (!profileId || onboardingChecked) return;
    const dismissed = localStorage.getItem("onboarding_dismissed");
    if (dismissed === "true") { setOnboardingChecked(true); return; }
    (async () => {
      const { count } = await supabase.from("uren_boekingen").select("id", { count: "exact", head: true }).eq("medewerker_id", profileId);
      if (count === 0) setShowOnboarding(true);
      setOnboardingChecked(true);
    })();
  }, [profileId, onboardingChecked]);

  useEffect(() => {
    const now = new Date();
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const viewingCurrentWeek = format(currentWeekStart, "yyyy-MM-dd") === format(thisWeekStart, "yyyy-MM-dd");
    setShowFridayBanner(isFridayAfternoon() && viewingCurrentWeek && conceptEntries.length > 0);
  }, [conceptEntries.length, currentWeekStart]);

  const submitAllConcepts = useCallback(async () => {
    if (!user || conceptEntries.length === 0) return;
    setSubmittingAll(true);
    const count = await submitAll();
    if (count > 0) setShowFridayBanner(false);
    setSubmittingAll(false);
  }, [user, conceptEntries, submitAll]);

  const handleRefresh = async () => {
    window.location.reload();
  };

  const today = dateKey(new Date());
  const weekLabel = `${fmt(weekDates[0])} – ${fmt(weekDates[6])}`;

  function openModal(date?: Date) {
    setModalDate(date || null);
    setShowModal(true);
  }

  const goedgekeurdUren = allEntries.filter((e) => e.status === "goedgekeurd").reduce((a, b) => a + b.hours, 0);
  const ingediendCount = allEntries.filter((e) => e.status === "ingediend").length;
  const afgekeurdCount = allEntries.filter((e) => e.status === "afgekeurd").length;

  const dismissOnboarding = () => {
    localStorage.setItem("onboarding_dismissed", "true");
    setShowOnboarding(false);
  };

  return (
    <PageShell>
    <div {...swipeHandlers} style={{ position: "relative" }}>
      {/* Header */}
      <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <HeaderLogo />

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: "var(--accent-light)", border: "1px solid #9DC87A" }}>
                <span className="text-lg font-extrabold" style={{ color: "var(--accent)" }}>{totalHours}</span>
                <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>uur</span>
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
                      <button key={n.path} onClick={() => navigate(n.path)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
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
              <button onClick={() => navigate("/projecten")} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium shrink-0" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                <FolderOpen className="h-3 w-3" /> Projecten
              </button>
              <button onClick={() => navigate("/opdrachtgevers")} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium shrink-0" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                <Building2 className="h-3 w-3" /> Opdrachtgevers
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex mt-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
            {([["week", "Deze week"], ["overzicht", "Overzicht"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as "week" | "overzicht")}
                className="flex-1 py-2.5 text-sm font-medium transition-colors"
                style={{
                  color: activeTab === key ? "var(--accent)" : "var(--text-muted)",
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

      <div className="lg:hidden">
        <PullToRefresh onRefresh={handleRefresh}>
          {renderContent()}
        </PullToRefresh>
      </div>
      <div className="hidden lg:block">
        {renderContent()}
      </div>

      {/* FAB */}
      <button
        onClick={() => openModal()}
        className="fixed z-40 flex items-center justify-center active:scale-[0.93] transition-transform sm:bottom-8"
        style={{
          bottom: 90,
          right: "max(24px, calc(50% - 215px + 24px))",
          width: 56, height: 56, borderRadius: "50%",
          background: "linear-gradient(135deg, var(--accent), var(--accent-dark))",
          color: "#fff", fontSize: 26, fontWeight: 300,
          boxShadow: "0 8px 28px color-mix(in srgb, var(--accent) 35%, transparent)",
        }}
      >
        +
      </button>

      {showModal && (
        <AddEntryModal weekDays={weekDates} onClose={() => setShowModal(false)} onSubmit={async (entry) => {
          if (!navigator.onLine && profileId) {
            await queueOfflineEntry({
              id: crypto.randomUUID(),
              medewerker_id: profileId,
              datum: entry.date,
              project_id: entry.projectId,
              beschrijving: entry.description,
              type: entry.description || "monteren",
              uren: entry.hours,
              status: "concept",
              created_at: new Date().toISOString(),
            });
            toast.success("Offline opgeslagen — wordt gesynchroniseerd bij verbinding");
            getPendingCount().then(setPendingOffline);
            return;
          }
          await addEntry(entry);
        }} initialDate={modalDate} />
      )}
    </div>
    </PageShell>
  );

  function renderContent() {
    return (
      <>
        {/* Offline banner */}
        {isOffline && (
          <div className="mx-4 mt-3 flex items-center gap-2 px-4 py-3 rounded-2xl" style={{ background: "var(--warn-bg)", border: "1px solid var(--warn-border)" }}>
            <WifiOff className="h-4 w-4 shrink-0" style={{ color: "var(--warn-text)" }} />
            <p className="text-xs font-medium" style={{ color: "var(--warn-text)" }}>
              📡 Geen verbinding — je kunt nog wel uren boeken. Ze worden ingediend als je weer online bent.
              {pendingOffline > 0 && ` (${pendingOffline} wachtend)`}
            </p>
          </div>
        )}
        {showOnboarding && !isManager && (
          <div className="mx-4 mt-3 rounded-2xl p-5 space-y-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: "var(--accent-light)" }}>👋</div>
            <div>
              <p className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Welkom bij TerreVolt Urenregistratie</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Boek hier je gewerkte uren per project. Je manager plant je in en keurt je uren goed.</p>
            </div>
            <div className="space-y-2">
              {[
                { step: "1", text: "Druk op + om uren te boeken" },
                { step: "2", text: "Kies je project en vul je uren in" },
                { step: "3", text: "Dien je uren in ter goedkeuring" },
              ].map(s => (
                <div key={s.step} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "var(--accent)", color: "#fff" }}>{s.step}</div>
                  <span className="text-sm" style={{ color: "var(--text-primary)" }}>{s.text}</span>
                </div>
              ))}
            </div>
            <button onClick={dismissOnboarding} style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
              Niet meer tonen
            </button>
          </div>
        )}

        {/* Friday afternoon banner */}
        {showFridayBanner && (
          <div className="mx-4 mt-3 flex items-center justify-between gap-2 px-4 py-3 rounded-2xl" style={{ background: "var(--warn-bg)", border: "1px solid #E8D070" }}>
            <p className="text-xs font-medium flex items-center gap-1" style={{ color: "var(--warn-text)" }}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Je hebt nog {conceptHours}u niet ingediend deze week.
            </p>
            <button
              onClick={submitAllConcepts}
              disabled={submittingAll}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0 transition-colors disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}
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
              <button onClick={goToPreviousWeek} className="w-8 h-8 rounded-full flex items-center justify-center text-base" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                ‹
              </button>
              <div className="text-center">
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{weekLabel}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {totalHours}u geboekt deze week
                </p>
              </div>
              <button onClick={goToNextWeek} className="w-8 h-8 rounded-full flex items-center justify-center text-base" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
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
                      background: isToday ? "var(--accent-light)" : "var(--bg-surface)",
                      border: isToday ? "1px solid #9DC87A" : "1px solid var(--border)",
                    }}
                  >
                    <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>{DAGEN[i]}</span>
                    <span className={`text-sm font-bold`} style={{ color: isToday ? "var(--accent)" : "var(--text-primary)" }}>
                      {d.getDate()}
                    </span>
                    {hasEntries ? (
                      <div className="flex items-center gap-1">
                        <div
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            background: dayEntries.some((e) => e.status === "afgekeurd")
                              ? "var(--danger)"
                              : dayEntries.some((e) => e.status === "goedgekeurd")
                              ? "var(--success)"
                              : "var(--warn-dot)",
                          }}
                        />
                        <span className="text-[9px] font-bold" style={{ color: "var(--text-muted)" }}>{dayHours}u</span>
                      </div>
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--border)" }} />
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
                    <p className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: "var(--text-muted)" }}>
                      {DAGEN[i]} {d.getDate()} {MAANDEN[d.getMonth()]}
                    </p>
                    {dayEntries.map((entry) => (
                      <EntryCard key={entry.id} entry={entry} onSubmit={submitEntry} onRemove={removeEntry} onRevertToConcept={revertToConcept} />
                    ))}
                  </div>
                );
              })}
              {weekEntries.length === 0 && !showOnboarding && (
                <div className="text-center py-12">
                  <ClipboardList className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Geen uren geboekt</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Druk op + om uren toe te voegen</p>
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
                { label: "Goedgekeurd", value: goedgekeurdUren + "u", color: "var(--success)" },
                { label: "In behandeling", value: String(ingediendCount), color: "var(--warn-dot)" },
                { label: "Afgekeurd", value: String(afgekeurdCount), color: "var(--danger)" },
              ].map((s, i) => (
                <div key={i} className="flex-1 rounded-2xl p-3 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[10px] mt-0.5 font-medium" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {allEntries.map((entry) => (
                <EntryCard key={entry.id} entry={entry} showDate onSubmit={submitEntry} onRemove={removeEntry} onRevertToConcept={revertToConcept} />
              ))}
              {allEntries.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nog geen uren geregistreerd</p>
                </div>
              )}
            </div>
          </div>
        )}
      </>
    );
  }
};

export default Index;

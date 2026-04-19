import { useState, useEffect, useCallback } from "react";
import { subWeeks } from "date-fns";
import { useProfile } from "@/hooks/useProfile";
import { useTimesheet } from "@/hooks/useTimesheet";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useLocation } from "react-router-dom";
import { useSwipe } from "@/hooks/useSwipe";
import { EntryCard } from "@/components/EntryCard";
import { ListSkeleton, UrenCardSkeleton } from "@/components/ui/Skeletons";
import { AddEntryModal } from "@/components/AddEntryModal";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { useNavBadges } from "@/hooks/useNavBadges";
import { PullToRefresh } from "@/components/PullToRefresh";
import { FolderOpen, Building2, ArrowRight, ClipboardList, AlertTriangle, WifiOff } from "lucide-react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { MobileHeader } from "@/components/MobileHeader";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, startOfWeek, addDays, getISOWeek } from "date-fns";
import { queueOfflineEntry, syncOfflineEntries, getPendingCount } from "@/lib/offlineQueue";
import { checkOveruren } from "@/lib/overurenCheck";

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

const AVATAR_COLORS = ['#3fff8b', '#22c55e', '#6e9bff', '#feb300', '#a78bfa'];

const Index = () => {
  const { user, profile, isManager } = useAuth();
  const { badges } = useNavBadges();
  const { profile: profileCtx } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<"week" | "overzicht">("week");
  const [showModal, setShowModal] = useState(false);
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [showFridayBanner, setShowFridayBanner] = useState(false);
  const [submittingAll, setSubmittingAll] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingOffline, setPendingOffline] = useState(0);
  const [vorigeWeekConcept, setVorigeWeekConcept] = useState<{ id: string; datum: string; uren: number }[]>([]);
  const [submittingVorigeWeek, setSubmittingVorigeWeek] = useState(false);
  const [planningItems, setPlanningItems] = useState<Array<{ datum: string; project_id: string }>>([]);

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

  // Vorige week reminder
  useEffect(() => {
    if (!profileId) return;
    const vorigeMaandag = startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
    const vorigeVrijdag = addDays(vorigeMaandag, 4);
    const startStr = format(vorigeMaandag, "yyyy-MM-dd");
    const endStr = format(vorigeVrijdag, "yyyy-MM-dd");
    (async () => {
      const { data } = await supabase
        .from("uren_boekingen")
        .select("id, datum, uren")
        .eq("medewerker_id", profileId)
        .eq("status", "concept")
        .gte("datum", startStr)
        .lte("datum", endStr);
      setVorigeWeekConcept(data?.map((d: any) => ({ id: d.id, datum: d.datum, uren: Number(d.uren) })) || []);
    })();
  }, [profileId]);

  useEffect(() => {
    const now = new Date();
    const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const viewingCurrentWeek = format(currentWeekStart, "yyyy-MM-dd") === format(thisWeekStart, "yyyy-MM-dd");
    setShowFridayBanner(isFridayAfternoon() && viewingCurrentWeek && conceptEntries.length > 0);
  }, [conceptEntries.length, currentWeekStart]);

  // Load planning for current week to filter project selection in modal
  useEffect(() => {
    if (!profileId) return;
    const startStr = format(currentWeekStart, "yyyy-MM-dd");
    const endStr = format(addDays(currentWeekStart, 6), "yyyy-MM-dd");
    (async () => {
      const { data } = await supabase
        .from("planning")
        .select("datum, project_id")
        .eq("medewerker_id", profileId)
        .gte("datum", startStr)
        .lte("datum", endStr);
      setPlanningItems((data ?? []) as Array<{ datum: string; project_id: string }>);
    })();
  }, [profileId, currentWeekStart]);

  const handleSubmitEntry = useCallback(async (id: string) => {
    const entry = [...weekEntries, ...allEntries].find(e => e.id === id);
    await submitEntry(id);
    if (entry && profileId) {
      checkOveruren(profileId, entry.date, entry.projectId, entry.hours).catch(() => {});
    }
  }, [weekEntries, allEntries, submitEntry, profileId]);

  const submitAllConcepts = useCallback(async () => {
    if (!user || conceptEntries.length === 0) return;
    setSubmittingAll(true);
    const count = await submitAll();
    if (count > 0) {
      setShowFridayBanner(false);
      // Check overuren for all submitted entries
      if (profileId) {
        for (const entry of conceptEntries) {
          checkOveruren(profileId, entry.date, entry.projectId, entry.hours).catch(() => {});
        }
      }
    }
    setSubmittingAll(false);
  }, [user, conceptEntries, submitAll, profileId]);

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
    <div {...swipeHandlers} style={{ position: "relative", minHeight: "100vh", background: "#060d18", fontFamily: "Inter, sans-serif" }}>

      <MobileHeader initials={profile?.full_name?.charAt(0)?.toUpperCase() || "U"} />

      {/* ── MAIN CONTENT ── */}
      <PullToRefresh onRefresh={handleRefresh}>
        <div style={{ padding: "20px 20px 180px 20px" }}>

          {/* WEEK HEADER */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "rgba(255,255,255,0.35)", textTransform: "uppercase" as const }}>HUIDIGE WEEK</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <button onClick={goToPreviousWeek} style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_left</span>
              </button>
              <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 20, color: "white" }}>
                Week {getISOWeek(currentWeekStart)}
              </span>
              <button onClick={goToNextWeek} style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>chevron_right</span>
              </button>
            </div>

            <div style={{ textAlign: "center", fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>
              {weekLabel}
            </div>

            {/* Status badge */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 12px", borderRadius: 9999,
                background: ingediendCount > 0 ? "rgba(110,155,255,0.1)" : goedgekeurdUren > 0 ? "rgba(63,255,139,0.1)" : "rgba(254,179,0,0.1)",
                border: `1px solid ${ingediendCount > 0 ? "rgba(110,155,255,0.3)" : goedgekeurdUren > 0 ? "rgba(63,255,139,0.3)" : "rgba(254,179,0,0.3)"}`,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: ingediendCount > 0 ? "#6e9bff" : goedgekeurdUren > 0 ? "#3fff8b" : "#feb300" }} />
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: ingediendCount > 0 ? "#6e9bff" : goedgekeurdUren > 0 ? "#3fff8b" : "#feb300" }}>
                  {ingediendCount > 0 ? "INGEDIEND" : goedgekeurdUren > 0 ? "GOEDGEKEURD" : "CONCEPT"}
                </span>
              </div>
            </div>
          </div>

          {/* PROGRESS CARD */}
          <div className="glass-card" style={{ padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 28, color: "#3fff8b" }}>{totalHours}</span>
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>/ 40 uur</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)" }}>{Math.round((totalHours / 40) * 100)}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, background: "linear-gradient(90deg, #3fff8b, #16a34a)", width: `${Math.min((totalHours / 40) * 100, 100)}%`, transition: "width 0.4s ease" }} />
            </div>
          </div>

          {/* CONDITIONAL BANNERS */}

          {/* Vorige week banner */}
          {vorigeWeekConcept.length > 0 && (
            <div style={{ marginBottom: 12, padding: "12px 16px", borderRadius: 16, background: "rgba(254,179,0,0.08)", border: "1px solid rgba(254,179,0,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#feb300", flex: 1 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>warning</span>
                Je hebt nog {vorigeWeekConcept.reduce((s, e) => s + e.uren, 0)}u van vorige week niet ingediend.
              </div>
              <button
                onClick={async () => {
                  setSubmittingVorigeWeek(true);
                  const ids = vorigeWeekConcept.map(e => e.id);
                  const { error } = await supabase.from("uren_boekingen").update({ status: "ingediend" } as any).in("id", ids);
                  if (!error) { toast.success("Ingediend ✓"); setVorigeWeekConcept([]); } else { toast.error("Er ging iets mis"); }
                  setSubmittingVorigeWeek(false);
                }}
                disabled={submittingVorigeWeek}
                style={{ background: "#feb300", color: "#523700", border: "none", borderRadius: 12, padding: "6px 12px", fontSize: 11, fontWeight: 700, fontFamily: "Inter", cursor: "pointer", whiteSpace: "nowrap" as const }}
              >
                Indienen
              </button>
            </div>
          )}

          {/* Offline banner */}
          {isOffline && (
            <div style={{ marginBottom: 12, padding: "12px 16px", borderRadius: 16, background: "rgba(254,179,0,0.08)", border: "1px solid rgba(254,179,0,0.2)", display: "flex", alignItems: "center", gap: 10 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#feb300" }}>wifi_off</span>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>
                Geen verbinding — uren worden gesynchroniseerd als je online bent.
                {pendingOffline > 0 && ` (${pendingOffline} wachtend)`}
              </div>
            </div>
          )}

          {/* Friday banner */}
          {showFridayBanner && (
            <div style={{ marginBottom: 12, padding: "12px 16px", borderRadius: 16, background: "rgba(254,179,0,0.08)", border: "1px solid rgba(254,179,0,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#feb300", flex: 1 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>warning</span>
                Je hebt nog {conceptHours}u niet ingediend deze week.
              </div>
              <button onClick={submitAllConcepts} disabled={submittingAll} style={{ background: "#3fff8b", color: "#005d2c", border: "none", borderRadius: 12, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                Alles indienen
              </button>
            </div>
          )}

          {/* Onboarding banner */}
          {profileCtx?.account_status === "onboarding" && (
            <div style={{ marginBottom: 12, padding: "12px 16px", borderRadius: 16, background: "rgba(254,179,0,0.08)", border: "1px solid rgba(254,179,0,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 12, color: "#feb300" }}>Account moet geverifieerd worden.</div>
              <button onClick={() => navigate("/onboarding-welkom")} style={{ background: "#3fff8b", color: "#005d2c", border: "none", borderRadius: 12, padding: "6px 12px", fontSize: 11, fontWeight: 700, fontFamily: "Inter", cursor: "pointer" }}>
                Naar onboarding →
              </button>
            </div>
          )}

          {/* DAY CARDS */}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
            {weekDates.slice(0, 5).map((date, i) => {
              const DAGEN_KORT = ["MA", "DI", "WO", "DO", "VR"];
              const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
              const dayEntries = weekEntries.filter(e => e.date === dateStr);
              const dayHours = dayEntries.reduce((a, b) => a + b.hours, 0);
              const isToday = dateStr === today;
              const hasEntries = dayEntries.length > 0;
              const isUnder = hasEntries && dayHours < 8;
              const hasAfgekeurd = dayEntries.some(e => e.status === "afgekeurd");

              // Friday empty — dashed style
              if (i === 4 && !hasEntries) {
                return (
                  <div key={i} onClick={() => openModal(date)} style={{ border: "2px dashed rgba(255,255,255,0.1)", borderRadius: 16, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", opacity: 0.5, cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", width: 36 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.05em" }}>{DAGEN_KORT[i]}</span>
                        <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "Manrope", color: "rgba(255,255,255,0.25)" }}>{date.getDate()}</span>
                      </div>
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.25)" }}>Niets geboekt</span>
                    </div>
                    <span style={{ fontSize: 14, color: "rgba(255,255,255,0.15)" }}>—</span>
                  </div>
                );
              }

              return (
                <div key={i} onClick={() => openModal(date)} style={{
                  background: isToday ? "rgba(63,255,139,0.04)" : "linear-gradient(135deg, rgba(10,26,48,0.7), rgba(6,19,39,0.8))",
                  backdropFilter: "blur(12px)",
                  borderRadius: 16,
                  padding: "16px 20px",
                  border: isToday ? "1px solid #3fff8b" : hasAfgekeurd ? "1px solid rgba(255,113,108,0.4)" : "1px solid rgba(106,118,140,0.15)",
                  borderLeft: isToday ? "4px solid #3fff8b" : hasAfgekeurd ? "4px solid #ff716c" : "1px solid rgba(106,118,140,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer",
                  transition: "transform 0.1s", minHeight: 72,
                }}>
                  {/* LEFT — day + date */}
                  <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", width: 36, marginRight: 14 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: isToday ? "#3fff8b" : "rgba(255,255,255,0.35)", letterSpacing: "0.05em" }}>{DAGEN_KORT[i]}</span>
                    <span style={{ fontSize: 20, fontWeight: 800, fontFamily: "Manrope", color: isToday ? "#3fff8b" : "white" }}>{date.getDate()}</span>
                  </div>

                  {/* CENTER — project info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {hasEntries ? (
                      <>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "white", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {dayEntries[0].projectNumber}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>location_on</span>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                            {dayEntries.length > 1 ? "Meerdere locaties" : "Zie planning"}
                          </span>
                          {dayEntries.length > 1 && (
                            <span style={{ fontSize: 10, color: "#3fff8b", fontWeight: 600, marginLeft: 4 }}>+{dayEntries.length - 1} meer</span>
                          )}
                        </div>
                        {isUnder && (
                          <div style={{ marginTop: 4, display: "inline-block", padding: "2px 6px", borderRadius: 4, background: "rgba(254,179,0,0.1)", border: "1px solid rgba(254,179,0,0.2)", fontSize: 9, fontWeight: 700, color: "#feb300", letterSpacing: "0.05em" }}>
                            ONDER TARGET
                          </div>
                        )}
                      </>
                    ) : (
                      <div>
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Niets geboekt</span>
                        {isToday && (
                          <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, color: "#3fff8b", letterSpacing: "0.05em", background: "rgba(63,255,139,0.1)", padding: "2px 6px", borderRadius: 4 }}>VANDAAG</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* RIGHT — hours or + button */}
                  {hasEntries ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 12 }}>
                      <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 18, color: "#3fff8b" }}>{dayHours}u</span>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: "rgba(255,255,255,0.2)" }}>chevron_right</span>
                    </div>
                  ) : isToday ? (
                    <button onClick={(e) => { e.stopPropagation(); openModal(date); }} style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(63,255,139,0.1)", border: "none", color: "#3fff8b", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 22 }}>add</span>
                    </button>
                  ) : (
                    <span style={{ fontSize: 14, color: "rgba(255,255,255,0.15)", marginLeft: 12 }}>—</span>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </PullToRefresh>

      {/* ── FAB ── */}
      {profileCtx?.account_status !== "onboarding" && (
        <div style={{ position: "fixed", bottom: 96, left: 0, right: 0, zIndex: 40, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <button onClick={() => openModal()} style={{
            pointerEvents: "all", minWidth: 280, height: 56, borderRadius: 9999,
            background: "#3fff8b", color: "#005d2c", fontFamily: "Manrope", fontWeight: 800, fontSize: 16,
            textTransform: "uppercase" as const, letterSpacing: "0.05em", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            boxShadow: "0 8px 32px rgba(63,255,139,0.3)",
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>add</span>
            UREN TOEVOEGEN
          </button>
        </div>
      )}

      <BottomNav badges={badges} />

      {/* ── MODAL ── */}
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
            toast.success("Offline opgeslagen");
            getPendingCount().then(setPendingOffline);
            return;
          }
          await addEntry(entry);
        }} initialDate={modalDate} />
      )}

    </div>
  );

  function renderContent() {
    const vorigeWeekUren = vorigeWeekConcept.reduce((s, e) => s + e.uren, 0);
    const submitVorigeWeek = async () => {
      setSubmittingVorigeWeek(true);
      const ids = vorigeWeekConcept.map(e => e.id);
      const { error } = await supabase.from("uren_boekingen").update({ status: "ingediend" } as any).in("id", ids);
      if (!error) {
        toast.success(`${vorigeWeekUren}u ingediend ✓`);
        setVorigeWeekConcept([]);
      } else {
        toast.error("Er ging iets mis");
      }
      setSubmittingVorigeWeek(false);
    };

    return (
      <>
        {/* Vorige week reminder */}
        {vorigeWeekConcept.length > 0 && (
          <div className="mx-4 mt-3 flex items-center justify-between gap-2 px-4 py-3 rounded-2xl" style={{ background: "rgba(254,179,0,0.08)", border: "1px solid rgba(254,179,0,0.3)" }}>
            <p className="text-xs font-medium flex items-center gap-1" style={{ color: "#feb300" }}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Je hebt nog {vorigeWeekUren}u van vorige week niet ingediend.
            </p>
            <button
              onClick={submitVorigeWeek}
              disabled={submittingVorigeWeek}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0 transition-colors disabled:opacity-50"
              style={{ background: "#3fff8b", color: "#fff" }}
            >
              Alles indienen <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}
        {/* Offline banner */}
        {isOffline && (
          <div className="mx-4 mt-3 flex items-center gap-2 px-4 py-3 rounded-2xl" style={{ background: "rgba(254,179,0,0.08)", border: "1px solid rgba(254,179,0,0.3)" }}>
            <WifiOff className="h-4 w-4 shrink-0" style={{ color: "#feb300" }} />
            <p className="text-xs font-medium" style={{ color: "#feb300" }}>
              📡 Geen verbinding — je kunt nog wel uren boeken. Ze worden ingediend als je weer online bent.
              {pendingOffline > 0 && ` (${pendingOffline} wachtend)`}
            </p>
          </div>
        )}
        {showOnboarding && !isManager && (
          <div className="mx-4 mt-3 rounded-2xl p-5 space-y-4" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl" style={{ background: "rgba(63,255,139,0.1)" }}>👋</div>
            <div>
              <p className="text-base font-bold" style={{ color: "#dae6ff" }}>Welkom bij TerreVolt Urenregistratie</p>
              <p className="text-xs mt-1" style={{ color: "#a0abc3" }}>Boek hier je gewerkte uren per project. Je manager plant je in en keurt je uren goed.</p>
            </div>
            <div className="space-y-2">
              {[
                { step: "1", text: "Druk op + om uren te boeken" },
                { step: "2", text: "Kies je project en vul je uren in" },
                { step: "3", text: "Dien je uren in ter goedkeuring" },
              ].map(s => (
                <div key={s.step} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "#3fff8b", color: "#fff" }}>{s.step}</div>
                  <span className="text-sm" style={{ color: "#dae6ff" }}>{s.text}</span>
                </div>
              ))}
            </div>
            <button onClick={dismissOnboarding} style={{ marginTop: 12, fontSize: 11, color: "#a0abc3", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
              Niet meer tonen
            </button>
          </div>
        )}

        {/* Friday afternoon banner */}
        {showFridayBanner && (
          <div className="mx-4 mt-3 flex items-center justify-between gap-2 px-4 py-3 rounded-2xl" style={{ background: "rgba(254,179,0,0.08)", border: "1px solid rgba(254,179,0,0.3)" }}>
            <p className="text-xs font-medium flex items-center gap-1" style={{ color: "#feb300" }}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Je hebt nog {conceptHours}u niet ingediend deze week.
            </p>
            <button
              onClick={submitAllConcepts}
              disabled={submittingAll}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0 transition-colors disabled:opacity-50"
              style={{ background: "#3fff8b", color: "#fff" }}
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
              <button onClick={goToPreviousWeek} className="w-8 h-8 rounded-full flex items-center justify-center text-base" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>
                ‹
              </button>
              <div className="text-center">
                <p className="text-sm font-semibold" style={{ color: "#dae6ff" }}>{weekLabel}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "#a0abc3" }}>
                  {totalHours}u geboekt deze week
                </p>
              </div>
              <button onClick={goToNextWeek} className="w-8 h-8 rounded-full flex items-center justify-center text-base" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>
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
                      background: isToday ? "rgba(63,255,139,0.1)" : "rgba(10,26,48,0.7)",
                      border: isToday ? "1px solid rgba(63,255,139,0.3)" : "1px solid rgba(106,118,140,0.15)",
                    }}
                  >
                    <span className="text-[10px] font-medium" style={{ color: "#a0abc3" }}>{DAGEN[i]}</span>
                    <span className={`text-sm font-bold`} style={{ color: isToday ? "#3fff8b" : "#dae6ff" }}>
                      {d.getDate()}
                    </span>
                    {hasEntries ? (
                      <div className="flex items-center gap-1">
                        <div
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            background: dayEntries.some((e) => e.status === "afgekeurd")
                              ? "#ff716c"
                              : dayEntries.some((e) => e.status === "goedgekeurd")
                              ? "#3fff8b"
                              : "#feb300",
                          }}
                        />
                        <span className="text-[9px] font-bold" style={{ color: "#a0abc3" }}>{dayHours}u</span>
                      </div>
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: "rgba(106,118,140,0.15)" }} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Week entries by day */}
            {loading ? (
              <ListSkeleton count={3} ItemSkeleton={UrenCardSkeleton} />
            ) : (
            <div className="space-y-3">
              {weekDates.map((d, i) => {
                const key = dateKey(d);
                const dayEntries = weekEntries.filter((e) => e.date === key);
                if (dayEntries.length === 0) return null;
                return (
                  <div key={key} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: "#a0abc3" }}>
                      {DAGEN[i]} {d.getDate()} {MAANDEN[d.getMonth()]}
                    </p>
                    {dayEntries.map((entry) => (
                      <EntryCard key={entry.id} entry={entry} onSubmit={handleSubmitEntry} onRemove={removeEntry} onRevertToConcept={revertToConcept} />
                    ))}
                  </div>
                );
              })}
              {weekEntries.length === 0 && !showOnboarding && (
                <div className="text-center py-12">
                  <ClipboardList className="h-8 w-8 mx-auto mb-2" style={{ color: "#a0abc3" }} />
                  <p className="text-sm font-medium" style={{ color: "#dae6ff" }}>Geen uren geboekt</p>
                  <p className="text-xs mt-1" style={{ color: "#a0abc3" }}>Druk op + om uren toe te voegen</p>
                </div>
              )}
            </div>
            )}
          </div>
        )}

        {/* Overzicht tab */}
        {activeTab === "overzicht" && (
          <div className="px-4 py-4 space-y-4 animate-fade-in">
            <div className="flex gap-2">
              {[
                { label: "Goedgekeurd", value: goedgekeurdUren + "u", color: "#3fff8b" },
                { label: "In behandeling", value: String(ingediendCount), color: "#feb300" },
                { label: "Afgekeurd", value: String(afgekeurdCount), color: "#ff716c" },
              ].map((s, i) => (
                <div key={i} className="flex-1 rounded-2xl p-3 text-center" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
                  <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[10px] mt-0.5 font-medium" style={{ color: "#a0abc3" }}>{s.label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {allEntries.map((entry) => (
                <EntryCard key={entry.id} entry={entry} showDate onSubmit={handleSubmitEntry} onRemove={removeEntry} onRevertToConcept={revertToConcept} />
              ))}
              {allEntries.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-sm" style={{ color: "#a0abc3" }}>Nog geen uren geregistreerd</p>
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

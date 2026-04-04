import { useState } from "react";
import { useTimesheet } from "@/hooks/useTimesheet";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useSwipe } from "@/hooks/useSwipe";
import { format } from "date-fns";
import { EntryCard } from "@/components/EntryCard";
import { AddEntryModal } from "@/components/AddEntryModal";
import { LogOut, Users, CheckCircle, BarChart3, Menu, X, FolderOpen } from "lucide-react";

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function dateKey(d: Date) {
  return d.toISOString().split("T")[0];
}

function fmt(date: Date) {
  return `${date.getDate()} ${MAANDEN[date.getMonth()]}`;
}

const Index = () => {
  const { profile, isManager, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"week" | "overzicht">("week");
  const [showModal, setShowModal] = useState(false);
  const [modalDate, setModalDate] = useState<Date | null>(null);

  const {
    currentWeekStart,
    weekDates,
    weekEntries,
    allEntries,
    addEntry,
    removeEntry,
    submitEntry,
    goToPreviousWeek,
    goToNextWeek,
    totalHours,
  } = useTimesheet();

  const swipeHandlers = useSwipe({
    onSwipeLeft: goToNextWeek,
    onSwipeRight: goToPreviousWeek,
  });

  const today = dateKey(new Date());
  const weekLabel = `${fmt(weekDates[0])} – ${fmt(weekDates[6])}`;

  function openModal(date?: Date) {
    setModalDate(date || null);
    setShowModal(true);
  }

  // Stats for overzicht
  const goedgekeurdUren = allEntries.filter((e) => e.status === "goedgekeurd").reduce((a, b) => a + b.hours, 0);
  const ingediendCount = allEntries.filter((e) => e.status === "ingediend").length;
  const afgekeurdCount = allEntries.filter((e) => e.status === "afgekeurd").length;

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{
        background: "#0a0a0f",
        maxWidth: 430,
        margin: "0 auto",
        position: "relative",
        paddingBottom: 100,
      }}
      {...swipeHandlers}
    >
      {/* Header */}
      <header className="sticky top-0 z-30" style={{ background: "rgba(10,10,15,0.95)", backdropFilter: "blur(12px)" }}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
                style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}
              >
                ⚡
              </div>
              <span className="text-base font-bold text-foreground tracking-tight">TerreVolt</span>
            </div>

            <div className="flex items-center gap-2">
              {isManager && (
                <button
                  className="w-8 h-8 rounded-lg flex items-center justify-center sm:hidden"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  {menuOpen ? <X className="h-4 w-4 text-muted-foreground" /> : <Menu className="h-4 w-4 text-muted-foreground" />}
                </button>
              )}
              {/* Desktop nav */}
              <div className="hidden sm:flex items-center gap-1.5">
                {isManager && (
                  <>
                    <button onClick={() => navigate("/goedkeuring")} className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-primary transition-colors" style={{ background: "rgba(255,255,255,0.04)" }}>
                      Goedkeuren
                    </button>
                    <button onClick={() => navigate("/rapportage")} className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-primary transition-colors" style={{ background: "rgba(255,255,255,0.04)" }}>
                      Rapportage
                    </button>
                    <button onClick={() => navigate("/medewerkers")} className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-primary transition-colors" style={{ background: "rgba(255,255,255,0.04)" }}>
                      Medewerkers
                    </button>
                    <button onClick={() => navigate("/projecten")} className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-primary transition-colors" style={{ background: "rgba(255,255,255,0.04)" }}>
                      Projecten
                    </button>
                  </>
                )}
              </div>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)", color: "#fff" }}
              >
                {profile?.full_name?.charAt(0)?.toUpperCase() || "U"}
              </div>
            </div>
          </div>

          {/* Mobile menu */}
          {menuOpen && isManager && (
            <div className="flex flex-col gap-1 mt-3 pt-3 border-t border-border/50 sm:hidden animate-fade-in">
              <span className="text-[11px] text-muted-foreground font-medium px-2 mb-1">{profile?.full_name}</span>
              <button onClick={() => { navigate("/goedkeuring"); setMenuOpen(false); }} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-foreground" style={{ background: "rgba(255,255,255,0.04)" }}>
                <CheckCircle className="h-4 w-4 text-primary" /> Uren goedkeuren
              </button>
              <button onClick={() => { navigate("/rapportage"); setMenuOpen(false); }} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-foreground" style={{ background: "rgba(255,255,255,0.04)" }}>
                <BarChart3 className="h-4 w-4 text-primary" /> Rapportage
              </button>
              <button onClick={() => { navigate("/medewerkers"); setMenuOpen(false); }} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-foreground" style={{ background: "rgba(255,255,255,0.04)" }}>
                <Users className="h-4 w-4 text-primary" /> Medewerkers
              </button>
              <button onClick={signOut} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-destructive" style={{ background: "rgba(255,255,255,0.04)" }}>
                <LogOut className="h-4 w-4" /> Uitloggen
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex mt-3 border-b border-border/50">
            {([["week", "Deze week"], ["overzicht", "Overzicht"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as "week" | "overzicht")}
                className="flex-1 py-2.5 text-sm font-medium transition-colors"
                style={{
                  color: activeTab === key ? "#22c55e" : "#64748b",
                  borderBottom: activeTab === key ? "2px solid #22c55e" : "2px solid transparent",
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

      {/* Week tab */}
      {activeTab === "week" && (
        <div className="px-4 py-4 space-y-4 animate-fade-in">
          {/* Week navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={goToPreviousWeek}
              className="w-8 h-8 rounded-full flex items-center justify-center text-base text-muted-foreground"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              ‹
            </button>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">{weekLabel}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {totalHours}u geboekt deze week
              </p>
            </div>
            <button
              onClick={goToNextWeek}
              className="w-8 h-8 rounded-full flex items-center justify-center text-base text-muted-foreground"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
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
              return (
                <button
                  key={i}
                  onClick={() => openModal(d)}
                  className="flex-1 flex flex-col items-center gap-1 transition-colors active:scale-[0.94]"
                  style={{
                    padding: "10px 0",
                    borderRadius: 12,
                    background: isToday ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)",
                    border: isToday ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <span className="text-[10px] font-medium text-muted-foreground">{DAGEN[i]}</span>
                  <span className={`text-sm font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                    {d.getDate()}
                  </span>
                  {hasEntries && (
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background: dayEntries.some((e) => e.status === "afgekeurd")
                          ? "#ef4444"
                          : dayEntries.some((e) => e.status === "goedgekeurd")
                          ? "#22c55e"
                          : "#f59e0b",
                      }}
                    />
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
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    {DAGEN[i]} {d.getDate()} {MAANDEN[d.getMonth()]}
                  </p>
                  {dayEntries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      onSubmit={submitEntry}
                      onRemove={removeEntry}
                    />
                  ))}
                </div>
              );
            })}
            {weekEntries.length === 0 && (
              <div className="text-center py-12">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-sm font-medium text-foreground">Geen uren geboekt</p>
                <p className="text-xs text-muted-foreground mt-1">Druk op + om uren toe te voegen</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Overzicht tab */}
      {activeTab === "overzicht" && (
        <div className="px-4 py-4 space-y-4 animate-fade-in">
          {/* Stats */}
          <div className="flex gap-2">
            {[
              { label: "Goedgekeurd", value: goedgekeurdUren + "u", color: "#22c55e" },
              { label: "In behandeling", value: String(ingediendCount), color: "#f59e0b" },
              { label: "Afgekeurd", value: String(afgekeurdCount), color: "#ef4444" },
            ].map((s, i) => (
              <div
                key={i}
                className="flex-1 rounded-2xl p-3 text-center"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">{s.label}</p>
              </div>
            ))}
          </div>

          {/* All entries */}
          <div className="space-y-2">
            {allEntries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                showDate
                onSubmit={submitEntry}
                onRemove={removeEntry}
              />
            ))}
            {allEntries.length === 0 && (
              <div className="text-center py-12">
                <p className="text-sm text-muted-foreground">Nog geen uren geregistreerd</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => openModal()}
        className="fixed z-40 flex items-center justify-center active:scale-[0.93] transition-transform"
        style={{
          bottom: 32,
          right: "max(24px, calc(50% - 215px + 24px))",
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #22c55e, #16a34a)",
          color: "#fff",
          fontSize: 26,
          fontWeight: 300,
          boxShadow: "0 8px 32px rgba(34,197,94,0.4), 0 2px 8px rgba(0,0,0,0.4)",
        }}
      >
        +
      </button>

      {/* Modal */}
      {showModal && (
        <AddEntryModal
          weekDays={weekDates}
          onClose={() => setShowModal(false)}
          onSubmit={addEntry}
          initialDate={modalDate}
        />
      )}
    </div>
  );
};

export default Index;

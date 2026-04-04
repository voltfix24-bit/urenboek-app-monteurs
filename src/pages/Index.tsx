import { useState } from "react";
import { useTimesheet } from "@/hooks/useTimesheet";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useSwipe } from "@/hooks/useSwipe";
import { EntryCard } from "@/components/EntryCard";
import { AddEntryModal } from "@/components/AddEntryModal";
import { BottomNav } from "@/components/BottomNav";
import { FolderOpen, Building2 } from "lucide-react";

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function dateKey(d: Date) {
  return d.toISOString().split("T")[0];
}

function fmt(date: Date) {
  return `${date.getDate()} ${MAANDEN[date.getMonth()]}`;
}

const Index = () => {
  const { profile, isManager } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"week" | "overzicht">("week");
  const [showModal, setShowModal] = useState(false);
  const [modalDate, setModalDate] = useState<Date | null>(null);

  const {
    weekDates,
    weekEntries,
    allEntries,
    addEntry,
    removeEntry,
    submitEntry,
    revertToConcept,
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
        paddingBottom: 80,
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
              {/* Prominent uren badge */}
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                style={{
                  background: "rgba(34,197,94,0.1)",
                  border: "1px solid rgba(34,197,94,0.2)",
                }}
              >
                <span className="text-lg font-extrabold" style={{ color: "#22c55e" }}>{totalHours}</span>
                <span className="text-[10px] font-semibold text-muted-foreground">uur</span>
              </div>

              {/* Desktop nav for managers */}
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
                    <button onClick={() => navigate("/opdrachtgevers")} className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-primary transition-colors" style={{ background: "rgba(255,255,255,0.04)" }}>
                      Opdrachtgevers
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

          {/* Manager quick links (mobile) */}
          {isManager && (
            <div className="flex gap-1.5 mt-2.5 sm:hidden overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              <button onClick={() => navigate("/projecten")} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground shrink-0" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <FolderOpen className="h-3 w-3" /> Projecten
              </button>
              <button onClick={() => navigate("/opdrachtgevers")} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground shrink-0" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <Building2 className="h-3 w-3" /> Opdrachtgevers
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex mt-2.5 border-b border-border/50">
            {([["week", "Deze week"], ["overzicht", "Overzicht"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as "week" | "overzicht")}
                className="flex-1 py-2.5 text-sm font-medium transition-colors"
                style={{
                  color: activeTab === key ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                  borderBottom: activeTab === key ? "2px solid hsl(var(--primary))" : "2px solid transparent",
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
              const dayHours = dayEntries.reduce((a, b) => a + b.hours, 0);
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
                  {hasEntries ? (
                    <div className="flex items-center gap-1">
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
                      <span className="text-[9px] font-bold text-muted-foreground">{dayHours}u</span>
                    </div>
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />
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
                      onRevertToConcept={revertToConcept}
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
        className="fixed z-40 flex items-center justify-center active:scale-[0.93] transition-transform sm:bottom-8"
        style={{
          bottom: 90,
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

      {/* Bottom Nav */}
      <BottomNav />

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

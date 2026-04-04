import { useTimesheet } from "@/hooks/useTimesheet";
import { useAuth } from "@/hooks/useAuth";
import { WeekNavigation } from "@/components/WeekNavigation";
import { AddEntryForm } from "@/components/AddEntryForm";
import { WeekOverview } from "@/components/WeekOverview";
import { WeekSummary } from "@/components/WeekSummary";
import { Button } from "@/components/ui/button";
import { LogOut, Users, CheckCircle, BarChart3, Menu, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useSwipe } from "@/hooks/useSwipe";
import terrevoltLogo from "@/assets/terrevolt-logo.png";

const Index = () => {
  const { profile, isManager, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    currentWeekStart,
    weekDates,
    weekEntries,
    addEntry,
    addMultipleEntries,
    removeEntry,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
    totalHours,
    hoursByProject,
    hoursByDay,
  } = useTimesheet();
  const swipeHandlers = useSwipe({
    onSwipeLeft: goToNextWeek,
    onSwipeRight: goToPreviousWeek,
  });

  return (
    <div className="min-h-screen bg-background overflow-x-hidden" {...swipeHandlers}>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur-md">
        <div className="px-4 py-3 max-w-5xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img src={terrevoltLogo} alt="TerreVolt BV" className="h-7" />
              <div className="border-l pl-2.5 hidden sm:block">
                <span className="text-[11px] text-muted-foreground font-medium tracking-wide uppercase">Urenregistratie</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium hidden sm:inline">{profile?.full_name}</span>
              {isManager && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="sm:hidden h-8 w-8"
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                </Button>
              )}
              {/* Desktop nav */}
              <div className="hidden sm:flex items-center gap-1.5">
                {isManager && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => navigate("/goedkeuring")} className="gap-1.5 text-xs h-8 hover:bg-primary/5 hover:text-primary">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Goedkeuren
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => navigate("/rapportage")} className="gap-1.5 text-xs h-8 hover:bg-primary/5 hover:text-primary">
                      <BarChart3 className="h-3.5 w-3.5" />
                      Rapportage
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => navigate("/medewerkers")} className="gap-1.5 text-xs h-8 hover:bg-primary/5 hover:text-primary">
                      <Users className="h-3.5 w-3.5" />
                      Medewerkers
                    </Button>
                  </>
                )}
              </div>
              <div className="w-px h-5 bg-border hidden sm:block" />
              <Button variant="ghost" size="icon" onClick={signOut} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Mobile menu */}
          {menuOpen && isManager && (
            <div className="flex flex-col gap-1 mt-3 pt-3 border-t sm:hidden animate-fade-in">
              <span className="text-[11px] text-muted-foreground font-medium px-2 mb-1">{profile?.full_name}</span>
              <Button variant="ghost" size="sm" onClick={() => { navigate("/goedkeuring"); setMenuOpen(false); }} className="gap-2 justify-start h-9 text-xs">
                <CheckCircle className="h-4 w-4 text-primary" />
                Uren goedkeuren
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { navigate("/rapportage"); setMenuOpen(false); }} className="gap-2 justify-start h-9 text-xs">
                <BarChart3 className="h-4 w-4 text-primary" />
                Rapportage
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { navigate("/medewerkers"); setMenuOpen(false); }} className="gap-2 justify-start h-9 text-xs">
                <Users className="h-4 w-4 text-primary" />
                Medewerkers
              </Button>
            </div>
          )}

          {/* Week navigation */}
          <div className="flex justify-center mt-3 pt-3 border-t">
            <WeekNavigation
              weekStart={currentWeekStart}
              onPrevious={goToPreviousWeek}
              onNext={goToNextWeek}
              onToday={goToCurrentWeek}
            />
          </div>
        </div>
      </header>

      <main className="px-4 py-5 space-y-5 max-w-5xl mx-auto">
        {/* Entry form */}
        <section className="rounded-2xl border bg-card shadow-card p-5 animate-slide-up">
          <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
            <div className="w-1 h-4 rounded-full gradient-primary" />
            Uren invoeren
          </h2>
          <AddEntryForm weekDates={weekDates} onAdd={addEntry} onAddMultiple={addMultipleEntries} />
        </section>

        {/* Summary */}
        <div className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <WeekSummary
            totalHours={totalHours}
            hoursByProject={hoursByProject}
            hoursByDay={hoursByDay}
            weekDates={weekDates}
          />
        </div>

        {/* Overview */}
        <section className="animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <div className="w-1 h-4 rounded-full gradient-accent" />
            Weekoverzicht
          </h2>
          <WeekOverview
            weekDates={weekDates}
            entries={weekEntries}
            onRemove={removeEntry}
          />
        </section>
      </main>
    </div>
  );
};

export default Index;

import { useTimesheet } from "@/hooks/useTimesheet";
import { useAuth } from "@/hooks/useAuth";
import { WeekNavigation } from "@/components/WeekNavigation";
import { AddEntryForm } from "@/components/AddEntryForm";
import { WeekOverview } from "@/components/WeekOverview";
import { WeekSummary } from "@/components/WeekSummary";
import { Button } from "@/components/ui/button";
import { LogOut, Users, CheckCircle, BarChart3, Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
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

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <header className="border-b bg-card">
        <div className="px-4 py-3">
          {/* Top row: logo + hamburger */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={terrevoltLogo} alt="TerreVolt BV" className="h-7" />
              <span className="text-xs text-muted-foreground border-l pl-2 hidden sm:inline">Urenregistratie</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">{profile?.full_name}</span>
              {isManager && (
                <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setMenuOpen(!menuOpen)}>
                  <Menu className="h-5 w-5" />
                </Button>
              )}
              {/* Desktop nav */}
              <div className="hidden sm:flex items-center gap-2">
                {isManager && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => navigate("/goedkeuring")} className="gap-1">
                      <CheckCircle className="h-4 w-4" />
                      Goedkeuren
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate("/rapportage")} className="gap-1">
                      <BarChart3 className="h-4 w-4" />
                      Rapportage
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => navigate("/medewerkers")} className="gap-1">
                      <Users className="h-4 w-4" />
                      Medewerkers
                    </Button>
                  </>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={signOut}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Mobile menu */}
          {menuOpen && isManager && (
            <div className="flex flex-col gap-2 mt-3 sm:hidden">
              <span className="text-xs text-muted-foreground">{profile?.full_name}</span>
              <Button variant="outline" size="sm" onClick={() => { navigate("/goedkeuring"); setMenuOpen(false); }} className="gap-1 justify-start">
                <CheckCircle className="h-4 w-4" />
                Goedkeuren
              </Button>
              <Button variant="outline" size="sm" onClick={() => { navigate("/rapportage"); setMenuOpen(false); }} className="gap-1 justify-start">
                <BarChart3 className="h-4 w-4" />
                Rapportage
              </Button>
              <Button variant="outline" size="sm" onClick={() => { navigate("/medewerkers"); setMenuOpen(false); }} className="gap-1 justify-start">
                <Users className="h-4 w-4" />
                Medewerkers
              </Button>
            </div>
          )}

          {/* Week navigation - always visible, centered */}
          <div className="flex justify-center mt-3">
            <WeekNavigation
              weekStart={currentWeekStart}
              onPrevious={goToPreviousWeek}
              onNext={goToNextWeek}
              onToday={goToCurrentWeek}
            />
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 max-w-5xl mx-auto">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Uren invoeren</h2>
          <AddEntryForm weekDates={weekDates} onAdd={addEntry} onAddMultiple={addMultipleEntries} />
        </section>

        <WeekSummary
          totalHours={totalHours}
          hoursByProject={hoursByProject}
          hoursByDay={hoursByDay}
          weekDates={weekDates}
        />

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">Overzicht</h2>
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

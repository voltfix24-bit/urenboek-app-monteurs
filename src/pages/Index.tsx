import { useTimesheet } from "@/hooks/useTimesheet";
import { useAuth } from "@/hooks/useAuth";
import { WeekNavigation } from "@/components/WeekNavigation";
import { AddEntryForm } from "@/components/AddEntryForm";
import { WeekOverview } from "@/components/WeekOverview";
import { WeekSummary } from "@/components/WeekSummary";
import { Button } from "@/components/ui/button";
import { LogOut, Users, CheckCircle, BarChart3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import terrevoltLogo from "@/assets/terrevolt-logo.png";

const Index = () => {
  const { profile, isManager, signOut } = useAuth();
  const navigate = useNavigate();
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
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={terrevoltLogo} alt="TerreVolt BV" className="h-8" />
            <span className="text-xs text-muted-foreground border-l pl-3">Urenregistratie</span>
          </div>
          <WeekNavigation
            weekStart={currentWeekStart}
            onPrevious={goToPreviousWeek}
            onNext={goToNextWeek}
            onToday={goToCurrentWeek}
          />
          <div className="flex items-center gap-3">
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
            <span className="text-sm text-muted-foreground">{profile?.full_name}</span>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-4 py-6 space-y-6">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Uren invoeren</h2>
          <AddEntryForm weekDates={weekDates} onAdd={addEntry} />
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

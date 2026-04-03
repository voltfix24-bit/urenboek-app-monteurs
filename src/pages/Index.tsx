import { useTimesheet } from "@/hooks/useTimesheet";
import { WeekNavigation } from "@/components/WeekNavigation";
import { AddEntryForm } from "@/components/AddEntryForm";
import { WeekOverview } from "@/components/WeekOverview";
import { WeekSummary } from "@/components/WeekSummary";
import terrevoltLogo from "@/assets/terrevolt-logo.png";

const Index = () => {
  const {
    currentWeekStart,
    weekDates,
    weekEntries,
    addEntry,
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
      {/* Header */}
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
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Add entry form */}
        <section className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Uren invoeren</h2>
          <AddEntryForm weekDates={weekDates} onAdd={addEntry} />
        </section>

        {/* Summary */}
        <WeekSummary
          totalHours={totalHours}
          hoursByProject={hoursByProject}
          hoursByDay={hoursByDay}
          weekDates={weekDates}
        />

        {/* Entries */}
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

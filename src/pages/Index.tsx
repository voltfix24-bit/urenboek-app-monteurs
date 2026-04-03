import { Clock } from "lucide-react";
import { useTimesheet } from "@/hooks/useTimesheet";
import { WeekNavigation } from "@/components/WeekNavigation";
import { AddEntryForm } from "@/components/AddEntryForm";
import { WeekOverview } from "@/components/WeekOverview";
import { WeekSummary } from "@/components/WeekSummary";

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
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <Clock className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Urenregistratie</h1>
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

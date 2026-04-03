import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimeEntry } from "@/types/timesheet";

interface WeekOverviewProps {
  weekDates: Date[];
  entries: TimeEntry[];
  onRemove: (id: string) => void;
}

export function WeekOverview({ weekDates, entries, onRemove }: WeekOverviewProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">Nog geen uren ingevoerd deze week</p>
        <p className="text-sm mt-1">Gebruik het formulier hierboven om uren toe te voegen</p>
      </div>
    );
  }

  const groupedByDate = weekDates
    .map((date) => {
      const dateStr = format(date, "yyyy-MM-dd");
      const dayEntries = entries.filter((e) => e.date === dateStr);
      const dayTotal = dayEntries.reduce((sum, e) => sum + e.hours, 0);
      return { date, dateStr, dayEntries, dayTotal };
    })
    .filter((g) => g.dayEntries.length > 0);

  return (
    <div className="space-y-4">
      {groupedByDate.map(({ date, dayEntries, dayTotal }) => (
        <div key={date.toISOString()} className="rounded-lg border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/50">
            <span className="font-medium text-sm capitalize">
              {format(date, "EEEE d MMMM", { locale: nl })}
            </span>
            <span className="text-sm font-semibold text-primary">
              {dayTotal} uur
            </span>
          </div>
          <div className="divide-y divide-border">
            {dayEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors"
              >
                <span className="font-mono text-xs font-semibold bg-primary/10 text-primary px-2 py-1 rounded">
                  {entry.projectNumber}
                </span>
                <span className="flex-1 text-sm text-foreground truncate">
                  {entry.description || "–"}
                </span>
                <span className="text-sm font-semibold min-w-[3rem] text-right">
                  {entry.hours}u
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(entry.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

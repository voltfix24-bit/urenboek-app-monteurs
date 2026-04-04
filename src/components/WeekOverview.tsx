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
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">Nog geen uren ingevoerd deze week</p>
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
    <div className="space-y-3">
      {groupedByDate.map(({ date, dayEntries, dayTotal }) => (
        <div key={date.toISOString()} className="rounded-lg border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-secondary/50">
            <span className="font-medium text-xs capitalize">
              {format(date, "EEEE d MMM", { locale: nl })}
            </span>
            <span className="text-xs font-semibold text-primary">
              {dayTotal}u
            </span>
          </div>
          <div className="divide-y divide-border">
            {dayEntries.map((entry) => (
              <div
                key={entry.id}
                className="px-3 py-2.5 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    {entry.projectNumber}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{entry.hours}u</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemove(entry.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {entry.description && (
                  <p className="text-xs text-muted-foreground">{entry.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

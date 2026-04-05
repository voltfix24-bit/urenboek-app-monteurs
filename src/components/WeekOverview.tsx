import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Trash2, ClipboardList } from "lucide-react";
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
      <div className="text-center py-10 text-muted-foreground rounded-2xl border bg-card shadow-card">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <ClipboardList className="h-5 w-5" style={{ color: "#8AAD6E" }} />
        </div>
        <p className="text-sm font-medium">Nog geen uren deze week</p>
        <p className="text-xs mt-1">Voeg uren toe via het formulier hierboven</p>
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
        <div key={date.toISOString()} className="rounded-2xl border bg-card shadow-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-secondary/40">
            <span className="font-semibold text-xs capitalize tracking-tight">
              {format(date, "EEEE d MMMM", { locale: nl })}
            </span>
            <span className="text-xs font-bold text-primary tabular-nums">
              {dayTotal}u
            </span>
          </div>
          <div className="divide-y divide-border/50">
            {dayEntries.map((entry) => (
              <div
                key={entry.id}
                className="px-4 py-3 hover:bg-muted/30 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono text-[11px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-md shrink-0">
                      {entry.projectNumber}
                    </span>
                    <span className="text-xs font-bold tabular-nums">{entry.hours}u</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity sm:opacity-100"
                    onClick={() => onRemove(entry.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                {entry.description && (
                  <p className="text-xs text-muted-foreground mt-1.5 pl-0">{entry.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

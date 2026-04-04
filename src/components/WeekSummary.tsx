import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface WeekSummaryProps {
  totalHours: number;
  hoursByProject: Record<string, number>;
  hoursByDay: number[];
  weekDates: Date[];
}

export function WeekSummary({
  totalHours,
  hoursByProject,
  hoursByDay,
  weekDates,
}: WeekSummaryProps) {
  const maxHours = Math.max(...hoursByDay, 8);

  return (
    <div className="grid grid-cols-1 gap-3">
      {/* Daily bar chart */}
      <div className="rounded-lg border bg-card p-3">
        <h3 className="text-xs font-semibold text-foreground mb-2">Uren per dag</h3>
        <div className="flex items-end gap-1.5 h-24">
          {weekDates.map((date, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-medium text-muted-foreground">
                {hoursByDay[i] > 0 ? `${hoursByDay[i]}` : ""}
              </span>
              <div className="w-full bg-secondary rounded-t relative" style={{ height: "100%" }}>
                <div
                  className="absolute bottom-0 w-full bg-primary/80 rounded-t transition-all duration-300"
                  style={{
                    height: `${maxHours > 0 ? (hoursByDay[i] / maxHours) * 100 : 0}%`,
                    minHeight: hoursByDay[i] > 0 ? "4px" : "0",
                  }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground capitalize">
                {format(date, "EEE", { locale: nl })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Project summary */}
      <div className="rounded-lg border bg-card p-3">
        <h3 className="text-xs font-semibold text-foreground mb-2">Per project</h3>
        {Object.keys(hoursByProject).length === 0 ? (
          <p className="text-xs text-muted-foreground">Geen data</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(hoursByProject)
              .sort(([, a], [, b]) => b - a)
              .map(([project, hours]) => (
                <div key={project} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0">
                    {project}
                  </span>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${totalHours > 0 ? (hours / totalHours) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold shrink-0">{hours}u</span>
                  </div>
                </div>
              ))}
          </div>
        )}
        <div className="mt-3 pt-2 border-t flex justify-between">
          <span className="text-xs font-medium text-muted-foreground">Totaal</span>
          <span className="text-sm font-bold text-primary">{totalHours} uur</span>
        </div>
      </div>
    </div>
  );
}

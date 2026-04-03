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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Daily bar chart */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Uren per dag</h3>
        <div className="flex items-end gap-2 h-32">
          {weekDates.map((date, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {hoursByDay[i] > 0 ? `${hoursByDay[i]}u` : ""}
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
      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Per project</h3>
        {Object.keys(hoursByProject).length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen data</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(hoursByProject)
              .sort(([, a], [, b]) => b - a)
              .map(([project, hours]) => (
                <div key={project} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded">
                      {project}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${totalHours > 0 ? (hours / totalHours) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold min-w-[3rem] text-right">
                      {hours}u
                    </span>
                  </div>
                </div>
              ))}
          </div>
        )}
        <div className="mt-4 pt-3 border-t flex justify-between">
          <span className="text-sm font-medium text-muted-foreground">Totaal</span>
          <span className="text-lg font-bold text-primary">{totalHours} uur</span>
        </div>
      </div>
    </div>
  );
}

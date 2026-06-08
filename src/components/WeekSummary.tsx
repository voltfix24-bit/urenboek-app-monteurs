import { formatDag } from "@/lib/formatting";

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
  const targetHours = 40;
  const progress = Math.min((totalHours / targetHours) * 100, 100);

  return (
    <div className="grid grid-cols-1 gap-3">
      {/* Total hours highlight */}
      <div className="rounded-2xl border bg-card shadow-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Deze week</h3>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-primary">{totalHours}</span>
            <span className="text-xs text-muted-foreground font-medium">/ {targetHours}u</span>
          </div>
        </div>
        <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full rounded-full gradient-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Daily bar chart */}
      <div className="rounded-2xl border bg-card shadow-card p-4">
        <h3 className="text-xs font-bold text-foreground mb-3 uppercase tracking-wider">Uren per dag</h3>
        <div className="flex items-end gap-2 h-28">
          {weekDates.map((date, i) => {
            const isWeekend = i >= 5;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">
                  {hoursByDay[i] > 0 ? hoursByDay[i] : ""}
                </span>
                <div className={`w-full rounded-lg relative transition-all ${isWeekend ? 'bg-muted/50' : 'bg-secondary'}`} style={{ height: "100%" }}>
                  <div
                    className={`absolute bottom-0 w-full rounded-lg transition-all duration-500 ease-out ${isWeekend ? 'bg-muted-foreground/20' : ''}`}
                    style={{
                      height: `${maxHours > 0 ? (hoursByDay[i] / maxHours) * 100 : 0}%`,
                      minHeight: hoursByDay[i] > 0 ? "6px" : "0",
                      background: !isWeekend && hoursByDay[i] > 0 ? 'linear-gradient(135deg, #3fff8b, #22c55e)' : undefined,
                    }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium capitalize">
                  {formatDag(date)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Project summary */}
      <div className="rounded-2xl border bg-card shadow-card p-4">
        <h3 className="text-xs font-bold text-foreground mb-3 uppercase tracking-wider">Per project</h3>
        {Object.keys(hoursByProject).length === 0 ? (
          <p className="text-xs text-muted-foreground">Geen data</p>
        ) : (
          <div className="space-y-2.5">
            {Object.entries(hoursByProject)
              .sort(([, a], [, b]) => b - a)
              .map(([project, hours]) => (
                <div key={project} className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[11px] font-bold bg-primary/10 text-primary px-2 py-1 rounded-md shrink-0">
                    {project}
                  </span>
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{
                          width: `${totalHours > 0 ? (hours / totalHours) * 100 : 0}%`,
                          background: 'linear-gradient(135deg, #3fff8b, #22c55e)',
                        }}
                      />
                    </div>
                    <span className="text-xs font-bold tabular-nums shrink-0">{hours}u</span>
                  </div>
                </div>
              ))}
          </div>
        )}
        <div className="mt-4 pt-3 border-t flex justify-between items-center">
          <span className="text-xs font-medium text-muted-foreground">Totaal</span>
          <span className="text-base font-extrabold text-primary">{totalHours} uur</span>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, startOfISOWeek, addDays, getISOWeek, getISOWeekYear, addWeeks } from "date-fns";
import { nl } from "date-fns/locale";
import { BottomNav } from "@/components/BottomNav";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ReportEntry {
  date: string;
  project_number: string;
  description: string;
  hours: number;
  status: string;
  full_name: string;
}

function getWeekRange(weekStart: Date) {
  const start = format(weekStart, "yyyy-MM-dd");
  const end = format(addDays(weekStart, 6), "yyyy-MM-dd");
  return { start, end };
}

export default function Rapportage() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfISOWeek(new Date()));
  const [filter, setFilter] = useState<string>("goedgekeurd");
  const [entries, setEntries] = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const weekNumber = getISOWeek(currentWeekStart);
  const weekYear = getISOWeekYear(currentWeekStart);
  const { start: startDate, end: endDate } = getWeekRange(currentWeekStart);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("time_entries")
      .select("*")
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date");

    if (filter !== "alle") {
      query = query.eq("status", filter);
    }

    const { data: timeEntries, error } = await query;

    if (error) {
      toast.error("Fout bij ophalen");
      setLoading(false);
      return;
    }

    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name");
    const profileMap = new Map(profiles?.map((p) => [p.user_id, p.full_name]) ?? []);

    setEntries(
      (timeEntries ?? []).map((e) => ({
        date: e.date,
        project_number: e.project_number,
        description: e.description,
        hours: Number(e.hours),
        status: e.status,
        full_name: profileMap.get(e.user_id) || "Onbekend",
      }))
    );
    setLoading(false);
  }, [startDate, endDate, filter]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const totalHours = entries.reduce((s, e) => s + e.hours, 0);
  const uniqueProjects = new Set(entries.map((e) => e.project_number)).size;
  const uniqueEmployees = new Set(entries.map((e) => e.full_name)).size;

  // Per medewerker stats for bar chart
  const perMedewerker = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.full_name] = (acc[e.full_name] || 0) + e.hours;
    return acc;
  }, {});
  const medewerkerStats = Object.entries(perMedewerker).sort((a, b) => b[1] - a[1]);
  const maxMedUren = Math.max(...medewerkerStats.map((m) => m[1]), 1);

  // Per project stats
  const perProject = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.project_number] = (acc[e.project_number] || 0) + e.hours;
    return acc;
  }, {});
  const projectStats = Object.entries(perProject).sort((a, b) => b[1] - a[1]);

  const exportCSV = () => {
    const rows = [["Datum", "Project", "Medewerker", "Omschrijving", "Uren"]];
    entries.forEach((e) => {
      rows.push([e.date, e.project_number, e.full_name, e.description, String(e.hours)]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `terrevolt-uren-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV gedownload!");
  };

  if (!isManager) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Alleen managers hebben toegang.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden" style={{ maxWidth: 430, margin: "0 auto", paddingBottom: 80 }}>
      {/* Header */}
      <header className="sticky top-0 z-30" style={{ background: "rgba(10,10,15,0.95)", backdropFilter: "blur(12px)" }}>
        <div className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>
              ⚡
            </div>
            <span className="text-base font-bold text-foreground tracking-tight">Rapportage</span>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {/* Date range */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {/* Week navigation */}
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentWeekStart((p) => addWeeks(p, -1))} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
              <ChevronLeft className="h-4 w-4 text-foreground" />
            </button>
            <div className="text-center">
              <p className="text-lg font-extrabold text-foreground">Week {weekNumber}</p>
              <p className="text-[11px] text-muted-foreground">
                {format(currentWeekStart, "d MMM", { locale: nl })} – {format(addDays(currentWeekStart, 6), "d MMM yyyy", { locale: nl })}
              </p>
            </div>
            <button onClick={() => setCurrentWeekStart((p) => addWeeks(p, 1))} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
              <ChevronRight className="h-4 w-4 text-foreground" />
            </button>
          </div>

          {/* Today button */}
          <button
            onClick={() => setCurrentWeekStart(startOfISOWeek(new Date()))}
            className="w-full py-1.5 rounded-xl text-[11px] font-semibold text-muted-foreground transition-colors"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            Deze week
          </button>

          {/* Filter chips */}
          <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {([["goedgekeurd", "Goedgekeurd"], ["ingediend", "Ingediend"], ["alle", "Alle uren"]] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className="shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-colors"
                style={{
                  background: filter === k ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.04)",
                  border: filter === k ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  color: filter === k ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* KPI strip */}
        <div className="flex gap-2">
          {[
            { label: "Uren", value: totalHours + "u", icon: "⏱", color: "#22c55e" },
            { label: "Projecten", value: String(uniqueProjects), icon: "📁", color: "#6366f1" },
            { label: "Monteurs", value: String(uniqueEmployees), icon: "👷", color: "#f59e0b" },
          ].map((k, i) => (
            <div key={i} className="flex-1 rounded-2xl p-3 text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-lg mb-0.5">{k.icon}</p>
              <p className="text-xl font-extrabold" style={{ color: k.color }}>{k.value}</p>
              <p className="text-[10px] text-muted-foreground font-medium mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-10">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-muted-foreground mt-3">Laden...</p>
          </div>
        ) : (
          <>
            {/* Per medewerker bar chart */}
            {medewerkerStats.length > 0 && (
              <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Per monteur</p>
                {medewerkerStats.map(([naam, uren], i) => (
                  <div key={naam} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{naam}</span>
                      <span className="text-xs font-bold tabular-nums" style={{ color: "hsl(var(--primary))" }}>{uren}u</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(uren / maxMedUren) * 100}%`,
                          background: "linear-gradient(90deg, hsl(var(--primary)), hsl(160 70% 40%))",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Per project */}
            {projectStats.length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Per project</p>
                {projectStats.map(([project, uren]) => (
                  <div key={project} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span className="text-sm font-medium text-foreground">{project}</span>
                    <span className="text-xs font-bold tabular-nums" style={{ color: "hsl(var(--primary))" }}>{uren}u</span>
                  </div>
                ))}
              </div>
            )}

            {entries.length === 0 && (
              <div className="text-center py-10 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-3xl mb-2">📊</p>
                <p className="text-sm font-medium text-foreground">Geen data gevonden</p>
                <p className="text-xs text-muted-foreground mt-1">Geen uren in deze periode</p>
              </div>
            )}

            {/* Export */}
            {entries.length > 0 && (
              <button
                onClick={exportCSV}
                className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "hsl(var(--foreground))",
                }}
              >
                <Download className="h-4 w-4" />
                CSV exporteren
              </button>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

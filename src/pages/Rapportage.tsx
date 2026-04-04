import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Download, FileText, Clock, FolderOpen, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import terrevoltLogo from "@/assets/terrevolt-logo.png";

interface ReportEntry {
  date: string;
  project_number: string;
  description: string;
  hours: number;
  status: string;
  full_name: string;
}

export default function Rapportage() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState(() => format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [entries, setEntries] = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const { data: timeEntries, error } = await supabase
      .from("time_entries")
      .select("*")
      .gte("date", startDate)
      .lte("date", endDate)
      .eq("status", "goedgekeurd")
      .order("date");

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
  }, [startDate, endDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const byProject = entries.reduce<Record<string, { totalHours: number; employees: Record<string, number> }>>((acc, e) => {
    if (!acc[e.project_number]) acc[e.project_number] = { totalHours: 0, employees: {} };
    acc[e.project_number].totalHours += e.hours;
    acc[e.project_number].employees[e.full_name] = (acc[e.project_number].employees[e.full_name] || 0) + e.hours;
    return acc;
  }, {});

  const totalHours = entries.reduce((s, e) => s + e.hours, 0);

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
    <div className="min-h-screen bg-background overflow-x-hidden">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur-md">
        <div className="px-4 py-3 flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-2.5">
            <img src={terrevoltLogo} alt="TerreVolt BV" className="h-7" />
            <div className="border-l pl-2.5">
              <span className="text-[11px] text-muted-foreground font-medium tracking-wide uppercase">Rapportage</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5 text-xs h-8">
            <ArrowLeft className="h-3.5 w-3.5" />
            Terug
          </Button>
        </div>
      </header>

      <main className="px-4 py-5 space-y-4 max-w-5xl mx-auto">
        {/* Filters */}
        <div className="rounded-2xl border bg-card shadow-card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5 flex-1 min-w-[140px]">
              <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Van</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-sm rounded-lg" />
            </div>
            <div className="space-y-1.5 flex-1 min-w-[140px]">
              <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tot</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-sm rounded-lg" />
            </div>
            <Button variant="outline" onClick={exportCSV} className="gap-1.5 h-9 text-xs rounded-lg font-medium">
              <Download className="h-3.5 w-3.5" />
              CSV exporteren
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border bg-card shadow-card p-4 text-center">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <p className="text-xl font-extrabold text-foreground">{totalHours}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">Uren</p>
          </div>
          <div className="rounded-2xl border bg-card shadow-card p-4 text-center">
            <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center mx-auto mb-2">
              <FolderOpen className="h-4 w-4 text-accent" />
            </div>
            <p className="text-xl font-extrabold text-foreground">{Object.keys(byProject).length}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">Projecten</p>
          </div>
          <div className="rounded-2xl border bg-card shadow-card p-4 text-center">
            <div className="w-9 h-9 rounded-xl bg-success/10 flex items-center justify-center mx-auto mb-2">
              <Users className="h-4 w-4 text-success" />
            </div>
            <p className="text-xl font-extrabold text-foreground">{new Set(entries.map((e) => e.full_name)).size}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">Medewerkers</p>
          </div>
        </div>

        {/* Per project */}
        {loading ? (
          <div className="text-center py-10">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-muted-foreground mt-3">Laden...</p>
          </div>
        ) : Object.keys(byProject).length === 0 ? (
          <div className="text-center py-10 rounded-2xl border bg-card shadow-card">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <span className="text-xl">📊</span>
            </div>
            <p className="text-sm font-medium">Geen goedgekeurde uren</p>
            <p className="text-xs text-muted-foreground mt-1">Geen data in deze periode</p>
          </div>
        ) : (
          Object.entries(byProject)
            .sort((a, b) => b[1].totalHours - a[1].totalHours)
            .map(([project, data]) => (
              <div key={project} className="rounded-2xl border bg-card shadow-card overflow-hidden animate-slide-up">
                <div className="flex items-center justify-between px-4 py-3 bg-secondary/30">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-semibold text-sm">Project {project}</span>
                  </div>
                  <span className="text-sm font-bold text-primary tabular-nums">{data.totalHours}u</span>
                </div>
                <div className="divide-y divide-border/50 px-4">
                  {Object.entries(data.employees)
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, hours]) => (
                      <div key={name} className="flex items-center justify-between py-2.5">
                        <span className="text-sm">{name}</span>
                        <div className="flex items-center gap-2.5">
                          <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${data.totalHours > 0 ? (hours / data.totalHours) * 100 : 0}%`,
                                background: 'var(--gradient-primary)',
                              }}
                            />
                          </div>
                          <span className="text-xs font-bold tabular-nums">{hours}u</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))
        )}
      </main>
    </div>
  );
}

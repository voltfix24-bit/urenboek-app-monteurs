import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Download, FileText } from "lucide-react";
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

  // Group by project
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
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={terrevoltLogo} alt="TerreVolt BV" className="h-8" />
            <span className="text-xs text-muted-foreground border-l pl-3">Rapportage</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Terug
          </Button>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Van</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tot</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <Button variant="outline" onClick={exportCSV} className="gap-1.5">
                <Download className="h-4 w-4" />
                CSV exporteren
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-primary">{totalHours}</p>
              <p className="text-xs text-muted-foreground">Totaal uren</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-primary">{Object.keys(byProject).length}</p>
              <p className="text-xs text-muted-foreground">Projecten</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-2xl font-bold text-primary">{new Set(entries.map((e) => e.full_name)).size}</p>
              <p className="text-xs text-muted-foreground">Medewerkers</p>
            </CardContent>
          </Card>
        </div>

        {/* Per project */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Laden...</p>
        ) : Object.keys(byProject).length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen goedgekeurde uren in deze periode.</p>
        ) : (
          Object.entries(byProject)
            .sort((a, b) => b[1].totalHours - a[1].totalHours)
            .map(([project, data]) => (
              <Card key={project}>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Project {project}
                    </span>
                    <span className="text-primary">{data.totalHours} uur</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="divide-y">
                    {Object.entries(data.employees)
                      .sort((a, b) => b[1] - a[1])
                      .map(([name, hours]) => (
                        <div key={name} className="flex items-center justify-between py-2">
                          <span className="text-sm">{name}</span>
                          <span className="text-sm font-semibold">{hours} uur</span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            ))
        )}
      </main>
    </div>
  );
}

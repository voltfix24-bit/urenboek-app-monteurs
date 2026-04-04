import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Check, X, ChevronLeft, ChevronRight, Calendar, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, addDays } from "date-fns";
import { nl } from "date-fns/locale";
import terrevoltLogo from "@/assets/terrevolt-logo.png";

interface EntryWithProfile {
  id: string;
  date: string;
  project_number: string;
  description: string;
  hours: number;
  status: string;
  user_id: string;
  full_name: string;
}

export default function Goedkeuring() {
  const { isManager, user } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<EntryWithProfile[]>([]);
  const [filter, setFilter] = useState<string>("ingediend");
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const { data: timeEntries, error } = await supabase
      .from("time_entries")
      .select("*")
      .gte("date", format(weekStart, "yyyy-MM-dd"))
      .lte("date", format(weekEnd, "yyyy-MM-dd"))
      .order("date");

    if (error) {
      toast.error("Fout bij ophalen uren");
      setLoading(false);
      return;
    }

    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name");
    const profileMap = new Map(profiles?.map((p) => [p.user_id, p.full_name]) ?? []);

    const merged: EntryWithProfile[] = (timeEntries ?? []).map((e) => ({
      id: e.id,
      date: e.date,
      project_number: e.project_number,
      description: e.description,
      hours: Number(e.hours),
      status: e.status,
      user_id: e.user_id,
      full_name: profileMap.get(e.user_id) || "Onbekend",
    }));

    setEntries(merged);
    setLoading(false);
  }, [weekOffset]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("time_entries")
      .update({ status, approved_by: user?.id })
      .eq("id", id);
    if (error) {
      toast.error("Fout bij bijwerken");
    } else {
      toast.success(status === "goedgekeurd" ? "Goedgekeurd!" : "Afgekeurd");
      fetchEntries();
    }
  };

  const filteredEntries = entries.filter((e) => filter === "alle" || e.status === filter);

  const grouped = filteredEntries.reduce<Record<string, EntryWithProfile[]>>((acc, e) => {
    if (!acc[e.full_name]) acc[e.full_name] = [];
    acc[e.full_name].push(e);
    return acc;
  }, {});

  const statusConfig: Record<string, { bg: string; text: string; dot: string }> = {
    ingediend: { bg: "bg-warning/10", text: "text-warning", dot: "bg-warning" },
    goedgekeurd: { bg: "bg-success/10", text: "text-success", dot: "bg-success" },
    afgekeurd: { bg: "bg-destructive/10", text: "text-destructive", dot: "bg-destructive" },
    concept: { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-muted-foreground" },
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
              <span className="text-[11px] text-muted-foreground font-medium tracking-wide uppercase">Goedkeuren</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5 text-xs h-8">
            <ArrowLeft className="h-3.5 w-3.5" />
            Terug
          </Button>
        </div>
      </header>

      <main className="px-4 py-5 space-y-4 max-w-5xl mx-auto">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md" onClick={() => setWeekOffset((w) => w - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-[11px] rounded-md px-2 font-medium" onClick={() => setWeekOffset(0)}>
              <Calendar className="h-3 w-3 mr-1" />
              Vandaag
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md" onClick={() => setWeekOffset((w) => w + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <span className="text-xs font-semibold tracking-tight">
            {format(weekStart, "d MMM", { locale: nl })} – {format(weekEnd, "d MMM yyyy", { locale: nl })}
          </span>
          <div className="ml-auto">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-8 text-xs w-auto min-w-[120px] rounded-lg">
                <Filter className="h-3 w-3 mr-1.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle statussen</SelectItem>
                <SelectItem value="ingediend">Ingediend</SelectItem>
                <SelectItem value="goedgekeurd">Goedgekeurd</SelectItem>
                <SelectItem value="afgekeurd">Afgekeurd</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-10">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-muted-foreground mt-3">Laden...</p>
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-10 rounded-2xl border bg-card shadow-card">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <span className="text-xl">✅</span>
            </div>
            <p className="text-sm font-medium">Geen uren gevonden</p>
            <p className="text-xs text-muted-foreground mt-1">Geen uren met deze filter voor deze week</p>
          </div>
        ) : (
          Object.entries(grouped).map(([name, userEntries]) => {
            const totalHours = userEntries.reduce((s, e) => s + e.hours, 0);
            const pendingCount = userEntries.filter(e => e.status === 'ingediend').length;
            return (
              <div key={name} className="rounded-2xl border bg-card shadow-card overflow-hidden animate-slide-up">
                <div className="flex items-center justify-between px-4 py-3 bg-secondary/30">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="font-semibold text-sm">{name}</span>
                      {pendingCount > 0 && (
                        <span className="ml-2 text-[10px] bg-warning/15 text-warning font-semibold px-1.5 py-0.5 rounded-full">
                          {pendingCount} open
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-primary tabular-nums">{totalHours}u</span>
                </div>
                <div className="divide-y divide-border/50">
                  {userEntries.map((entry) => {
                    const sc = statusConfig[entry.status] || statusConfig.concept;
                    return (
                      <div key={entry.id} className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] text-muted-foreground font-medium min-w-[60px]">
                            {format(new Date(entry.date), "EEE d/M", { locale: nl })}
                          </span>
                          <span className="font-mono text-[11px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                            {entry.project_number}
                          </span>
                          <span className="text-xs flex-1 truncate min-w-0">{entry.description || "–"}</span>
                          <span className="text-xs font-bold tabular-nums">{entry.hours}u</span>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc.bg} ${sc.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                            {entry.status}
                          </span>
                          {entry.status === "ingediend" && (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg text-success hover:bg-success/10"
                                onClick={() => updateStatus(entry.id, "goedgekeurd")}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-lg text-destructive hover:bg-destructive/10"
                                onClick={() => updateStatus(entry.id, "afgekeurd")}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}

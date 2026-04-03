import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Check, X, Clock } from "lucide-react";
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

  // Group by employee
  const grouped = filteredEntries.reduce<Record<string, EntryWithProfile[]>>((acc, e) => {
    if (!acc[e.full_name]) acc[e.full_name] = [];
    acc[e.full_name].push(e);
    return acc;
  }, {});

  const statusColor: Record<string, string> = {
    ingediend: "bg-yellow-100 text-yellow-800",
    goedgekeurd: "bg-green-100 text-green-800",
    afgekeurd: "bg-red-100 text-red-800",
    concept: "bg-muted text-muted-foreground",
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
            <span className="text-xs text-muted-foreground border-l pl-3">Uren goedkeuren</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Terug
          </Button>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setWeekOffset((w) => w - 1)}>←</Button>
            <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>Vandaag</Button>
            <Button variant="outline" size="sm" onClick={() => setWeekOffset((w) => w + 1)}>→</Button>
          </div>
          <span className="text-sm font-medium">
            {format(weekStart, "d MMM", { locale: nl })} – {format(weekEnd, "d MMM yyyy", { locale: nl })}
          </span>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40">
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

        {loading ? (
          <p className="text-sm text-muted-foreground">Laden...</p>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen uren gevonden voor deze week.</p>
        ) : (
          Object.entries(grouped).map(([name, userEntries]) => {
            const totalHours = userEntries.reduce((s, e) => s + e.hours, 0);
            return (
              <Card key={name}>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>{name}</span>
                    <span className="text-primary">{totalHours} uur</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {userEntries.map((entry) => (
                      <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="text-xs text-muted-foreground min-w-[70px]">
                          {format(new Date(entry.date), "EEE d/M", { locale: nl })}
                        </span>
                        <span className="font-mono text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded">
                          {entry.project_number}
                        </span>
                        <span className="flex-1 text-sm truncate">{entry.description || "–"}</span>
                        <span className="text-sm font-semibold">{entry.hours}u</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${statusColor[entry.status] || ""}`}>
                          {entry.status}
                        </span>
                        {entry.status === "ingediend" && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-green-600 hover:bg-green-50"
                              onClick={() => updateStatus(entry.id, "goedgekeurd")}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-600 hover:bg-red-50"
                              onClick={() => updateStatus(entry.id, "afgekeurd")}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </main>
    </div>
  );
}

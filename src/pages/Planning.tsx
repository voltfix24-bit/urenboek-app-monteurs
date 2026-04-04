import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfISOWeek, addDays, addWeeks, getISOWeek } from "date-fns";
import { nl } from "date-fns/locale";

interface PlanningItem {
  id: string;
  datum: string;
  starttijd: string;
  eindtijd: string;
  notitie: string;
  project_naam: string;
  project_nummer: string;
}

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

export default function Planning() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => startOfISOWeek(new Date()));
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [loading, setLoading] = useState(true);

  const weekNumber = getISOWeek(weekStart);

  const fetchPlanning = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Get profile id
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!profile) { setLoading(false); return; }

    const startStr = format(weekStart, "yyyy-MM-dd");
    const endStr = format(addDays(weekStart, 6), "yyyy-MM-dd");

    const { data } = await supabase
      .from("planning")
      .select("id, datum, starttijd, eindtijd, notitie, project_id")
      .eq("medewerker_id", profile.id)
      .gte("datum", startStr)
      .lte("datum", endStr)
      .order("datum");

    if (data) {
      // fetch project names
      const projectIds = [...new Set(data.map((d: any) => d.project_id))];
      const { data: projects } = await supabase
        .from("projects")
        .select("id, naam, nummer")
        .in("id", projectIds);

      const projMap = new Map(projects?.map((p: any) => [p.id, p]) ?? []);

      setItems(data.map((d: any) => {
        const proj = projMap.get(d.project_id) || { naam: "Onbekend", nummer: "" };
        return {
          id: d.id,
          datum: d.datum,
          starttijd: d.starttijd?.slice(0, 5) || "07:00",
          eindtijd: d.eindtijd?.slice(0, 5) || "16:00",
          notitie: d.notitie || "",
          project_naam: (proj as any).naam,
          project_nummer: (proj as any).nummer,
        };
      }));
    }
    setLoading(false);
  }, [user, weekStart]);

  useEffect(() => { fetchPlanning(); }, [fetchPlanning]);

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <div className="min-h-screen bg-background overflow-x-hidden" style={{ maxWidth: 430, margin: "0 auto", paddingBottom: 80 }}>
      <header className="sticky top-0 z-30" style={{ background: "rgba(10,10,15,0.95)", backdropFilter: "blur(12px)" }}>
        <div className="px-4 py-3 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>⚡</div>
          <span className="text-base font-bold text-foreground tracking-tight">Mijn planning</span>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {/* Week nav */}
        <div className="flex items-center justify-between rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={() => setWeekStart(p => addWeeks(p, -1))} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
            <ChevronLeft className="h-4 w-4 text-foreground" />
          </button>
          <div className="text-center">
            <p className="text-lg font-extrabold text-foreground">Week {weekNumber}</p>
            <p className="text-[11px] text-muted-foreground">
              {format(weekStart, "d MMM", { locale: nl })} – {format(addDays(weekStart, 6), "d MMM", { locale: nl })}
            </p>
          </div>
          <button onClick={() => setWeekStart(p => addWeeks(p, 1))} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
            <ChevronRight className="h-4 w-4 text-foreground" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-10">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-3xl mb-2">📅</p>
            <p className="text-sm font-medium text-foreground">Geen planning deze week</p>
            <p className="text-xs text-muted-foreground mt-1">Je bent nog niet ingepland</p>
          </div>
        ) : (
          weekDates.map((date, i) => {
            const dateStr = format(date, "yyyy-MM-dd");
            const dayItems = items.filter(it => it.datum === dateStr);
            if (dayItems.length === 0) return null;
            const isToday = dateStr === today;
            return (
              <div key={dateStr} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: isToday ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                  {DAGEN[i]} {format(date, "d MMM", { locale: nl })} {isToday && "· Vandaag"}
                </p>
                {dayItems.map(item => (
                  <div key={item.id} className="rounded-2xl p-4 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: isToday ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-bold text-foreground">{item.project_naam}</p>
                        <p className="text-[11px] font-mono text-muted-foreground mt-0.5">{item.project_nummer}</p>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ background: "rgba(99,102,241,0.1)", color: "#818cf8" }}>
                        {item.starttijd} – {item.eindtijd}
                      </span>
                    </div>
                    {item.notitie && (
                      <p className="text-xs text-muted-foreground" style={{ background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: 10 }}>
                        💬 {item.notitie}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            );
          })
        )}
      </main>

      <BottomNav />
    </div>
  );
}

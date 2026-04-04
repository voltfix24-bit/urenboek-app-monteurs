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

interface BeschikbaarheidItem {
  id: string;
  type: string;
  datum_van: string;
  datum_tot: string;
  status: string;
}

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

export default function Planning() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => startOfISOWeek(new Date()));
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [beschikbaarheid, setBeschikbaarheid] = useState<BeschikbaarheidItem[]>([]);
  const [loading, setLoading] = useState(true);

  const weekNumber = getISOWeek(weekStart);

  const fetchPlanning = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!profile) { setLoading(false); return; }

    const startStr = format(weekStart, "yyyy-MM-dd");
    const endStr = format(addDays(weekStart, 6), "yyyy-MM-dd");

    const [{ data }, { data: beschData }] = await Promise.all([
      supabase
        .from("planning")
        .select("id, datum, starttijd, eindtijd, notitie, project_id")
        .eq("medewerker_id", profile.id)
        .gte("datum", startStr)
        .lte("datum", endStr)
        .order("datum"),
      supabase
        .from("beschikbaarheid")
        .select("id, type, datum_van, datum_tot, status")
        .eq("medewerker_id", profile.id)
        .eq("status", "goedgekeurd")
        .lte("datum_van", endStr)
        .gte("datum_tot", startStr),
    ]);

    setBeschikbaarheid((beschData ?? []) as any);

    if (data) {
      const projectIds = [...new Set(data.map((d: any) => d.project_id))];
      let projMap = new Map();
      if (projectIds.length > 0) {
        const { data: projects } = await supabase
          .from("projects")
          .select("id, naam, nummer")
          .in("id", projectIds);
        projMap = new Map(projects?.map((p: any) => [p.id, p]) ?? []);
      }

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

  // Helper: check if a date falls in a beschikbaarheid record
  function getBeschikbaarheidForDate(dateStr: string): BeschikbaarheidItem | null {
    return beschikbaarheid.find(b => dateStr >= b.datum_van && dateStr <= b.datum_tot) || null;
  }

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
        ) : (
          <>
            {/* Beschikbaarheid + planning items per dag */}
            {weekDates.map((date, i) => {
              const dateStr = format(date, "yyyy-MM-dd");
              const dayItems = items.filter(it => it.datum === dateStr);
              const besch = getBeschikbaarheidForDate(dateStr);
              const hasSomething = dayItems.length > 0 || besch;
              if (!hasSomething) return null;
              const isToday = dateStr === today;

              return (
                <div key={dateStr} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: isToday ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}>
                    {DAGEN[i]} {format(date, "d MMM", { locale: nl })} {isToday && "· Vandaag"}
                  </p>

                  {/* Beschikbaarheid kaart */}
                  {besch && (
                    <div
                      className="rounded-2xl p-4 flex items-center gap-3"
                      style={{
                        background: besch.type === "ziek"
                          ? "rgba(239,68,68,0.08)"
                          : "rgba(245,158,11,0.08)",
                        border: besch.type === "ziek"
                          ? "1px solid rgba(239,68,68,0.2)"
                          : "1px solid rgba(245,158,11,0.2)",
                      }}
                    >
                      <span className="text-xl">{besch.type === "ziek" ? "🤒" : "🏖"}</span>
                      <div>
                        <p className="text-sm font-bold" style={{ color: besch.type === "ziek" ? "#ef4444" : "#f59e0b" }}>
                          {besch.type === "ziek" ? "Ziekmelding geregistreerd" : "Vakantie goedgekeurd"}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {besch.datum_van} → {besch.datum_tot}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Planning items */}
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
            })}

            {/* Empty state when nothing at all */}
            {items.length === 0 && beschikbaarheid.length === 0 && (
              <div className="text-center py-12 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-3xl mb-2">📅</p>
                <p className="text-sm font-medium text-foreground">Geen planning deze week</p>
                <p className="text-xs text-muted-foreground mt-1">Je bent nog niet ingepland</p>
              </div>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
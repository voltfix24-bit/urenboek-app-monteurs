import { useState, useEffect, useCallback } from "react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { format, startOfISOWeek, addDays, addWeeks, getISOWeek } from "date-fns";
import { nl } from "date-fns/locale";

interface PlanningItem { id: string; datum: string; starttijd: string; eindtijd: string; notitie: string; project_naam: string; project_nummer: string; project_id: string; is_definitief: boolean; }
interface BeschikbaarheidItem { id: string; type: string; datum_van: string; datum_tot: string; status: string; }

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
    const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
    if (!profile) { setLoading(false); return; }
    const startStr = format(weekStart, "yyyy-MM-dd");
    const endStr = format(addDays(weekStart, 6), "yyyy-MM-dd");

    const [{ data }, { data: beschData }] = await Promise.all([
      supabase.from("planning").select("id, datum, starttijd, eindtijd, notitie, project_id").eq("medewerker_id", profile.id).gte("datum", startStr).lte("datum", endStr).order("datum"),
      supabase.from("beschikbaarheid").select("id, type, datum_van, datum_tot, status").eq("medewerker_id", profile.id).eq("status", "goedgekeurd").lte("datum_van", endStr).gte("datum_tot", startStr),
    ]);
    setBeschikbaarheid((beschData ?? []) as any);
    if (data) {
      const projectIds = [...new Set(data.map((d: any) => d.project_id))];
      let projMap = new Map();
      let statusMap = new Map<string, boolean>();
      if (projectIds.length > 0) {
        const [{ data: projects }, { data: statuses }] = await Promise.all([
          supabase.from("projects").select("id, naam, nummer").in("id", projectIds),
          supabase.from("project_planning_status").select("project_id, is_definitief").in("project_id", projectIds),
        ]);
        projMap = new Map(projects?.map((p: any) => [p.id, p]) ?? []);
        (statuses || []).forEach((s: any) => statusMap.set(s.project_id, s.is_definitief));
      }
      setItems(data.map((d: any) => {
        const proj = projMap.get(d.project_id) || { naam: "Onbekend", nummer: "" };
        return { id: d.id, datum: d.datum, starttijd: d.starttijd?.slice(0, 5) || "07:00", eindtijd: d.eindtijd?.slice(0, 5) || "16:00", notitie: d.notitie || "", project_naam: (proj as any).naam, project_nummer: (proj as any).nummer, project_id: d.project_id, is_definitief: statusMap.get(d.project_id) ?? false };
      }));
    }
    setLoading(false);
  }, [user, weekStart]);

  useEffect(() => { fetchPlanning(); }, [fetchPlanning]);

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = format(new Date(), "yyyy-MM-dd");

  function getBeschikbaarheidForDate(dateStr: string): BeschikbaarheidItem | null {
    return beschikbaarheid.find(b => dateStr >= b.datum_van && dateStr <= b.datum_tot) || null;
  }

  return (
    <PageShell>
      <header className="sticky top-0 z-30" style={{ background: "rgba(235,240,228,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid #C5D4B2" }}>
        <div className="px-4 py-3 flex items-center gap-2.5">
          <HeaderLogo />
          <span className="text-base font-bold tracking-tight" style={{ color: "#2D4A1E" }}>Mijn planning</span>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between rounded-2xl p-3" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
          <button onClick={() => setWeekStart(p => addWeeks(p, -1))} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#DFE8D6", color: "#5A7A42" }}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <p className="text-lg font-extrabold" style={{ color: "#2D4A1E" }}>Week {weekNumber}</p>
            <p className="text-[11px]" style={{ color: "#8AAD6E" }}>
              {format(weekStart, "d MMM", { locale: nl })} – {format(addDays(weekStart, 6), "d MMM", { locale: nl })}
            </p>
          </div>
          <button onClick={() => setWeekStart(p => addWeeks(p, 1))} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#DFE8D6", color: "#5A7A42" }}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-10"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "#4A7C2F", borderTopColor: "transparent" }} /></div>
        ) : (
          <>
            {weekDates.map((date, i) => {
              const dateStr = format(date, "yyyy-MM-dd");
              const dayItems = items.filter(it => it.datum === dateStr);
              const besch = getBeschikbaarheidForDate(dateStr);
              if (!dayItems.length && !besch) return null;
              const isToday = dateStr === today;

              return (
                <div key={dateStr} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: isToday ? "#4A7C2F" : "#8AAD6E" }}>
                    {DAGEN[i]} {format(date, "d MMM", { locale: nl })} {isToday && "· Vandaag"}
                  </p>

                  {besch && (
                    <div className="rounded-2xl p-4 flex items-center gap-3" style={{
                      background: besch.type === "ziek" ? "#FDECEA" : "#FFF3CD",
                      border: besch.type === "ziek" ? "1px solid #E8A09A" : "1px solid #E8D070",
                    }}>
                      <span className="text-xl">{besch.type === "ziek" ? "🤒" : "🏖"}</span>
                      <div>
                        <p className="text-sm font-bold" style={{ color: besch.type === "ziek" ? "#C0392B" : "#8B6914" }}>
                          {besch.type === "ziek" ? "Ziekmelding geregistreerd" : "Vakantie goedgekeurd"}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: "#8AAD6E" }}>{besch.datum_van} → {besch.datum_tot}</p>
                      </div>
                    </div>
                  )}

                  {dayItems.map(item => (
                    <div key={item.id} className="rounded-2xl p-4 space-y-2" style={{
                      background: "#EBF0E4",
                      border: isToday ? "1px solid #9DC87A" : "1px solid #C5D4B2",
                      opacity: item.is_definitief ? 1 : 0.5,
                    }}>
                      {!item.is_definitief && (
                        <div className="flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-lg mb-1" style={{ background: "#DFE8D6", color: "#8AAD6E" }}>
                          <Lock className="h-3 w-3" /> {item.project_naam} — Planning nog concept
                        </div>
                      )}
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-bold" style={{ color: "#2D4A1E" }}>{item.project_naam}</p>
                          <p className="text-[11px] font-mono mt-0.5" style={{ color: "#8AAD6E" }}>{item.project_nummer}</p>
                        </div>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ background: "#D4E8C2", color: "#4A7C2F" }}>
                          {item.starttijd} – {item.eindtijd}
                        </span>
                      </div>
                      {item.notitie && (
                        <p className="text-xs" style={{ background: "#FFF8DC", border: "1px solid #E8D070", color: "#8B6914", padding: "6px 10px", borderRadius: 10 }}>
                          💬 {item.notitie}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}

            {items.length === 0 && beschikbaarheid.length === 0 && (
              <div className="text-center py-12 rounded-2xl" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
                <p className="text-3xl mb-2">📅</p>
                <p className="text-sm font-medium" style={{ color: "#2D4A1E" }}>Geen planning deze week</p>
                <p className="text-xs mt-1" style={{ color: "#8AAD6E" }}>Je bent nog niet ingepland</p>
              </div>
            )}
          </>
        )}
      </main>
    </PageShell>
  );
}

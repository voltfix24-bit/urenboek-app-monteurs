import { useState, useEffect, useCallback } from "react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, X, ChevronLeft, ChevronRight, Calendar, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, addDays } from "date-fns";
import { nl } from "date-fns/locale";
import { BottomNav } from "@/components/BottomNav";

interface EntryWithProfile {
  id: string; date: string; project_number: string; description: string;
  hours: number; status: string; user_id: string; full_name: string;
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
    const { data: timeEntries, error } = await supabase.from("time_entries").select("*").gte("date", format(weekStart, "yyyy-MM-dd")).lte("date", format(weekEnd, "yyyy-MM-dd")).order("date");
    if (error) { toast.error("Fout bij ophalen uren"); setLoading(false); return; }
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name");
    const profileMap = new Map(profiles?.map((p) => [p.user_id, p.full_name]) ?? []);
    const merged: EntryWithProfile[] = (timeEntries ?? []).map((e) => ({
      id: e.id, date: e.date, project_number: e.project_number, description: e.description,
      hours: Number(e.hours), status: e.status, user_id: e.user_id, full_name: profileMap.get(e.user_id) || "Onbekend",
    }));
    setEntries(merged);
    setLoading(false);
  }, [weekOffset]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("time_entries").update({ status, approved_by: user?.id }).eq("id", id);
    if (error) toast.error("Fout bij bijwerken");
    else { toast.success(status === "goedgekeurd" ? "Goedgekeurd!" : "Afgekeurd"); fetchEntries(); }
  };

  const approveAllForUser = async (userName: string) => {
    const userEntries = entries.filter((e) => e.full_name === userName && e.status === "ingediend");
    if (userEntries.length === 0) return;
    const ids = userEntries.map((e) => e.id);
    const { error } = await supabase.from("time_entries").update({ status: "goedgekeurd", approved_by: user?.id }).in("id", ids);
    if (error) toast.error("Fout bij bulk-goedkeuring");
    else { toast.success(`${userEntries.length} uren goedgekeurd voor ${userName}`); fetchEntries(); }
  };

  const filteredEntries = entries.filter((e) => filter === "alle" || e.status === filter);
  const grouped = filteredEntries.reduce<Record<string, EntryWithProfile[]>>((acc, e) => {
    if (!acc[e.full_name]) acc[e.full_name] = [];
    acc[e.full_name].push(e);
    return acc;
  }, {});
  const totalIngediend = entries.filter((e) => e.status === "ingediend").length;

  const statusConfig: Record<string, { bg: string; text: string; dot: string }> = {
    ingediend: { bg: "#FFF3CD", text: "#8B6914", dot: "#D4A017" },
    goedgekeurd: { bg: "#D4EDD8", text: "#2D7A3A", dot: "#2D7A3A" },
    afgekeurd: { bg: "#FDECEA", text: "#C0392B", dot: "#C0392B" },
    concept: { bg: "#DFE8D6", text: "#5A7A42", dot: "#8AAD6E" },
  };

  if (!isManager) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "#F5F7F0" }}><p style={{ color: "#8AAD6E" }}>Alleen managers hebben toegang.</p></div>;
  }

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "#F5F7F0", maxWidth: 430, margin: "0 auto", paddingBottom: 80 }}>
      <header className="sticky top-0 z-30" style={{ background: "rgba(235,240,228,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid #C5D4B2" }}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <HeaderLogo />
              <span className="text-base font-bold tracking-tight" style={{ color: "#2D4A1E" }}>Goedkeuren</span>
            </div>
            {totalIngediend > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: "#FFF3CD", border: "1px solid #E8D070" }}>
                <span className="text-lg font-extrabold" style={{ color: "#8B6914" }}>{totalIngediend}</span>
                <span className="text-[10px] font-semibold" style={{ color: "#8AAD6E" }}>open</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-xl p-0.5" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
            <button className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#DFE8D6", color: "#5A7A42" }} onClick={() => setWeekOffset((w) => w - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className="px-2 py-1 rounded-lg text-[11px] font-medium" style={{ color: "#5A7A42" }} onClick={() => setWeekOffset(0)}>
              <Calendar className="h-3 w-3 inline mr-1" />Vandaag
            </button>
            <button className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#DFE8D6", color: "#5A7A42" }} onClick={() => setWeekOffset((w) => w + 1)}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <span className="text-xs font-semibold" style={{ color: "#2D4A1E" }}>
            {format(weekStart, "d MMM", { locale: nl })} – {format(weekEnd, "d MMM", { locale: nl })}
          </span>
        </div>

        <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {([["ingediend", "Ingediend"], ["goedgekeurd", "Goedgekeurd"], ["afgekeurd", "Afgekeurd"], ["alle", "Alle"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors" style={{
              background: filter === k ? "#D4E8C2" : "#EBF0E4",
              border: filter === k ? "1px solid #9DC87A" : "1px solid #C5D4B2",
              color: filter === k ? "#4A7C2F" : "#8AAD6E",
            }}>
              {l}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-10">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "#4A7C2F", borderTopColor: "transparent" }} />
            <p className="text-xs mt-3" style={{ color: "#8AAD6E" }}>Laden...</p>
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-10 rounded-2xl" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
            <p className="text-3xl mb-2">✅</p>
            <p className="text-sm font-medium" style={{ color: "#2D4A1E" }}>Geen uren gevonden</p>
            <p className="text-xs mt-1" style={{ color: "#8AAD6E" }}>Geen uren met deze filter voor deze week</p>
          </div>
        ) : (
          Object.entries(grouped).map(([name, userEntries]) => {
            const totalHours = userEntries.reduce((s, e) => s + e.hours, 0);
            const pendingCount = userEntries.filter((e) => e.status === "ingediend").length;
            return (
              <div key={name} className="rounded-2xl overflow-hidden animate-slide-up" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
                <div className="flex items-center justify-between px-4 py-3" style={{ background: "#DFE8D6" }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-xs font-bold" style={{ color: "#fff" }}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="font-semibold text-sm" style={{ color: "#2D4A1E" }}>{name}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px]" style={{ color: "#8AAD6E" }}>{userEntries.length} dag{userEntries.length !== 1 ? "en" : ""} · {totalHours}u</span>
                        {pendingCount > 0 && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#FFF3CD", color: "#8B6914" }}>
                            {pendingCount} open
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold tabular-nums" style={{ color: "#4A7C2F" }}>{totalHours}u</span>
                    {pendingCount > 0 && (
                      <button onClick={() => approveAllForUser(name)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-colors active:scale-95" style={{ background: "#D4EDD8", border: "1px solid #8DC99A", color: "#2D7A3A" }}>
                        <CheckCheck className="h-3.5 w-3.5" /> Alles ✓
                      </button>
                    )}
                  </div>
                </div>

                <div className="divide-y" style={{ borderColor: "#DFE8D6" }}>
                  {userEntries.map((entry) => {
                    const sc = statusConfig[entry.status] || statusConfig.concept;
                    return (
                      <div key={entry.id} className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-medium min-w-[60px]" style={{ color: "#8AAD6E" }}>
                            {format(new Date(entry.date), "EEE d/M", { locale: nl })}
                          </span>
                          <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ background: "#D4E8C2", color: "#4A7C2F" }}>
                            {entry.project_number}
                          </span>
                          <span className="text-xs flex-1 truncate min-w-0" style={{ color: "#2D4A1E" }}>{entry.description || "–"}</span>
                          <span className="text-xs font-bold tabular-nums" style={{ color: "#2D4A1E" }}>{entry.hours}u</span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.text }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
                            {entry.status}
                          </span>
                          {entry.status === "ingediend" && (
                            <div className="flex gap-1">
                              <button className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors" style={{ background: "#D4EDD8", border: "1px solid #8DC99A" }} onClick={() => updateStatus(entry.id, "goedgekeurd")}>
                                <Check className="h-4 w-4" style={{ color: "#2D7A3A" }} />
                              </button>
                              <button className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors" style={{ background: "#FDECEA", border: "1px solid #E8A09A" }} onClick={() => updateStatus(entry.id, "afgekeurd")}>
                                <X className="h-4 w-4" style={{ color: "#C0392B" }} />
                              </button>
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

      <BottomNav />
    </div>
  );
}

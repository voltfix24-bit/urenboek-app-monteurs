import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format, startOfISOWeek, addDays } from "date-fns";
import { nl } from "date-fns/locale";
import { Check, X, ChevronRight, AlertTriangle, Shield } from "lucide-react";

export default function Dashboard() {
  const { isManager, user } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [weekHours, setWeekHours] = useState(0);
  const [activeProjects, setActiveProjects] = useState(0);
  const [pendingEntries, setPendingEntries] = useState<any[]>([]);
  const [verlofAanvragen, setVerlofAanvragen] = useState<any[]>([]);
  const [expiringCerts, setExpiringCerts] = useState<any[]>([]);
  const [todayPlanning, setTodayPlanning] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const weekStart = startOfISOWeek(new Date());
    const weekEnd = addDays(weekStart, 6);
    const today = format(new Date(), "yyyy-MM-dd");

    const { data: pending } = await supabase.from("time_entries").select("id, date, project_number, hours, user_id").eq("status", "ingediend").order("date").limit(5);
    if (pending) {
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name");
      const nameMap = new Map(profiles?.map((p: any) => [p.user_id, p.full_name]) ?? []);
      setPendingEntries(pending.map(e => ({ ...e, full_name: nameMap.get(e.user_id) || "Onbekend" })));
      setPendingCount(pending.length);
    }

    const { data: weekData } = await supabase.from("time_entries").select("hours").eq("status", "goedgekeurd").gte("date", format(weekStart, "yyyy-MM-dd")).lte("date", format(weekEnd, "yyyy-MM-dd"));
    setWeekHours(weekData?.reduce((s: number, e: any) => s + Number(e.hours), 0) || 0);

    const { count } = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("active", true);
    setActiveProjects(count || 0);

    const { data: verlof } = await supabase.from("beschikbaarheid").select("id, medewerker_id, type, datum_van, datum_tot, reden, status").eq("status", "aangevraagd").order("datum_van").limit(5);
    if (verlof) {
      const profIds = [...new Set(verlof.map((v: any) => v.medewerker_id))];
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", profIds);
      const profMap = new Map(profs?.map((p: any) => [p.id, p.full_name]) ?? []);
      setVerlofAanvragen(verlof.map((v: any) => ({ ...v, naam: profMap.get(v.medewerker_id) || "Onbekend" })));
    }

    const thirtyDays = format(addDays(new Date(), 30), "yyyy-MM-dd");
    const { data: certs } = await supabase.from("certificaten").select("id, medewerker_id, naam, type, vervaldatum").lte("vervaldatum", thirtyDays).order("vervaldatum").limit(5);
    if (certs) {
      const profIds = [...new Set(certs.map((c: any) => c.medewerker_id))];
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", profIds);
      const profMap = new Map(profs?.map((p: any) => [p.id, p.full_name]) ?? []);
      setExpiringCerts(certs.map((c: any) => ({ ...c, medewerker: profMap.get(c.medewerker_id) || "Onbekend" })));
    }

    const { data: plan } = await supabase.from("planning").select("id, medewerker_id, project_id, starttijd, eindtijd").eq("datum", today);
    if (plan) {
      const profIds = [...new Set(plan.map((p: any) => p.medewerker_id))];
      const projIds = [...new Set(plan.map((p: any) => p.project_id))];
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", profIds);
      const { data: projs } = await supabase.from("projects").select("id, naam").in("id", projIds);
      const profMap = new Map(profs?.map((p: any) => [p.id, p.full_name]) ?? []);
      const projMap = new Map(projs?.map((p: any) => [p.id, p.naam]) ?? []);
      setTodayPlanning(plan.map((p: any) => ({ ...p, naam: profMap.get(p.medewerker_id) || "Onbekend", project: projMap.get(p.project_id) || "Onbekend", starttijd: p.starttijd?.slice(0, 5), eindtijd: p.eindtijd?.slice(0, 5) })));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const handleVerlof = async (id: string, status: string) => {
    const { error } = await supabase.from("beschikbaarheid").update({ status } as any).eq("id", id);
    if (error) toast.error("Fout");
    else { toast.success(status === "goedgekeurd" ? "Goedgekeurd" : "Afgekeurd"); fetchDashboard(); }
  };

  if (!isManager) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "#F5F7F0" }}><p style={{ color: "#8AAD6E" }}>Alleen managers hebben toegang.</p></div>;
  }

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "#F5F7F0", maxWidth: 430, margin: "0 auto", paddingBottom: 80 }}>
      <header className="sticky top-0 z-30" style={{ background: "rgba(235,240,228,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid #C5D4B2" }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: "linear-gradient(135deg, #4A7C2F, #3D6826)" }}>⚡</div>
            <span className="text-base font-bold tracking-tight" style={{ color: "#2D4A1E" }}>Dashboard</span>
          </div>
          <span className="text-xs" style={{ color: "#8AAD6E" }}>{format(new Date(), "d MMMM yyyy", { locale: nl })}</span>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {loading ? (
          <div className="text-center py-10"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "#4A7C2F", borderTopColor: "transparent" }} /></div>
        ) : (
          <>
            {/* KPI strip */}
            <div className="flex gap-2">
              {[
                { label: "Open keuring", value: String(pendingCount), color: "#D4A017", icon: "⏳" },
                { label: "Uren (week)", value: weekHours + "u", color: "#2D7A3A", icon: "⏱" },
                { label: "Projecten", value: String(activeProjects), color: "#2D5A8A", icon: "📁" },
              ].map((k, i) => (
                <div key={i} className="flex-1 rounded-2xl p-3 text-center" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
                  <p className="text-lg mb-0.5">{k.icon}</p>
                  <p className="text-xl font-extrabold" style={{ color: k.color }}>{k.value}</p>
                  <p className="text-[10px] font-medium mt-0.5" style={{ color: "#8AAD6E" }}>{k.label}</p>
                </div>
              ))}
            </div>

            {/* Today planning */}
            {todayPlanning.length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#8AAD6E" }}>Vandaag ingepland</p>
                  <button onClick={() => navigate("/manager-planning")} className="text-[11px] font-semibold flex items-center gap-0.5" style={{ color: "#4A7C2F" }}>
                    Alle <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                {todayPlanning.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #DFE8D6" }}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "#4A7C2F", color: "#fff" }}>
                        {p.naam?.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: "#2D4A1E" }}>{p.naam}</p>
                        <p className="text-[10px]" style={{ color: "#8AAD6E" }}>{p.project}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-medium" style={{ color: "#4A7C2F" }}>{p.starttijd}–{p.eindtijd}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Pending approvals */}
            {pendingEntries.length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#8AAD6E" }}>Openstaande goedkeuringen</p>
                  <button onClick={() => navigate("/goedkeuring")} className="text-[11px] font-semibold flex items-center gap-0.5" style={{ color: "#4A7C2F" }}>
                    Alle <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                {pendingEntries.slice(0, 3).map(e => (
                  <div key={e.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #DFE8D6" }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "#2D4A1E" }}>{e.full_name}</p>
                      <p className="text-[10px]" style={{ color: "#8AAD6E" }}>{e.project_number} · {e.hours}u · {format(new Date(e.date), "d MMM", { locale: nl })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Verlof requests */}
            {verlofAanvragen.length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#8AAD6E" }}>Verlofaanvragen</p>
                {verlofAanvragen.map(v => (
                  <div key={v.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #DFE8D6" }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "#2D4A1E" }}>{v.naam}</p>
                      <p className="text-[10px] capitalize" style={{ color: "#8AAD6E" }}>{v.type} · {v.datum_van} → {v.datum_tot}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => handleVerlof(v.id, "goedgekeurd")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#D4EDD8", border: "1px solid #8DC99A" }}>
                        <Check className="h-4 w-4" style={{ color: "#2D7A3A" }} />
                      </button>
                      <button onClick={() => handleVerlof(v.id, "afgekeurd")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#FDECEA", border: "1px solid #E8A09A" }}>
                        <X className="h-4 w-4" style={{ color: "#C0392B" }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Expiring certs */}
            {expiringCerts.length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
                <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "#8AAD6E" }}>
                  <AlertTriangle className="h-3.5 w-3.5" style={{ color: "#D4A017" }} />
                  Certificaten verlopen binnenkort
                </p>
                {expiringCerts.map(c => {
                  const expired = new Date(c.vervaldatum) < new Date();
                  return (
                    <div key={c.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #DFE8D6" }}>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" style={{ color: expired ? "#C0392B" : "#D4A017" }} />
                        <div>
                          <p className="text-sm font-medium" style={{ color: "#2D4A1E" }}>{c.medewerker}</p>
                          <p className="text-[10px]" style={{ color: "#8AAD6E" }}>{c.naam} ({c.type})</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold" style={{ color: expired ? "#C0392B" : "#D4A017" }}>{c.vervaldatum}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {pendingEntries.length === 0 && verlofAanvragen.length === 0 && todayPlanning.length === 0 && (
              <div className="text-center py-10 rounded-2xl" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
                <p className="text-3xl mb-2">✅</p>
                <p className="text-sm font-medium" style={{ color: "#2D4A1E" }}>Alles bijgewerkt</p>
                <p className="text-xs mt-1" style={{ color: "#8AAD6E" }}>Geen openstaande items</p>
              </div>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

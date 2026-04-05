import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format, startOfISOWeek, addDays } from "date-fns";
import { nl } from "date-fns/locale";
import { Check, X, ChevronRight, AlertTriangle, Shield, Clock, FolderOpen, Hourglass, CheckCircle, Users, TrendingUp, CalendarDays } from "lucide-react";
import { HeaderLogo } from "@/components/HeaderLogo";

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

export default function Dashboard() {
  const { isManager, user } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [weekHours, setWeekHours] = useState(0);
  const [activeProjects, setActiveProjects] = useState(0);
  const [teamCount, setTeamCount] = useState(0);
  const [pendingEntries, setPendingEntries] = useState<any[]>([]);
  const [verlofAanvragen, setVerlofAanvragen] = useState<any[]>([]);
  const [expiringCerts, setExpiringCerts] = useState<any[]>([]);
  const [todayPlanning, setTodayPlanning] = useState<any[]>([]);
  const [projectsWithMarge, setProjectsWithMarge] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [afkeurReden, setAfkeurReden] = useState("");
  const [afkeurId, setAfkeurId] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const weekStart = startOfISOWeek(new Date());
    const weekEnd = addDays(weekStart, 6);
    const today = format(new Date(), "yyyy-MM-dd");

    // Pending approvals
    const { data: pending } = await supabase
      .from("uren_boekingen")
      .select("id, datum, project_id, uren, beschrijving, medewerker_id, type")
      .eq("status", "ingediend")
      .order("datum")
      .limit(10);
    if (pending) {
      const medIds = [...new Set(pending.map((p: any) => p.medewerker_id))];
      const projIds = [...new Set(pending.map((p: any) => p.project_id))];
      const [{ data: profiles }, { data: projects }] = await Promise.all([
        medIds.length > 0 ? supabase.from("profiles").select("id, full_name").in("id", medIds) : { data: [] },
        projIds.length > 0 ? supabase.from("projects").select("id, naam, nummer").in("id", projIds) : { data: [] },
      ]);
      const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));
      const projMap = new Map((projects ?? []).map((p: any) => [p.id, p]));
      setPendingEntries(pending.map(e => {
        const proj = projMap.get(e.project_id) || { naam: "", nummer: "" };
        return { ...e, full_name: nameMap.get(e.medewerker_id) || "Onbekend", project_naam: (proj as any).naam, project_nummer: (proj as any).nummer };
      }));
      setPendingCount(pending.length);
    }

    // Week hours
    const { data: weekData } = await supabase
      .from("uren_boekingen")
      .select("uren")
      .eq("status", "goedgekeurd")
      .gte("datum", format(weekStart, "yyyy-MM-dd"))
      .lte("datum", format(weekEnd, "yyyy-MM-dd"));
    setWeekHours(weekData?.reduce((s: number, e: any) => s + Number(e.uren), 0) || 0);

    // Active projects count
    const { count } = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("active", true);
    setActiveProjects(count || 0);

    // Team count
    const { count: tCount } = await supabase.from("profiles").select("id", { count: "exact", head: true });
    setTeamCount(tCount || 0);

    // Verlof aanvragen
    const { data: verlof } = await supabase.from("beschikbaarheid").select("id, medewerker_id, type, datum_van, datum_tot, reden, status").eq("status", "aangevraagd").order("datum_van").limit(5);
    if (verlof) {
      const profIds = [...new Set(verlof.map((v: any) => v.medewerker_id))];
      const { data: profs } = profIds.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", profIds) : { data: [] };
      const profMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
      setVerlofAanvragen(verlof.map((v: any) => ({ ...v, naam: profMap.get(v.medewerker_id) || "Onbekend" })));
    }

    // Expiring certs
    const thirtyDays = format(addDays(new Date(), 30), "yyyy-MM-dd");
    const { data: certs } = await supabase.from("certificaten").select("id, medewerker_id, naam, type, vervaldatum").lte("vervaldatum", thirtyDays).order("vervaldatum").limit(5);
    if (certs) {
      const profIds = [...new Set(certs.map((c: any) => c.medewerker_id))];
      const { data: profs } = profIds.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", profIds) : { data: [] };
      const profMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
      setExpiringCerts(certs.map((c: any) => ({ ...c, medewerker: profMap.get(c.medewerker_id) || "Onbekend" })));
    }

    // Today planning
    const { data: plan } = await supabase.from("planning").select("id, medewerker_id, project_id, starttijd, eindtijd").eq("datum", today);
    if (plan) {
      const profIds = [...new Set(plan.map((p: any) => p.medewerker_id))];
      const projIds = [...new Set(plan.map((p: any) => p.project_id))];
      const [{ data: profs }, { data: projs }] = await Promise.all([
        profIds.length > 0 ? supabase.from("profiles").select("id, full_name").in("id", profIds) : { data: [] },
        projIds.length > 0 ? supabase.from("projects").select("id, naam").in("id", projIds) : { data: [] },
      ]);
      const profMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
      const projMap = new Map((projs ?? []).map((p: any) => [p.id, p.naam]));
      setTodayPlanning(plan.map((p: any) => ({ ...p, naam: profMap.get(p.medewerker_id) || "Onbekend", project: projMap.get(p.project_id) || "Onbekend", starttijd: p.starttijd?.slice(0, 5), eindtijd: p.eindtijd?.slice(0, 5) })));
    }

    // Projects with marge from forecast
    const { data: forecasts } = await supabase.from("project_forecast").select("id, project_id, methode");
    if (forecasts && forecasts.length > 0) {
      const fIds = forecasts.map((f: any) => f.id);
      const pIds = forecasts.map((f: any) => f.project_id);
      const [{ data: regels }, { data: projs }] = await Promise.all([
        supabase.from("forecast_regels").select("forecast_id, tarief_terrevolt, tarief_inkoop, aantal, geplande_uren, uurtarief_snap, type").in("forecast_id", fIds),
        supabase.from("projects").select("id, naam, nummer").in("id", pIds),
      ]);
      const projMap = new Map((projs ?? []).map((p: any) => [p.id, p]));
      const fMethode = new Map(forecasts.map((f: any) => [f.id, f.methode]));
      const fProject = new Map(forecasts.map((f: any) => [f.id, f.project_id]));

      // Group regels by forecast
      const regelsByForecast = new Map<string, any[]>();
      (regels ?? []).forEach((r: any) => {
        const arr = regelsByForecast.get(r.forecast_id) || [];
        arr.push(r);
        regelsByForecast.set(r.forecast_id, arr);
      });

      const result: any[] = [];
      forecasts.forEach((f: any) => {
        const rules = regelsByForecast.get(f.id) || [];
        if (rules.length === 0) return;
        let omzet = 0, kosten = 0;
        rules.forEach((r: any) => {
          if (r.type === "spec") {
            omzet += (r.tarief_terrevolt || 0) * (r.aantal || 1);
            kosten += (r.tarief_inkoop || 0) * (r.aantal || 1);
          } else if (r.type === "uren") {
            kosten += (r.geplande_uren || 0) * (r.uurtarief_snap || 0);
          }
        });
        const marge = omzet > 0 ? ((omzet - kosten) / omzet) * 100 : 0;
        const proj = projMap.get(f.project_id);
        if (proj) {
          result.push({ ...proj, omzet, kosten, marge });
        }
      });
      setProjectsWithMarge(result.sort((a, b) => a.marge - b.marge));
    }

    setLoading(false);
  }, [user]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const handleApprove = async (id: string) => {
    const { error } = await supabase.from("uren_boekingen").update({ status: "goedgekeurd" } as any).eq("id", id);
    if (error) toast.error("Fout bij goedkeuren");
    else { toast.success("Goedgekeurd"); fetchDashboard(); }
  };

  const handleReject = async () => {
    if (!afkeurId || !afkeurReden.trim()) { toast.error("Vul een reden in"); return; }
    const { error } = await supabase.from("uren_boekingen").update({ status: "afgekeurd", afkeur_reden: afkeurReden.trim() } as any).eq("id", afkeurId);
    if (error) toast.error("Fout bij afkeuren");
    else { toast.success("Afgekeurd"); setAfkeurId(null); setAfkeurReden(""); fetchDashboard(); }
  };

  const handleVerlof = async (id: string, status: string) => {
    const { error } = await supabase.from("beschikbaarheid").update({ status } as any).eq("id", id);
    if (error) toast.error("Fout");
    else { toast.success(status === "goedgekeurd" ? "Goedgekeurd" : "Afgekeurd"); fetchDashboard(); }
  };

  const margeColor = (m: number) => m >= 30 ? "var(--success)" : m >= 15 ? "var(--warn-dot)" : "var(--danger)";
  const margeBg = (m: number) => m >= 30 ? "var(--success-light)" : m >= 15 ? "var(--warn-light)" : "var(--danger-light)";

  if (!isManager) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}><p style={{ color: "var(--text-muted)" }}>Alleen managers hebben toegang.</p></div>;
  }

  return (
    <PageShell>
      <header className="sticky top-0 z-30" style={{ background: "rgba(235,240,228,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid #C5D4B2" }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <HeaderLogo />
            <span className="text-base font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Dashboard</span>
          </div>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{format(new Date(), "d MMMM yyyy", { locale: nl })}</span>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {loading ? (
          <div className="text-center py-10"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} /></div>
        ) : (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Open keuring", value: String(pendingCount), color: "var(--warn-dot)", Icon: Hourglass, onClick: () => navigate("/goedkeuring") },
                { label: "Uren (week)", value: weekHours + "u", color: "var(--success)", Icon: Clock },
                { label: "Projecten", value: String(activeProjects), color: "var(--info)", Icon: FolderOpen, onClick: () => navigate("/projecten") },
                { label: "Team", value: String(teamCount), color: "var(--purple)", Icon: Users, onClick: () => navigate("/medewerkers") },
              ].map((k, i) => (
                <div key={i} onClick={k.onClick} className="rounded-2xl p-3 text-center" style={{ background: "var(--bg-surface)", border: "1px solid #C5D4B2", cursor: k.onClick ? "pointer" : "default" }}>
                  <k.Icon className="h-5 w-5 mx-auto mb-1" style={{ color: k.color }} />
                  <p className="text-xl font-extrabold" style={{ color: k.color, fontFamily: "DM Mono, monospace" }}>{k.value}</p>
                  <p className="text-[10px] font-medium mt-0.5" style={{ color: "var(--text-muted)" }}>{k.label}</p>
                </div>
              ))}
            </div>

            {/* Today planning */}
            {todayPlanning.length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid #C5D4B2" }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                    <CalendarDays className="h-3.5 w-3.5" /> Vandaag ingepland
                  </p>
                  <button onClick={() => navigate("/manager-planning")} className="text-[11px] font-semibold flex items-center gap-0.5" style={{ color: "var(--accent)" }}>
                    Alle <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                {todayPlanning.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #DFE8D6" }}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--accent)", color: "#fff" }}>
                        {p.naam?.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{p.naam}</p>
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{p.project}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-medium" style={{ color: "var(--accent)", fontFamily: "DM Mono, monospace" }}>{p.starttijd}–{p.eindtijd}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Pending approvals with inline actions */}
            {pendingEntries.length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid #C5D4B2" }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Openstaande goedkeuringen ({pendingCount})</p>
                  <button onClick={() => navigate("/goedkeuring")} className="text-[11px] font-semibold flex items-center gap-0.5" style={{ color: "var(--accent)" }}>
                    Alle <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                {pendingEntries.slice(0, 5).map(e => (
                  <div key={e.id} className="py-2.5" style={{ borderBottom: "1px solid #DFE8D6" }}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{e.full_name}</p>
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {e.project_nummer} · {e.uren}u · {format(new Date(e.datum), "d MMM", { locale: nl })}
                          {e.beschrijving && ` · ${e.beschrijving}`}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0 ml-2">
                        <button onClick={() => handleApprove(e.id)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--success-light)", border: "1px solid #8DC99A" }}>
                          <Check className="h-4 w-4" style={{ color: "var(--success)" }} />
                        </button>
                        <button onClick={() => { setAfkeurId(e.id); setAfkeurReden(""); }} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--danger-light)", border: "1px solid #E8A09A" }}>
                          <X className="h-4 w-4" style={{ color: "var(--danger)" }} />
                        </button>
                      </div>
                    </div>
                    {afkeurId === e.id && (
                      <div className="flex gap-2 mt-2 animate-fade-in">
                        <input
                          value={afkeurReden}
                          onChange={ev => setAfkeurReden(ev.target.value)}
                          placeholder="Reden voor afkeuring..."
                          className="flex-1 px-3 py-2 rounded-xl text-xs"
                          style={{ background: "var(--bg-base)", border: "1px solid #E8A09A", color: "var(--text-primary)" }}
                          autoFocus
                          onKeyDown={ev => ev.key === "Enter" && handleReject()}
                        />
                        <button onClick={handleReject} className="px-3 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "var(--danger)" }}>Afkeuren</button>
                        <button onClick={() => setAfkeurId(null)} className="px-2 py-2 rounded-xl text-xs" style={{ color: "var(--text-muted)" }}>×</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Verlof requests with inline actions */}
            {verlofAanvragen.length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid #C5D4B2" }}>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Verlofaanvragen</p>
                {verlofAanvragen.map(v => (
                  <div key={v.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #DFE8D6" }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{v.naam}</p>
                      <p className="text-[10px] capitalize" style={{ color: "var(--text-muted)" }}>{v.type} · {format(new Date(v.datum_van), "d MMM", { locale: nl })} → {format(new Date(v.datum_tot), "d MMM", { locale: nl })}</p>
                      {v.reden && <p className="text-[10px] italic" style={{ color: "var(--text-muted)" }}>{v.reden}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => handleVerlof(v.id, "goedgekeurd")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--success-light)", border: "1px solid #8DC99A" }}>
                        <Check className="h-4 w-4" style={{ color: "var(--success)" }} />
                      </button>
                      <button onClick={() => handleVerlof(v.id, "afgekeurd")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--danger-light)", border: "1px solid #E8A09A" }}>
                        <X className="h-4 w-4" style={{ color: "var(--danger)" }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Active projects with marge */}
            {projectsWithMarge.length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid #C5D4B2" }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                    <TrendingUp className="h-3.5 w-3.5" /> Projecten marge
                  </p>
                  <button onClick={() => navigate("/projecten")} className="text-[11px] font-semibold flex items-center gap-0.5" style={{ color: "var(--accent)" }}>
                    Alle <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                {projectsWithMarge.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #DFE8D6" }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{p.naam}</p>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)", fontFamily: "DM Mono, monospace" }}>
                        Omzet {euro(p.omzet)} · Kosten {euro(p.kosten)}
                      </p>
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ml-2" style={{ background: margeBg(p.marge), color: margeColor(p.marge), fontFamily: "DM Mono, monospace" }}>
                      {p.marge.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Expiring certs */}
            {expiringCerts.length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid #C5D4B2" }}>
                <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                  <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--warn-dot)" }} />
                  Certificaten verlopen binnenkort
                </p>
                {expiringCerts.map(c => {
                  const expired = new Date(c.vervaldatum) < new Date();
                  return (
                    <div key={c.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #DFE8D6" }}>
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" style={{ color: expired ? "var(--danger)" : "var(--warn-dot)" }} />
                        <div>
                          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{c.medewerker}</p>
                          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{c.naam} ({c.type})</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold" style={{ color: expired ? "var(--danger)" : "var(--warn-dot)" }}>
                        {format(new Date(c.vervaldatum), "d MMM yyyy", { locale: nl })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {pendingEntries.length === 0 && verlofAanvragen.length === 0 && todayPlanning.length === 0 && projectsWithMarge.length === 0 && (
              <div className="text-center py-10 rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid #C5D4B2" }}>
                <CheckCircle className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--accent)" }} />
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Alles bijgewerkt</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Geen openstaande items</p>
              </div>
            )}
          </>
        )}
      </main>
    </PageShell>
  );
}

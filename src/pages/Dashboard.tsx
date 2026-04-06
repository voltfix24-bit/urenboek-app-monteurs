import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { format, startOfISOWeek, addDays } from "date-fns";
import { nl } from "date-fns/locale";
import { Check, X, ChevronRight, AlertTriangle, Shield, Clock, FolderOpen, Hourglass, CheckCircle, Users, TrendingUp, CalendarDays, MapPin, Layers, FileSignature, UserCheck } from "lucide-react";
import { volledigAdres } from "@/lib/utils";
import { HeaderLogo } from "@/components/HeaderLogo";
import { euro } from "@/lib/formatting";
import { DashboardSkeleton } from "@/components/ui/Skeletons";
import { useDashboardQuery } from "@/hooks/queries/useDashboardQuery";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

import { formatDatum } from "@/lib/formatting";

function ContractAttentionSection({ navigate }: { navigate: (p: string) => void }) {
  const [wachtend, setWachtend] = useState<any[]>([]);
  const [correcties, setCorrecties] = useState<any[]>([]);
  const [verlopen, setVerlopen] = useState<any[]>([]);

  useEffect(() => {
    const dertig = new Date();
    dertig.setDate(dertig.getDate() + 30);
    Promise.all([
      supabase.from("contracten").select("id, contract_nummer, ot_naam, kandidaat_id").eq("status", "ondertekend_ot"),
      supabase.from("contracten").select("id, contract_nummer, ot_naam, kandidaat_id").eq("status", "correctie_gevraagd"),
      supabase.from("contracten").select("id, contract_nummer, einddatum, profiel_id").eq("status", "ondertekend_beiden").lte("einddatum", dertig.toISOString().split("T")[0]).order("einddatum"),
    ]).then(([{ data: w }, { data: c }, { data: v }]) => {
      setWachtend(w || []);
      setCorrecties(c || []);
      setVerlopen(v || []);
    });
  }, []);

  if (wachtend.length === 0 && correcties.length === 0 && verlopen.length === 0) return null;

  return (
    <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
        <FileSignature className="h-3.5 w-3.5" /> Contracten die aandacht vragen
      </p>
      {correcties.map(c => (
        <div key={c.id} className="flex items-center gap-2.5 p-2.5 rounded-xl" style={{ background: "var(--bg-base)", border: "1px solid var(--danger-border)" }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: "var(--danger-light)", color: "var(--danger)" }}>⚠️</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{c.ot_naam || "Opdrachtnemer"}</p>
            <p className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>{c.contract_nummer}</p>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0" style={{ background: "var(--danger-light)", color: "var(--danger)", border: "1px solid var(--danger-border)" }}>Correctie gevraagd</span>
          <button onClick={() => navigate("/kandidaten")} className="text-xs font-medium shrink-0" style={{ color: "var(--accent)" }}>Bekijken</button>
        </div>
      ))}
      {wachtend.map(c => (
        <div key={c.id} className="flex items-center gap-2.5 p-2.5 rounded-xl" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: "var(--warn-light)", color: "var(--warn-text)" }}>⏳</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{c.ot_naam || "Opdrachtnemer"}</p>
            <p className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>{c.contract_nummer}</p>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0" style={{ background: "var(--warn-light)", color: "var(--warn-text)", border: "1px solid var(--warn-border)" }}>Wacht op handtekening</span>
          <button onClick={() => navigate("/kandidaten")} className="text-xs font-medium shrink-0" style={{ color: "var(--accent)" }}>Ondertekenen</button>
        </div>
      ))}
      {verlopen.map(c => {
        const days = c.einddatum ? Math.ceil((new Date(c.einddatum).getTime() - Date.now()) / 86400000) : 0;
        return (
          <div key={c.id} className="flex items-center gap-2.5 p-2.5 rounded-xl" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: days < 0 ? "var(--danger-light)" : "var(--warn-light)", color: days < 0 ? "var(--danger)" : "var(--warn-text)" }}>⏰</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{c.contract_nummer}</p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Verloopt {formatDatum(c.einddatum)}</p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0" style={{ background: days < 0 ? "var(--danger-light)" : "var(--warn-light)", color: days < 0 ? "var(--danger)" : "var(--warn-text)" }}>{days < 0 ? "Verlopen" : `${days}d`}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const { isManager, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: dashboardData, isLoading: loading } = useDashboardQuery();

  const pendingCount = dashboardData?.pendingCount ?? 0;
  const weekHours = dashboardData?.weekHours ?? 0;
  const activeProjects = dashboardData?.activeProjects ?? 0;
  const teamCount = dashboardData?.teamCount ?? 0;
  const pendingEntries = dashboardData?.pendingEntries ?? [];
  const verlofAanvragen = dashboardData?.verlofAanvragen ?? [];
  const expiringCerts = dashboardData?.expiringCerts ?? [];
  const todayPlanning = dashboardData?.todayPlanning ?? [];
  const projectsWithMarge = dashboardData?.projectsWithMarge ?? [];
  const overurenMeldingen = dashboardData?.overurenMeldingen ?? [];
  const overurenCount = dashboardData?.overurenCount ?? 0;
  const statusGroups = dashboardData?.statusGroups ?? {};

  const [afkeurReden, setAfkeurReden] = useState("");
  const [afkeurId, setAfkeurId] = useState<string | null>(null);

  const refetchDashboard = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
  }, [queryClient]);

  // Realtime subscriptions
  useEffect(() => {
    if (!user) return;
    const kanalen = [
      supabase.channel('dash-ub').on('postgres_changes', { event: '*', schema: 'public', table: 'uren_boekingen' }, refetchDashboard).subscribe(),
      supabase.channel('dash-pl').on('postgres_changes', { event: '*', schema: 'public', table: 'planning' }, refetchDashboard).subscribe(),
      supabase.channel('dash-besch').on('postgres_changes', { event: '*', schema: 'public', table: 'beschikbaarheid' }, refetchDashboard).subscribe(),
      supabase.channel('dash-cert').on('postgres_changes', { event: '*', schema: 'public', table: 'certificaten' }, refetchDashboard).subscribe(),
    ];
    return () => { kanalen.forEach(k => supabase.removeChannel(k)); };
  }, [user, refetchDashboard]);

  const handleApprove = async (id: string) => {
    if (!await mutate(supabase.from("uren_boekingen").update({ status: "goedgekeurd" } as any).eq("id", id))) return;
    toast.success("Goedgekeurd"); refetchDashboard();
  };

  const handleReject = async () => {
    if (!afkeurId || !afkeurReden.trim()) { toast.error("Vul een reden in"); return; }
    if (!await mutate(supabase.from("uren_boekingen").update({ status: "afgekeurd", afkeur_reden: afkeurReden.trim() } as any).eq("id", afkeurId))) return;
    toast.success("Afgekeurd"); setAfkeurId(null); setAfkeurReden(""); refetchDashboard();
  };

  const handleVerlof = async (id: string, status: string) => {
    if (!await mutate(supabase.from("beschikbaarheid").update({ status } as any).eq("id", id))) return;
    toast.success(status === "goedgekeurd" ? "Goedgekeurd" : "Afgekeurd"); refetchDashboard();
  };

  const margeColor = (m: number) => m >= 30 ? "var(--success)" : m >= 15 ? "var(--warn-dot)" : "var(--danger)";
  const margeBg = (m: number) => m >= 30 ? "var(--success-light)" : m >= 15 ? "var(--warn-light)" : "var(--danger-light)";

  if (!isManager) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}><p style={{ color: "var(--text-muted)" }}>Alleen managers hebben toegang.</p></div>;
  }

  return (
    <PageShell>
      <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
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
          <DashboardSkeleton />
        ) : (
          <>
            {/* KPI strip */}
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Open keuring", value: String(pendingCount), color: "var(--warn-dot)", Icon: Hourglass, onClick: () => navigate("/goedkeuring") },
                { label: "Uren (week)", value: weekHours + "u", color: "var(--success)", Icon: Clock },
                { label: "Projecten", value: String(activeProjects), color: "var(--info)", Icon: FolderOpen, onClick: () => navigate("/projecten") },
                { label: "Team", value: String(teamCount), color: "var(--purple)", Icon: Users, onClick: () => navigate("/medewerkers") },
                { label: "Overuren", value: overurenCount > 0 ? String(overurenCount) : "✓", color: overurenCount > 0 ? "var(--warn-text)" : "var(--success)", Icon: overurenCount > 0 ? AlertTriangle : CheckCircle, onClick: () => navigate("/overuren") },
              ].map((k, i) => (
                <div key={i} onClick={k.onClick} className="rounded-2xl p-3 text-center" style={{ background: overurenCount > 0 && k.label === "Overuren" ? "var(--warn-bg)" : "var(--bg-surface)", border: "1px solid var(--border)", cursor: k.onClick ? "pointer" : "default" }}>
                  <k.Icon className="h-5 w-5 mx-auto mb-1" style={{ color: k.color }} />
                  <p className="text-xl font-extrabold" style={{ color: k.color, fontFamily: "DM Mono, monospace" }}>{k.value}</p>
                  <p className="text-[10px] font-medium mt-0.5" style={{ color: "var(--text-muted)" }}>{k.label}</p>
                </div>
              ))}
            </div>

            {/* Project status groups */}
            {Object.keys(statusGroups).length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                    <Layers className="h-3.5 w-3.5" /> Projectstatus
                  </p>
                  <button onClick={() => navigate("/projecten")} className="text-[11px] font-semibold flex items-center gap-0.5" style={{ color: "var(--accent)" }}>
                    Alle <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: "nieuw", label: "Nieuw", color: "var(--text-muted)", bg: "var(--bg-surface-2)" },
                    { key: "gepland", label: "Gepland", color: "var(--info)", bg: "var(--info-light)" },
                    { key: "in_uitvoering", label: "Uitvoering", color: "var(--warn-text)", bg: "var(--warn-light)" },
                    { key: "opgeleverd", label: "Opgeleverd", color: "var(--success)", bg: "var(--success-light)" },
                    { key: "gefactureerd", label: "Gefactureerd", color: "var(--accent)", bg: "var(--accent-light)" },
                    { key: "gesloten", label: "Gesloten", color: "var(--text-muted)", bg: "var(--bg-surface-2)" },
                  ] as const).filter(s => (statusGroups[s.key] || 0) > 0).map(s => (
                    <div key={s.key} className="rounded-xl p-2.5 text-center" style={{ background: s.bg }}>
                      <p className="text-lg font-extrabold" style={{ color: s.color, fontFamily: "DM Mono, monospace" }}>{statusGroups[s.key] || 0}</p>
                      <p className="text-[9px] font-semibold mt-0.5" style={{ color: s.color }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Today planning */}
            {todayPlanning.length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                    <CalendarDays className="h-3.5 w-3.5" /> Vandaag ingepland
                  </p>
                  <button onClick={() => navigate("/manager-planning")} className="text-[11px] font-semibold flex items-center gap-0.5" style={{ color: "var(--accent)" }}>
                    Alle <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                {todayPlanning.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--bg-surface-2)" }}>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--accent)", color: "#fff" }}>
                        {p.naam?.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{p.naam}</p>
                        <div className="flex items-center gap-1.5">
                          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{p.project}</p>
                          {p.activiteit && (
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 3,
                              padding: "1px 6px", borderRadius: 10, fontSize: 9, fontWeight: 600,
                              background: p.activiteit_kleur ? `${p.activiteit_kleur}22` : "var(--accent-light)",
                              color: p.activiteit_kleur || "var(--accent)",
                              border: `1px solid ${p.activiteit_kleur || "var(--accent)"}44`,
                            }}>
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: p.activiteit_kleur || "var(--accent)" }} />
                              {p.activiteit}
                            </span>
                          )}
                        </div>
                        {p.projectAdres && <p className="text-[10px] flex items-center gap-0.5" style={{ color: "var(--text-muted)" }}><MapPin className="h-3 w-3 inline" /> {p.projectAdres}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-medium block" style={{ color: "var(--accent)", fontFamily: "DM Mono, monospace" }}>{p.starttijd}–{p.eindtijd}</span>
                      {p.boeking ? (
                        <span className="text-[10px] font-semibold" style={{ color: "var(--success)" }}>✓ {p.boeking.uren}u geboekt</span>
                      ) : (
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Nog geen uren</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pending approvals with inline actions */}
            {pendingEntries.length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Openstaande goedkeuringen ({pendingCount})</p>
                  <button onClick={() => navigate("/goedkeuring")} className="text-[11px] font-semibold flex items-center gap-0.5" style={{ color: "var(--accent)" }}>
                    Alle <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                {pendingEntries.slice(0, 5).map(e => (
                  <div key={e.id} className="py-2.5" style={{ borderBottom: "1px solid var(--bg-surface-2)" }}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{e.full_name}</p>
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {e.project_nummer} · {e.uren}u · {format(new Date(e.datum), "d MMM", { locale: nl })}
                          {e.beschrijving && ` · ${e.beschrijving}`}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0 ml-2">
                        <button onClick={() => handleApprove(e.id)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--success-light)", border: "1px solid var(--success-border)" }}>
                          <Check className="h-4 w-4" style={{ color: "var(--success)" }} />
                        </button>
                        <button onClick={() => { setAfkeurId(e.id); setAfkeurReden(""); }} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--danger-light)", border: "1px solid var(--danger-border)" }}>
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
                          style={{ background: "var(--bg-base)", border: "1px solid var(--danger-border)", color: "var(--text-primary)" }}
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

            {/* Overuren meldingen section */}
            {overurenMeldingen.length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                    <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--warn-dot)" }} /> Overuren meldingen
                  </p>
                  <button onClick={() => navigate("/overuren")} className="text-[11px] font-semibold flex items-center gap-0.5" style={{ color: "var(--accent)" }}>
                    Bekijk alle <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                {overurenMeldingen.map((m: any) => {
                  const typeLabel = m.type === "dag_overschrijding" ? "Dag > 8u" : m.type === "week_overschrijding" ? "Week > 40u" : "Meer dan ingepland";
                  return (
                    <div key={m.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--bg-surface-2)" }}>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "var(--warn-dot)" }} />
                        <div>
                          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{m.full_name}</p>
                          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            {format(new Date(m.datum), "d MMM", { locale: nl })} · {typeLabel}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold" style={{ fontFamily: "DM Mono, monospace", color: m.geboekte_uren > m.limiet_uren ? "var(--danger)" : "var(--text-primary)" }}>
                        {m.geboekte_uren}u / {m.limiet_uren}u
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Verlof requests with inline actions */}
            {verlofAanvragen.length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Verlofaanvragen</p>
                {verlofAanvragen.map(v => (
                  <div key={v.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--bg-surface-2)" }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{v.naam}</p>
                      <p className="text-[10px] capitalize" style={{ color: "var(--text-muted)" }}>{v.type} · {format(new Date(v.datum_van), "d MMM", { locale: nl })} → {format(new Date(v.datum_tot), "d MMM", { locale: nl })}</p>
                      {v.reden && <p className="text-[10px] italic" style={{ color: "var(--text-muted)" }}>{v.reden}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => handleVerlof(v.id, "goedgekeurd")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--success-light)", border: "1px solid var(--success-border)" }}>
                        <Check className="h-4 w-4" style={{ color: "var(--success)" }} />
                      </button>
                      <button onClick={() => handleVerlof(v.id, "afgekeurd")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--danger-light)", border: "1px solid var(--danger-border)" }}>
                        <X className="h-4 w-4" style={{ color: "var(--danger)" }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Active projects with marge */}
            {projectsWithMarge.length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                    <TrendingUp className="h-3.5 w-3.5" /> Projecten marge
                  </p>
                  <button onClick={() => navigate("/projecten")} className="text-[11px] font-semibold flex items-center gap-0.5" style={{ color: "var(--accent)" }}>
                    Alle <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
                {projectsWithMarge.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--bg-surface-2)" }}>
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

            {/* Contracts needing attention */}
            <ContractAttentionSection navigate={navigate} />

            {/* Expiring certs */}
            {expiringCerts.length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                  <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--warn-dot)" }} />
                  Certificaten verlopen binnenkort
                </p>
                {expiringCerts.map(c => {
                  const expired = new Date(c.vervaldatum) < new Date();
                  return (
                    <div key={c.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--bg-surface-2)" }}>
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
              <div className="text-center py-10 rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
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

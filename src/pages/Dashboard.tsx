import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { format, startOfISOWeek, addDays } from "date-fns";
import { nl } from "date-fns/locale";
import { Check, X, ChevronRight, AlertTriangle, Shield, Clock, FolderOpen, Hourglass, CheckCircle, Users, TrendingUp, CalendarDays, MapPin, Layers, FileSignature, UserCheck, Receipt } from "lucide-react";
import { volledigAdres } from "@/lib/utils";
import { HeaderLogo } from "@/components/HeaderLogo";
import { MobileHeader } from "@/components/MobileHeader";
import { useNavBadges } from "@/hooks/useNavBadges";
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
    <div className="rounded-2xl p-4 space-y-2" style={{ background: "#ffffff", border: "1px solid #e5e7eb" }}>
      <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "#6b7280" }}>
        <FileSignature className="h-3.5 w-3.5" /> Contracten die aandacht vragen
      </p>
      {correcties.map(c => (
        <div key={c.id} className="flex items-center gap-2.5 p-2.5 rounded-xl" style={{ background: "var(--app-navy)", border: "1px solid rgba(255,113,108,0.3)" }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: "rgba(255,113,108,0.1)", color: "#dc2626" }}>⚠️</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: "#1f2937" }}>{c.ot_naam || "Opdrachtnemer"}</p>
            <p className="text-[10px] font-mono" style={{ color: "#6b7280" }}>{c.contract_nummer}</p>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0" style={{ background: "rgba(255,113,108,0.1)", color: "#dc2626", border: "1px solid rgba(255,113,108,0.3)" }}>Correctie gevraagd</span>
          <button onClick={() => navigate("/kandidaten")} className="text-xs font-medium shrink-0" style={{ color: "#10b981" }}>Bekijken</button>
        </div>
      ))}
      {wachtend.map(c => (
        <div key={c.id} className="flex items-center gap-2.5 p-2.5 rounded-xl" style={{ background: "var(--app-navy)", border: "1px solid #e5e7eb" }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: "rgba(254,179,0,0.1)", color: "#d97706" }}>⏳</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: "#1f2937" }}>{c.ot_naam || "Opdrachtnemer"}</p>
            <p className="text-[10px] font-mono" style={{ color: "#6b7280" }}>{c.contract_nummer}</p>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0" style={{ background: "rgba(254,179,0,0.1)", color: "#d97706", border: "1px solid rgba(254,179,0,0.3)" }}>Wacht op handtekening</span>
          <button onClick={() => navigate("/kandidaten")} className="text-xs font-medium shrink-0" style={{ color: "#10b981" }}>Ondertekenen</button>
        </div>
      ))}
      {verlopen.map(c => {
        const days = c.einddatum ? Math.ceil((new Date(c.einddatum).getTime() - Date.now()) / 86400000) : 0;
        return (
          <div key={c.id} className="flex items-center gap-2.5 p-2.5 rounded-xl" style={{ background: "var(--app-navy)", border: "1px solid #e5e7eb" }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: days < 0 ? "rgba(255,113,108,0.1)" : "rgba(254,179,0,0.1)", color: days < 0 ? "#dc2626" : "#d97706" }}>⏰</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: "#1f2937" }}>{c.contract_nummer}</p>
              <p className="text-[10px]" style={{ color: "#6b7280" }}>Verloopt {formatDatum(c.einddatum)}</p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0" style={{ background: days < 0 ? "rgba(255,113,108,0.1)" : "rgba(254,179,0,0.1)", color: days < 0 ? "#dc2626" : "#d97706" }}>{days < 0 ? "Verlopen" : `${days}d`}</span>
          </div>
        );
      })}
    </div>
  );
}

function NieuweMedewerkersSection({ navigate }: { navigate: (p: string) => void }) {
  const [medewerkers, setMedewerkers] = useState<any[]>([]);

  const fetchNieuw = useCallback(() => {
    supabase.from("profiles").select("id, full_name, activated_at")
      .eq("account_status", "onboarding").eq("onboarding_voltooid", true)
      .order("activated_at", { ascending: false }).limit(10)
      .then(({ data }) => setMedewerkers(data || []));
  }, []);

  useEffect(() => { fetchNieuw(); }, [fetchNieuw]);

  // Realtime: herlaad als een profiel wijzigt
  useEffect(() => {
    const id = crypto.randomUUID();
    const channel = supabase.channel('dash-nieuwe-mw-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => fetchNieuw())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchNieuw]);

  if (medewerkers.length === 0) return null;

  return (
    <div className="rounded-2xl p-4 space-y-2" style={{ background: "#ffffff", border: "1px solid #e5e7eb" }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "#6b7280" }}>
          <UserCheck className="h-3.5 w-3.5" /> Nieuwe medewerkers
        </p>
        <button onClick={() => navigate("/medewerkers")} className="text-[11px] font-semibold flex items-center gap-0.5" style={{ color: "#10b981" }}>
          Alle <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      {medewerkers.map(m => (
        <div key={m.id} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #ffffff" }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "#10b981", color: "#fff" }}>
              {m.full_name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: "#1f2937" }}>{m.full_name}</p>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#ecfdf5", color: "#10b981", border: "1px solid #a7f3d0" }}>Klaar voor verificatie</span>
            </div>
          </div>
          <button onClick={() => navigate("/medewerkers")} className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold" style={{ background: "#ecfdf5", color: "#10b981", border: "1px solid #a7f3d0" }}>
            Verifiëren →
          </button>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { isManager, user } = useAuth();
  const { profile } = useProfile();
  const { badges } = useNavBadges();
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
  const zonderOrder = dashboardData?.zonderOrder ?? [];

  const [afkeurReden, setAfkeurReden] = useState("");
  const [afkeurId, setAfkeurId] = useState<string | null>(null);

  const refetchDashboard = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
  }, [queryClient]);

  // Realtime subscriptions
  useEffect(() => {
    if (!user) return;
    const id = crypto.randomUUID();
    const kanalen = [
      supabase.channel('dash-ub-' + id).on('postgres_changes', { event: '*', schema: 'public', table: 'uren_boekingen' }, refetchDashboard).subscribe(),
      supabase.channel('dash-pl-' + id).on('postgres_changes', { event: '*', schema: 'public', table: 'planning' }, refetchDashboard).subscribe(),
      supabase.channel('dash-besch-' + id).on('postgres_changes', { event: '*', schema: 'public', table: 'beschikbaarheid' }, refetchDashboard).subscribe(),
      supabase.channel('dash-cert-' + id).on('postgres_changes', { event: '*', schema: 'public', table: 'certificaten' }, refetchDashboard).subscribe(),
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

  const margeColor = (m: number) => m >= 30 ? "#10b981" : m >= 15 ? "#d97706" : "#dc2626";
  const margeBg = (m: number) => m >= 30 ? "#ecfdf5" : m >= 15 ? "rgba(254,179,0,0.1)" : "rgba(255,113,108,0.1)";

  if (!isManager) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-navy)" }}><p style={{ color: "#6b7280" }}>Alleen managers hebben toegang.</p></div>;
  }

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Goedemorgen";
    if (h < 18) return "Goedemiddag";
    return "Goedenavond";
  })();

  const userName =
    profile?.full_name?.split(" ")[0]
    || user?.user_metadata?.full_name
      ?.split(" ")[0]
    || "Manager";

  return (
    <PageShell>
      <div style={{ background: "var(--app-navy)", minHeight: "100dvh", paddingBottom: 120 }}>
        <MobileHeader initials={profile?.full_name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?'} />

        <main style={{ padding: "24px 20px" }}>
          {loading ? (
            <DashboardSkeleton />
          ) : (
            <>
              {/* GREETING */}
              <section style={{ marginBottom: 24 }}>
                <h1 style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 28, color: "#1f2937", marginBottom: 4 }}>
                  {greeting}, {userName}
                </h1>
                <p style={{ fontSize: 14, color: "#6b7280", fontFamily: "Inter" }}>
                  {format(new Date(), "EEEE d MMMM yyyy", { locale: nl })}
                </p>
              </section>

              {/* ALERT CARD — pending approvals */}
              {pendingCount > 0 && (
                <div onClick={() => navigate("/goedkeuring")} style={{
                  background: "rgba(254,179,0,0.08)", border: "1px solid rgba(254,179,0,0.3)",
                  borderRadius: 16, padding: "16px 20px", marginBottom: 24,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  cursor: "pointer", boxShadow: "0 4px 20px rgba(254,179,0,0.1)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#d97706", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#92400e", fontVariationSettings: "'FILL' 1" }}>priority_high</span>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "Inter", color: "#d97706" }}>
                      {pendingCount} weekstaten wachten op goedkeuring
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#d97706", borderRadius: 9999, padding: "6px 14px" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#92400e", fontFamily: "Inter" }}>Bekijk</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#92400e" }}>arrow_forward</span>
                  </div>
                </div>
              )}

              {/* STATS ROW — 3 cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
                {[
                  { label: "Monteurs", value: teamCount ?? "—", color: "#10b981", icon: "engineering" },
                  { label: "Openstaand", value: pendingCount ?? "—", color: "#d97706", icon: "pending_actions" },
                  { label: "Deze week", value: weekHours ? `${weekHours}u` : "—", color: "#10b981", icon: "timer" },
                ].map((stat) => (
                  <div key={stat.label} style={{ background: "#ffffff", borderRadius: 16, padding: "16px 12px", borderBottom: `2px solid ${stat.color}40` }}>
                    <p style={{ fontSize: 9, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.1em", color: "#6b7280", marginBottom: 6 }}>
                      {stat.label}
                    </p>
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 24, color: stat.color }}>{stat.value}</span>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: `${stat.color}80` }}>{stat.icon}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* VANDAAG INGEPLAND */}
              {todayPlanning.length > 0 && (
                <section style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.2em", color: "#10b981" }}>
                      VANDAAG INGEPLAND
                    </span>
                    <button onClick={() => navigate("/manager-planning")} style={{ background: "none", border: "none", cursor: "pointer" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#6b7280" }}>arrow_forward</span>
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {todayPlanning.map((m: any) => {
                      const hasBoeking = !!m.boeking;
                      const chipColor = hasBoeking ? "#10b981" : "#d97706";
                      const chipBg = hasBoeking ? "#ecfdf5" : "rgba(254,179,0,0.1)";
                      const chipLabel = hasBoeking ? `${m.boeking.uren}u GEBOEKT` : "GEEN UREN";
                      const initials = m.naam?.split(" ").map((n: string) => n[0]).slice(0, 2).join("") || "XX";
                      return (
                        <div key={m.id} style={{ background: "#ffffff", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter", fontWeight: 700, fontSize: 11, color: "#1f2937" }}>
                              {initials}
                            </div>
                            <div>
                              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "Inter", color: "#1f2937", display: "block" }}>{m.naam}</span>
                              <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "Inter" }}>{m.project} · {m.starttijd}–{m.eindtijd}</span>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ padding: "4px 10px", borderRadius: 9999, background: chipBg, border: `1px solid ${chipColor}50` }}>
                              <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", color: chipColor }}>{chipLabel}</span>
                            </div>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#6b7280" }}>chevron_right</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* OPENSTAANDE GOEDKEURINGEN */}
              {pendingEntries.length > 0 && (
                <section style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.2em", color: "#6b7280" }}>
                      GOEDKEURINGEN ({pendingCount})
                    </span>
                    <button onClick={() => navigate("/goedkeuring")} style={{ background: "none", border: "none", cursor: "pointer" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#6b7280" }}>arrow_forward</span>
                    </button>
                  </div>
                  <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden" }}>
                    {pendingEntries.slice(0, 5).map((e: any, i: number) => (
                      <div key={e.id} style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "14px 16px",
                        borderBottom: i < Math.min(pendingEntries.length, 5) - 1 ? "1px solid #f3f4f6" : "none",
                      }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#d97706", marginTop: 1, fontVariationSettings: "'FILL' 1" }}>schedule</span>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: "#1f2937", fontFamily: "Inter", marginBottom: 2 }}>{e.full_name}</p>
                            <p style={{ fontSize: 11, color: "#6b7280", fontFamily: "Inter" }}>
                              {e.project_nummer} · {e.uren}u · {format(new Date(e.datum), "d MMM", { locale: nl })}
                            </p>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button onClick={() => handleApprove(e.id)} style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "#ecfdf5", border: "1px solid #a7f3d0", cursor: "pointer" }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#10b981", fontVariationSettings: "'FILL' 1" }}>check</span>
                          </button>
                          <button onClick={() => { setAfkeurId(e.id); setAfkeurReden(""); }} style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,113,108,0.1)", border: "1px solid rgba(255,113,108,0.3)", cursor: "pointer" }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#dc2626", fontVariationSettings: "'FILL' 1" }}>close</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {afkeurId && (
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <input value={afkeurReden} onChange={ev => setAfkeurReden(ev.target.value)} placeholder="Reden voor afkeuring..." autoFocus onKeyDown={ev => ev.key === "Enter" && handleReject()}
                        style={{ flex: 1, padding: "10px 14px", borderRadius: 12, fontSize: 13, background: "#ffffff", border: "1px solid rgba(255,113,108,0.3)", color: "#1f2937", fontFamily: "Inter", outline: "none" }}
                      />
                      <button onClick={handleReject} style={{ padding: "10px 16px", borderRadius: 12, fontSize: 13, fontWeight: 700, color: "#fff", background: "#dc2626", border: "none", cursor: "pointer", fontFamily: "Inter" }}>Afkeuren</button>
                      <button onClick={() => setAfkeurId(null)} style={{ padding: "10px", borderRadius: 12, fontSize: 16, color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}>×</button>
                    </div>
                  )}
                </section>
              )}

              {/* VERLOFAANVRAGEN */}
              {verlofAanvragen.length > 0 && (
                <section style={{ marginBottom: 24 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.2em", color: "#6b7280", display: "block", marginBottom: 12 }}>
                    VERLOFAANVRAGEN
                  </span>
                  <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden" }}>
                    {verlofAanvragen.map((v: any, i: number) => (
                      <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: i < verlofAanvragen.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#1f2937", fontFamily: "Inter", marginBottom: 2 }}>{v.naam}</p>
                          <p style={{ fontSize: 11, color: "#6b7280", fontFamily: "Inter", textTransform: "capitalize" }}>
                            {v.type} · {format(new Date(v.datum_van), "d MMM", { locale: nl })} → {format(new Date(v.datum_tot), "d MMM", { locale: nl })}
                          </p>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => handleVerlof(v.id, "goedgekeurd")} style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "#ecfdf5", border: "1px solid #a7f3d0", cursor: "pointer" }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#10b981", fontVariationSettings: "'FILL' 1" }}>check</span>
                          </button>
                          <button onClick={() => handleVerlof(v.id, "afgekeurd")} style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,113,108,0.1)", border: "1px solid rgba(255,113,108,0.3)", cursor: "pointer" }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#dc2626", fontVariationSettings: "'FILL' 1" }}>close</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* OVERUREN */}
              {overurenMeldingen.length > 0 && (
                <section style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.2em", color: "#dc2626" }}>
                      OVERUREN ({overurenCount})
                    </span>
                    <button onClick={() => navigate("/overuren")} style={{ background: "none", border: "none", cursor: "pointer" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#6b7280" }}>arrow_forward</span>
                    </button>
                  </div>
                  <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden" }}>
                    {overurenMeldingen.map((m: any, i: number) => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: i < overurenMeldingen.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#dc2626", marginTop: 1, fontVariationSettings: "'FILL' 1" }}>warning</span>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: "#1f2937", fontFamily: "Inter", marginBottom: 2 }}>{m.full_name}</p>
                            <p style={{ fontSize: 11, color: "#6b7280", fontFamily: "Inter" }}>
                              {format(new Date(m.datum), "d MMM", { locale: nl })} · {m.geboekte_uren}u / {m.limiet_uren}u
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* PROJECTEN MARGE */}
              {projectsWithMarge.length > 0 && (
                <section style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.2em", color: "#6b7280" }}>
                      PROJECTEN MARGE
                    </span>
                    <button onClick={() => navigate("/projecten")} style={{ background: "none", border: "none", cursor: "pointer" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#6b7280" }}>arrow_forward</span>
                    </button>
                  </div>
                  <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden" }}>
                    {projectsWithMarge.map((p: any, i: number) => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: i < projectsWithMarge.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#1f2937", fontFamily: "Inter", marginBottom: 2 }}>{p.naam}</p>
                          <p style={{ fontSize: 11, color: "#6b7280", fontFamily: "Inter" }}>
                            Omzet {euro(p.omzet)} · Kosten {euro(p.kosten)}
                          </p>
                        </div>
                        <div style={{
                          padding: "4px 12px", borderRadius: 9999,
                          background: p.marge >= 30 ? "#ecfdf5" : p.marge >= 15 ? "rgba(254,179,0,0.1)" : "rgba(255,113,108,0.1)",
                          border: `1px solid ${p.marge >= 30 ? "#a7f3d0" : p.marge >= 15 ? "rgba(254,179,0,0.3)" : "rgba(255,113,108,0.3)"}`,
                        }}>
                          <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "Inter", color: p.marge >= 30 ? "#10b981" : p.marge >= 15 ? "#d97706" : "#dc2626" }}>
                            {p.marge.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ZONDER ORDER */}
              {zonderOrder.length > 0 && (
                <section style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.2em", color: "#6b7280" }}>
                      ZONDER INKOOPORDER
                    </span>
                    <button onClick={() => navigate("/inkooporders")} style={{ background: "none", border: "none", cursor: "pointer" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#6b7280" }}>arrow_forward</span>
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {zonderOrder.map((m) => {
                      const initials = m.naam.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase();
                      return (
                        <div key={m.id} onClick={() => navigate(`/inkooporders?medewerker=${m.id}`)} style={{ background: "#ffffff", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter", fontWeight: 700, fontSize: 11, color: "#1f2937" }}>{initials}</div>
                            <div>
                              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "Inter", color: "#1f2937", display: "block" }}>{m.naam}</span>
                              <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "Inter" }}>{m.aantal} boekingen · {m.uren}u</span>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#10b981", borderRadius: 9999, padding: "6px 14px" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#047857", fontFamily: "Inter" }}>Order</span>
                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#047857" }}>arrow_forward</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* CONTRACT ATTENTION */}
              <ContractAttentionSection navigate={navigate} />
              <NieuweMedewerkersSection navigate={navigate} />

              {/* CERTIFICATEN */}
              {expiringCerts.length > 0 && (
                <section style={{ marginBottom: 24 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.2em", color: "#d97706", display: "block", marginBottom: 12 }}>
                    CERTIFICATEN VERLOPEN
                  </span>
                  <div style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden" }}>
                    {expiringCerts.map((c: any, i: number) => {
                      const expired = new Date(c.vervaldatum) < new Date();
                      return (
                        <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: i < expiringCerts.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: expired ? "#dc2626" : "#d97706", marginTop: 1, fontVariationSettings: "'FILL' 1" }}>verified_user</span>
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 700, color: "#1f2937", fontFamily: "Inter", marginBottom: 2 }}>{c.medewerker}</p>
                              <p style={{ fontSize: 11, color: "#6b7280", fontFamily: "Inter" }}>{c.naam} ({c.type})</p>
                            </div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: expired ? "#dc2626" : "#d97706", fontFamily: "Inter" }}>
                            {format(new Date(c.vervaldatum), "d MMM yyyy", { locale: nl })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* EMPTY STATE */}
              {pendingEntries.length === 0 && verlofAanvragen.length === 0 && todayPlanning.length === 0 && projectsWithMarge.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 20px", background: "#ffffff", borderRadius: 16 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 40, color: "#10b981", marginBottom: 8, display: "block", fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#1f2937", fontFamily: "Inter", marginBottom: 4 }}>Alles bijgewerkt</p>
                  <p style={{ fontSize: 13, color: "#6b7280", fontFamily: "Inter" }}>Geen openstaande items</p>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </PageShell>
  );
}

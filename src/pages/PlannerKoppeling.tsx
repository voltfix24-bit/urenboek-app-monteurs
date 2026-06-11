import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Link2, Send, Eye, RefreshCcw, XCircle, Plug, Info, Search, HelpCircle, Ban, Settings2 } from "lucide-react";
import { PLANNER_EXCLUSION_REASONS, PLANNER_EXCLUSION_LABEL, exclusionLabel, type PlannerExclusionReason } from "@/lib/plannerExclusion";

type AnalyseStatus = "exact" | "waarschijnlijk" | "conflict" | "geen_match" | "uitgesloten";
interface Afwijking { veld: string; urenapp: unknown; planner: unknown }
interface AnalyseRow {
  urenapp: any;
  status: AnalyseStatus;
  reden: string;
  kandidaat: any | null;
  bestaande_koppeling_urenapp: string | null;
  bestaande_koppeling_planner: string | null;
  afwijkingen: Afwijking[];
}
interface AnalyseResponse {
  success: boolean;
  projecten: { aantallen: Record<AnalyseStatus | "totaal", number>; resultaten: AnalyseRow[] };
  monteurs: { aantallen: Record<AnalyseStatus | "totaal", number>; resultaten: AnalyseRow[] };
  planner_aantallen: { projecten: number; monteurs: number };
}
const STATUS_LABEL: Record<AnalyseStatus, string> = {
  exact: "Exact",
  waarschijnlijk: "Waarschijnlijk",
  conflict: "Conflict",
  geen_match: "Geen match",
  uitgesloten: "Uitgesloten",
};
const STATUS_COLOR: Record<AnalyseStatus, { bg: string; fg: string }> = {
  exact:         { bg: "var(--accent)",      fg: "white" },
  waarschijnlijk:{ bg: "var(--warn-light)",  fg: "var(--warn-text)" },
  conflict:      { bg: "#fee2e2",            fg: "#b91c1c" },
  geen_match:    { bg: "var(--bg-surface-2)",fg: "var(--text-muted)" },
  uitgesloten:   { bg: "#e0e7ff",            fg: "#3730a3" },
};

interface ResultaatItem {
  kind: "project" | "monteur";
  urenapp_id: string;
  status: "gesynchroniseerd" | "overgeslagen" | "mislukt";
  planner_id?: string;
  action?: "created" | "updated";
  reden?: string;
}
interface SyncResponse {
  success: boolean;
  dry_run: boolean;
  aantallen: { gevonden: number; gesynchroniseerd: number; overgeslagen: number; mislukt: number };
  resultaten: ResultaatItem[];
  fouten: { urenapp_id: string; kind: string; reden: string }[];
}

interface ProjectRow {
  id: string;
  nummer: string;
  naam: string;
  projectjaar: number | null;
  planner_project_id: string | null;
  active: boolean;
  planner_sync_enabled: boolean;
  planner_sync_exclusion_reason: string | null;
}
interface MonteurRow {
  id: string;
  full_name: string;
  account_status: string;
  is_onderaannemer: boolean;
  planner_monteur_id: string | null;
  roles: string[];
  planbaar: boolean;
}
interface Stats {
  projectenTotaal: number;
  projectenZonderJaar: number;
  projectenGekoppeld: number;
  projectenUitgesloten: number;
  monteursPlanbaar: number;
  monteursGekoppeld: number;
}

type SelectieMode = null | { kind: "project"; row: ProjectRow } | { kind: "monteur"; row: MonteurRow } | { kind: "bulk"; actie: "projecten" | "monteurs" };

export default function PlannerKoppeling() {
  const { isManager } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [projecten, setProjecten] = useState<ProjectRow[]>([]);
  const [monteurs, setMonteurs] = useState<MonteurRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "dry" | "single" | "projecten" | "monteurs">(null);
  const [response, setResponse] = useState<SyncResponse | null>(null);
  const [naamMap, setNaamMap] = useState<Map<string, string>>(new Map());
  const [confirm, setConfirm] = useState<SelectieMode>(null);
  const [tab, setTab] = useState<"projecten" | "monteurs">("projecten");
  const [filter, setFilter] = useState("");

  // Analyse (read-only koppelwizard fase 1)
  const [analyse, setAnalyse] = useState<AnalyseResponse | null>(null);
  const [analyseBusy, setAnalyseBusy] = useState(false);
  const [analyseTab, setAnalyseTab] = useState<"projecten" | "monteurs">("projecten");
  const [analyseStatusFilter, setAnalyseStatusFilter] = useState<AnalyseStatus | "alle">("alle");
  const [analyseQuery, setAnalyseQuery] = useState("");

  async function runAnalyse() {
    setAnalyseBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyse-planner-matches", { body: {} });
      if (error) throw error;
      setAnalyse(data as AnalyseResponse);
      toast.success("Analyse klaar");
    } catch (e: any) {
      toast.error(e?.message ?? "Analyse mislukt");
    } finally {
      setAnalyseBusy(false);
    }
  }

  async function loadStats() {
    setLoading(true);
    const [{ data: projs }, { data: profs }, { data: rollen }] = await Promise.all([
      supabase.from("projects").select("id, nummer, naam, projectjaar, planner_project_id, active").order("nummer"),
      supabase.from("profiles").select("id, user_id, full_name, account_status, is_onderaannemer, planner_monteur_id").order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const rolesByUser = new Map<string, string[]>();
    (rollen ?? []).forEach((r: any) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });
    const naam = new Map<string, string>();
    (projs ?? []).forEach((p: any) => naam.set(p.id, `${p.nummer} — ${p.naam}`));
    (profs ?? []).forEach((p: any) => naam.set(p.id, p.full_name));
    setNaamMap(naam);

    const monteursList: MonteurRow[] = (profs ?? []).map((p: any) => {
      const roles = rolesByUser.get(p.user_id) ?? [];
      const planbaar = !p.is_onderaannemer && !roles.includes("manager") && (roles.includes("monteur") || roles.includes("schakelmonteur"));
      return {
        id: p.id,
        full_name: p.full_name,
        account_status: p.account_status,
        is_onderaannemer: p.is_onderaannemer,
        planner_monteur_id: p.planner_monteur_id,
        roles,
        planbaar,
      };
    });

    setProjecten((projs ?? []) as ProjectRow[]);
    setMonteurs(monteursList);
    setStats({
      projectenTotaal: projs?.length ?? 0,
      projectenZonderJaar: (projs ?? []).filter((p: any) => p.projectjaar == null).length,
      projectenGekoppeld: (projs ?? []).filter((p: any) => p.planner_project_id != null).length,
      monteursPlanbaar: monteursList.filter((m) => m.planbaar).length,
      monteursGekoppeld: monteursList.filter((m) => m.planbaar && m.planner_monteur_id != null).length,
    });
    setLoading(false);
  }

  useEffect(() => { loadStats(); }, []);

  async function runBulk(actie: "projecten" | "monteurs" | "alles", dry_run: boolean) {
    setBusy(dry_run ? "dry" : actie === "monteurs" ? "monteurs" : "projecten");
    setResponse(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-masterdata-to-planner", { body: { actie, dry_run } });
      if (error) throw error;
      setResponse(data as SyncResponse);
      toast.success(dry_run ? "Dry-run klaar" : "Synchronisatie klaar");
      if (!dry_run) loadStats();
    } catch (e: any) {
      toast.error(e?.message ?? "Synchronisatie mislukt");
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  async function runSingle(kind: "project" | "monteur", id: string) {
    setBusy("single");
    setResponse(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-masterdata-to-planner", {
        body: { actie: kind === "project" ? "projecten" : "monteurs", ids: [id], dry_run: false },
      });
      if (error) throw error;
      setResponse(data as SyncResponse);
      toast.success("Synchronisatie klaar");
      loadStats();
    } catch (e: any) {
      toast.error(e?.message ?? "Synchronisatie mislukt");
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  const filteredProjecten = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return projecten.filter(p => !q || p.nummer.toLowerCase().includes(q) || p.naam.toLowerCase().includes(q));
  }, [projecten, filter]);
  const filteredMonteurs = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return monteurs.filter(m => !q || m.full_name.toLowerCase().includes(q));
  }, [monteurs, filter]);

  if (!isManager) {
    return <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>Alleen voor managers.</div>;
  }

  const card = { background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)", borderRadius: 12, padding: 16 };
  const statBox = (label: string, value: number | string, warn = false) => (
    <div style={card}>
      <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: warn ? "var(--warn-text)" : "var(--text-primary)", fontFamily: "DM Mono, monospace" }}>{value}</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex items-center gap-3">
        <Link2 className="h-6 w-6" style={{ color: "var(--accent)" }} />
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "Hanken Grotesk" }}>Planner-koppeling</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Handmatige verzending van masterdata naar TerreVolt Planner.</p>
        </div>
        <button onClick={loadStats} className="ml-auto p-2 rounded-lg" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)" }} title="Ververs">
          <RefreshCcw className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
        </button>
      </header>

      {loading || !stats ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--accent)" }} /></div>
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {statBox("Projecten totaal", stats.projectenTotaal)}
            {statBox("Zonder projectjaar", stats.projectenZonderJaar, stats.projectenZonderJaar > 0)}
            {statBox("Gekoppeld aan Planner", `${stats.projectenGekoppeld}/${stats.projectenTotaal}`)}
            {statBox("Planbare monteurs", stats.monteursPlanbaar)}
            {statBox("Monteurs gekoppeld", `${stats.monteursGekoppeld}/${stats.monteursPlanbaar}`)}
            <div style={card}>
              <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>Endpoint</p>
              <p className="text-xs mt-1 break-all" style={{ color: "var(--text-secondary)", fontFamily: "DM Mono, monospace" }}>nafldfgbhjpswwaqfjwr…/receive-urenapp-masterdata</p>
              <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Status: alleen bij dry-run testbaar</p>
            </div>
          </section>

          {/* Verbindingscontrole — read-only rapportage, geen dummy */}
          <section style={card} className="space-y-2">
            <div className="flex items-center gap-2">
              <Plug className="h-4 w-4" style={{ color: "var(--accent)" }} />
              <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Verbindingscontrole</h2>
            </div>
            <div className="flex items-start gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <p>
                Het Planner-endpoint <code style={{ fontFamily: "DM Mono, monospace" }}>receive-urenapp-masterdata</code> heeft <strong>geen ping- of health-route</strong>. Elke geldige aanroep verwerkt direct een project of monteur (upsert). Een dummy-record sturen om verbinding te toetsen zou een testitem in Planner aanmaken; dat doen we bewust niet.
              </p>
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Gebruik in plaats daarvan <strong>Controleren (dry-run)</strong> — die voert de hele pijplijn lokaal door zonder daadwerkelijk te versturen, of synchroniseer één geselecteerd item om de echte verbinding te valideren.
            </p>
          </section>

          {stats.projectenZonderJaar > 0 && (
            <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
              <AlertTriangle className="h-4 w-4 mt-0.5" style={{ color: "var(--warn-text)" }} />
              <p className="text-xs" style={{ color: "var(--warn-text)" }}>
                Er {stats.projectenZonderJaar === 1 ? "is" : "zijn"} <strong>{stats.projectenZonderJaar}</strong> project{stats.projectenZonderJaar === 1 ? "" : "en"} zonder projectjaar. Deze worden overgeslagen bij synchronisatie. Vul het projectjaar in via Projecten.
              </p>
            </div>
          )}

          <section className="flex flex-wrap gap-2">
            <button
              disabled={busy !== null}
              onClick={() => runBulk("alles", true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)", opacity: busy ? 0.5 : 1 }}
            >
              {busy === "dry" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Controleren (dry-run)
            </button>
            <button
              disabled={busy !== null}
              onClick={() => setConfirm({ kind: "bulk", actie: "projecten" })}
              className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 text-white"
              style={{ background: "var(--accent)", opacity: busy ? 0.5 : 1 }}
            >
              {busy === "projecten" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Alle projecten synchroniseren
            </button>
            <button
              disabled={busy !== null}
              onClick={() => setConfirm({ kind: "bulk", actie: "monteurs" })}
              className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 text-white"
              style={{ background: "var(--accent)", opacity: busy ? 0.5 : 1 }}
            >
              {busy === "monteurs" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Alle monteurs synchroniseren
            </button>
          </section>

          {/* Per-item selectie */}
          <section style={card} className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold mr-2" style={{ color: "var(--text-primary)" }}>Per item synchroniseren</h2>
              <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--planning-border-soft)" }}>
                <button onClick={() => setTab("projecten")} className="px-3 py-1 text-xs font-semibold" style={{ background: tab === "projecten" ? "var(--accent)" : "var(--bg-surface-2)", color: tab === "projecten" ? "white" : "var(--text-primary)" }}>Projecten ({projecten.length})</button>
                <button onClick={() => setTab("monteurs")} className="px-3 py-1 text-xs font-semibold" style={{ background: tab === "monteurs" ? "var(--accent)" : "var(--bg-surface-2)", color: tab === "monteurs" ? "white" : "var(--text-primary)" }}>Monteurs ({monteurs.filter(m => m.planbaar).length})</button>
              </div>
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter…"
                className="ml-auto px-3 py-1 text-xs rounded-lg"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)", minWidth: 180 }}
              />
            </div>

            <ul className="space-y-1 max-h-96 overflow-y-auto">
              {tab === "projecten" && filteredProjecten.map(p => {
                const jaarOk = p.projectjaar != null;
                const gekoppeld = p.planner_project_id != null;
                return (
                  <li key={p.id} className="flex items-center gap-2 text-xs py-2 px-2 rounded" style={{ background: "var(--bg-surface-2)" }}>
                    <span style={{ fontFamily: "DM Mono, monospace", color: "var(--text-muted)", minWidth: 70 }}>{p.nummer}</span>
                    <span className="flex-1 truncate" style={{ color: "var(--text-primary)" }}>{p.naam}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: jaarOk ? "var(--bg-surface)" : "var(--warn-light)", color: jaarOk ? "var(--text-muted)" : "var(--warn-text)" }}>
                      {jaarOk ? `Jaar ${p.projectjaar}` : "Jaar ontbreekt"}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: gekoppeld ? "var(--accent)" : "var(--bg-surface)", color: gekoppeld ? "white" : "var(--text-muted)" }}>
                      {gekoppeld ? "Gekoppeld" : "Niet gekoppeld"}
                    </span>
                    <button
                      disabled={busy !== null || !jaarOk}
                      onClick={() => setConfirm({ kind: "project", row: p })}
                      className="px-2 py-1 rounded text-[11px] font-semibold"
                      style={{ background: jaarOk ? "var(--accent)" : "var(--bg-surface)", color: jaarOk ? "white" : "var(--text-muted)", opacity: busy || !jaarOk ? 0.5 : 1 }}
                      title={jaarOk ? "Synchroniseer dit project" : "Vul eerst het projectjaar in"}
                    >
                      Sync
                    </button>
                  </li>
                );
              })}
              {tab === "monteurs" && filteredMonteurs.map(m => {
                const gekoppeld = m.planner_monteur_id != null;
                return (
                  <li key={m.id} className="flex items-center gap-2 text-xs py-2 px-2 rounded" style={{ background: "var(--bg-surface-2)" }}>
                    <span className="flex-1 truncate" style={{ color: "var(--text-primary)" }}>{m.full_name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: "var(--bg-surface)", color: "var(--text-muted)" }}>
                      {m.roles.join(", ") || "geen rol"}
                    </span>
                    {!m.planbaar && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: "var(--warn-light)", color: "var(--warn-text)" }}>
                        {m.is_onderaannemer ? "Onderaannemer" : m.roles.includes("manager") ? "Manager" : "Niet planbaar"}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: gekoppeld ? "var(--accent)" : "var(--bg-surface)", color: gekoppeld ? "white" : "var(--text-muted)" }}>
                      {gekoppeld ? "Gekoppeld" : "Niet gekoppeld"}
                    </span>
                    <button
                      disabled={busy !== null || !m.planbaar}
                      onClick={() => setConfirm({ kind: "monteur", row: m })}
                      className="px-2 py-1 rounded text-[11px] font-semibold"
                      style={{ background: m.planbaar ? "var(--accent)" : "var(--bg-surface)", color: m.planbaar ? "white" : "var(--text-muted)", opacity: busy || !m.planbaar ? 0.5 : 1 }}
                      title={m.planbaar ? "Synchroniseer deze monteur" : "Niet planbaar"}
                    >
                      Sync
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Bestaande gegevens koppelen — fase 1 read-only */}
          <section style={card} className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Search className="h-4 w-4" style={{ color: "var(--accent)" }} />
              <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Bestaande gegevens koppelen</h2>
              <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>read-only — fase 1</span>
              <button
                onClick={runAnalyse}
                disabled={analyseBusy}
                className="ml-auto px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 text-white"
                style={{ background: "var(--accent)", opacity: analyseBusy ? 0.5 : 1 }}
              >
                {analyseBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Analyseer bestaande Planner-data
              </button>
            </div>
            <p className="text-xs flex items-start gap-1.5" style={{ color: "var(--text-muted)" }}>
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              Deze analyse vergelijkt urenapp-records met Planner-records. Er worden geen koppelingen gemaakt, geen records gewijzigd en geen secrets getoond.
            </p>

            {analyse && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                  {(["exact","waarschijnlijk","conflict","geen_match"] as AnalyseStatus[]).map(s => {
                    const c = (analyseTab === "projecten" ? analyse.projecten : analyse.monteurs).aantallen[s] ?? 0;
                    return (
                      <button key={s} onClick={() => setAnalyseStatusFilter(analyseStatusFilter === s ? "alle" : s)}
                        className="px-2 py-2 rounded-lg text-left"
                        style={{
                          background: analyseStatusFilter === s ? STATUS_COLOR[s].bg : "var(--bg-surface-2)",
                          color: analyseStatusFilter === s ? STATUS_COLOR[s].fg : "var(--text-primary)",
                          border: "1px solid var(--planning-border-soft)",
                        }}>
                        <div className="text-[10px] uppercase tracking-wider opacity-80">{STATUS_LABEL[s]}</div>
                        <div className="text-lg font-bold" style={{ fontFamily: "DM Mono, monospace" }}>{c}</div>
                      </button>
                    );
                  })}
                  <div className="px-2 py-2 rounded-lg" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)" }}>
                    <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Planner totaal</div>
                    <div className="text-lg font-bold" style={{ color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }}>
                      {analyseTab === "projecten" ? analyse.planner_aantallen.projecten : analyse.planner_aantallen.monteurs}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--planning-border-soft)" }}>
                    <button onClick={() => { setAnalyseTab("projecten"); setAnalyseStatusFilter("alle"); }} className="px-3 py-1 text-xs font-semibold"
                      style={{ background: analyseTab === "projecten" ? "var(--accent)" : "var(--bg-surface-2)", color: analyseTab === "projecten" ? "white" : "var(--text-primary)" }}>
                      Projecten ({analyse.projecten.aantallen.totaal})
                    </button>
                    <button onClick={() => { setAnalyseTab("monteurs"); setAnalyseStatusFilter("alle"); }} className="px-3 py-1 text-xs font-semibold"
                      style={{ background: analyseTab === "monteurs" ? "var(--accent)" : "var(--bg-surface-2)", color: analyseTab === "monteurs" ? "white" : "var(--text-primary)" }}>
                      Monteurs ({analyse.monteurs.aantallen.totaal})
                    </button>
                  </div>
                  <input value={analyseQuery} onChange={e => setAnalyseQuery(e.target.value)} placeholder="Filter op naam of nummer…"
                    className="ml-auto px-3 py-1 text-xs rounded-lg"
                    style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)", minWidth: 200 }} />
                </div>

                <ul className="space-y-2 max-h-[480px] overflow-y-auto">
                  {(analyseTab === "projecten" ? analyse.projecten.resultaten : analyse.monteurs.resultaten)
                    .filter(r => analyseStatusFilter === "alle" || r.status === analyseStatusFilter)
                    .filter(r => {
                      const q = analyseQuery.trim().toLowerCase();
                      if (!q) return true;
                      const u = r.urenapp;
                      const c = r.kandidaat ?? {};
                      const hay = [u.naam, u.full_name, u.nummer, c.naam, c.nummer].filter(Boolean).join(" ").toLowerCase();
                      return hay.includes(q);
                    })
                    .map((r, i) => {
                      const isProj = analyseTab === "projecten";
                      const u = r.urenapp;
                      const c = r.kandidaat;
                      const col = STATUS_COLOR[r.status];
                      return (
                        <li key={i} className="p-3 rounded-lg" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)" }}>
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: col.bg, color: col.fg }}>{STATUS_LABEL[r.status]}</span>
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{r.reden}</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            <div>
                              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Urenapp</div>
                              {isProj ? (
                                <>
                                  <div style={{ color: "var(--text-primary)" }}>
                                    <span style={{ fontFamily: "DM Mono, monospace" }}>{u.nummer}</span> — {u.naam}
                                  </div>
                                  <div style={{ color: "var(--text-muted)" }}>Jaar {u.projectjaar ?? "—"} · {u.locatie ?? "—"}</div>
                                  <div style={{ color: "var(--text-muted)" }}>
                                    Koppeling: {r.bestaande_koppeling_urenapp ? <code style={{ fontFamily: "DM Mono, monospace" }}>{r.bestaande_koppeling_urenapp.slice(0,8)}…</code> : <em>geen</em>}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div style={{ color: "var(--text-primary)" }}>{u.full_name}</div>
                                  <div style={{ color: "var(--text-muted)" }}>Type: {u.type ?? "—"}</div>
                                  <div style={{ color: "var(--text-muted)" }}>
                                    Koppeling: {r.bestaande_koppeling_urenapp ? <code style={{ fontFamily: "DM Mono, monospace" }}>{r.bestaande_koppeling_urenapp.slice(0,8)}…</code> : <em>geen</em>}
                                  </div>
                                </>
                              )}
                            </div>
                            <div>
                              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Planner kandidaat</div>
                              {c ? (
                                isProj ? (
                                  <>
                                    <div style={{ color: "var(--text-primary)" }}>
                                      <span style={{ fontFamily: "DM Mono, monospace" }}>{c.nummer}</span> — {c.naam}
                                    </div>
                                    <div style={{ color: "var(--text-muted)" }}>Jaar {c.jaar ?? "—"} · {c.locatie ?? "—"}</div>
                                    <div style={{ color: "var(--text-muted)" }}>
                                      Koppeling: {r.bestaande_koppeling_planner ? <code style={{ fontFamily: "DM Mono, monospace" }}>{r.bestaande_koppeling_planner.slice(0,8)}…</code> : <em>geen</em>}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div style={{ color: "var(--text-primary)" }}>{c.naam}</div>
                                    <div style={{ color: "var(--text-muted)" }}>Type: {c.type ?? "—"} · {c.actief ? "actief" : "inactief"}</div>
                                    <div style={{ color: "var(--text-muted)" }}>
                                      Koppeling: {r.bestaande_koppeling_planner ? <code style={{ fontFamily: "DM Mono, monospace" }}>{r.bestaande_koppeling_planner.slice(0,8)}…</code> : <em>geen</em>}
                                    </div>
                                  </>
                                )
                              ) : (
                                <div style={{ color: "var(--text-muted)" }}><HelpCircle className="h-3 w-3 inline mr-1" />Geen kandidaat</div>
                              )}
                            </div>
                          </div>
                          {r.afwijkingen.length > 0 && (
                            <div className="mt-2 pt-2" style={{ borderTop: "1px dashed var(--planning-border-soft)" }}>
                              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--warn-text)" }}>Afwijkingen</div>
                              <ul className="text-[11px] space-y-0.5" style={{ color: "var(--text-muted)" }}>
                                {r.afwijkingen.map((a, j) => (
                                  <li key={j}>
                                    <strong style={{ color: "var(--text-primary)" }}>{a.veld}:</strong>{" "}
                                    urenapp <code style={{ fontFamily: "DM Mono, monospace" }}>{String(a.urenapp ?? "—")}</code>{" "}
                                    ≠ planner <code style={{ fontFamily: "DM Mono, monospace" }}>{String(a.planner ?? "—")}</code>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </>
            )}
          </section>



          {response && (
            <section style={card}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  Resultaat {response.dry_run && <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>(dry-run, niets verzonden)</span>}
                </h2>
                <div className="flex gap-2 text-xs">
                  <span style={{ color: "var(--text-muted)" }}>Gevonden: <strong>{response.aantallen.gevonden}</strong></span>
                  <span style={{ color: "var(--accent)" }}>OK: <strong>{response.aantallen.gesynchroniseerd}</strong></span>
                  <span style={{ color: "var(--warn-text)" }}>Overgeslagen: <strong>{response.aantallen.overgeslagen}</strong></span>
                  <span style={{ color: "var(--danger)" }}>Mislukt: <strong>{response.aantallen.mislukt}</strong></span>
                </div>
              </div>
              <ul className="space-y-1 max-h-96 overflow-y-auto">
                {response.resultaten.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded" style={{ background: "var(--bg-surface-2)" }}>
                    {r.status === "gesynchroniseerd" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--accent)" }} />}
                    {r.status === "overgeslagen" && <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--warn-text)" }} />}
                    {r.status === "mislukt" && <XCircle className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--danger)" }} />}
                    <span style={{ color: "var(--text-muted)", minWidth: 60 }}>{r.kind}</span>
                    <span className="truncate flex-1" style={{ color: "var(--text-primary)" }}>{naamMap.get(r.urenapp_id) ?? r.urenapp_id}</span>
                    {r.reden && <span style={{ color: "var(--text-muted)" }}>{r.reden}</span>}
                    {r.action && <span style={{ color: "var(--text-muted)" }}>{r.action}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setConfirm(null)}>
          <div className="rounded-xl p-5 max-w-sm w-full" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }} onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-base mb-3" style={{ color: "var(--text-primary)" }}>Bevestig synchronisatie</h3>

            {confirm.kind === "project" && (
              <dl className="text-xs space-y-1 mb-4" style={{ color: "var(--text-muted)" }}>
                <div className="flex gap-2"><dt className="w-24">Naam</dt><dd style={{ color: "var(--text-primary)" }}>{confirm.row.naam}</dd></div>
                <div className="flex gap-2"><dt className="w-24">Nummer</dt><dd style={{ color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }}>{confirm.row.nummer}</dd></div>
                <div className="flex gap-2"><dt className="w-24">Projectjaar</dt><dd style={{ color: confirm.row.projectjaar ? "var(--text-primary)" : "var(--warn-text)" }}>{confirm.row.projectjaar ?? "ontbreekt"}</dd></div>
                <div className="flex gap-2"><dt className="w-24">Koppelstatus</dt><dd style={{ color: "var(--text-primary)" }}>{confirm.row.planner_project_id ? "Reeds gekoppeld (update)" : "Nog niet gekoppeld (create)"}</dd></div>
              </dl>
            )}
            {confirm.kind === "monteur" && (
              <dl className="text-xs space-y-1 mb-4" style={{ color: "var(--text-muted)" }}>
                <div className="flex gap-2"><dt className="w-24">Naam</dt><dd style={{ color: "var(--text-primary)" }}>{confirm.row.full_name}</dd></div>
                <div className="flex gap-2"><dt className="w-24">Rollen</dt><dd style={{ color: "var(--text-primary)" }}>{confirm.row.roles.join(", ")}</dd></div>
                <div className="flex gap-2"><dt className="w-24">Status</dt><dd style={{ color: "var(--text-primary)" }}>{confirm.row.account_status}</dd></div>
                <div className="flex gap-2"><dt className="w-24">Koppelstatus</dt><dd style={{ color: "var(--text-primary)" }}>{confirm.row.planner_monteur_id ? "Reeds gekoppeld (update)" : "Nog niet gekoppeld (create)"}</dd></div>
              </dl>
            )}
            {confirm.kind === "bulk" && (
              <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
                {confirm.actie === "projecten"
                  ? `Verstuur ${stats!.projectenTotaal - stats!.projectenZonderJaar} project(en) naar Planner?`
                  : `Verstuur ${stats!.monteursPlanbaar} monteur(s) naar Planner?`}
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirm(null)} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}>Annuleren</button>
              <button
                onClick={() => {
                  if (confirm.kind === "bulk") runBulk(confirm.actie, false);
                  else runSingle(confirm.kind, confirm.row.id);
                }}
                className="px-3 py-2 rounded-lg text-xs font-semibold text-white"
                style={{ background: "var(--accent)" }}
              >
                Verstuur
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

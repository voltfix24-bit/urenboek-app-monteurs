import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Link2, Send, Eye, RefreshCcw, XCircle } from "lucide-react";

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

interface Stats {
  projectenTotaal: number;
  projectenZonderJaar: number;
  projectenGekoppeld: number;
  monteursPlanbaar: number;
  monteursGekoppeld: number;
}

export default function PlannerKoppeling() {
  const { isManager } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "dry" | "projecten" | "monteurs">(null);
  const [response, setResponse] = useState<SyncResponse | null>(null);
  const [naamMap, setNaamMap] = useState<Map<string, string>>(new Map());
  const [confirm, setConfirm] = useState<null | "projecten" | "monteurs">(null);

  async function loadStats() {
    setLoading(true);
    const [{ data: projs }, { data: profs }, { data: rollen }] = await Promise.all([
      supabase.from("projects").select("id, nummer, naam, projectjaar, planner_project_id"),
      supabase.from("profiles").select("id, user_id, full_name, account_status, is_onderaannemer, planner_monteur_id"),
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

    const planbaar = (profs ?? []).filter((p: any) => {
      if (p.is_onderaannemer) return false;
      const r = rolesByUser.get(p.user_id) ?? [];
      if (r.includes("manager")) return false;
      return r.includes("monteur") || r.includes("schakelmonteur");
    });

    setStats({
      projectenTotaal: projs?.length ?? 0,
      projectenZonderJaar: (projs ?? []).filter((p: any) => p.projectjaar == null).length,
      projectenGekoppeld: (projs ?? []).filter((p: any) => p.planner_project_id != null).length,
      monteursPlanbaar: planbaar.length,
      monteursGekoppeld: planbaar.filter((p: any) => p.planner_monteur_id != null).length,
    });
    setLoading(false);
  }

  useEffect(() => { loadStats(); }, []);

  async function run(actie: "projecten" | "monteurs" | "alles", dry_run: boolean) {
    setBusy(dry_run ? "dry" : actie === "monteurs" ? "monteurs" : "projecten");
    setResponse(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-masterdata-to-planner", {
        body: { actie, dry_run },
      });
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
              onClick={() => run("alles", true)}
              className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)", opacity: busy ? 0.5 : 1 }}
            >
              {busy === "dry" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Controleren (dry-run)
            </button>
            <button
              disabled={busy !== null}
              onClick={() => setConfirm("projecten")}
              className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 text-white"
              style={{ background: "var(--accent)", opacity: busy ? 0.5 : 1 }}
            >
              {busy === "projecten" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Projecten synchroniseren
            </button>
            <button
              disabled={busy !== null}
              onClick={() => setConfirm("monteurs")}
              className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 text-white"
              style={{ background: "var(--accent)", opacity: busy ? 0.5 : 1 }}
            >
              {busy === "monteurs" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Monteurs synchroniseren
            </button>
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
            <h3 className="font-bold text-base mb-2" style={{ color: "var(--text-primary)" }}>Bevestig synchronisatie</h3>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
              {confirm === "projecten"
                ? `Verstuur ${stats!.projectenTotaal - stats!.projectenZonderJaar} project(en) naar Planner?`
                : `Verstuur ${stats!.monteursPlanbaar} monteur(s) naar Planner?`}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirm(null)} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}>Annuleren</button>
              <button onClick={() => run(confirm, false)} className="px-3 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: "var(--accent)" }}>Verstuur</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Link2, Send, Eye, RefreshCcw, XCircle, Plug, Info, Search, HelpCircle, Ban, Settings2, Calendar, Trash2 } from "lucide-react";
import { PLANNER_EXCLUSION_REASONS, PLANNER_EXCLUSION_LABEL, exclusionLabel, type PlannerExclusionReason } from "@/lib/plannerExclusion";
import { PlannerSyncAuditPanel } from "@/components/PlannerSyncAuditPanel";
import { PlannerSoftDeletedPanel } from "@/components/PlannerSoftDeletedPanel";
import { PlannerSyncStatusBar } from "@/components/PlannerSyncStatusBar";

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

type SelectieMode = null | { kind: "project"; row: ProjectRow } | { kind: "monteur"; row: MonteurRow } | { kind: "exclusion"; row: ProjectRow } | { kind: "bulk"; actie: "projecten" | "monteurs" };

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
  const [koppelBusyKey, setKoppelBusyKey] = useState<string | null>(null);
  const [koppelConfirm, setKoppelConfirm] = useState<{
    kind: "project" | "monteur";
    urenapp_id: string;
    planner_id: string;
    label: string;
    afwijkingen: Afwijking[];
  } | null>(null);

  // Planning voorvertoning (fase 2)
  type PreviewStatus = "nieuw" | "ongewijzigd" | "gewijzigd" | "conflict" | "verwijderd_in_planner";
  interface PreviewRegel {
    status: PreviewStatus;
    external_id: string;
    datum: string;
    urenapp_project_id: string | null;
    urenapp_profile_id: string | null;
    project_label: string | null;
    monteur_label: string | null;
    activiteit: string | null;
    kleur: string | null;
    notitie: string;
    voorgesteld: { starttijd: string; eindtijd: string };
    conflict_redenen: string[];
    verschillen: { veld: string; huidig: unknown; voorgesteld: unknown }[];
    bestaande_row: { id?: string; datum?: string; starttijd: string; eindtijd: string; activiteit: string | null; activiteit_kleur: string | null; notitie: string; project_id?: string; medewerker_id?: string } | null;
  }
  interface PreviewResponse {
    success: boolean;
    datum_vanaf: string;
    datum_tot: string;
    aantallen: {
      totaal_planner: number; nieuw: number; ongewijzigd: number; gewijzigd: number;
      conflict: number; verwijderd_in_planner: number; uitgesloten_info: number;
      bestaande_handmatig: number; bestaande_extern: number;
    };
    regels: PreviewRegel[];
    uitgesloten_info: { planner_monteur_id: string; planning_cel_id: string; datum: string; reden: string }[];
  }
  const PREVIEW_STATUS_LABEL: Record<PreviewStatus, string> = {
    nieuw: "Nieuw",
    ongewijzigd: "Ongewijzigd",
    gewijzigd: "Gewijzigd",
    conflict: "Conflict",
    verwijderd_in_planner: "Verwijderd in Planner",
  };
  const PREVIEW_STATUS_COLOR: Record<PreviewStatus, { bg: string; fg: string }> = {
    nieuw: { bg: "var(--accent)", fg: "white" },
    ongewijzigd: { bg: "var(--bg-surface-2)", fg: "var(--text-muted)" },
    gewijzigd: { bg: "var(--warn-light)", fg: "var(--warn-text)" },
    conflict: { bg: "#fee2e2", fg: "#b91c1c" },
    verwijderd_in_planner: { bg: "#fef3c7", fg: "#92400e" },
  };
  const today = new Date().toISOString().slice(0, 10);
  const in28 = new Date(Date.now() + 27 * 86_400_000).toISOString().slice(0, 10);
  const [previewVanaf, setPreviewVanaf] = useState(today);
  const [previewTot, setPreviewTot] = useState(in28);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewStatusFilter, setPreviewStatusFilter] = useState<PreviewStatus | "alle">("alle");
  const [previewQuery, setPreviewQuery] = useState("");
  const [proefsyncBusyKey, setProefsyncBusyKey] = useState<string | null>(null);
  const [proefsyncConfirm, setProefsyncConfirm] = useState<PreviewRegel | null>(null);
  const [adoptBusyKey, setAdoptBusyKey] = useState<string | null>(null);
  const [adoptConfirm, setAdoptConfirm] = useState<PreviewRegel | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchConfirm, setBatchConfirm] = useState(false);
  const [batchResult, setBatchResult] = useState<null | {
    aantallen: { gesynchroniseerd: number; reeds_gesynchroniseerd: number; geweigerd: number; fout: number };
    verwerkt: number;
  }>(null);
  const [updatesBusy, setUpdatesBusy] = useState(false);
  const [updatesConfirm, setUpdatesConfirm] = useState(false);
  const [updatesResult, setUpdatesResult] = useState<null | {
    aantallen: { bijgewerkt: number; overgeslagen: number; geweigerd: number; fout: number };
    verwerkt: number;
  }>(null);
  const [deletionsBusy, setDeletionsBusy] = useState(false);
  const [deletionsConfirm, setDeletionsConfirm] = useState(false);
  const [deletionsResult, setDeletionsResult] = useState<null | {
    aantallen: { verwijderd: number; gemarkeerd_verwijderd: number; overgeslagen: number; geweigerd: number; fout: number };
    verwerkt: number;
  }>(null);
  const BATCH_LIMIT = 25;

  // Fase A/B/C/D: audit refresh + conflict keuze
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);
  const [keuzeBusyKey, setKeuzeBusyKey] = useState<string | null>(null);
  const scrollNaarAudit = () => {
    document.getElementById("planner-sync-audit")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const logKeuze = async (external_id: string, datum: string, keuze: "terrevolt" | "planner" | "overslaan") => {
    setKeuzeBusyKey(`${external_id}:${keuze}`);
    try {
      const { data, error } = await (supabase.rpc as any)("log_planner_conflict_keuze_v1", {
        _external_id: external_id, _datum: datum, _keuze: keuze, _toelichting: null,
      });
      if (error) throw error;
      toast.success(`Keuze vastgelegd: ${data?.uitkomst ?? keuze}`);
      setAuditRefreshKey(k => k + 1);
    } catch (e: any) {
      toast.error(`Vastleggen mislukt: ${e?.message ?? "onbekend"}`);
    } finally {
      setKeuzeBusyKey(null);
    }
  };

  function isAdopteerbaar(r: PreviewRegel): boolean {
    return (
      r.status === "conflict" &&
      r.conflict_redenen.length === 1 &&
      r.conflict_redenen[0] === "overlap_handmatige_planning" &&
      !!r.urenapp_project_id &&
      !!r.urenapp_profile_id
    );
  }

  async function runAdoptie(regel: PreviewRegel) {
    if (!isAdopteerbaar(regel)) return;
    const key = regel.external_id;
    setAdoptBusyKey(key);
    setAdoptConfirm(null);
    try {
      const { data, error } = await supabase.functions.invoke("adopt-planner-planning-item", {
        body: {
          datum_vanaf: preview?.datum_vanaf ?? regel.datum,
          datum_tot: preview?.datum_tot ?? regel.datum,
          external_id: regel.external_id,
        },
      });
      if (error) {
        const ctx = (error as any)?.context;
        let msg = (error as any)?.message ?? "Adoptie mislukt";
        try {
          const body = ctx && typeof ctx.json === "function" ? await ctx.json() : null;
          if (body?.error) msg = body.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      const uitkomst = (data as any)?.uitkomst;
      if (uitkomst === "reeds_geadopteerd") {
        toast.success("Was al geadopteerd");
      } else {
        toast.success("Adoptie geslaagd");
      }
      await runPreview();
    } catch (e: any) {
      toast.error(e?.message ?? "Adoptie mislukt");
    } finally {
      setAdoptBusyKey(null);
    }
  }

  async function runProefsync(regel: PreviewRegel) {
    if (regel.status !== "nieuw") return;
    const key = regel.external_id;
    setProefsyncBusyKey(key);
    setProefsyncConfirm(null);
    try {
      const { data, error } = await supabase.functions.invoke("sync-planner-planning-item", {
        body: {
          datum_vanaf: preview?.datum_vanaf ?? regel.datum,
          datum_tot: preview?.datum_tot ?? regel.datum,
          external_id: regel.external_id,
        },
      });
      if (error) {
        const ctx = (error as any)?.context;
        let msg = (error as any)?.message ?? "Proefsync mislukt";
        try {
          const body = ctx && typeof ctx.json === "function" ? await ctx.json() : null;
          if (body?.error) msg = body.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      const uitkomst = (data as any)?.uitkomst;
      if (uitkomst === "reeds_gesynchroniseerd") {
        toast.success("Was al gesynchroniseerd");
      } else {
        toast.success("Proefsync geslaagd");
      }
      await runPreview();
    } catch (e: any) {
      toast.error(e?.message ?? "Proefsync mislukt");
    } finally {
      setProefsyncBusyKey(null);
    }
  }

  async function runBatch() {
    if (!preview) return;
    setBatchBusy(true);
    setBatchConfirm(false);
    try {
      const { data, error } = await supabase.functions.invoke("sync-planner-planning-batch", {
        body: {
          datum_vanaf: preview.datum_vanaf,
          datum_tot: preview.datum_tot,
          limit: BATCH_LIMIT,
        },
      });
      if (error) {
        const ctx = (error as any)?.context;
        let msg = (error as any)?.message ?? "Batch-sync mislukt";
        try {
          const body = ctx && typeof ctx.json === "function" ? await ctx.json() : null;
          if (body?.error) msg = body.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      const d = data as any;
      setBatchResult({ aantallen: d.aantallen, verwerkt: d.verwerkt });
      if ((d.aantallen?.fout ?? 0) > 0 || (d.aantallen?.geweigerd ?? 0) > 0) {
        toast.warning(`Batch klaar met ${d.aantallen.fout} fouten en ${d.aantallen.geweigerd} geweigerd`);
      } else {
        toast.success(`Batch klaar: ${d.aantallen.gesynchroniseerd} gesynchroniseerd`);
      }
      await runPreview();
    } catch (e: any) {
      toast.error(e?.message ?? "Batch-sync mislukt");
    } finally {
      setBatchBusy(false);
    }
  }

  async function runUpdates() {
    if (!preview) return;
    setUpdatesBusy(true);
    setUpdatesConfirm(false);
    try {
      const { data, error } = await supabase.functions.invoke("sync-planner-planning-updates", {
        body: {
          datum_vanaf: preview.datum_vanaf,
          datum_tot: preview.datum_tot,
          limit: BATCH_LIMIT,
        },
      });
      if (error) {
        const ctx = (error as any)?.context;
        let msg = (error as any)?.message ?? "Wijzigingen verwerken mislukt";
        try {
          const body = ctx && typeof ctx.json === "function" ? await ctx.json() : null;
          if (body?.error) msg = body.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      const d = data as any;
      setUpdatesResult({ aantallen: d.aantallen, verwerkt: d.verwerkt });
      if ((d.aantallen?.fout ?? 0) > 0 || (d.aantallen?.geweigerd ?? 0) > 0) {
        toast.warning(`Update klaar: ${d.aantallen.bijgewerkt} bijgewerkt · ${d.aantallen.geweigerd} geweigerd · ${d.aantallen.fout} fout`);
      } else {
        toast.success(`Update klaar: ${d.aantallen.bijgewerkt} bijgewerkt`);
      }
      await runPreview();
    } catch (e: any) {
      toast.error(e?.message ?? "Wijzigingen verwerken mislukt");
    } finally {
      setUpdatesBusy(false);
    }
  }

  async function runDeletions() {
    if (!preview) return;
    setDeletionsBusy(true);
    setDeletionsConfirm(false);
    try {
      const { data, error } = await supabase.functions.invoke("sync-planner-planning-deletions", {
        body: {
          datum_vanaf: preview.datum_vanaf,
          datum_tot: preview.datum_tot,
          limit: BATCH_LIMIT,
        },
      });
      if (error) {
        const ctx = (error as any)?.context;
        let msg = (error as any)?.message ?? "Verwijderingen verwerken mislukt";
        try {
          const body = ctx && typeof ctx.json === "function" ? await ctx.json() : null;
          if (body?.error) msg = body.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      const d = data as any;
      setDeletionsResult({ aantallen: d.aantallen, verwerkt: d.verwerkt });
      if ((d.aantallen?.fout ?? 0) > 0 || (d.aantallen?.geweigerd ?? 0) > 0) {
        toast.warning(`Verwijderingen klaar: ${d.aantallen.verwijderd} verwijderd · ${d.aantallen.gemarkeerd_verwijderd} gemarkeerd · ${d.aantallen.fout} fout`);
      } else {
        toast.success(`Verwijderingen klaar: ${d.aantallen.verwijderd} verwijderd · ${d.aantallen.gemarkeerd_verwijderd} gemarkeerd`);
      }
      await runPreview();
    } catch (e: any) {
      toast.error(e?.message ?? "Verwijderingen verwerken mislukt");
    } finally {
      setDeletionsBusy(false);
    }
  }

  async function runPreview() {
    setPreviewBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("preview-planner-planning", {
        body: { datum_vanaf: previewVanaf, datum_tot: previewTot },
      });
      if (error) {
        const ctx = (error as any)?.context;
        let msg = (error as any)?.message ?? "Voorvertoning mislukt";
        try {
          const body = ctx && typeof ctx.json === "function" ? await ctx.json() : null;
          if (body?.error) msg = body.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      setPreview(data as PreviewResponse);
      toast.success("Voorvertoning klaar");
    } catch (e: any) {
      toast.error(e?.message ?? "Voorvertoning mislukt");
    } finally {
      setPreviewBusy(false);
    }
  }

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

  async function doKoppel(kind: "project" | "monteur", urenapp_id: string, planner_id: string) {
    const key = `${kind}:${urenapp_id}`;
    if (koppelBusyKey) return; // anti-dubbele-klik
    setKoppelBusyKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("confirm-planner-match", {
        body: { kind, urenapp_id, planner_id },
      });
      if (error) {
        const ctx = (error as any)?.context;
        let msg = (error as any)?.message ?? "Koppelen mislukt";
        try {
          const body = ctx && typeof ctx.json === "function" ? await ctx.json() : null;
          if (body?.error) msg = body.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if ((data as any)?.reeds_gekoppeld) toast.info("Records waren al gekoppeld");
      else toast.success("Gekoppeld");
      await runAnalyse();
    } catch (e: any) {
      toast.error(e?.message ?? "Koppelen mislukt");
    } finally {
      setKoppelBusyKey(null);
      setKoppelConfirm(null);
    }
  }


  async function loadStats() {
    setLoading(true);
    const [{ data: projs }, { data: profs }, { data: rollen }] = await Promise.all([
      supabase.from("projects").select("id, nummer, naam, projectjaar, planner_project_id, active, planner_sync_enabled, planner_sync_exclusion_reason").order("nummer"),
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

    const projectenList = (projs ?? []) as ProjectRow[];
    setProjecten(projectenList);
    setMonteurs(monteursList);
    setStats({
      projectenTotaal: projectenList.length,
      // Jaar telt alleen voor actief ingeschakelde sync-projecten (true), niet uitgesloten (false)
      projectenZonderJaar: projectenList.filter(p => p.planner_sync_enabled === true && p.projectjaar == null).length,
      projectenGekoppeld: projectenList.filter(p => p.planner_project_id != null).length,
      projectenUitgesloten: projectenList.filter(p => p.planner_sync_enabled === false).length,
      monteursPlanbaar: monteursList.filter(m => m.planbaar).length,
      monteursGekoppeld: monteursList.filter(m => m.planbaar && m.planner_monteur_id != null).length,
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

  async function saveExclusion(projectId: string, enabled: boolean, reason: PlannerExclusionReason | null) {
    if (!enabled && !reason) {
      toast.error("Kies een uitsluitingsreden");
      return;
    }
    setBusy("single");
    try {
      const { error } = await supabase
        .from("projects")
        .update({
          planner_sync_enabled: enabled,
          planner_sync_exclusion_reason: enabled ? null : reason,
        })
        .eq("id", projectId);
      if (error) throw error;
      toast.success(enabled ? "Project weer ingeschakeld" : "Project uitgesloten");
      setConfirm(null);
      await loadStats();
    } catch (e: any) {
      toast.error(e?.message ?? "Wijzigen mislukt");
    } finally {
      setBusy(null);
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

      <PlannerSyncStatusBar
        conflicten={preview?.aantallen.conflict ?? null}
        verwijderingen={preview?.aantallen.verwijderd_in_planner ?? null}
        refreshKey={auditRefreshKey}
        onScrollNaarAudit={scrollNaarAudit}
      />



      {loading || !stats ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--accent)" }} /></div>
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {statBox("Projecten totaal", stats.projectenTotaal)}
            {statBox("Uitgesloten van sync", stats.projectenUitgesloten)}
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
                const uitgesloten = p.planner_sync_enabled === false;
                const jaarOk = p.projectjaar != null;
                const gekoppeld = p.planner_project_id != null;
                const syncBaar = !uitgesloten && jaarOk;
                return (
                  <li key={p.id} className="flex items-center gap-2 text-xs py-2 px-2 rounded" style={{ background: "var(--bg-surface-2)" }}>
                    <span style={{ fontFamily: "DM Mono, monospace", color: "var(--text-muted)", minWidth: 70 }}>{p.nummer}</span>
                    <span className="flex-1 truncate" style={{ color: "var(--text-primary)" }}>{p.naam}</span>
                    {uitgesloten ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1" style={{ background: "#e0e7ff", color: "#3730a3" }} title={exclusionLabel(p.planner_sync_exclusion_reason)}>
                        <Ban className="h-3 w-3" /> Uitgesloten
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: jaarOk ? "var(--bg-surface)" : "var(--warn-light)", color: jaarOk ? "var(--text-muted)" : "var(--warn-text)" }}>
                        {jaarOk ? `Jaar ${p.projectjaar}` : "Jaar ontbreekt"}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: gekoppeld ? "var(--accent)" : "var(--bg-surface)", color: gekoppeld ? "white" : "var(--text-muted)" }}>
                      {gekoppeld ? "Gekoppeld" : "Niet gekoppeld"}
                    </span>
                    <button
                      onClick={() => setConfirm({ kind: "exclusion", row: p })}
                      className="p-1 rounded"
                      style={{ background: "var(--bg-surface)", color: "var(--text-muted)" }}
                      title="Uitsluiting beheren"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      disabled={busy !== null || !syncBaar}
                      onClick={() => setConfirm({ kind: "project", row: p })}
                      className="px-2 py-1 rounded text-[11px] font-semibold"
                      style={{ background: syncBaar ? "var(--accent)" : "var(--bg-surface)", color: syncBaar ? "white" : "var(--text-muted)", opacity: busy || !syncBaar ? 0.5 : 1 }}
                      title={uitgesloten ? `Uitgesloten van sync — ${exclusionLabel(p.planner_sync_exclusion_reason)}` : jaarOk ? "Synchroniseer dit project" : "Vul eerst het projectjaar in"}
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
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
                  {(["exact","waarschijnlijk","conflict","geen_match","uitgesloten"] as AnalyseStatus[]).map(s => {
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
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{r.status === "uitgesloten" ? exclusionLabel(r.reden) : r.reden}</span>
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
                          {(() => {
                            if (!c) return null;
                            const kind: "project" | "monteur" = isProj ? "project" : "monteur";
                            const key = `${kind}:${u.id}`;
                            const busy = koppelBusyKey === key;
                            const reedsWederzijds =
                              r.bestaande_koppeling_urenapp === c.planner_id &&
                              r.bestaande_koppeling_planner === u.id;
                            if (reedsWederzijds) {
                              return (
                                <div className="mt-2 pt-2 flex justify-end" style={{ borderTop: "1px solid var(--planning-border-soft)" }}>
                                  <span className="px-2 py-1 rounded text-[11px] font-semibold inline-flex items-center gap-1"
                                    style={{ background: "var(--accent)", color: "white" }}>
                                    <CheckCircle2 className="h-3 w-3" /> Al gekoppeld
                                  </span>
                                </div>
                              );
                            }
                            if (r.status !== "exact" && r.status !== "waarschijnlijk") return null;
                            const label = isProj ? `${u.nummer} — ${u.naam}` : u.full_name;
                            return (
                              <div className="mt-2 pt-2 flex justify-end" style={{ borderTop: "1px solid var(--planning-border-soft)" }}>
                                {r.status === "exact" ? (
                                  <button
                                    onClick={() => doKoppel(kind, u.id, c.planner_id)}
                                    disabled={busy || !!koppelBusyKey}
                                    className="px-3 py-1.5 rounded text-xs font-bold inline-flex items-center gap-1.5"
                                    style={{ background: "var(--accent)", color: "white", opacity: busy ? 0.5 : 1 }}
                                  >
                                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                                    Koppelen
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setKoppelConfirm({ kind, urenapp_id: u.id, planner_id: c.planner_id, label, afwijkingen: r.afwijkingen })}
                                    disabled={busy || !!koppelBusyKey}
                                    className="px-3 py-1.5 rounded text-xs font-bold inline-flex items-center gap-1.5"
                                    style={{ background: "var(--warn-light)", color: "var(--warn-text)", opacity: busy ? 0.5 : 1 }}
                                  >
                                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                                    Controleren en koppelen
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </li>

                      );
                    })}
                </ul>
              </>
            )}
          </section>

          {/* Planning voorvertoning — fase 2 read-only */}
          <section style={card} className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Calendar className="h-4 w-4" style={{ color: "var(--accent)" }} />
              <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Planning voorvertoning</h2>
              <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>read-only — fase 2</span>
            </div>
            <p className="text-xs flex items-start gap-1.5" style={{ color: "var(--text-muted)" }}>
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              Vergelijkt Planner-planning met de eigen planning binnen het opgegeven datumbereik (maximaal 93 dagen). Voorgestelde tijden 07:00 — 16:00. Er worden geen records gewijzigd, aangemaakt of verwijderd.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Vanaf</label>
                <input type="date" value={previewVanaf} onChange={e => setPreviewVanaf(e.target.value)}
                  className="px-2 py-1 text-xs rounded-lg"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }} />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-muted)" }}>T/m</label>
                <input type="date" value={previewTot} onChange={e => setPreviewTot(e.target.value)}
                  className="px-2 py-1 text-xs rounded-lg"
                  style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }} />
              </div>
              <button onClick={runPreview} disabled={previewBusy}
                className="ml-auto px-3 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 text-white"
                style={{ background: "var(--accent)", opacity: previewBusy ? 0.5 : 1 }}>
                {previewBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                Voorvertoning ophalen
              </button>
            </div>

            {preview && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
                  {(["nieuw","ongewijzigd","gewijzigd","conflict","verwijderd_in_planner"] as PreviewStatus[]).map(s => {
                    const c = preview.aantallen[s as keyof typeof preview.aantallen] as number;
                    const col = PREVIEW_STATUS_COLOR[s];
                    return (
                      <button key={s} onClick={() => setPreviewStatusFilter(previewStatusFilter === s ? "alle" : s)}
                        className="px-2 py-2 rounded-lg text-left"
                        style={{
                          background: previewStatusFilter === s ? col.bg : "var(--bg-surface-2)",
                          color: previewStatusFilter === s ? col.fg : "var(--text-primary)",
                          border: "1px solid var(--planning-border-soft)",
                        }}>
                        <div className="text-[10px] uppercase tracking-wider opacity-80">{PREVIEW_STATUS_LABEL[s]}</div>
                        <div className="text-lg font-bold" style={{ fontFamily: "DM Mono, monospace" }}>{c}</div>
                      </button>
                    );
                  })}
                  <div className="px-2 py-2 rounded-lg" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)" }}>
                    <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Planner totaal</div>
                    <div className="text-lg font-bold" style={{ color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }}>{preview.aantallen.totaal_planner}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                  <div className="px-3 py-2 rounded-lg" style={{ background: "#eef2ff", border: "1px solid #c7d2fe", color: "#3730a3" }}>
                    <strong>{preview.aantallen.uitgesloten_info}</strong> uitgesloten Planner-toewijzingen (informatief, geen fout)
                  </div>
                  <div className="px-3 py-2 rounded-lg" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)", color: "var(--text-muted)" }}>
                    Bestaande externe planning in bereik: <strong style={{ color: "var(--text-primary)" }}>{preview.aantallen.bestaande_extern}</strong>
                  </div>
                  <div className="px-3 py-2 rounded-lg" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)", color: "var(--text-muted)" }}>
                    Bestaande handmatige planning in bereik: <strong style={{ color: "var(--text-primary)" }}>{preview.aantallen.bestaande_handmatig}</strong>
                  </div>
                </div>

                {(() => {
                  const a = preview.aantallen;
                  const kanBatch = a.nieuw > 0 && a.conflict === 0 && a.verwijderd_in_planner === 0 && a.gewijzigd === 0;
                  if (!kanBatch) return null;
                  const teVerwerken = Math.min(a.nieuw, BATCH_LIMIT);
                  return (
                    <div className="flex items-center gap-2 flex-wrap p-2 rounded-lg" style={{ background: "var(--accent-light, #ecfdf5)", border: "1px solid var(--accent)" }}>
                      <span className="text-xs" style={{ color: "var(--text-primary)" }}>
                        <strong>{a.nieuw}</strong> nieuwe Planner-regels gereed voor synchronisatie. Limiet per batch: <strong>{BATCH_LIMIT}</strong>.
                      </span>
                      <button
                        onClick={() => setBatchConfirm(true)}
                        disabled={batchBusy}
                        className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 text-white"
                        style={{ background: "var(--accent)", opacity: batchBusy ? 0.5 : 1 }}
                      >
                        {batchBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Nieuwe regels synchroniseren ({teVerwerken})
                      </button>
                    </div>
                  );
                })()}

                {(() => {
                  const a = preview.aantallen;
                  const kanUpdates = a.gewijzigd > 0 && a.conflict === 0 && a.verwijderd_in_planner === 0;
                  if (!kanUpdates) return null;
                  const teVerwerken = Math.min(a.gewijzigd, BATCH_LIMIT);
                  return (
                    <div className="flex items-center gap-2 flex-wrap p-2 rounded-lg" style={{ background: "#fffbeb", border: "1px solid #f59e0b" }}>
                      <span className="text-xs" style={{ color: "#92400e" }}>
                        <strong>{a.gewijzigd}</strong> Planner-wijziging(en) gevonden voor bestaande regels. Limiet per batch: <strong>{BATCH_LIMIT}</strong>.
                      </span>
                      <button
                        onClick={() => setUpdatesConfirm(true)}
                        disabled={updatesBusy}
                        className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 text-white"
                        style={{ background: "#f59e0b", opacity: updatesBusy ? 0.5 : 1 }}
                      >
                        {updatesBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Wijzigingen verwerken ({teVerwerken})
                      </button>
                    </div>
                  );
                })()}

                {(() => {
                  const a = preview.aantallen;
                  const kanDeletions = a.verwijderd_in_planner > 0 && a.conflict === 0;
                  if (!kanDeletions) return null;
                  const teVerwerken = Math.min(a.verwijderd_in_planner, BATCH_LIMIT);
                  return (
                    <div className="flex items-center gap-2 flex-wrap p-2 rounded-lg" style={{ background: "#fef2f2", border: "1px solid #ef4444" }}>
                      <span className="text-xs" style={{ color: "#991b1b" }}>
                        <strong>{a.verwijderd_in_planner}</strong> Planner-regel(s) verwijderd. Regels met urenboekingen worden gemarkeerd, andere worden hard verwijderd. Limiet per batch: <strong>{BATCH_LIMIT}</strong>.
                      </span>
                      <button
                        onClick={() => setDeletionsConfirm(true)}
                        disabled={deletionsBusy}
                        className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 text-white"
                        style={{ background: "#ef4444", opacity: deletionsBusy ? 0.5 : 1 }}
                      >
                        {deletionsBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Verwijderingen verwerken ({teVerwerken})
                      </button>
                    </div>
                  );
                })()}

                {batchResult && (
                  <div className="p-2 rounded-lg text-xs" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }}>
                    Laatste batch — verwerkt: <strong>{batchResult.verwerkt}</strong>{" · "}
                    gesynchroniseerd: <strong>{batchResult.aantallen.gesynchroniseerd}</strong>{" · "}
                    reeds: <strong>{batchResult.aantallen.reeds_gesynchroniseerd}</strong>{" · "}
                    geweigerd: <strong style={{ color: batchResult.aantallen.geweigerd > 0 ? "#b91c1c" : undefined }}>{batchResult.aantallen.geweigerd}</strong>{" · "}
                    fout: <strong style={{ color: batchResult.aantallen.fout > 0 ? "#b91c1c" : undefined }}>{batchResult.aantallen.fout}</strong>
                  </div>
                )}

                {updatesResult && (
                  <div className="p-2 rounded-lg text-xs" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }}>
                    Laatste update — verwerkt: <strong>{updatesResult.verwerkt}</strong>{" · "}
                    bijgewerkt: <strong>{updatesResult.aantallen.bijgewerkt}</strong>{" · "}
                    overgeslagen: <strong>{updatesResult.aantallen.overgeslagen}</strong>{" · "}
                    geweigerd: <strong style={{ color: updatesResult.aantallen.geweigerd > 0 ? "#b91c1c" : undefined }}>{updatesResult.aantallen.geweigerd}</strong>{" · "}
                    fout: <strong style={{ color: updatesResult.aantallen.fout > 0 ? "#b91c1c" : undefined }}>{updatesResult.aantallen.fout}</strong>
                  </div>
                )}

                {deletionsResult && (
                  <div className="p-2 rounded-lg text-xs" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }}>
                    Laatste verwijderingen — verwerkt: <strong>{deletionsResult.verwerkt}</strong>{" · "}
                    verwijderd: <strong>{deletionsResult.aantallen.verwijderd}</strong>{" · "}
                    gemarkeerd: <strong>{deletionsResult.aantallen.gemarkeerd_verwijderd}</strong>{" · "}
                    overgeslagen: <strong>{deletionsResult.aantallen.overgeslagen}</strong>{" · "}
                    geweigerd: <strong style={{ color: deletionsResult.aantallen.geweigerd > 0 ? "#b91c1c" : undefined }}>{deletionsResult.aantallen.geweigerd}</strong>{" · "}
                    fout: <strong style={{ color: deletionsResult.aantallen.fout > 0 ? "#b91c1c" : undefined }}>{deletionsResult.aantallen.fout}</strong>
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Bereik: <strong style={{ color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }}>{preview.datum_vanaf}</strong>
                    {" — "}
                    <strong style={{ color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }}>{preview.datum_tot}</strong>
                  </span>
                  <input value={previewQuery} onChange={e => setPreviewQuery(e.target.value)} placeholder="Filter op project, monteur of activiteit…"
                    className="ml-auto px-3 py-1 text-xs rounded-lg"
                    style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)", minWidth: 240 }} />
                </div>

                <ul className="space-y-2 max-h-[480px] overflow-y-auto">
                  {preview.regels
                    .filter(r => previewStatusFilter === "alle" || r.status === previewStatusFilter)
                    .filter(r => {
                      const q = previewQuery.trim().toLowerCase();
                      if (!q) return true;
                      return [r.project_label, r.monteur_label, r.activiteit, r.datum].filter(Boolean).join(" ").toLowerCase().includes(q);
                    })
                    .map((r, i) => {
                      const col = PREVIEW_STATUS_COLOR[r.status];
                      return (
                        <li key={`${r.external_id}-${i}`} className="p-3 rounded-lg" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)" }}>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: col.bg, color: col.fg }}>
                              {r.status === "verwijderd_in_planner" && <Trash2 className="h-3 w-3 inline mr-1" />}
                              {PREVIEW_STATUS_LABEL[r.status]}
                            </span>
                            <span className="text-xs font-semibold" style={{ color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }}>{r.datum}</span>
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{r.voorgesteld.starttijd}–{r.voorgesteld.eindtijd}</span>
                          </div>
                          <div className="text-xs" style={{ color: "var(--text-primary)" }}>
                            <strong>{r.monteur_label ?? <em style={{ color: "var(--warn-text)" }}>onbekende monteur</em>}</strong>
                            {" · "}
                            {r.project_label ?? <em style={{ color: "var(--warn-text)" }}>onbekend project</em>}
                          </div>
                          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {r.activiteit ?? "—"}{r.kleur ? ` (${r.kleur})` : ""}{r.notitie ? ` · ${r.notitie}` : ""}
                          </div>
                          {r.conflict_redenen.length > 0 && (
                            <ul className="mt-1 text-[11px]" style={{ color: "#b91c1c" }}>
                              {r.conflict_redenen.map((c, j) => <li key={j}>• {c}</li>)}
                            </ul>
                          )}
                          {r.verschillen.length > 0 && (
                            <div className="mt-2 pt-2" style={{ borderTop: "1px dashed var(--planning-border-soft)" }}>
                              <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--warn-text)" }}>Verschillen met bestaande externe regel</div>
                              <ul className="text-[11px] space-y-0.5" style={{ color: "var(--text-muted)" }}>
                                {r.verschillen.map((v, j) => (
                                  <li key={j}>
                                    <strong style={{ color: "var(--text-primary)" }}>{v.veld}:</strong>{" "}
                                    huidig <code style={{ fontFamily: "DM Mono, monospace" }}>{String(v.huidig ?? "—")}</code>{" "}
                                    → voorstel <code style={{ fontFamily: "DM Mono, monospace" }}>{String(v.voorgesteld ?? "—")}</code>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {r.status === "nieuw" && (
                            <div className="mt-2 flex">
                              <button
                                onClick={() => setProefsyncConfirm(r)}
                                disabled={proefsyncBusyKey === r.external_id}
                                className="px-3 py-1 text-xs rounded-lg font-semibold inline-flex items-center gap-1.5"
                                style={{
                                  background: "var(--accent)",
                                  color: "white",
                                  opacity: proefsyncBusyKey === r.external_id ? 0.5 : 1,
                                  cursor: proefsyncBusyKey === r.external_id ? "wait" : "pointer",
                                }}
                              >
                                {proefsyncBusyKey === r.external_id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Send className="h-3 w-3" />}
                                Proefsync
                              </button>
                            </div>
                          )}
                          {isAdopteerbaar(r) && (
                            <div className="mt-2 flex">
                              <button
                                onClick={() => setAdoptConfirm(r)}
                                disabled={adoptBusyKey === r.external_id}
                                className="px-3 py-1 text-xs rounded-lg font-semibold inline-flex items-center gap-1.5"
                                style={{
                                  background: "var(--warn-text)",
                                  color: "white",
                                  opacity: adoptBusyKey === r.external_id ? 0.5 : 1,
                                  cursor: adoptBusyKey === r.external_id ? "wait" : "pointer",
                                }}
                              >
                                {adoptBusyKey === r.external_id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Send className="h-3 w-3" />}
                                Adopteren
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  {preview.regels.filter(r => previewStatusFilter === "alle" || r.status === previewStatusFilter).length === 0 && (
                    <li className="text-xs italic text-center py-4" style={{ color: "var(--text-muted)" }}>Geen regels in deze filter.</li>
                  )}
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

      {confirm && confirm.kind === "exclusion" && (
        <ExclusionDialog
          row={confirm.row}
          busy={busy !== null}
          onClose={() => setConfirm(null)}
          onSave={(enabled, reason) => saveExclusion(confirm.row.id, enabled, reason)}
        />
      )}

      {confirm && confirm.kind !== "exclusion" && (
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
                  ? `Verstuur ${stats!.projectenTotaal - stats!.projectenZonderJaar - stats!.projectenUitgesloten} project(en) naar Planner? (${stats!.projectenUitgesloten} uitgesloten, ${stats!.projectenZonderJaar} zonder jaar worden overgeslagen)`
                  : `Verstuur ${stats!.monteursPlanbaar} monteur(s) naar Planner?`}
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirm(null)} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}>Annuleren</button>
              <button
                onClick={() => {
                  if (confirm.kind === "bulk") runBulk(confirm.actie, false);
                  else if (confirm.kind === "project" || confirm.kind === "monteur") runSingle(confirm.kind, confirm.row.id);
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

      {koppelConfirm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => !koppelBusyKey && setKoppelConfirm(null)}>
          <div className="bg-white w-full max-w-md rounded-t-2xl md:rounded-2xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 mt-0.5" style={{ color: "var(--warn-text)" }} />
              <div>
                <h3 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Controleer voor koppelen</h3>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Dit is een <strong>waarschijnlijke</strong> match. Bevestig alleen wanneer u zeker weet dat dit hetzelfde {koppelConfirm.kind} is.
                </p>
              </div>
            </div>
            <div className="p-3 rounded-lg text-xs" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)" }}>
              <div style={{ color: "var(--text-primary)" }}><strong>{koppelConfirm.label}</strong></div>
              <div className="mt-1" style={{ color: "var(--text-muted)" }}>
                Planner-ID: <code style={{ fontFamily: "DM Mono, monospace" }}>{koppelConfirm.planner_id.slice(0, 12)}…</code>
              </div>
            </div>
            {koppelConfirm.afwijkingen.length > 0 && (
              <div className="p-3 rounded-lg text-xs" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-text)" }}>
                <div className="font-semibold mb-1" style={{ color: "var(--warn-text)" }}>Zichtbare afwijkingen:</div>
                <ul className="space-y-0.5" style={{ color: "var(--text-primary)" }}>
                  {koppelConfirm.afwijkingen.map((a, i) => (
                    <li key={i}>
                      <strong>{a.veld}:</strong> urenapp <code style={{ fontFamily: "DM Mono, monospace" }}>{String(a.urenapp ?? "—")}</code> ≠ planner <code style={{ fontFamily: "DM Mono, monospace" }}>{String(a.planner ?? "—")}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setKoppelConfirm(null)} disabled={!!koppelBusyKey} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}>
                Annuleren
              </button>
              <button
                onClick={() => doKoppel(koppelConfirm.kind, koppelConfirm.urenapp_id, koppelConfirm.planner_id)}
                disabled={!!koppelBusyKey}
                className="px-3 py-2 rounded-lg text-xs font-bold text-white inline-flex items-center gap-1.5"
                style={{ background: "var(--accent)", opacity: koppelBusyKey ? 0.5 : 1 }}
              >
                {koppelBusyKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                Bevestig en koppel
              </button>
            </div>
          </div>
        </div>
      )}

      {batchConfirm && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setBatchConfirm(false)}>
          <div className="rounded-2xl p-4 max-w-md w-full" style={{ background: "var(--bg-surface)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-base mb-3" style={{ color: "var(--text-primary)" }}>Bevestig batch-synchronisatie</h3>
            <dl className="text-xs space-y-1.5" style={{ color: "var(--text-muted)" }}>
              <div className="flex gap-2"><dt className="w-32">Bereik</dt><dd style={{ color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }}>{preview.datum_vanaf} — {preview.datum_tot}</dd></div>
              <div className="flex gap-2"><dt className="w-32">Nieuwe regels</dt><dd style={{ color: "var(--text-primary)" }}>{preview.aantallen.nieuw}</dd></div>
              <div className="flex gap-2"><dt className="w-32">Te verwerken</dt><dd style={{ color: "var(--text-primary)" }}>{Math.min(preview.aantallen.nieuw, BATCH_LIMIT)} (limiet {BATCH_LIMIT})</dd></div>
              <div className="flex gap-2"><dt className="w-32">Tijden</dt><dd style={{ color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }}>07:00–16:00</dd></div>
            </dl>
            <p className="text-[11px] mt-3" style={{ color: "var(--text-muted)" }}>
              Alleen regels met status <strong>nieuw</strong> worden verwerkt. Bestaande externe en handmatige regels blijven ongewijzigd.
            </p>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setBatchConfirm(false)} className="px-3 py-1.5 text-xs rounded-lg"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}>
                Annuleren
              </button>
              <button
                onClick={() => runBatch()}
                disabled={batchBusy}
                className="px-3 py-1.5 text-xs rounded-lg font-bold inline-flex items-center gap-1.5"
                style={{ background: "var(--accent)", color: "white", opacity: batchBusy ? 0.5 : 1 }}>
                {batchBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Start batch-sync
              </button>
            </div>
          </div>
        </div>
      )}

      {updatesConfirm && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setUpdatesConfirm(false)}>
          <div className="rounded-2xl p-4 max-w-md w-full" style={{ background: "var(--bg-surface)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-base mb-3" style={{ color: "var(--text-primary)" }}>Bevestig Planner-wijzigingen</h3>
            <dl className="text-xs space-y-1.5" style={{ color: "var(--text-muted)" }}>
              <div className="flex gap-2"><dt className="w-32">Bereik</dt><dd style={{ color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }}>{preview.datum_vanaf} — {preview.datum_tot}</dd></div>
              <div className="flex gap-2"><dt className="w-32">Wijzigingen</dt><dd style={{ color: "var(--text-primary)" }}>{preview.aantallen.gewijzigd}</dd></div>
              <div className="flex gap-2"><dt className="w-32">Te verwerken</dt><dd style={{ color: "var(--text-primary)" }}>{Math.min(preview.aantallen.gewijzigd, BATCH_LIMIT)} (limiet {BATCH_LIMIT})</dd></div>
            </dl>
            <p className="text-[11px] mt-3" style={{ color: "#92400e", background: "#fffbeb", padding: "6px 8px", borderRadius: 6, border: "1px solid #fde68a" }}>
              Regels met bestaande urenboekingen, time-entries, of handmatige overlap op de doel-datum worden geweigerd of overgeslagen. Bestaande external_source en external_id blijven intact.
            </p>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setUpdatesConfirm(false)} className="px-3 py-1.5 text-xs rounded-lg"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}>
                Annuleren
              </button>
              <button
                onClick={() => runUpdates()}
                disabled={updatesBusy}
                className="px-3 py-1.5 text-xs rounded-lg font-bold inline-flex items-center gap-1.5 text-white"
                style={{ background: "#f59e0b", opacity: updatesBusy ? 0.5 : 1 }}>
                {updatesBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Start update-batch
              </button>
            </div>
          </div>
        </div>
      )}

      {deletionsConfirm && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setDeletionsConfirm(false)}>
          <div className="rounded-2xl p-4 max-w-md w-full" style={{ background: "var(--bg-surface)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-base mb-3" style={{ color: "var(--text-primary)" }}>Bevestig verwijderingen</h3>
            <dl className="text-xs space-y-1.5" style={{ color: "var(--text-muted)" }}>
              <div className="flex gap-2"><dt className="w-32">Bereik</dt><dd style={{ color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }}>{preview.datum_vanaf} — {preview.datum_tot}</dd></div>
              <div className="flex gap-2"><dt className="w-32">Verwijderingen</dt><dd style={{ color: "var(--text-primary)" }}>{preview.aantallen.verwijderd_in_planner}</dd></div>
              <div className="flex gap-2"><dt className="w-32">Te verwerken</dt><dd style={{ color: "var(--text-primary)" }}>{Math.min(preview.aantallen.verwijderd_in_planner, BATCH_LIMIT)} (limiet {BATCH_LIMIT})</dd></div>
            </dl>
            <p className="text-[11px] mt-3" style={{ color: "#991b1b", background: "#fef2f2", padding: "6px 8px", borderRadius: 6, border: "1px solid #fecaca" }}>
              Regels zonder urenboekingen of time-entries worden hard verwijderd. Regels met boekingen worden gemarkeerd met external_deleted_at en blijven beschikbaar voor de mobiele planning en urencontrole.
            </p>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setDeletionsConfirm(false)} className="px-3 py-1.5 text-xs rounded-lg"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}>
                Annuleren
              </button>
              <button
                onClick={() => runDeletions()}
                disabled={deletionsBusy}
                className="px-3 py-1.5 text-xs rounded-lg font-bold inline-flex items-center gap-1.5 text-white"
                style={{ background: "#ef4444", opacity: deletionsBusy ? 0.5 : 1 }}>
                {deletionsBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Start verwijderbatch
              </button>
            </div>
          </div>
        </div>
      )}



      {proefsyncConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setProefsyncConfirm(null)}>
          <div className="rounded-xl p-5 max-w-sm w-full" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }} onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-base mb-3" style={{ color: "var(--text-primary)" }}>Bevestig proefsync</h3>
            <dl className="text-xs space-y-1 mb-4" style={{ color: "var(--text-muted)" }}>
              <div className="flex gap-2"><dt className="w-24">Datum</dt><dd style={{ color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }}>{proefsyncConfirm.datum}</dd></div>
              <div className="flex gap-2"><dt className="w-24">Project</dt><dd style={{ color: "var(--text-primary)" }}>{proefsyncConfirm.project_label ?? "—"}</dd></div>
              <div className="flex gap-2"><dt className="w-24">Monteur</dt><dd style={{ color: "var(--text-primary)" }}>{proefsyncConfirm.monteur_label ?? "—"}</dd></div>
              <div className="flex gap-2"><dt className="w-24">Activiteit</dt><dd style={{ color: "var(--text-primary)" }}>{proefsyncConfirm.activiteit ?? "—"}{proefsyncConfirm.kleur ? ` (${proefsyncConfirm.kleur})` : ""}</dd></div>
              <div className="flex gap-2"><dt className="w-24">Tijden</dt><dd style={{ color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }}>{proefsyncConfirm.voorgesteld.starttijd}–{proefsyncConfirm.voorgesteld.eindtijd}</dd></div>
              {proefsyncConfirm.notitie && (
                <div className="flex gap-2"><dt className="w-24">Notitie</dt><dd style={{ color: "var(--text-primary)" }}>{proefsyncConfirm.notitie}</dd></div>
              )}
            </dl>
            <p className="text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>
              Eén regel wordt aangemaakt en gemarkeerd als sync-locked. Bestaande planning wordt niet gewijzigd.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setProefsyncConfirm(null)} className="px-3 py-1.5 text-xs rounded-lg"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}>
                Annuleer
              </button>
              <button
                onClick={() => runProefsync(proefsyncConfirm)}
                disabled={proefsyncBusyKey !== null}
                className="px-3 py-1.5 text-xs rounded-lg font-semibold inline-flex items-center gap-1.5"
                style={{ background: "var(--accent)", color: "white", opacity: proefsyncBusyKey ? 0.5 : 1 }}>
                {proefsyncBusyKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Start proefsync
              </button>
            </div>
          </div>
        </div>
      )}

      {adoptConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setAdoptConfirm(null)}>
          <div className="rounded-xl p-5 max-w-md w-full" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }} onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-base mb-2" style={{ color: "var(--text-primary)" }}>Bevestig adoptie</h3>
            <p className="text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>
              De bestaande handmatige regel blijft behouden (zelfde id, project, monteur, datum, tijden) en wordt onder Planner gehangen via external_source en external_id. Lege velden worden aangevuld vanuit Planner.
            </p>
            <div className="grid grid-cols-2 gap-3 text-[11px] mb-3">
              <div className="rounded-lg p-2" style={{ background: "var(--bg-surface-2)" }}>
                <div className="font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Bestaande regel</div>
                <div style={{ color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }}>
                  {adoptConfirm.bestaande_row?.starttijd ?? "07:00"}–{adoptConfirm.bestaande_row?.eindtijd ?? "16:00"}
                </div>
                <div style={{ color: "var(--text-primary)" }}>
                  {adoptConfirm.bestaande_row?.activiteit ?? <em style={{ color: "var(--text-muted)" }}>geen activiteit</em>}
                </div>
                <div style={{ color: "var(--text-muted)" }}>
                  {adoptConfirm.bestaande_row?.notitie || <em>geen notitie</em>}
                </div>
              </div>
              <div className="rounded-lg p-2" style={{ background: "var(--bg-surface-2)" }}>
                <div className="font-semibold mb-1" style={{ color: "var(--text-muted)" }}>Planner</div>
                <div style={{ color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }}>
                  {adoptConfirm.voorgesteld.starttijd}–{adoptConfirm.voorgesteld.eindtijd}
                </div>
                <div style={{ color: "var(--text-primary)" }}>
                  {adoptConfirm.activiteit ?? "—"}{adoptConfirm.kleur ? ` (${adoptConfirm.kleur})` : ""}
                </div>
                <div style={{ color: "var(--text-muted)" }}>
                  {adoptConfirm.notitie || <em>geen notitie</em>}
                </div>
              </div>
            </div>
            <dl className="text-xs space-y-1 mb-4" style={{ color: "var(--text-muted)" }}>
              <div className="flex gap-2"><dt className="w-20">Datum</dt><dd style={{ color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }}>{adoptConfirm.datum}</dd></div>
              <div className="flex gap-2"><dt className="w-20">Project</dt><dd style={{ color: "var(--text-primary)" }}>{adoptConfirm.project_label ?? "—"}</dd></div>
              <div className="flex gap-2"><dt className="w-20">Monteur</dt><dd style={{ color: "var(--text-primary)" }}>{adoptConfirm.monteur_label ?? "—"}</dd></div>
            </dl>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAdoptConfirm(null)} className="px-3 py-1.5 text-xs rounded-lg"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}>
                Annuleer
              </button>
              <button
                onClick={() => runAdoptie(adoptConfirm)}
                disabled={adoptBusyKey !== null}
                className="px-3 py-1.5 text-xs rounded-lg font-semibold inline-flex items-center gap-1.5"
                style={{ background: "var(--warn-text)", color: "white", opacity: adoptBusyKey ? 0.5 : 1 }}>
                {adoptBusyKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Adopteren
              </button>
            </div>
          </div>
        </div>
      )}

      <PlannerSyncAuditPanel />
    </div>


  );
}

function ExclusionDialog({ row, busy, onClose, onSave }: {
  row: ProjectRow;
  busy: boolean;
  onClose: () => void;
  onSave: (enabled: boolean, reason: PlannerExclusionReason | null) => void;
}) {
  const startEnabled = row.planner_sync_enabled !== false;
  const [enabled, setEnabled] = useState(startEnabled);
  const [reason, setReason] = useState<PlannerExclusionReason>(
    (row.planner_sync_exclusion_reason as PlannerExclusionReason) ?? "urenregistratie"
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="rounded-xl p-5 max-w-sm w-full space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }} onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-base" style={{ color: "var(--text-primary)" }}>Sync-uitsluiting beheren</h3>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          <span style={{ fontFamily: "DM Mono, monospace" }}>{row.nummer}</span> — {row.naam}
        </p>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          Project meenemen in Planner-synchronisatie
        </label>
        {!enabled && (
          <div className="space-y-2">
            <label className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Reden van uitsluiting (verplicht)</label>
            <div className="space-y-1">
              {PLANNER_EXCLUSION_REASONS.map(r => (
                <label key={r} className="flex items-start gap-2 text-xs p-2 rounded cursor-pointer" style={{ background: reason === r ? "var(--bg-surface-2)" : "transparent", border: "1px solid var(--planning-border-soft)" }}>
                  <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="mt-0.5" />
                  <span style={{ color: "var(--text-primary)" }}>{PLANNER_EXCLUSION_LABEL[r]}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} disabled={busy} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}>Annuleren</button>
          <button
            disabled={busy || (!enabled && !reason)}
            onClick={() => onSave(enabled, enabled ? null : reason)}
            className="px-3 py-2 rounded-lg text-xs font-semibold text-white"
            style={{ background: "var(--accent)", opacity: busy ? 0.5 : 1 }}
          >
            Opslaan
          </button>
        </div>
      </div>
    </div>
  );
}

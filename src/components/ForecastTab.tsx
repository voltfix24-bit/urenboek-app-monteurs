import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { query, mutate } from "@/lib/supabaseHelpers";
import { SPEC_CODES, GROEP_LABELS, type SpecCode, loadSpecCodes } from "@/lib/specCodes";
import {
  Plus, Trash2, Search, ChevronDown, ChevronUp, Minus, ClipboardList, Clock,
  Check, Info, Download, FileSpreadsheet, AlertTriangle, RefreshCw, CheckCircle2,
  Layers, Hash, Users,

} from "lucide-react";

import { euroDecimals as fmt } from "@/lib/formatting";
import { Spinner } from "@/components/ui/Spinner";
import { NumericInput } from "@/components/ui/NumericInput";
import { generateForecastPdf } from "@/lib/forecastPdf";
import { generatePrijzenbladExcel } from "@/lib/prijzenbladExcel";

const mono = "font-mono tracking-tight";

interface ForecastRegel {
  id?: string;
  type: string;
  spec_code?: string;
  spec_omschrijving?: string;
  tarief?: number;
  eigen_kosten?: number;
  aantal?: number;
  medewerker_id?: string;
  geplande_uren?: number;
  uurtarief_snap?: number;
}

interface MonteurOption {
  id: string;
  full_name: string;
  uurtarief: number | null;
  rol?: string;
}

interface ProjectInfo {
  nummer: string | null;
  naam: string | null;
}

export interface PlanningKostRegel {
  medewerker_id: string;
  full_name: string;
  rol: string;
  uurtarief: number | null;
  dagen: number;
  uren: number;
  kosten: number;
  zonderTarief: boolean;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function ForecastTab({ projectId }: { projectId: string }) {
  const [forecastId, setForecastId] = useState<string | null>(null);
  const [methode, setMethode] = useState<string | null>(null);
  const [regels, setRegels] = useState<ForecastRegel[]>([]);
  const [monteurs, setMonteurs] = useState<MonteurOption[]>([]);
  const [alleProfielen, setAlleProfielen] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [verwachteOmzet, setVerwachteOmzet] = useState<number>(0);
  const [specCodes, setSpecCodes] = useState<SpecCode[]>(SPEC_CODES);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const isSavingRef = useRef(false);
  const [project, setProject] = useState<ProjectInfo>({ nummer: null, naam: null });
  const [planningKosten, setPlanningKosten] = useState<PlanningKostRegel[]>([]);


  const loadForecast = useCallback(async () => {
    setLoading(true);
    const codes = await loadSpecCodes(supabase);
    setSpecCodes(codes);

    const { data: proj } = await supabase
      .from("projects")
      .select("nummer, naam")
      .eq("id", projectId)
      .maybeSingle();
    if (proj) setProject({ nummer: (proj as any).nummer ?? null, naam: (proj as any).naam ?? null });

    const { data: fc } = await supabase.from("project_forecast").select("*").eq("project_id", projectId).maybeSingle();
    if (fc) {
      setForecastId(fc.id);
      setMethode(fc.methode);
      if ((fc as any).verwachte_omzet != null) {
        setVerwachteOmzet(Number((fc as any).verwachte_omzet) || 0);
      }
      const { data: r } = await supabase.from("forecast_regels").select("*").eq("forecast_id", fc.id);
      if (r) {
        const updatedRegels = r.map((regel: any) => {
          if (regel.spec_code) {
            const spec = codes.find(s => s.code === regel.spec_code);
            if (spec && spec.tarief !== Number(regel.tarief)) {
              return { ...regel, tarief: spec.tarief };
            }
          }
          return regel;
        });
        setRegels(updatedRegels as any);
        const changed = updatedRegels.filter((u: any, i: number) => Number(u.tarief) !== Number((r as any)[i].tarief));
        if (changed.length > 0) {
          for (const regel of changed) {
            await supabase.from("forecast_regels").update({ tarief: regel.tarief }).eq("id", regel.id);
          }
        }
      }
    } else {
      setForecastId(null);
      setMethode(null);
      setRegels([]);
    }
    const { data: profiles } = await supabase.from("profiles").select("id, user_id, full_name, uurtarief");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");

    if (profiles) {
      const namenMap = new Map(profiles.map(p => [p.id, p.full_name]));
      setAlleProfielen(namenMap);
      const rolMap = new Map((roles || []).map(r => [r.user_id, r.role]));
      const tariefMap = new Map(profiles.map(p => [p.id, (p as any).uurtarief != null ? Number((p as any).uurtarief) : null] as [string, number | null]));
      const profielRolMap = new Map(profiles.map(p => [p.id, rolMap.get(p.user_id) || ''] as [string, string]));
      const beschikbaar = profiles
        .filter(p => (p as any).uurtarief != null && Number((p as any).uurtarief) > 0)
        .map(p => ({
          id: p.id,
          full_name: p.full_name,
          uurtarief: (p as any).uurtarief,
          rol: rolMap.get(p.user_id) || '',
        }));
      setMonteurs(beschikbaar);

      // ── Geplande inzet (planning) → personeelskosten ──────────────
      const { data: planRows } = await supabase
        .from("planning")
        .select("medewerker_id, datum, starttijd, eindtijd")
        .eq("project_id", projectId);
      const seen = new Set<string>();
      const perMon = new Map<string, { dagen: Set<string>; uren: number }>();
      for (const row of planRows || []) {
        const key = `${row.medewerker_id}|${row.datum}|${row.starttijd}|${row.eindtijd}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const start = String(row.starttijd || "00:00").slice(0, 5).split(":").map(Number);
        const eind = String(row.eindtijd || "00:00").slice(0, 5).split(":").map(Number);
        const uren = Math.max(0, (eind[0] + eind[1] / 60) - (start[0] + start[1] / 60));
        const agg = perMon.get(row.medewerker_id) || { dagen: new Set(), uren: 0 };
        agg.dagen.add(row.datum);
        agg.uren += uren;
        perMon.set(row.medewerker_id, agg);
      }
      const planKosten: PlanningKostRegel[] = Array.from(perMon.entries()).map(([mid, agg]) => {
        const tarief = tariefMap.get(mid) ?? null;
        return {
          medewerker_id: mid,
          full_name: namenMap.get(mid) || "Onbekend",
          rol: profielRolMap.get(mid) || '',
          uurtarief: tarief,
          dagen: agg.dagen.size,
          uren: agg.uren,
          kosten: tarief != null ? agg.uren * tarief : 0,
          zonderTarief: tarief == null || tarief === 0,
        };
      }).sort((a, b) => b.kosten - a.kosten);
      setPlanningKosten(planKosten);
    }
    setLoading(false);
  }, [projectId]);


  useEffect(() => { loadForecast(); }, [loadForecast]);

  async function selectMethode(m: string) {
    const data = await query(supabase.from("project_forecast").insert({ project_id: projectId, methode: m }).select().single());
    if (!data) return;
    setForecastId(data.id);
    setMethode(m);
  }

  async function changeMethode(nieuweMethode: string) {
    if (!forecastId) return;
    const label = nieuweMethode === "stuksprijzen" ? "stuksprijzen" : nieuweMethode === "uren" ? "uren" : nieuweMethode;
    const ok = window.confirm(
      `Weet je zeker dat je de vergoedingsmethode wijzigt naar "${label}"?\n\nAlle bestaande forecast-regels van dit project worden verwijderd.`
    );
    if (!ok) return;
    await supabase.from("forecast_regels").delete().eq("forecast_id", forecastId);
    const { error } = await supabase
      .from("project_forecast")
      .update({ methode: nieuweMethode, verwachte_omzet: 0 } as any)
      .eq("id", forecastId);
    if (error) {
      toast.error("Kon methode niet wijzigen: " + error.message);
      return;
    }
    setMethode(nieuweMethode);
    setRegels([]);
    setVerwachteOmzet(0);
    toast.success(`Vergoedingsmethode gewijzigd naar ${label}`);
  }

  async function saveVerwachteOmzet(omzet: number) {
    if (!forecastId) return;
    await supabase
      .from("project_forecast")
      .update({ verwachte_omzet: omzet } as any)
      .eq("id", forecastId);
  }

  async function saveRegels(newRegels: ForecastRegel[]) {
    if (!forecastId || isSavingRef.current) return;
    isSavingRef.current = true;
    setSaveState("saving");
    try {
      const { error: delErr } = await supabase.from("forecast_regels").delete().eq("forecast_id", forecastId);
      if (delErr) throw delErr;
      if (newRegels.length > 0) {
        const inserts = newRegels.map(r => ({
          forecast_id: forecastId,
          type: r.type,
          spec_code: r.spec_code || null,
          spec_omschrijving: r.spec_omschrijving || null,
          tarief: r.tarief ?? null,
          eigen_kosten: r.eigen_kosten ?? null,
          aantal: r.aantal ?? 1,
          medewerker_id: r.medewerker_id || null,
          geplande_uren: r.geplande_uren ?? null,
          uurtarief_snap: r.uurtarief_snap ?? null,
        }));
        const ok = await mutate(supabase.from("forecast_regels").insert(inserts));
        if (!ok) throw new Error("insert failed");
      }
      setSaveState("saved");
      setTimeout(() => setSaveState(s => (s === "saved" ? "idle" : s)), 2500);
    } catch (e) {
      setSaveState("error");
    } finally {
      isSavingRef.current = false;
    }
  }

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  function debouncedSave(newRegels: ForecastRegel[]) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveState("saving");
    saveTimerRef.current = setTimeout(() => saveRegels(newRegels), 1200);
  }

  function updateRegels(newRegels: ForecastRegel[]) {
    setRegels(newRegels);
    debouncedSave(newRegels);
  }

  if (loading) return <Spinner padding="py-8" />;

  if (!methode) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Hoe wordt dit project vergoed?</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: "stuksprijzen", Icon: ClipboardList, label: "Stuksprijzen", desc: "Vergoeding per spec-code (R320010 etc.)", sub: "Tarieven Van Gelder als basis" },
            { key: "uren", Icon: Clock, label: "Op uren", desc: "Vergoeding per gewerkt uur", sub: "Op basis van monteurtarief" },
          ].map(o => (
            <button key={o.key} onClick={() => selectMethode(o.key)} className="p-5 rounded-[8px] text-center space-y-2 transition-colors hover:border-[var(--accent)]" style={{ background: "var(--bg-surface)", border: "1.5px solid var(--planning-border-soft)", cursor: "pointer" }}>
              <o.Icon className="h-6 w-6 mx-auto" style={{ color: "var(--accent)" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{o.label}</p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{o.desc}</p>
              <p className="text-[10px]" style={{ color: "var(--planning-border-soft)" }}>{o.sub}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const methodeLabel = methode === "stuksprijzen" ? "Stuksprijzen" : methode === "uren" ? "Op uren" : methode === "intake" ? "Intake (stuksprijzen)" : methode;
  const isStuks = methode === "stuksprijzen" || methode === "intake";
  const otherMethode = isStuks ? "uren" : "stuksprijzen";
  const otherLabel = otherMethode === "stuksprijzen" ? "Stuksprijzen" : "Op uren";

  // ----- Totals (single source of truth) -----
  const planningKostenTotaal = planningKosten.reduce((s, r) => s + r.kosten, 0);
  let totaalOmzet = 0;
  let totaalKosten = 0;
  if (isStuks) {
    totaalOmzet = regels.reduce((s, r) => s + (r.tarief || 0) * (r.aantal || 1), 0);
    // Personeelskosten komen uit de projectplanning, niet uit SPEC-codes.
    totaalKosten = planningKostenTotaal;
  } else {
    totaalOmzet = verwachteOmzet;
    totaalKosten = regels.reduce((s, r) => s + (r.geplande_uren || 0) * (r.uurtarief_snap || 0), 0);
  }
  const margeEuro = totaalOmzet - totaalKosten;
  const margePerc = totaalOmzet > 0 ? (margeEuro / totaalOmzet) * 100 : 0;
  const margeColor = totaalOmzet === 0 ? "var(--text-muted)" : margePerc > 30 ? "var(--accent)" : margePerc >= 15 ? "var(--warn-text)" : "var(--danger)";

  const showOmzetWarn = totaalOmzet <= 0;
  const showKostenWarn = isStuks ? planningKosten.length === 0 : totaalKosten <= 0 && regels.length > 0;


  return (
    <div className="space-y-4">
      {/* ============ Top bar ============ */}
      <div className="rounded-[8px] p-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold leading-tight truncate" style={{ color: "var(--text-primary)" }}>Forecast &amp; calculatie</h2>
            <span className="px-2 py-0.5 rounded-[8px] text-[10px] font-semibold uppercase tracking-wider" style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}>{methodeLabel}</span>
          </div>
          <div className="text-[11px] mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: "var(--text-muted)" }}>
            {project.nummer && <span className={`${mono}`} style={{ color: "var(--accent)" }}>{project.nummer}</span>}
            {project.naam && <span className="truncate">{project.naam}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SaveBadge state={saveState} onRetry={() => saveRegels(regels)} />
          {regels.length > 0 && isStuks && (
            <button
              onClick={() => generatePrijzenbladExcel(projectId)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-semibold transition-colors"
              style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}
              title="Exporteer prijzenblad naar Excel"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Excel</span>
            </button>
          )}
          {regels.length > 0 && (
            <button
              onClick={() => generateForecastPdf(projectId)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-semibold transition-colors"
              style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}
              title="Exporteer prijzenblad als PDF"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">PDF</span>
            </button>
          )}
          <button
            onClick={() => changeMethode(otherMethode)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-semibold transition-colors"
            style={{ background: "var(--warn-light)", color: "var(--warn-text)", border: "1px solid var(--warn-border)" }}
            title={`Wijzig naar ${otherLabel}. Bestaande regels worden gewist.`}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{otherLabel}</span>
          </button>
        </div>
      </div>

      {/* ============ Summary ============ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <SummaryCard label="Verwachte omzet" value={fmt(totaalOmzet)} warn={showOmzetWarn} warnText="Vul omzet in" />
        <SummaryCard label="Personeelskosten (planning)" value={fmt(totaalKosten)} warn={showKostenWarn} warnText={isStuks ? "Geen planning" : "Geen kosten"} />
        <SummaryCard label="Brutomarge" value={fmt(margeEuro)} accent={totaalOmzet > 0 ? margeColor : undefined} />
        <SummaryCard label="Marge %" value={totaalOmzet > 0 ? `${margePerc.toFixed(1)}%` : "—"} accent={totaalOmzet > 0 ? margeColor : undefined} />
      </div>

      {/* ============ Body ============ */}
      {isStuks ? (
        <StuksprijzenEditor regels={regels} onUpdate={updateRegels} specCodes={specCodes} planningKosten={planningKosten} planningKostenTotaal={planningKostenTotaal} />
      ) : (

        <UrenEditor
          regels={regels}
          monteurs={monteurs}
          alleProfielen={alleProfielen}
          onUpdate={updateRegels}
          verwachteOmzet={verwachteOmzet}
          setVerwachteOmzet={setVerwachteOmzet}
          saveVerwachteOmzet={saveVerwachteOmzet}
        />
      )}
    </div>
  );
}

// =================== Reusable bits ===================

function SaveBadge({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "idle") return null;
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[8px] text-[11px] font-medium" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>
        <RefreshCw className="h-3 w-3 animate-spin" /> Opslaan…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[8px] text-[11px] font-medium" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
        <CheckCircle2 className="h-3 w-3" /> Opgeslagen
      </span>
    );
  }
  return (
    <button
      onClick={onRetry}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[8px] text-[11px] font-medium"
      style={{ background: "var(--danger-light, #fef2f2)", color: "var(--danger)", border: "1px solid var(--danger)" }}
      title="Opnieuw proberen"
    >
      <AlertTriangle className="h-3 w-3" /> Opslaan mislukt — opnieuw
    </button>
  );
}

function SummaryCard({ label, value, accent, warn, warnText }: { label: string; value: string; accent?: string; warn?: boolean; warnText?: string }) {
  return (
    <div className="rounded-[8px] p-2.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className={`mt-1 text-[15px] font-semibold ${mono}`} style={{ color: accent || "var(--text-primary)" }}>{value}</p>
      {warn && (
        <p className="mt-1 inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--warn-text)" }}>
          <AlertTriangle className="h-3 w-3" /> {warnText}
        </p>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: any; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-semibold transition-colors"
      style={{
        background: active ? "var(--accent-light)" : "var(--bg-surface)",
        color: active ? "var(--accent)" : "var(--text-muted)",
        border: `1px solid ${active ? "var(--accent-border)" : "var(--planning-border-soft)"}`,
      }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      <span className={`${mono} text-[10px] px-1.5 rounded-[8px]`} style={{ background: active ? "var(--accent)" : "var(--bg-surface-2)", color: active ? "var(--bg-surface)" : "var(--text-muted)" }}>{count}</span>
    </button>
  );
}

// =================== Stuksprijzen editor ===================

function StuksprijzenEditor({ regels, onUpdate, specCodes }: { regels: ForecastRegel[]; onUpdate: (r: ForecastRegel[]) => void; specCodes: SpecCode[] }) {
  const [search, setSearch] = useState("");
  const [browserOpen, setBrowserOpen] = useState(false);
  const [openGroepen, setOpenGroepen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"alle" | "materiaal">("alle");
  const searchRef = useRef<HTMLInputElement>(null);

  const groepen = useMemo(() => {
    const gs = new Set(specCodes.map(s => s.groep));
    return Array.from(gs).sort();
  }, [specCodes]);

  const filteredCodes = useMemo(() => {
    if (!search.trim()) return specCodes;
    const q = search.toLowerCase();
    return specCodes.filter(s => s.code.toLowerCase().includes(q) || s.omschrijving.toLowerCase().includes(q));
  }, [search, specCodes]);

  // Auto-open groups that match the search
  useEffect(() => {
    if (!search.trim()) return;
    const groups = new Set(filteredCodes.map(c => c.groep));
    setOpenGroepen(groups);
  }, [search, filteredCodes]);

  function addCode(sc: SpecCode) {
    if (regels.find(r => r.spec_code === sc.code)) return;
    onUpdate([...regels, { type: "stuks", spec_code: sc.code, spec_omschrijving: sc.omschrijving, tarief: sc.tarief, eigen_kosten: sc.eigen_kosten || 0, aantal: 1 }]);
  }

  function updateAantal(code: string, delta: number) {
    onUpdate(regels.map(r => r.spec_code === code ? { ...r, aantal: Math.max(0.5, (r.aantal || 1) + delta) } : r));
  }
  function setAantal(code: string, val: number) {
    onUpdate(regels.map(r => r.spec_code === code ? { ...r, aantal: Math.max(0.5, val) } : r));
  }
  function removeCode(code: string) {
    const r = regels.find(x => x.spec_code === code);
    if (!window.confirm(`Regel "${r?.spec_code} — ${r?.spec_omschrijving}" verwijderen?`)) return;
    onUpdate(regels.filter(r => r.spec_code !== code));
  }

  const selectedCodes = new Set(regels.map(r => r.spec_code));
  const visibleRegels = regels; // filter "alle" / "materiaal" → identiek voor stuks

  // Per-row spec lookup (eenheid)
  const codeMap = useMemo(() => new Map(specCodes.map(c => [c.code, c])), [specCodes]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
          <input
            ref={searchRef}
            value={search}
            onChange={e => { setSearch(e.target.value); if (!browserOpen) setBrowserOpen(true); }}
            placeholder="Zoek op code of omschrijving"
            className="w-full pl-8 pr-3 py-1.5 rounded-[8px] text-[13px]"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }}
          />
        </div>
        <button
          onClick={() => { setBrowserOpen(o => !o); setTimeout(() => searchRef.current?.focus(), 50); }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-semibold"
          style={{ background: "var(--accent)", color: "#fff", border: "1px solid var(--accent)" }}
          title="SPEC-code zoeken en toevoegen"
        >
          <Plus className="h-3.5 w-3.5" /> Regel toevoegen
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <FilterChip active={filter === "alle"} onClick={() => setFilter("alle")} icon={Layers} label="Alle" count={regels.length} />
        <FilterChip active={filter === "materiaal"} onClick={() => setFilter("materiaal")} icon={Tag} label="Materiaal" count={regels.length} />
      </div>

      {/* SPEC code browser (collapsible) */}
      {browserOpen && (
        <div className="rounded-[8px] overflow-hidden" style={{ border: "1px solid var(--planning-border-soft)" }}>
          <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>
            <span>SPEC-codes</span>
            <button onClick={() => setBrowserOpen(false)} className="text-[11px] font-medium normal-case" style={{ color: "var(--text-muted)" }}>verbergen</button>
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            {groepen.map(g => {
              const codes = filteredCodes.filter(s => s.groep === g);
              if (codes.length === 0) return null;
              const open = openGroepen.has(g);
              const label = GROEP_LABELS[g] || g;
              return (
                <div key={g}>
                  <button onClick={() => { const n = new Set(openGroepen); open ? n.delete(g) : n.add(g); setOpenGroepen(n); }} className="w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold" style={{ background: "var(--bg-surface)", color: "var(--text-primary)", borderTop: "1px solid var(--planning-border-soft)" }}>
                    <span>{label}</span>
                    {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  {open && codes.map(sc => (
                    <div key={sc.code} className="flex items-center gap-2 px-3 py-1.5 text-[12px]" style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--planning-border-soft)" }}>
                      <button
                        onClick={() => addCode(sc)}
                        disabled={selectedCodes.has(sc.code)}
                        className="w-6 h-6 rounded-[8px] flex items-center justify-center shrink-0 text-xs"
                        style={{ background: selectedCodes.has(sc.code) ? "var(--bg-surface-2)" : "var(--accent-light)", color: selectedCodes.has(sc.code) ? "var(--text-muted)" : "var(--accent)" }}
                      >
                        {selectedCodes.has(sc.code) ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                      </button>
                      <span className={`${mono} w-16 shrink-0`} style={{ color: "var(--accent)" }}>{sc.code}</span>
                      <span className="flex-1 truncate" style={{ color: "var(--text-primary)" }}>{sc.omschrijving}</span>
                      <span className={`${mono} shrink-0 text-[11px]`} style={{ color: "var(--text-muted)" }}>{fmt(sc.tarief)} / {sc.eenheid}</span>
                    </div>
                  ))}
                </div>
              );
            })}
            {filteredCodes.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>Geen SPEC-codes gevonden voor “{search}”</div>
            )}
          </div>
        </div>
      )}

      {/* Selected rows */}
      {visibleRegels.length === 0 ? (
        <EmptyState text="Nog geen regels — open de SPEC-codezoeker om de eerste regel toe te voegen." />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-[8px] overflow-hidden overflow-x-auto" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
            <table className="w-full text-[12px]" style={{ minWidth: 720 }}>
              <thead>
                <tr style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>
                  <th className="text-left font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[90px]">Code</th>
                  <th className="text-left font-semibold uppercase tracking-wider text-[10px] px-3 py-2">Omschrijving</th>
                  <th className="text-left font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[90px]">Categorie</th>
                  <th className="text-left font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[60px]">Eenheid</th>
                  <th className="text-center font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[130px]">Aantal</th>
                  <th className="text-right font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[90px]">Prijs</th>
                  <th className="text-right font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[110px]">Totaal</th>
                  <th className="px-3 py-2 w-[40px]"></th>
                </tr>
              </thead>
              <tbody>
                {visibleRegels.map(r => {
                  const totaal = (r.tarief || 0) * (r.aantal || 1);
                  const eenheid = codeMap.get(r.spec_code || "")?.eenheid || "st";
                  return (
                    <tr key={r.spec_code} style={{ borderTop: "1px solid var(--planning-border-soft)" }}>
                      <td className={`px-3 py-1.5 ${mono}`} style={{ color: "var(--accent)" }}>{r.spec_code}</td>
                      <td className="px-3 py-1.5" style={{ color: "var(--text-primary)" }}>
                        <div className="truncate max-w-[320px]" title={r.spec_omschrijving}>{r.spec_omschrijving}</div>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="px-1.5 py-0.5 rounded-[8px] text-[10px] font-semibold" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>Materiaal</span>
                      </td>
                      <td className={`px-3 py-1.5 ${mono}`} style={{ color: "var(--text-muted)" }}>{eenheid}</td>
                      <td className="px-3 py-1.5">
                        <AantalControl value={r.aantal ?? 1} onChange={v => setAantal(r.spec_code!, v)} onStep={d => updateAantal(r.spec_code!, d)} />
                      </td>
                      <td className={`px-3 py-1.5 text-right ${mono}`} style={{ color: "var(--text-muted)" }}>{fmt(r.tarief || 0)}</td>
                      <td className={`px-3 py-1.5 text-right font-semibold ${mono}`} style={{ color: "var(--accent)" }}>{fmt(totaal)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <button onClick={() => removeCode(r.spec_code!)} className="w-6 h-6 rounded-[8px] inline-flex items-center justify-center" style={{ color: "var(--danger)" }} title="Regel verwijderen">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden space-y-2">
            {visibleRegels.map(r => {
              const totaal = (r.tarief || 0) * (r.aantal || 1);
              const eenheid = codeMap.get(r.spec_code || "")?.eenheid || "st";
              return (
                <div key={r.spec_code} className="rounded-[8px] p-2.5 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`${mono} text-[12px]`} style={{ color: "var(--accent)" }}>{r.spec_code}</span>
                        <span className="px-1.5 py-0.5 rounded-[8px] text-[9px] font-semibold uppercase" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>Materiaal</span>
                      </div>
                      <p className="text-[12px] mt-0.5" style={{ color: "var(--text-primary)" }}>{r.spec_omschrijving}</p>
                      <p className={`text-[11px] mt-0.5 ${mono}`} style={{ color: "var(--text-muted)" }}>{fmt(r.tarief || 0)} / {eenheid}</p>
                    </div>
                    <button onClick={() => removeCode(r.spec_code!)} className="w-7 h-7 rounded-[8px] inline-flex items-center justify-center shrink-0" style={{ color: "var(--danger)" }} title="Verwijderen">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <AantalControl value={r.aantal ?? 1} onChange={v => setAantal(r.spec_code!, v)} onStep={d => updateAantal(r.spec_code!, d)} />
                    <span className={`text-[14px] font-semibold ${mono}`} style={{ color: "var(--accent)" }}>{fmt(totaal)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Totals block */}
          <TotalsBlock
            rows={[
              { label: "Verwachte omzet", value: regels.reduce((s, r) => s + (r.tarief || 0) * (r.aantal || 1), 0), accent: true },
              { label: "Totale eigen kosten", value: regels.reduce((s, r) => s + (r.eigen_kosten || 0) * (r.aantal || 1), 0) },
            ]}
            margeFromOmzet
          />
        </>
      )}
    </div>
  );
}

// =================== Aantal control ===================

function AantalControl({ value, onChange, onStep }: { value: number; onChange: (v: number) => void; onStep: (delta: number) => void }) {
  return (
    <div className="inline-flex items-center rounded-[8px] overflow-hidden" style={{ border: "1px solid var(--planning-border-soft)", background: "var(--bg-surface)" }}>
      <button
        onClick={() => onStep(-0.5)}
        className="w-6 h-7 flex items-center justify-center transition-colors"
        style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}
        title="Verlagen"
      >
        <Minus className="h-3 w-3" />
      </button>
      <NumericInput
        value={value}
        onChange={v => onChange(v ?? 1)}
        min={0}
        emptyAs={1}
        decimals={2}
        selectOnFocus
        className={`w-14 h-7 text-center text-[12px] ${mono} bg-transparent outline-none focus:bg-[var(--bg-surface-2)]`}
        style={{ color: "var(--text-primary)" }}
      />
      <button
        onClick={() => onStep(0.5)}
        className="w-6 h-7 flex items-center justify-center transition-colors"
        style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}
        title="Verhogen"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

// =================== Totals block ===================

function TotalsBlock({ rows, margeFromOmzet, children }: { rows: { label: string; value: number; accent?: boolean }[]; margeFromOmzet?: boolean; children?: React.ReactNode }) {
  const omzet = rows.find(r => r.accent)?.value ?? 0;
  const kosten = rows.filter(r => !r.accent).reduce((s, r) => s + r.value, 0);
  const marge = omzet - kosten;
  const margePerc = omzet > 0 ? (marge / omzet) * 100 : 0;
  const margeColor = omzet === 0 ? "var(--text-muted)" : margePerc > 30 ? "var(--accent)" : margePerc >= 15 ? "var(--warn-text)" : "var(--danger)";

  return (
    <div className="rounded-[8px] p-3 space-y-1.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
      {rows.map(r => (
        <div key={r.label} className="flex justify-between text-[12px]">
          <span style={{ color: "var(--text-muted)" }}>{r.label}</span>
          <span className={mono} style={{ color: r.accent ? "var(--accent)" : "var(--text-primary)" }}>{fmt(r.value)}</span>
        </div>
      ))}
      {children}
      {margeFromOmzet && (
        <div className="pt-2 mt-1" style={{ borderTop: "1px solid var(--planning-border-soft)" }}>
          <div className="flex justify-between items-center text-[13px] font-semibold">
            <span style={{ color: "var(--text-primary)" }}>Brutomarge</span>
            <div className="flex items-center gap-2">
              <span className={mono} style={{ color: margeColor }}>{fmt(marge)}</span>
              <span className="px-2 py-0.5 rounded-[8px] text-[11px] font-semibold" style={{ background: margeColor + "18", color: margeColor }}>{margePerc.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-8 rounded-[8px]" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
      <Info className="h-6 w-6 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
      <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>{text}</p>
    </div>
  );
}

// =================== Uren editor ===================

function UrenEditor({ regels, monteurs, alleProfielen, onUpdate, verwachteOmzet, setVerwachteOmzet, saveVerwachteOmzet }: {
  regels: ForecastRegel[]; monteurs: MonteurOption[]; alleProfielen: Map<string, string>; onUpdate: (r: ForecastRegel[]) => void;
  verwachteOmzet: number; setVerwachteOmzet: (v: number) => void; saveVerwachteOmzet: (v: number) => void;
}) {
  const [selectedMonteur, setSelectedMonteur] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"alle" | "uren">("alle");

  function addMonteur() {
    if (!selectedMonteur) return;
    const m = monteurs.find(m => m.id === selectedMonteur);
    if (!m || regels.find(r => r.medewerker_id === m.id)) return;
    onUpdate([...regels, { type: "uren", medewerker_id: m.id, geplande_uren: 0, uurtarief_snap: m.uurtarief || 0 }]);
    setSelectedMonteur("");
  }

  function updateUren(mid: string, uren: number) {
    onUpdate(regels.map(r => r.medewerker_id === mid ? { ...r, geplande_uren: Math.max(0, uren) } : r));
  }
  function stepUren(mid: string, delta: number) {
    onUpdate(regels.map(r => r.medewerker_id === mid ? { ...r, geplande_uren: Math.max(0, (r.geplande_uren || 0) + delta) } : r));
  }
  function removeMonteur(mid: string) {
    const m = monteurs.find(x => x.id === mid);
    const naam = m?.full_name || alleProfielen.get(mid) || "deze medewerker";
    if (!window.confirm(`Regel voor ${naam} verwijderen?`)) return;
    onUpdate(regels.filter(r => r.medewerker_id !== mid));
  }

  const usedIds = new Set(regels.map(r => r.medewerker_id));
  const available = monteurs.filter(m => !usedIds.has(m.id));

  const filteredRegels = useMemo(() => {
    if (!search.trim()) return regels;
    const q = search.toLowerCase();
    return regels.filter(r => {
      const m = monteurs.find(x => x.id === r.medewerker_id);
      return (m?.full_name || alleProfielen.get(r.medewerker_id || "") || "").toLowerCase().includes(q);
    });
  }, [search, regels, monteurs, alleProfielen]);

  function rolLabel(rol: string) {
    if (rol === 'manager') return ' (Manager)';
    if (rol === 'uitvoerder') return ' (Uitvoerder)';
    if (rol === 'wv') return ' (WV)';
    return '';
  }

  return (
    <div className="space-y-3">
      {/* Verwachte omzet */}
      <div className="rounded-[8px] p-3 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
        <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Verwachte omzet (€)</label>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Wat factureert TerreVolt aan Van Gelder voor dit project?
        </p>
        <NumericInput
          value={verwachteOmzet}
          onChange={v => { const val = v ?? 0; setVerwachteOmzet(val); saveVerwachteOmzet(val); }}
          min={0}
          emptyAs={0}
          decimals={2}
          selectOnFocus
          placeholder="bijv. 25000"
          className={`w-full px-3 py-2 rounded-[8px] text-sm ${mono}`}
          style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Zoek op naam"
            className="w-full pl-8 pr-3 py-1.5 rounded-[8px] text-[13px]"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }}
          />
        </div>
        <select value={selectedMonteur} onChange={e => setSelectedMonteur(e.target.value)} className="px-2.5 py-1.5 rounded-[8px] text-[12px] max-w-[260px]" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }}>
          <option value="">Medewerker kiezen…</option>
          {available.map(m => (
            <option key={m.id} value={m.id}>{m.full_name}{rolLabel(m.rol || '')} · €{m.uurtarief}/u</option>
          ))}
        </select>
        <button onClick={addMonteur} disabled={!selectedMonteur} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-semibold disabled:opacity-50" style={{ background: "var(--accent)", color: "#fff", border: "1px solid var(--accent)" }}>
          <Plus className="h-3.5 w-3.5" /> Regel toevoegen
        </button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <FilterChip active={filter === "alle"} onClick={() => setFilter("alle")} icon={Layers} label="Alle" count={regels.length} />
        <FilterChip active={filter === "uren"} onClick={() => setFilter("uren")} icon={Clock} label="Uren" count={regels.length} />
      </div>

      {filteredRegels.length === 0 ? (
        <EmptyState text={regels.length === 0 ? "Nog geen regels — kies een medewerker en voeg toe." : "Geen regels die aan het zoekfilter voldoen."} />
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block rounded-[8px] overflow-hidden overflow-x-auto" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
            <table className="w-full text-[12px]" style={{ minWidth: 640 }}>
              <thead>
                <tr style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>
                  <th className="text-left font-semibold uppercase tracking-wider text-[10px] px-3 py-2">Medewerker</th>
                  <th className="text-left font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[90px]">Categorie</th>
                  <th className="text-left font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[60px]">Eenheid</th>
                  <th className="text-center font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[130px]">Aantal</th>
                  <th className="text-right font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[90px]">Tarief</th>
                  <th className="text-right font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[110px]">Totaal</th>
                  <th className="px-3 py-2 w-[40px]"></th>
                </tr>
              </thead>
              <tbody>
                {filteredRegels.map(r => {
                  const m = monteurs.find(m => m.id === r.medewerker_id);
                  const naam = m?.full_name || alleProfielen.get(r.medewerker_id || '') || r.medewerker_id?.slice(0, 8) || "?";
                  const kosten = (r.geplande_uren || 0) * (r.uurtarief_snap || 0);
                  return (
                    <tr key={r.medewerker_id} style={{ borderTop: "1px solid var(--planning-border-soft)" }}>
                      <td className="px-3 py-1.5" style={{ color: "var(--text-primary)" }}>{naam}</td>
                      <td className="px-3 py-1.5">
                        <span className="px-1.5 py-0.5 rounded-[8px] text-[10px] font-semibold" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>Uren</span>
                      </td>
                      <td className={`px-3 py-1.5 ${mono}`} style={{ color: "var(--text-muted)" }}>u</td>
                      <td className="px-3 py-1.5">
                        <AantalControl value={r.geplande_uren ?? 0} onChange={v => updateUren(r.medewerker_id!, v)} onStep={d => stepUren(r.medewerker_id!, d)} />
                      </td>
                      <td className={`px-3 py-1.5 text-right ${mono}`} style={{ color: "var(--text-muted)" }}>€ {r.uurtarief_snap || 0}</td>
                      <td className={`px-3 py-1.5 text-right font-semibold ${mono}`} style={{ color: "var(--text-primary)" }}>{fmt(kosten)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <button onClick={() => removeMonteur(r.medewerker_id!)} className="w-6 h-6 rounded-[8px] inline-flex items-center justify-center" style={{ color: "var(--danger)" }} title="Regel verwijderen">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-2">
            {filteredRegels.map(r => {
              const m = monteurs.find(m => m.id === r.medewerker_id);
              const naam = m?.full_name || alleProfielen.get(r.medewerker_id || '') || "?";
              const kosten = (r.geplande_uren || 0) * (r.uurtarief_snap || 0);
              return (
                <div key={r.medewerker_id} className="rounded-[8px] p-2.5 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate" style={{ color: "var(--text-primary)" }}>{naam}</p>
                      <p className={`text-[11px] mt-0.5 ${mono}`} style={{ color: "var(--text-muted)" }}>€ {r.uurtarief_snap || 0} / u</p>
                    </div>
                    <button onClick={() => removeMonteur(r.medewerker_id!)} className="w-7 h-7 rounded-[8px] inline-flex items-center justify-center shrink-0" style={{ color: "var(--danger)" }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <AantalControl value={r.geplande_uren ?? 0} onChange={v => updateUren(r.medewerker_id!, v)} onStep={d => stepUren(r.medewerker_id!, d)} />
                    <span className={`text-[14px] font-semibold ${mono}`} style={{ color: "var(--text-primary)" }}>{fmt(kosten)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <TotalsBlock
            rows={[
              { label: "Verwachte omzet", value: verwachteOmzet, accent: true },
              { label: "Totale personeelskosten", value: regels.reduce((s, r) => s + (r.geplande_uren || 0) * (r.uurtarief_snap || 0), 0) },
            ]}
            margeFromOmzet
          >
            <div className="flex justify-between text-[11px] pt-1">
              <span style={{ color: "var(--text-muted)" }}>Totaal geplande uren</span>
              <span className={mono} style={{ color: "var(--text-muted)" }}>{regels.reduce((s, r) => s + (r.geplande_uren || 0), 0)} u</span>
            </div>
          </TotalsBlock>

          {verwachteOmzet === 0 && (
            <div className="flex items-center gap-2 rounded-[8px] p-2.5" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
              <AlertTriangle className="h-4 w-4" style={{ color: "var(--warn-text)" }} />
              <span className="text-[11px] font-medium" style={{ color: "var(--warn-text)" }}>Vul de verwachte omzet in om de marge te berekenen.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

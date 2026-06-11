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
  isPloeg?: boolean;
  ploegLeden?: string[];
  ploegWarning?: boolean;
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
  const [reiskosten, setReiskosten] = useState<number>(0);


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
        const decimalStuks = updatedRegels.filter((u: any) => u.type === "stuks" && u.aantal != null && Number(u.aantal) !== Math.trunc(Number(u.aantal)));
        if (decimalStuks.length > 0) {
          toast.warning(`${decimalStuks.length} bestekregel(s) hebben een decimaal aantal. Aantallen moeten gehele getallen zijn; pas deze handmatig aan.`);
        }
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
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, user_id, full_name, uurtarief, is_onderaannemer, onderaannemer_id");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");

    if (profiles) {
      const namenMap = new Map(profiles.map(p => [p.id, p.full_name]));
      setAlleProfielen(namenMap);
      const rolMap = new Map((roles || []).map(r => [r.user_id, r.role]));
      const tariefMap = new Map(profiles.map(p => [p.id, (p as any).uurtarief != null ? Number((p as any).uurtarief) : null] as [string, number | null]));
      const profielRolMap = new Map(profiles.map(p => [p.id, rolMap.get(p.user_id) || ''] as [string, string]));
      const isOnderaannemerMap = new Map(profiles.map(p => [p.id, !!(p as any).is_onderaannemer] as [string, boolean]));
      const parentMap = new Map(profiles.map(p => [p.id, (p as any).onderaannemer_id as string | null] as [string, string | null]));
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
      // Per monteur (gewone monteurs én onderaannemer-zelf): individuele aggregatie
      const perMon = new Map<string, { dagen: Set<string>; uren: number }>();
      // Per ploeg: groepeer per (parent_id, datum) en houd uren per lid bij om afwijkingen te detecteren
      const perPloegDag = new Map<string, Map<string, Map<string, number>>>();
      // ploegKey → datum → medewerker_id → uren

      for (const row of planRows || []) {
        const key = `${row.medewerker_id}|${row.datum}|${row.starttijd}|${row.eindtijd}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const start = String(row.starttijd || "00:00").slice(0, 5).split(":").map(Number);
        const eind = String(row.eindtijd || "00:00").slice(0, 5).split(":").map(Number);
        const uren = Math.max(0, (eind[0] + eind[1] / 60) - (start[0] + start[1] / 60));

        const parentId = parentMap.get(row.medewerker_id) || null;
        if (parentId) {
          // submonteur van een onderaannemer → tellen op de ploeg
          let dagMap = perPloegDag.get(parentId);
          if (!dagMap) { dagMap = new Map(); perPloegDag.set(parentId, dagMap); }
          let ledenMap = dagMap.get(row.datum);
          if (!ledenMap) { ledenMap = new Map(); dagMap.set(row.datum, ledenMap); }
          ledenMap.set(row.medewerker_id, (ledenMap.get(row.medewerker_id) || 0) + uren);
        } else {
          const agg = perMon.get(row.medewerker_id) || { dagen: new Set(), uren: 0 };
          agg.dagen.add(row.datum);
          agg.uren += uren;
          perMon.set(row.medewerker_id, agg);
        }
      }

      const planKosten: PlanningKostRegel[] = [];

      // Individuele monteurs én onderaannemers die zelf staan ingepland.
      // PAUZE: 1 uur pauze per monteur per dag van planninguren aftrekken (min 0).
      for (const [mid, agg] of perMon.entries()) {
        const tarief = tariefMap.get(mid) ?? null;
        const isOnderaannemerZelf = isOnderaannemerMap.get(mid) || false;
        const netUren = Math.max(0, agg.uren - agg.dagen.size); // 1 u pauze p/dag
        planKosten.push({
          medewerker_id: mid,
          full_name: (namenMap.get(mid) || "Onbekend") + (isOnderaannemerZelf ? " (ploeg)" : ""),
          rol: isOnderaannemerZelf ? "onderaannemer" : (profielRolMap.get(mid) || ''),
          uurtarief: tarief,
          dagen: agg.dagen.size,
          uren: netUren,
          kosten: tarief != null ? netUren * tarief : 0,
          zonderTarief: tarief == null || tarief === 0,
          isPloeg: isOnderaannemerZelf,
        });
      }

      // Onderaannemerploegen (parent + gekoppelde monteurs).
      // PAUZE: per ploegdag 1 u pauze aftrekken (ploeg lunch tegelijk).
      for (const [parentId, dagMap] of perPloegDag.entries()) {
        const ploegTarief = tariefMap.get(parentId) ?? null;
        let ploegUren = 0;
        let warning = false;
        const leden = new Set<string>();
        for (const [, ledenMap] of dagMap.entries()) {
          const ledenUren = Array.from(ledenMap.values());
          ledenUren.forEach((_, idx) => leden.add(Array.from(ledenMap.keys())[idx]));
          if (ledenUren.length === 0) continue;
          const maxUren = Math.max(...ledenUren);
          const minUren = Math.min(...ledenUren);
          if (Math.abs(maxUren - minUren) > 0.01) warning = true;
          ploegUren += Math.max(0, maxUren - 1); // 1 u pauze per ploegdag
        }
        planKosten.push({
          medewerker_id: parentId,
          full_name: (namenMap.get(parentId) || "Onderaannemer") + " (ploeg)",
          rol: "onderaannemer",
          uurtarief: ploegTarief,
          dagen: dagMap.size,
          uren: ploegUren,
          kosten: ploegTarief != null ? ploegUren * ploegTarief : 0,
          zonderTarief: ploegTarief == null || ploegTarief === 0,
          isPloeg: true,
          ploegLeden: Array.from(leden).map(id => namenMap.get(id) || "?"),
          ploegWarning: warning,
        });
      }

      planKosten.sort((a, b) => b.kosten - a.kosten);
      setPlanningKosten(planKosten);

      // ── Reiskosten uit aangemaakte inkooporders ──────────────
      const { data: reiskostenRows } = await supabase
        .from("inkooporder_regels")
        .select("bedrag")
        .eq("project_id", projectId)
        .eq("regel_type", "reiskosten");
      const reiskostenTotaal = (reiskostenRows || []).reduce(
        (s, r: any) => s + Number(r.bedrag || 0),
        0
      );
      setReiskosten(reiskostenTotaal);
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
    // Personeelskosten + reiskosten uit aangemaakte inkooporders.
    totaalKosten = planningKostenTotaal + reiskosten;
  } else {
    totaalOmzet = verwachteOmzet;
    totaalKosten = regels.reduce((s, r) => s + (r.geplande_uren || 0) * (r.uurtarief_snap || 0), 0) + reiskosten;
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
        <StuksprijzenEditor regels={regels} onUpdate={updateRegels} specCodes={specCodes} planningKosten={planningKosten} planningKostenTotaal={planningKostenTotaal} reiskosten={reiskosten} />
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

function StuksprijzenEditor({ regels, onUpdate, specCodes, planningKosten, planningKostenTotaal }: {
  regels: ForecastRegel[]; onUpdate: (r: ForecastRegel[]) => void; specCodes: SpecCode[];
  planningKosten: PlanningKostRegel[]; planningKostenTotaal: number;
}) {
  const [search, setSearch] = useState("");
  const [browserOpen, setBrowserOpen] = useState(true);
  const [openGroepen, setOpenGroepen] = useState<Set<string>>(new Set());
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

  const selectedCodes = useMemo(() => new Set(regels.map(r => r.spec_code)), [regels]);

  // Auto-open groups that match the search or contain selected codes
  useEffect(() => {
    setOpenGroepen(prev => {
      const n = new Set(prev);
      if (search.trim()) {
        filteredCodes.forEach(c => n.add(c.groep));
      }
      // Open groups containing selected codes by default
      regels.forEach(r => {
        const sc = specCodes.find(s => s.code === r.spec_code);
        if (sc) n.add(sc.groep);
      });
      return n;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, regels.length, specCodes]);

  function addCode(sc: SpecCode) {
    if (regels.find(r => r.spec_code === sc.code)) return;
    onUpdate([...regels, { type: "stuks", spec_code: sc.code, spec_omschrijving: sc.omschrijving, tarief: sc.tarief, eigen_kosten: 0, aantal: 1 }]);
  }
  function updateAantal(code: string, delta: number) {
    onUpdate(regels.map(r => r.spec_code === code ? { ...r, aantal: Math.max(0, Math.trunc((r.aantal || 1) + delta)) } : r));
  }
  function setAantal(code: string, val: number) {
    if (!Number.isInteger(val)) {
      toast.error("Aantal moet een geheel getal zijn");
      return;
    }
    onUpdate(regels.map(r => r.spec_code === code ? { ...r, aantal: Math.max(0, val) } : r));
  }
  function removeCode(code: string) {
    const r = regels.find(x => x.spec_code === code);
    if (!window.confirm(`Bestekregel "${r?.spec_code} — ${r?.spec_omschrijving}" verwijderen?`)) return;
    onUpdate(regels.filter(r => r.spec_code !== code));
  }

  const codeMap = useMemo(() => new Map(specCodes.map(c => [c.code, c])), [specCodes]);

  // Per-groep selecties (aantallen + subtotaal)
  const selectiePerGroep = useMemo(() => {
    const map = new Map<string, { count: number; subtotaal: number }>();
    for (const r of regels) {
      const sc = specCodes.find(s => s.code === r.spec_code);
      if (!sc) continue;
      const cur = map.get(sc.groep) || { count: 0, subtotaal: 0 };
      cur.count += 1;
      cur.subtotaal += (r.tarief || 0) * (r.aantal || 1);
      map.set(sc.groep, cur);
    }
    return map;
  }, [regels, specCodes]);

  const omzet = regels.reduce((s, r) => s + (r.tarief || 0) * (r.aantal || 1), 0);

  return (
    <div className="space-y-3">
      {/* ───────────── Bestekcode-zoeker (codekiezer) ───────────── */}
      <div className="rounded-[8px] overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
        <div className="flex items-center gap-2 px-3 py-2 flex-wrap" style={{ background: "var(--bg-surface-2)" }}>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Zoek bestekcode of werkzaamheden"
              className="w-full pl-8 pr-3 py-1.5 rounded-[8px] text-[13px]"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }}
            />
          </div>
          <button
            onClick={() => setBrowserOpen(o => !o)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[12px] font-semibold"
            style={{ background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--planning-border-soft)" }}
          >
            {browserOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {browserOpen ? "Inklappen" : "Uitklappen"}
          </button>
        </div>
        {browserOpen && (
          <div className="max-h-[360px] overflow-y-auto">
            {groepen.map(g => {
              const codes = filteredCodes.filter(s => s.groep === g);
              if (codes.length === 0) return null;
              const open = openGroepen.has(g);
              const label = GROEP_LABELS[g] || g;
              const sel = selectiePerGroep.get(g);
              return (
                <div key={g} style={{ borderTop: "1px solid var(--planning-border-soft)" }}>
                  <button
                    onClick={() => { const n = new Set(openGroepen); open ? n.delete(g) : n.add(g); setOpenGroepen(n); }}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-[12px] font-semibold"
                    style={{ background: "var(--bg-surface)", color: "var(--text-primary)" }}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                      <span className="truncate">{label}</span>
                    </span>
                    {sel && sel.count > 0 && (
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="px-1.5 py-0.5 rounded-[8px] text-[10px] font-semibold" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>{sel.count} gekozen</span>
                        <span className={`${mono} text-[11px]`} style={{ color: "var(--accent)" }}>{fmt(sel.subtotaal)}</span>
                      </span>
                    )}
                  </button>
                  {open && codes.map(sc => {
                    const isSel = selectedCodes.has(sc.code);
                    return (
                      <div key={sc.code} className="flex items-center gap-2 px-3 py-1.5 text-[12px]" style={{ background: isSel ? "var(--accent-light)" : "var(--bg-surface)", borderTop: "1px solid var(--planning-border-soft)" }}>
                        <button
                          onClick={() => addCode(sc)}
                          disabled={isSel}
                          className="w-6 h-6 rounded-[8px] flex items-center justify-center shrink-0 text-xs"
                          style={{ background: isSel ? "var(--accent)" : "var(--accent-light)", color: isSel ? "#fff" : "var(--accent)" }}
                          title={isSel ? "Al toegevoegd" : "Toevoegen"}
                        >
                          {isSel ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                        </button>
                        <span className={`${mono} w-16 shrink-0`} style={{ color: "var(--accent)" }}>{sc.code}</span>
                        <span className="flex-1 truncate" style={{ color: "var(--text-primary)" }}>{sc.omschrijving}</span>
                        <span className={`${mono} shrink-0 text-[11px]`} style={{ color: "var(--text-muted)" }}>{fmt(sc.tarief)} / {sc.eenheid}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {filteredCodes.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>Geen bestekcodes gevonden voor "{search}"</div>
            )}
          </div>
        )}
      </div>

      {/* ───────────── Geselecteerde bestekregels ───────────── */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Geselecteerde bestekregels</p>
        {regels.length === 0 ? (
          <EmptyState text="Nog geen bestekregels — open hierboven een hoofdstuk en kies de werkzaamheden." />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block rounded-[8px] overflow-hidden overflow-x-auto" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
              <table className="w-full text-[12px]" style={{ minWidth: 700 }}>
                <thead>
                  <tr style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>
                    <th className="text-left font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[90px]">Bestekcode</th>
                    <th className="text-left font-semibold uppercase tracking-wider text-[10px] px-3 py-2">Werkzaamheden</th>
                    <th className="text-left font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[60px]">Eenheid</th>
                    <th className="text-center font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[130px]">Aantal</th>
                    <th className="text-right font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[110px]">Opbrengst / eenheid</th>
                    <th className="text-right font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[110px]">Totale opbrengst</th>
                    <th className="px-3 py-2 w-[40px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {regels.map(r => {
                    const totaal = (r.tarief || 0) * (r.aantal || 1);
                    const eenheid = codeMap.get(r.spec_code || "")?.eenheid || "st";
                    return (
                      <tr key={r.spec_code} style={{ borderTop: "1px solid var(--planning-border-soft)" }}>
                        <td className={`px-3 py-1.5 ${mono}`} style={{ color: "var(--accent)" }}>{r.spec_code}</td>
                        <td className="px-3 py-1.5" style={{ color: "var(--text-primary)" }}>
                          <div className="truncate max-w-[340px]" title={r.spec_omschrijving}>{r.spec_omschrijving}</div>
                        </td>
                        <td className={`px-3 py-1.5 ${mono}`} style={{ color: "var(--text-muted)" }}>{eenheid}</td>
                        <td className="px-3 py-1.5">
                          <AantalControl value={r.aantal ?? 1} onChange={v => setAantal(r.spec_code!, v)} onStep={d => updateAantal(r.spec_code!, d)} integer step={1} />
                        </td>
                        <td className={`px-3 py-1.5 text-right ${mono}`} style={{ color: "var(--text-muted)" }}>{fmt(r.tarief || 0)}</td>
                        <td className={`px-3 py-1.5 text-right font-semibold ${mono}`} style={{ color: "var(--accent)" }}>{fmt(totaal)}</td>
                        <td className="px-3 py-1.5 text-right">
                          <button onClick={() => removeCode(r.spec_code!)} className="w-6 h-6 rounded-[8px] inline-flex items-center justify-center" style={{ color: "var(--danger)" }} title="Verwijderen">
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
              {regels.map(r => {
                const totaal = (r.tarief || 0) * (r.aantal || 1);
                const eenheid = codeMap.get(r.spec_code || "")?.eenheid || "st";
                return (
                  <div key={r.spec_code} className="rounded-[8px] p-2.5 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className={`${mono} text-[12px]`} style={{ color: "var(--accent)" }}>{r.spec_code}</span>
                        <p className="text-[12px] mt-0.5" style={{ color: "var(--text-primary)" }}>{r.spec_omschrijving}</p>
                        <p className={`text-[11px] mt-0.5 ${mono}`} style={{ color: "var(--text-muted)" }}>{fmt(r.tarief || 0)} / {eenheid}</p>
                      </div>
                      <button onClick={() => removeCode(r.spec_code!)} className="w-7 h-7 rounded-[8px] inline-flex items-center justify-center shrink-0" style={{ color: "var(--danger)" }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <AantalControl value={r.aantal ?? 1} onChange={v => setAantal(r.spec_code!, v)} onStep={d => updateAantal(r.spec_code!, d)} integer step={1} />
                      <span className={`text-[14px] font-semibold ${mono}`} style={{ color: "var(--accent)" }}>{fmt(totaal)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ───────────── Geplande inzet en personeelskosten ───────────── */}
      <GeplandeInzetSectie planningKosten={planningKosten} />

      {/* ───────────── Totalen ───────────── */}
      <TotalsBlock
        rows={[
          { label: "Verwachte omzet (bestekcodes)", value: omzet, accent: true },
          { label: "Personeelskosten (planning)", value: planningKostenTotaal },
        ]}
        margeFromOmzet
      />
    </div>
  );
}

// =================== Geplande inzet sectie ===================

function GeplandeInzetSectie({ planningKosten }: { planningKosten: PlanningKostRegel[] }) {
  const totaal = planningKosten.reduce((s, r) => s + r.kosten, 0);
  const totaalUren = planningKosten.reduce((s, r) => s + r.uren, 0);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
          <Users className="h-3 w-3" /> Geplande inzet en kosten
        </p>
        {planningKosten.length > 0 && (
          <span className={`text-[11px] ${mono}`} style={{ color: "var(--text-muted)" }}>
            {totaalUren.toFixed(1)} u · {fmt(totaal)}
          </span>
        )}
      </div>
      {planningKosten.length === 0 ? (
        <EmptyState text="Nog geen monteurs ingepland op dit project. Plan inzet in via Planning om personeelskosten te berekenen." />
      ) : (
        <div className="rounded-[8px] overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
          {/* Desktop */}
          <table className="hidden md:table w-full text-[12px]">
            <thead>
              <tr style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>
                <th className="text-left font-semibold uppercase tracking-wider text-[10px] px-3 py-2">Naam</th>
                <th className="text-left font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[90px]">Rol</th>
                <th className="text-right font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[70px]">Dagen</th>
                <th className="text-right font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[80px]">Uren</th>
                <th className="text-right font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[100px]">Kostentarief</th>
                <th className="text-right font-semibold uppercase tracking-wider text-[10px] px-3 py-2 w-[110px]">Personeelskosten</th>
              </tr>
            </thead>
            <tbody>
              {planningKosten.map(r => (
                <tr key={r.medewerker_id} style={{ borderTop: "1px solid var(--planning-border-soft)" }}>
                  <td className="px-3 py-1.5" style={{ color: "var(--text-primary)" }}>
                    {r.full_name}
                    {r.zonderTarief && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--warn-text)" }}>
                        <AlertTriangle className="h-3 w-3" /> geen tarief
                      </span>
                    )}
                    {r.ploegWarning && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--warn-text)" }} title="Ploegleden hebben afwijkende tijden op dezelfde dag — controleer de planning.">
                        <AlertTriangle className="h-3 w-3" /> afwijkende ploegtijden
                      </span>
                    )}
                    {r.ploegLeden && r.ploegLeden.length > 0 && (
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        Leden: {r.ploegLeden.join(", ")}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{r.rol || "monteur"}</td>
                  <td className={`px-3 py-1.5 text-right ${mono}`} style={{ color: "var(--text-muted)" }}>{r.dagen}</td>
                  <td className={`px-3 py-1.5 text-right ${mono}`} style={{ color: "var(--text-primary)" }}>{r.uren.toFixed(1)}</td>
                  <td className={`px-3 py-1.5 text-right ${mono}`} style={{ color: "var(--text-muted)" }}>{r.uurtarief != null ? fmt(r.uurtarief) + (r.isPloeg ? "/ploeg-u" : "") : "—"}</td>
                  <td className={`px-3 py-1.5 text-right font-semibold ${mono}`} style={{ color: r.zonderTarief ? "var(--warn-text)" : "var(--text-primary)" }}>{fmt(r.kosten)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Mobile */}
          <div className="md:hidden divide-y" style={{ borderColor: "var(--planning-border-soft)" } as any}>
            {planningKosten.map(r => (
              <div key={r.medewerker_id} className="px-3 py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12px] truncate" style={{ color: "var(--text-primary)" }}>{r.full_name}</p>
                  <p className={`text-[11px] ${mono}`} style={{ color: "var(--text-muted)" }}>{r.dagen}d · {r.uren.toFixed(1)} u · {r.uurtarief != null ? fmt(r.uurtarief) + (r.isPloeg ? "/ploeg-u" : "/u") : "geen tarief"}</p>
                  {r.ploegWarning && <p className="text-[10px]" style={{ color: "var(--warn-text)" }}>⚠ afwijkende ploegtijden</p>}
                </div>
                <span className={`text-[13px] font-semibold ${mono} shrink-0`} style={{ color: r.zonderTarief ? "var(--warn-text)" : "var(--text-primary)" }}>{fmt(r.kosten)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] mt-1.5 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
        <Info className="h-3 w-3" /> Reiskosten worden (nog) niet automatisch in de Forecast opgenomen.
      </p>
    </div>
  );
}


// =================== Aantal control ===================

function AantalControl({ value, onChange, onStep, integer = false, step = 0.5 }: { value: number; onChange: (v: number) => void; onStep: (delta: number) => void; integer?: boolean; step?: number }) {
  return (
    <div className="inline-flex items-center rounded-[8px] overflow-hidden" style={{ border: "1px solid var(--planning-border-soft)", background: "var(--bg-surface)" }}>
      <button
        onClick={() => onStep(-step)}
        className="w-6 h-7 flex items-center justify-center transition-colors"
        style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}
        title="Verlagen"
      >
        <Minus className="h-3 w-3" />
      </button>
      <NumericInput
        value={value}
        onChange={v => onChange(v ?? (integer ? 0 : 1))}
        min={0}
        emptyAs={integer ? 0 : 1}
        integer={integer}
        decimals={integer ? undefined : 2}
        inputMode={integer ? "numeric" : "decimal"}
        selectOnFocus
        className={`w-14 h-7 text-center text-[12px] ${mono} bg-transparent outline-none focus:bg-[var(--bg-surface-2)]`}
        style={{ color: "var(--text-primary)" }}
      />
      <button
        onClick={() => onStep(step)}
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

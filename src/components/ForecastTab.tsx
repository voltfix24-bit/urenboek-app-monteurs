import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { query, mutate } from "@/lib/supabaseHelpers";
import { SPEC_CODES, GROEP_LABELS, type SpecCode, loadSpecCodes } from "@/lib/specCodes";
import { Plus, X, Search, ChevronDown, ChevronUp, Minus, ClipboardList, Clock, Check, Info, Download } from "lucide-react";

import { euroDecimals as fmt } from "@/lib/formatting";
import { Spinner } from "@/components/ui/Spinner";
import { generateForecastPdf } from "@/lib/forecastPdf";

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

export function ForecastTab({ projectId }: { projectId: string }) {
  const [forecastId, setForecastId] = useState<string | null>(null);
  const [methode, setMethode] = useState<string | null>(null);
  const [regels, setRegels] = useState<ForecastRegel[]>([]);
  const [monteurs, setMonteurs] = useState<MonteurOption[]>([]);
  const [alleProfielen, setAlleProfielen] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [verwachteOmzet, setVerwachteOmzet] = useState<number>(0);
  const [specCodes, setSpecCodes] = useState<SpecCode[]>(SPEC_CODES);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadForecast = useCallback(async () => {
    setLoading(true);
    const codes = await loadSpecCodes(supabase);
    setSpecCodes(codes);

    const { data: fc } = await supabase.from("project_forecast").select("*").eq("project_id", projectId).maybeSingle();
    if (fc) {
      setForecastId(fc.id);
      setMethode(fc.methode);
      // Load saved verwachte omzet
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
        // Persist any updated tarieven
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

      // Build role map
      const rolMap = new Map((roles || []).map(r => [r.user_id, r.role]));

      // All profiles with uurtarief > 0
      const beschikbaar = profiles
        .filter(p => (p as any).uurtarief != null && Number((p as any).uurtarief) > 0)
        .map(p => ({
          id: p.id,
          full_name: p.full_name,
          uurtarief: (p as any).uurtarief,
          rol: rolMap.get(p.user_id) || '',
        }));
      setMonteurs(beschikbaar);
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
    // Bestaande regels wissen
    await supabase.from("forecast_regels").delete().eq("forecast_id", forecastId);
    // Methode updaten + verwachte omzet resetten
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
    if (!forecastId || isSaving) return;
    setIsSaving(true);
    try {
      await supabase.from("forecast_regels").delete().eq("forecast_id", forecastId);
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
        if (!await mutate(supabase.from("forecast_regels").insert(inserts))) return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setIsSaving(false);
    }
  }

  const [saveTimer, setSaveTimer] = useState<NodeJS.Timeout | null>(null);
  function debouncedSave(newRegels: ForecastRegel[]) {
    if (saveTimer) clearTimeout(saveTimer);
    setSaved(false);
    const t = setTimeout(() => saveRegels(newRegels), 1500);
    setSaveTimer(t);
  }

  function updateRegels(newRegels: ForecastRegel[]) {
    setRegels(newRegels);
    debouncedSave(newRegels);
  }

  if (loading) return <Spinner padding="py-8" />;

  if (!methode) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium" style={{ color: "#dae6ff" }}>Hoe wordt dit project vergoed?</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: "stuksprijzen", Icon: ClipboardList, label: "Stuksprijzen", desc: "Vergoeding per spec-code (R320010 etc.)", sub: "Tarieven Van Gelder als basis" },
            { key: "uren", Icon: Clock, label: "Op uren", desc: "Vergoeding per gewerkt uur", sub: "Op basis van monteurtarief" },
          ].map(o => (
            <button key={o.key} onClick={() => selectMethode(o.key)} className="p-5 rounded-[14px] text-center space-y-2 transition-colors hover:border-[#3fff8b]" style={{ background: "rgba(10,26,48,0.7)", border: "1.5px solid rgba(106,118,140,0.15)", cursor: "pointer" }}>
              <o.Icon className="h-6 w-6 mx-auto" style={{ color: "#3fff8b" }} />
              <p className="text-sm font-semibold" style={{ color: "#dae6ff" }}>{o.label}</p>
              <p className="text-[11px]" style={{ color: "#a0abc3" }}>{o.desc}</p>
              <p className="text-[10px]" style={{ color: "rgba(106,118,140,0.15)" }}>{o.sub}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const methodeLabel = methode === "stuksprijzen" ? "Stuksprijzen" : methode === "uren" ? "Op uren" : methode === "intake" ? "Intake (stuksprijzen)" : methode;
  const otherMethode = (methode === "stuksprijzen" || methode === "intake") ? "uren" : "stuksprijzen";
  const otherLabel = otherMethode === "stuksprijzen" ? "Stuksprijzen" : "Op uren";

  const headerBar = (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2 text-[11px]" style={{ color: "#a0abc3" }}>
        <span className="uppercase tracking-wider">Methode:</span>
        <span className="font-semibold" style={{ color: "#dae6ff" }}>{methodeLabel}</span>
        <button
          onClick={() => changeMethode(otherMethode)}
          className="px-2 py-1 rounded-[8px] text-[11px] font-semibold transition-colors"
          style={{
            background: "rgba(254,179,0,0.1)",
            color: "#feb300",
            border: "1px solid rgba(254,179,0,0.3)",
          }}
          title={`Wijzig vergoedingsmethode naar ${otherLabel}. Bestaande regels worden gewist.`}
        >
          Wijzig naar {otherLabel}
        </button>
      </div>
      {regels.length > 0 && (
        <button
          onClick={() => generateForecastPdf(projectId)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[12px] font-semibold transition-colors"
          style={{
            background: "rgba(63,255,139,0.1)",
            color: "#3fff8b",
            border: "1px solid rgba(63,255,139,0.3)",
          }}
          title="Download prijzenblad als PDF om te delen met de opdrachtgever"
        >
          <Download className="h-3.5 w-3.5" />
          Prijzenblad (PDF)
        </button>
      )}
    </div>
  );

  if (methode === "stuksprijzen" || methode === "intake") {
    return (
      <div className="space-y-3">
        {headerBar}
        <StuksprijzenEditor regels={regels} onUpdate={updateRegels} specCodes={specCodes} saved={saved} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {headerBar}
      <UrenEditor regels={regels} monteurs={monteurs} alleProfielen={alleProfielen} onUpdate={updateRegels} verwachteOmzet={verwachteOmzet} setVerwachteOmzet={setVerwachteOmzet} saveVerwachteOmzet={saveVerwachteOmzet} saved={saved} />
    </div>
  );
}

function StuksprijzenEditor({ regels, onUpdate, specCodes, saved }: { regels: ForecastRegel[]; onUpdate: (r: ForecastRegel[]) => void; specCodes: SpecCode[]; saved: boolean }) {
  const [search, setSearch] = useState("");
  const [openGroepen, setOpenGroepen] = useState<Set<string>>(new Set());

  const groepen = useMemo(() => {
    const gs = new Set(specCodes.map(s => s.groep));
    return Array.from(gs).sort();
  }, [specCodes]);

  const filtered = useMemo(() => {
    if (!search.trim()) return specCodes;
    const q = search.toLowerCase();
    return specCodes.filter(s => s.code.toLowerCase().includes(q) || s.omschrijving.toLowerCase().includes(q));
  }, [search, specCodes]);

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
    onUpdate(regels.filter(r => r.spec_code !== code));
  }

  const totaalOmzet = regels.reduce((s, r) => s + (r.tarief || 0) * (r.aantal || 1), 0);
  const totaalKosten = regels.reduce((s, r) => s + (r.eigen_kosten || 0) * (r.aantal || 1), 0);
  const totaalMarge = totaalOmzet - totaalKosten;
  const totaalMargePerc = totaalOmzet > 0 ? (totaalMarge / totaalOmzet) * 100 : 0;
  const totaalMargeColor = totaalMargePerc > 30 ? "#3fff8b" : totaalMargePerc >= 15 ? "#feb300" : "#ff716c";

  const selectedCodes = new Set(regels.map(r => r.spec_code));

  return (
    <div className="space-y-4">
      {/* Spec code browser */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#a0abc3" }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoek op code of omschrijving..." className="w-full pl-9 pr-3 py-2 rounded-[10px] text-sm" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(106,118,140,0.15)" }}>
        {groepen.map(g => {
          const codes = filtered.filter(s => s.groep === g);
          if (codes.length === 0) return null;
          const open = openGroepen.has(g);
          const label = GROEP_LABELS[g] || g;
          return (
            <div key={g}>
              <button onClick={() => { const n = new Set(openGroepen); open ? n.delete(g) : n.add(g); setOpenGroepen(n); }} className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold" style={{ background: "#102038", color: "#dae6ff", borderBottom: "1px solid rgba(106,118,140,0.15)" }}>
                {label}
                {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {open && codes.map(sc => (
                <div key={sc.code} className="flex items-center gap-2 px-3 py-1.5 text-[12px]" style={{ background: "rgba(10,26,48,0.7)", borderBottom: "1px solid rgba(106,118,140,0.15)" }}>
                  <button onClick={() => addCode(sc)} disabled={selectedCodes.has(sc.code)} className="w-6 h-6 rounded flex items-center justify-center shrink-0 text-xs" style={{ background: selectedCodes.has(sc.code) ? "rgba(106,118,140,0.15)" : "rgba(63,255,139,0.1)", color: selectedCodes.has(sc.code) ? "#a0abc3" : "#3fff8b" }}>
                    {selectedCodes.has(sc.code) ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                  </button>
                  <span className={`${mono} w-16 shrink-0`} style={{ color: "#3fff8b" }}>{sc.code}</span>
                  <span className="flex-1 truncate" style={{ color: "#dae6ff" }}>{sc.omschrijving}</span>
                  <span className={`${mono} shrink-0`} style={{ color: "#a0abc3" }}>{fmt(sc.tarief)} / {sc.eenheid}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Selected codes table */}
      {regels.length > 0 ? (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Geselecteerde codes</p>
          <div className="rounded-xl overflow-hidden overflow-x-auto" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
            <div className="grid grid-cols-[70px_1fr_60px_80px_80px_80px_28px] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider min-w-[520px]" style={{ background: "#102038", color: "#a0abc3" }}>
              <span>Code</span><span>Omschrijving</span><span>Aantal</span><span>Omzet</span><span>Kosten</span><span>Marge</span><span></span>
            </div>
            {regels.map(r => {
              const omzet = (r.tarief || 0) * (r.aantal || 1);
              const kosten = (r.eigen_kosten || 0) * (r.aantal || 1);
              const marge = omzet - kosten;
              const margePerc = omzet > 0 ? (marge / omzet) * 100 : 0;
              const margeColor = margePerc > 30 ? "#3fff8b" : margePerc >= 15 ? "#feb300" : "#ff716c";
              return (
                <div key={r.spec_code} className="grid grid-cols-[70px_1fr_60px_80px_80px_80px_28px] items-center px-3 py-1.5 text-[12px] min-w-[520px]" style={{ borderTop: "1px solid rgba(106,118,140,0.15)" }}>
                  <span className={mono} style={{ color: "#3fff8b" }}>{r.spec_code}</span>
                  <span className="truncate" style={{ color: "#dae6ff" }}>{r.spec_omschrijving}</span>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => updateAantal(r.spec_code!, -0.5)} className="w-5 h-5 rounded flex items-center justify-center" style={{ background: "#102038" }}><Minus className="h-3 w-3" style={{ color: "#a0abc3" }} /></button>
                    <input type="number" value={r.aantal || 1} onChange={e => setAantal(r.spec_code!, parseFloat(e.target.value) || 1)} className={`w-8 text-center text-[11px] ${mono} bg-transparent`} style={{ color: "#dae6ff" }} />
                    <button onClick={() => updateAantal(r.spec_code!, 0.5)} className="w-5 h-5 rounded flex items-center justify-center" style={{ background: "#102038" }}><Plus className="h-3 w-3" style={{ color: "#a0abc3" }} /></button>
                  </div>
                  <span className={mono} style={{ color: "#3fff8b" }}>{fmt(omzet)}</span>
                  <span className={mono} style={{ color: "#a0abc3" }}>{fmt(kosten)}</span>
                  <span className={mono} style={{ color: margeColor }}>{fmt(marge)} <span className="text-[9px]">({margePerc.toFixed(0)}%)</span></span>
                  <button onClick={() => removeCode(r.spec_code!)} className="w-5 h-5 rounded flex items-center justify-center" style={{ color: "#ff716c" }}><X className="h-3.5 w-3.5" /></button>
                </div>
              );
            })}
          </div>

          {/* Totals */}
          <div className="rounded-xl p-3.5 space-y-1.5" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)" }}>
            <div className="flex justify-between text-[12px]">
              <span style={{ color: "#a0abc3" }}>Totaal omzet (Van Gelder)</span>
              <span className={mono} style={{ color: "#3fff8b" }}>{fmt(totaalOmzet)}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span style={{ color: "#a0abc3" }}>Totale eigen kosten</span>
              <span className={mono} style={{ color: "#dae6ff" }}>{fmt(totaalKosten)}</span>
            </div>
            <div className="pt-1.5" style={{ borderTop: "1px solid rgba(106,118,140,0.15)" }}>
              <div className="flex justify-between text-[13px] font-semibold">
                <span style={{ color: "#dae6ff" }}>Bruto marge</span>
                <div className="flex items-center gap-2">
                  <span className={mono} style={{ color: totaalMargeColor }}>{fmt(totaalMarge)}</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: totaalMargeColor + "18", color: totaalMargeColor }}>{totaalMargePerc.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Auto-save indicator */}
          <p className="text-[11px] text-center" style={{ color: "#a0abc3" }}>
            {saved ? "✓ Automatisch opgeslagen" : "Wordt automatisch opgeslagen..."}
          </p>
        </>
      ) : (
        <div className="text-center py-8 rounded-xl" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
          <Info className="h-6 w-6 mx-auto mb-2" style={{ color: "#a0abc3" }} />
          <p className="text-sm" style={{ color: "#a0abc3" }}>Voeg spec-codes toe om de forecast te berekenen.</p>
        </div>
      )}
    </div>
  );
}

function UrenEditor({ regels, monteurs, alleProfielen, onUpdate, verwachteOmzet, setVerwachteOmzet, saveVerwachteOmzet, saved }: {
  regels: ForecastRegel[]; monteurs: MonteurOption[]; alleProfielen: Map<string, string>; onUpdate: (r: ForecastRegel[]) => void;
  verwachteOmzet: number; setVerwachteOmzet: (v: number) => void; saveVerwachteOmzet: (v: number) => void; saved: boolean;
}) {
  const [selectedMonteur, setSelectedMonteur] = useState("");

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

  function removeMonteur(mid: string) {
    onUpdate(regels.filter(r => r.medewerker_id !== mid));
  }

  const totaalUren = regels.reduce((s, r) => s + (r.geplande_uren || 0), 0);
  const totaalKosten = regels.reduce((s, r) => s + (r.geplande_uren || 0) * (r.uurtarief_snap || 0), 0);
  const margeEuro = verwachteOmzet - totaalKosten;
  const margePerc = verwachteOmzet > 0 ? (margeEuro / verwachteOmzet) * 100 : 0;
  const margeColor = margePerc > 30 ? "#3fff8b" : margePerc >= 15 ? "#feb300" : "#ff716c";

  const usedIds = new Set(regels.map(r => r.medewerker_id));
  const available = monteurs.filter(m => !usedIds.has(m.id));

  function rolLabel(rol: string) {
    if (rol === 'manager') return ' (Manager)';
    if (rol === 'uitvoerder') return ' (Uitvoerder)';
    if (rol === 'wv') return ' (WV)';
    return '';
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select value={selectedMonteur} onChange={e => setSelectedMonteur(e.target.value)} className="flex-1 px-3 py-2 rounded-xl text-sm" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }}>
          <option value="">Medewerker toevoegen...</option>
          {available.map(m => (
            <option key={m.id} value={m.id}>{m.full_name}{rolLabel(m.rol || '')} · €{m.uurtarief}/u</option>
          ))}
        </select>
        <button onClick={addMonteur} disabled={!selectedMonteur} className="px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: "rgba(63,255,139,0.1)", color: "#3fff8b", border: "1px solid rgba(63,255,139,0.3)" }}>
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {regels.length > 0 && (
        <>
          <div className="rounded-xl overflow-hidden" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
            <div className="grid grid-cols-[1fr_70px_70px_80px_32px] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ background: "#102038", color: "#a0abc3" }}>
              <span>Medewerker</span><span>Tarief</span><span>Uren</span><span>Kosten</span><span></span>
            </div>
            {regels.map(r => {
              const m = monteurs.find(m => m.id === r.medewerker_id);
              const kosten = (r.geplande_uren || 0) * (r.uurtarief_snap || 0);
              return (
                <div key={r.medewerker_id} className="grid grid-cols-[1fr_70px_70px_80px_32px] items-center px-3 py-1.5 text-[12px]" style={{ borderTop: "1px solid rgba(106,118,140,0.15)" }}>
                  <span className="truncate" style={{ color: "#dae6ff" }}>{m?.full_name || alleProfielen.get(r.medewerker_id || '') || r.medewerker_id?.slice(0, 8) || "?"}</span>
                  <span className={mono} style={{ color: "#a0abc3" }}>€ {r.uurtarief_snap || 0}</span>
                  <input type="number" value={r.geplande_uren || 0} onChange={e => updateUren(r.medewerker_id!, parseFloat(e.target.value) || 0)} className={`w-14 text-center bg-transparent text-[12px] ${mono}`} style={{ color: "#dae6ff" }} min={0} />
                  <span className={mono} style={{ color: "#dae6ff" }}>{fmt(kosten)}</span>
                  <button onClick={() => removeMonteur(r.medewerker_id!)} className="w-5 h-5 rounded flex items-center justify-center" style={{ color: "#ff716c" }}><X className="h-3.5 w-3.5" /></button>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl p-3.5 space-y-2" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)" }}>
            <div className="flex justify-between text-[12px]">
              <span style={{ color: "#a0abc3" }}>Totaal geplande uren</span>
              <span className={mono} style={{ color: "#dae6ff" }}>{totaalUren} u</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span style={{ color: "#a0abc3" }}>Totale personeelskosten</span>
              <span className={mono} style={{ color: "#dae6ff" }}>{fmt(totaalKosten)}</span>
            </div>
            <div className="pt-2" style={{ borderTop: "1px solid rgba(106,118,140,0.15)" }}>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Verwachte omzet (€)</label>
                <p className="text-[11px]" style={{ color: "#a0abc3" }}>
                  Wat factureert TerreVolt aan Van Gelder voor dit project? Dit staat in de opdrachtbevestiging of is op basis van stuksprijzen afgesproken.
                </p>
                <input type="number" value={verwachteOmzet || ""} onChange={e => {
                  const val = parseFloat(e.target.value) || 0;
                  setVerwachteOmzet(val);
                  saveVerwachteOmzet(val);
                }} placeholder="bijv. 25000" className={`w-full mt-1 px-3 py-2 rounded-xl text-sm ${mono}`} style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
              </div>
            </div>
            {verwachteOmzet === 0 && (
              <div className="flex items-center gap-2 rounded-xl p-2.5" style={{ background: "rgba(254,179,0,0.1)", border: "1px solid rgba(254,179,0,0.3)" }}>
                <span className="text-[11px] font-medium" style={{ color: "#feb300" }}>⚠ Vul de verwachte omzet in om de marge te berekenen</span>
              </div>
            )}
            {verwachteOmzet > 0 && (
              <div className="flex justify-between items-center text-[13px] font-semibold pt-1" style={{ borderTop: "1px solid rgba(106,118,140,0.15)" }}>
                <span style={{ color: "#dae6ff" }}>Marge</span>
                <div className="flex items-center gap-2">
                  <span className={mono} style={{ color: "#dae6ff" }}>{fmt(margeEuro)}</span>
                  <span className="px-3 py-0.5 rounded-full text-[13px] font-semibold" style={{ background: margeColor + "18", color: margeColor }}>{margePerc.toFixed(1)}%</span>
                </div>
              </div>
            )}
          </div>

          {/* Auto-save indicator */}
          <p className="text-[11px] text-center" style={{ color: "#a0abc3" }}>
            {saved ? "✓ Automatisch opgeslagen" : "Wordt automatisch opgeslagen..."}
          </p>
        </>
      )}
    </div>
  );
}

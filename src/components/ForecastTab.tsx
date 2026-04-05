import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SPEC_CODES, SPEC_CODE_GROEPEN, type SpecCode } from "@/lib/specCodes";
import { Plus, X, Search, ChevronDown, ChevronUp, Minus } from "lucide-react";

const mono = "font-mono tracking-tight";
const fmt = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);

interface ForecastRegel {
  id?: string;
  type: string;
  spec_code?: string;
  spec_omschrijving?: string;
  tarief_terrevolt?: number;
  tarief_inkoop?: number;
  aantal?: number;
  medewerker_id?: string;
  geplande_uren?: number;
  uurtarief_snap?: number;
}

interface MonteurOption {
  id: string;
  full_name: string;
  uurtarief: number | null;
}

export function ForecastTab({ projectId }: { projectId: string }) {
  const [forecastId, setForecastId] = useState<string | null>(null);
  const [methode, setMethode] = useState<string | null>(null);
  const [regels, setRegels] = useState<ForecastRegel[]>([]);
  const [monteurs, setMonteurs] = useState<MonteurOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [verwachteOmzet, setVerwachteOmzet] = useState<number>(0);

  const loadForecast = useCallback(async () => {
    setLoading(true);
    const { data: fc } = await supabase.from("project_forecast").select("*").eq("project_id", projectId).maybeSingle();
    if (fc) {
      setForecastId(fc.id);
      setMethode(fc.methode);
      const { data: r } = await supabase.from("forecast_regels").select("*").eq("forecast_id", fc.id);
      if (r) setRegels(r as any);
    } else {
      setForecastId(null);
      setMethode(null);
      setRegels([]);
    }
    // Load monteurs for uren method
    const { data: profiles } = await supabase.from("profiles").select("id, user_id, full_name, uurtarief");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    if (profiles && roles) {
      const monteurUserIds = new Set(roles.filter(r => r.role === "monteur" || r.role === "schakelmonteur").map(r => r.user_id));
      setMonteurs(profiles.filter(p => monteurUserIds.has(p.user_id)).map(p => ({ id: p.id, full_name: p.full_name, uurtarief: (p as any).uurtarief })));
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadForecast(); }, [loadForecast]);

  async function selectMethode(m: string) {
    const { data, error } = await supabase.from("project_forecast").insert({ project_id: projectId, methode: m }).select().single();
    if (error) { toast.error("Fout bij opslaan methode"); return; }
    setForecastId(data.id);
    setMethode(m);
  }

  async function saveRegels(newRegels: ForecastRegel[]) {
    if (!forecastId) return;
    // Delete existing, insert new
    await supabase.from("forecast_regels").delete().eq("forecast_id", forecastId);
    if (newRegels.length > 0) {
      const inserts = newRegels.map(r => ({
        forecast_id: forecastId,
        type: r.type,
        spec_code: r.spec_code || null,
        spec_omschrijving: r.spec_omschrijving || null,
        tarief_terrevolt: r.tarief_terrevolt ?? null,
        tarief_inkoop: r.tarief_inkoop ?? null,
        aantal: r.aantal ?? 1,
        medewerker_id: r.medewerker_id || null,
        geplande_uren: r.geplande_uren ?? null,
        uurtarief_snap: r.uurtarief_snap ?? null,
      }));
      const { error } = await supabase.from("forecast_regels").insert(inserts);
      if (error) { toast.error("Fout bij opslaan"); return; }
    }
    toast.success("Forecast opgeslagen ✓");
  }

  // Debounced save
  const [saveTimer, setSaveTimer] = useState<NodeJS.Timeout | null>(null);
  function debouncedSave(newRegels: ForecastRegel[]) {
    if (saveTimer) clearTimeout(saveTimer);
    const t = setTimeout(() => saveRegels(newRegels), 1500);
    setSaveTimer(t);
  }

  function updateRegels(newRegels: ForecastRegel[]) {
    setRegels(newRegels);
    debouncedSave(newRegels);
  }

  if (loading) return <p className="text-sm py-8 text-center" style={{ color: "#8AAD6E" }}>Laden...</p>;

  if (!methode) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium" style={{ color: "#2D4A1E" }}>Hoe wordt dit project vergoed?</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: "stuksprijzen", icon: "📋", label: "Stuksprijzen", desc: "Vergoeding per spec-code (R320010 etc.)" },
            { key: "uren", icon: "⏱", label: "Op uren", desc: "Vergoeding per gewerkt uur" },
          ].map(o => (
            <button key={o.key} onClick={() => selectMethode(o.key)} className="p-5 rounded-[14px] text-center space-y-2 transition-colors hover:border-[#4A7C2F]" style={{ background: "#EBF0E4", border: "1.5px solid #C5D4B2", cursor: "pointer" }}>
              <p className="text-2xl">{o.icon}</p>
              <p className="text-sm font-semibold" style={{ color: "#2D4A1E" }}>{o.label}</p>
              <p className="text-[11px]" style={{ color: "#8AAD6E" }}>{o.desc}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (methode === "stuksprijzen") {
    return <StuksprijzenEditor regels={regels} onUpdate={updateRegels} onSave={() => saveRegels(regels)} />;
  }

  return <UrenEditor regels={regels} monteurs={monteurs} onUpdate={updateRegels} onSave={() => saveRegels(regels)} verwachteOmzet={verwachteOmzet} setVerwachteOmzet={setVerwachteOmzet} />;
}

function StuksprijzenEditor({ regels, onUpdate, onSave }: { regels: ForecastRegel[]; onUpdate: (r: ForecastRegel[]) => void; onSave: () => void }) {
  const [search, setSearch] = useState("");
  const [openGroepen, setOpenGroepen] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!search.trim()) return SPEC_CODES;
    const q = search.toLowerCase();
    return SPEC_CODES.filter(s => s.code.toLowerCase().includes(q) || s.omschrijving.toLowerCase().includes(q));
  }, [search]);

  function addCode(sc: SpecCode) {
    if (regels.find(r => r.spec_code === sc.code)) return;
    onUpdate([...regels, { type: "stuks", spec_code: sc.code, spec_omschrijving: sc.omschrijving, tarief_terrevolt: sc.tarief_terrevolt, tarief_inkoop: sc.tarief_inkoop, aantal: 1 }]);
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

  const totaalOmzet = regels.reduce((s, r) => s + (r.tarief_terrevolt || 0) * (r.aantal || 1), 0);
  const totaalKosten = regels.reduce((s, r) => s + (r.tarief_inkoop || 0) * (r.aantal || 1), 0);
  const marge = totaalOmzet - totaalKosten;
  const margePerc = totaalOmzet > 0 ? (marge / totaalOmzet) * 100 : 0;
  const margeColor = margePerc > 30 ? "#2D7A3A" : margePerc >= 15 ? "#8B6914" : "#C0392B";

  const selectedCodes = new Set(regels.map(r => r.spec_code));

  return (
    <div className="space-y-4">
      {/* Spec code browser */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#8AAD6E" }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoek op code of omschrijving..." className="w-full pl-9 pr-3 py-2 rounded-[10px] text-sm" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2", color: "#2D4A1E" }} />
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #C5D4B2" }}>
        {SPEC_CODE_GROEPEN.map(g => {
          const codes = filtered.filter(s => s.groep === g.prefix);
          if (codes.length === 0) return null;
          const open = openGroepen.has(g.prefix);
          return (
            <div key={g.prefix}>
              <button onClick={() => { const n = new Set(openGroepen); open ? n.delete(g.prefix) : n.add(g.prefix); setOpenGroepen(n); }} className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold" style={{ background: "#DFE8D6", color: "#2D4A1E", borderBottom: "1px solid #C5D4B2" }}>
                {g.label}
                {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {open && codes.map(sc => (
                <div key={sc.code} className="flex items-center gap-2 px-3 py-1.5 text-[12px]" style={{ background: "#EBF0E4", borderBottom: "1px solid #C5D4B2" }}>
                  <button onClick={() => addCode(sc)} disabled={selectedCodes.has(sc.code)} className="w-6 h-6 rounded flex items-center justify-center shrink-0 text-xs" style={{ background: selectedCodes.has(sc.code) ? "#C5D4B2" : "#D4E8C2", color: selectedCodes.has(sc.code) ? "#8AAD6E" : "#4A7C2F" }}>
                    {selectedCodes.has(sc.code) ? "✓" : "+"}
                  </button>
                  <span className={`${mono} w-16 shrink-0`} style={{ color: "#4A7C2F" }}>{sc.code}</span>
                  <span className="flex-1 truncate" style={{ color: "#2D4A1E" }}>{sc.omschrijving}</span>
                  <span className={`${mono} shrink-0`} style={{ color: "#5A7A42" }}>{fmt(sc.tarief_terrevolt)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Selected codes table */}
      {regels.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#8AAD6E" }}>Geselecteerde codes</p>
          <div className="rounded-xl overflow-hidden" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
            <div className="grid grid-cols-[80px_1fr_70px_80px_80px_32px] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ background: "#DFE8D6", color: "#8AAD6E" }}>
              <span>Code</span><span>Omschrijving</span><span>Aantal</span><span>Liander</span><span>TerreVolt</span><span></span>
            </div>
            {regels.map(r => (
              <div key={r.spec_code} className="grid grid-cols-[80px_1fr_70px_80px_80px_32px] items-center px-3 py-1.5 text-[12px]" style={{ borderTop: "1px solid #C5D4B2" }}>
                <span className={mono} style={{ color: "#4A7C2F" }}>{r.spec_code}</span>
                <span className="truncate" style={{ color: "#2D4A1E" }}>{r.spec_omschrijving}</span>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => updateAantal(r.spec_code!, -0.5)} className="w-5 h-5 rounded flex items-center justify-center" style={{ background: "#DFE8D6" }}><Minus className="h-3 w-3" style={{ color: "#5A7A42" }} /></button>
                  <input type="number" value={r.aantal || 1} onChange={e => setAantal(r.spec_code!, parseFloat(e.target.value) || 1)} className={`w-8 text-center text-[11px] ${mono} bg-transparent`} style={{ color: "#2D4A1E" }} />
                  <button onClick={() => updateAantal(r.spec_code!, 0.5)} className="w-5 h-5 rounded flex items-center justify-center" style={{ background: "#DFE8D6" }}><Plus className="h-3 w-3" style={{ color: "#5A7A42" }} /></button>
                </div>
                <span className={mono} style={{ color: "#2D4A1E" }}>{fmt((r.tarief_terrevolt || 0) * (r.aantal || 1))}</span>
                <span className={mono} style={{ color: "#2D4A1E" }}>{fmt((r.tarief_inkoop || 0) * (r.aantal || 1))}</span>
                <button onClick={() => removeCode(r.spec_code!)} className="w-5 h-5 rounded flex items-center justify-center" style={{ color: "#C0392B" }}><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="rounded-xl p-3.5 space-y-1.5" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2" }}>
            <div className="flex justify-between text-[12px]">
              <span style={{ color: "#5A7A42" }}>Totaal omzet (Liander)</span>
              <span className={mono} style={{ color: "#2D4A1E" }}>{fmt(totaalOmzet)}</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span style={{ color: "#5A7A42" }}>Totaal kosten (TerreVolt)</span>
              <span className={mono} style={{ color: "#2D4A1E" }}>{fmt(totaalKosten)}</span>
            </div>
            <div className="flex justify-between items-center text-[13px] font-semibold pt-1" style={{ borderTop: "1px solid #C5D4B2" }}>
              <span style={{ color: "#2D4A1E" }}>Marge</span>
              <div className="flex items-center gap-2">
                <span className={mono} style={{ color: "#2D4A1E" }}>{fmt(marge)}</span>
                <span className="px-3 py-0.5 rounded-full text-[13px] font-semibold" style={{ background: margeColor + "18", color: margeColor }}>{margePerc.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          <button onClick={onSave} className="w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg, #4A7C2F, #3D6826)" }}>
            Forecast opslaan
          </button>
        </>
      )}
    </div>
  );
}

function UrenEditor({ regels, monteurs, onUpdate, onSave, verwachteOmzet, setVerwachteOmzet }: {
  regels: ForecastRegel[]; monteurs: MonteurOption[]; onUpdate: (r: ForecastRegel[]) => void; onSave: () => void;
  verwachteOmzet: number; setVerwachteOmzet: (v: number) => void;
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
  const marge = verwachteOmzet - totaalKosten;
  const margePerc = verwachteOmzet > 0 ? (marge / verwachteOmzet) * 100 : 0;
  const margeColor = margePerc > 30 ? "#2D7A3A" : margePerc >= 15 ? "#8B6914" : "#C0392B";

  const usedIds = new Set(regels.map(r => r.medewerker_id));
  const available = monteurs.filter(m => !usedIds.has(m.id));

  return (
    <div className="space-y-4">
      {/* Add monteur */}
      <div className="flex gap-2">
        <select value={selectedMonteur} onChange={e => setSelectedMonteur(e.target.value)} className="flex-1 px-3 py-2 rounded-xl text-sm" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2", color: "#2D4A1E" }}>
          <option value="">Monteur toevoegen...</option>
          {available.map(m => (
            <option key={m.id} value={m.id}>{m.full_name} ({m.uurtarief != null ? `€${m.uurtarief}/u` : "geen tarief"})</option>
          ))}
        </select>
        <button onClick={addMonteur} disabled={!selectedMonteur} className="px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: "#D4E8C2", color: "#4A7C2F", border: "1px solid #9DC87A" }}>
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {regels.length > 0 && (
        <>
          <div className="rounded-xl overflow-hidden" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
            <div className="grid grid-cols-[1fr_70px_70px_80px_32px] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ background: "#DFE8D6", color: "#8AAD6E" }}>
              <span>Monteur</span><span>Tarief</span><span>Uren</span><span>Kosten</span><span></span>
            </div>
            {regels.map(r => {
              const m = monteurs.find(m => m.id === r.medewerker_id);
              const kosten = (r.geplande_uren || 0) * (r.uurtarief_snap || 0);
              return (
                <div key={r.medewerker_id} className="grid grid-cols-[1fr_70px_70px_80px_32px] items-center px-3 py-1.5 text-[12px]" style={{ borderTop: "1px solid #C5D4B2" }}>
                  <span className="truncate" style={{ color: "#2D4A1E" }}>{m?.full_name || "?"}</span>
                  <span className={mono} style={{ color: "#5A7A42" }}>€ {r.uurtarief_snap || 0}</span>
                  <input type="number" value={r.geplande_uren || 0} onChange={e => updateUren(r.medewerker_id!, parseFloat(e.target.value) || 0)} className={`w-14 text-center bg-transparent text-[12px] ${mono}`} style={{ color: "#2D4A1E" }} min={0} />
                  <span className={mono} style={{ color: "#2D4A1E" }}>{fmt(kosten)}</span>
                  <button onClick={() => removeMonteur(r.medewerker_id!)} className="w-5 h-5 rounded flex items-center justify-center" style={{ color: "#C0392B" }}><X className="h-3.5 w-3.5" /></button>
                </div>
              );
            })}
          </div>

          {/* Omzet input & totals */}
          <div className="rounded-xl p-3.5 space-y-2" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2" }}>
            <div className="flex justify-between text-[12px]">
              <span style={{ color: "#5A7A42" }}>Totaal geplande uren</span>
              <span className={mono} style={{ color: "#2D4A1E" }}>{totaalUren} u</span>
            </div>
            <div className="flex justify-between text-[12px]">
              <span style={{ color: "#5A7A42" }}>Totale personeelskosten</span>
              <span className={mono} style={{ color: "#2D4A1E" }}>{fmt(totaalKosten)}</span>
            </div>
            <div className="pt-2" style={{ borderTop: "1px solid #C5D4B2" }}>
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#8AAD6E" }}>Verwachte omzet (€)</label>
              <input type="number" value={verwachteOmzet || ""} onChange={e => setVerwachteOmzet(parseFloat(e.target.value) || 0)} placeholder="bijv. 25000" className={`w-full mt-1 px-3 py-2 rounded-xl text-sm ${mono}`} style={{ background: "#EBF0E4", border: "1px solid #C5D4B2", color: "#2D4A1E" }} />
            </div>
            {verwachteOmzet > 0 && (
              <div className="flex justify-between items-center text-[13px] font-semibold pt-1" style={{ borderTop: "1px solid #C5D4B2" }}>
                <span style={{ color: "#2D4A1E" }}>Marge</span>
                <div className="flex items-center gap-2">
                  <span className={mono} style={{ color: "#2D4A1E" }}>{fmt(marge)}</span>
                  <span className="px-3 py-0.5 rounded-full text-[13px] font-semibold" style={{ background: margeColor + "18", color: margeColor }}>{margePerc.toFixed(1)}%</span>
                </div>
              </div>
            )}
          </div>

          <button onClick={onSave} className="w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg, #4A7C2F, #3D6826)" }}>
            Forecast opslaan
          </button>
        </>
      )}
    </div>
  );
}

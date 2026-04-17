import { useState, useEffect, useCallback, useMemo } from "react";
import { X, Minus, Plus, Zap, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Loader2, AlertTriangle, RotateCcw, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SPEC_CODES, GROEP_LABELS, type SpecCode, loadSpecCodes } from "@/lib/specCodes";
import {
  IntakeAntwoorden, RmuConfiguratie, BerekendeRegel, IntakeRegel,
  LEGE_ANTWOORDEN, initAntwoorden, berekenRegels, suggesteerEindsluitingen,
} from "@/lib/forecastIntake";

interface Props {
  projectId: string;
  project: { nummer: string; naam: string; case_type: string | null };
  onClose: () => void;
  onComplete: () => void;
}

const STAPPEN = ["RMU", "MS extra", "Trafo", "LS-rek", "Bouwkundig", "MS kabels", "LS kabels", "Aansluit & OV", "Vrijschakelen", "Aarding & revisie", "WV & personeel", "Overzicht"];

import { euroDecimals as euro, euro as euroShort } from "@/lib/formatting";

const inputStyle = { background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" };

function NumberStepper({ value, onChange, min = 0, max = 999, step = 1, label, hint, tarief, eenheid }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number;
  label?: string; hint?: string; tarief?: number; eenheid?: string;
}) {
  return (
    <div className="rounded-xl p-3 mb-2" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: "#dae6ff" }}>
            {label}
            {tarief != null && <span className="ml-1 text-[11px] font-normal" style={{ color: "#a0abc3", fontFamily: "DM Mono, monospace" }}>({euro(tarief)}/{eenheid || "st"})</span>}
          </p>
          {hint && <p className="text-[11px] mt-0.5" style={{ color: "#a0abc3" }}>{hint}</p>}
        </div>
        <div className="flex items-center gap-0 shrink-0 ml-3">
          <button onClick={() => onChange(Math.max(min, value - step))} className="w-8 h-8 rounded-l-lg flex items-center justify-center" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)" }}>
            <Minus className="h-3.5 w-3.5" style={{ color: "#a0abc3" }} />
          </button>
          <div className="w-12 h-8 flex items-center justify-center text-sm font-bold" style={{ background: "#030e20", borderTop: "1px solid rgba(106,118,140,0.15)", borderBottom: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff", fontFamily: "DM Mono, monospace" }}>
            {value}
          </div>
          <button onClick={() => onChange(Math.min(max, value + step))} className="w-8 h-8 rounded-r-lg flex items-center justify-center" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)" }}>
            <Plus className="h-3.5 w-3.5" style={{ color: "#a0abc3" }} />
          </button>
        </div>
      </div>
    </div>
  );
}

function OptionButton({ selected, onClick, children, color }: { selected: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button onClick={onClick} className="w-full text-left rounded-xl p-3 transition-all" style={{
      background: selected ? (color === "warn" ? "rgba(254,179,0,0.08)" : "rgba(63,255,139,0.1)") : "rgba(10,26,48,0.7)",
      border: `1.5px solid ${selected ? (color === "warn" ? "rgba(254,179,0,0.3)" : "rgba(63,255,139,0.3)") : "rgba(106,118,140,0.15)"}`,
      color: "#dae6ff",
    }}>
      {children}
    </button>
  );
}

function CheckRow({ checked, onChange, label, hint, tarief, eenheid }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; tarief?: number; eenheid?: string;
}) {
  return (
    <button onClick={() => onChange(!checked)} className="w-full flex items-center gap-3 rounded-xl p-3 mb-1.5 text-left transition-all" style={{
      background: checked ? "rgba(63,255,139,0.1)" : "rgba(10,26,48,0.7)",
      border: `1px solid ${checked ? "rgba(63,255,139,0.3)" : "rgba(106,118,140,0.15)"}`,
    }}>
      <input type="checkbox" checked={checked} readOnly className="w-[18px] h-[18px] shrink-0" style={{ accentColor: "#3fff8b" }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: "#dae6ff" }}>
          {label}
          {tarief != null && <span className="ml-1 text-[11px] font-normal" style={{ color: "#a0abc3", fontFamily: "DM Mono, monospace" }}>({euro(tarief)}/{eenheid || "st"})</span>}
        </p>
        {hint && <p className="text-[11px] mt-0.5" style={{ color: "#a0abc3" }}>{hint}</p>}
      </div>
    </button>
  );
}

function ToggleRow({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl p-3 mb-1.5" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
      <div>
        <p className="text-sm font-medium" style={{ color: "#dae6ff" }}>{label}</p>
        {hint && <p className="text-[11px] mt-0.5" style={{ color: "#a0abc3" }}>{hint}</p>}
      </div>
      <button onClick={() => onChange(!checked)} className="w-11 h-6 rounded-full relative transition-colors shrink-0" style={{ background: checked ? "#3fff8b" : "#102038" }}>
        <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform" style={{ left: checked ? 22 : 2 }} />
      </button>
    </div>
  );
}

export function ForecastIntakeWizard({ projectId, project, onClose, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<IntakeAntwoorden>(() => initAntwoorden(project.case_type));
  const [rmuConfigs, setRmuConfigs] = useState<RmuConfiguratie[]>([]);
  const [dbRegels, setDbRegels] = useState<IntakeRegel[]>([]);
  const [saving, setSaving] = useState(false);
  const [showNewRmu, setShowNewRmu] = useState(false);
  const [newRmu, setNewRmu] = useState({ code: "", velden: 3 });
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [specCodes, setSpecCodes] = useState<SpecCode[]>(SPEC_CODES);
  const [confirmRedo, setConfirmRedo] = useState(false);

  const set = useCallback((patch: Partial<IntakeAntwoorden>) => setAnswers(a => ({ ...a, ...patch })), []);

  useEffect(() => {
    Promise.all([
      supabase.from("rmu_configuraties").select("*").eq("actief", true).order("volgorde"),
      supabase.from("intake_regels").select("*").eq("actief", true).order("volgorde"),
      loadSpecCodes(supabase),
      supabase.from("project_forecast").select("id").eq("project_id", projectId).maybeSingle(),
    ]).then(([rmu, regels, codes, existingFc]) => {
      if (rmu.data) setRmuConfigs(rmu.data as RmuConfiguratie[]);
      if (regels.data) setDbRegels(regels.data as IntakeRegel[]);
      if (codes) setSpecCodes(codes);
      if (existingFc.data) setConfirmRedo(true);
    });
  }, [projectId]);

  const selectedRmu = rmuConfigs.find(c => c.id === answers.rmu_configuratie_id) || null;
  const suggestie = suggesteerEindsluitingen(selectedRmu);
  const overzichtRegels = useMemo(() => berekenRegels(answers, project.case_type, dbRegels, specCodes), [answers, project.case_type, dbRegels, specCodes]);
  const caseTypeLower = project.case_type?.toLowerCase() || "";
  const isProvisiorium = caseTypeLower.includes("provisorium");
  const isCompact = caseTypeLower.includes("compact");

  const getSpec = (code: string) => specCodes.find(s => s.code === code);

  const totalSteps = STAPPEN.length;
  const isOverzicht = step === totalSteps - 1;

  const totaalOmzet = overzichtRegels.reduce((s, r) => s + r.tarief * r.aantal, 0);

  // Group overzicht by groep
  const groepen = useMemo(() => {
    const map = new Map<string, BerekendeRegel[]>();
    overzichtRegels.forEach(r => {
      const g = r.groep || "Overig";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [overzichtRegels]);

  useEffect(() => {
    if (isOverzicht) setOpenGroups(new Set(groepen.map(([g]) => g)));
  }, [isOverzicht, groepen]);

  const merken = Array.from(new Set(rmuConfigs.map(c => c.merk)));
  const merkConfigs = rmuConfigs.filter(c => c.merk === answers.rmu_merk);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Bug fix 1: check existing forecast and reuse/replace
      const { data: existing } = await supabase
        .from("project_forecast")
        .select("id")
        .eq("project_id", projectId)
        .maybeSingle();

      let forecastId: string;
      if (existing) {
        await supabase.from("forecast_regels").delete().eq("forecast_id", existing.id);
        forecastId = existing.id;
      } else {
        const { data: fc } = await supabase
          .from("project_forecast")
          .insert({ project_id: projectId, methode: "intake" } as any)
          .select()
          .single();
        if (!fc) throw new Error("Forecast niet aangemaakt");
        forecastId = fc.id;
      }

      const rows = overzichtRegels.map(r => ({
        forecast_id: forecastId,
        type: "spec",
        spec_code: r.spec_code,
        spec_omschrijving: r.label,
        aantal: r.aantal,
        tarief: r.tarief,
        eigen_kosten: r.eigen_kosten || null,
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from("forecast_regels").insert(rows as any);
        if (error) throw error;
      }
      await supabase.from("projects").update({ intake_gedaan: true, rmu_merk: answers.rmu_merk, rmu_configuratie_id: answers.rmu_configuratie_id } as any).eq("id", projectId);
      toast.success(existing ? "Forecast bijgewerkt!" : "Forecast aangemaakt!");
      onComplete();
    } catch (e: any) {
      toast.error(e.message || "Fout bij opslaan");
    } finally {
      setSaving(false);
    }
  };

  const handleAddRmu = async () => {
    if (!newRmu.code.trim() || !answers.rmu_merk) return;
    const { data } = await supabase.from("rmu_configuraties").insert({
      merk: answers.rmu_merk, code: newRmu.code, velden: newRmu.velden,
      label: `${answers.rmu_merk} ${newRmu.code} (${newRmu.velden}-velds)`, actief: true, volgorde: rmuConfigs.length,
    } as any).select().single();
    if (data) {
      setRmuConfigs(prev => [...prev, data as RmuConfiguratie]);
      set({ rmu_configuratie_id: data.id, rmu_velden: data.velden });
      setShowNewRmu(false);
      setNewRmu({ code: "", velden: 3 });
    }
  };

  const overneemSuggestie = () => {
    set({ ms_moffen: suggestie.moffen, ms_eindsluitingen: suggestie.eindsluitingen });
  };

  // ─── RENDER STEP CONTENT ───
  const renderStep = () => {
    switch (step) {
      // ═══ STAP 1 — RMU ═══
      case 0:
        return (
          <div className="space-y-3">
            <h3 className="text-base font-bold" style={{ color: "#dae6ff" }}>RMU installatie</h3>
            <div className="grid grid-cols-2 gap-2">
              <OptionButton selected={answers.rmu_vervangen} onClick={() => set({ rmu_vervangen: true })}>
                <div className="flex items-center gap-2"><Zap className="h-4 w-4" style={{ color: "#3fff8b" }} /><span className="text-sm font-semibold">RMU vervangen/plaatsen</span></div>
              </OptionButton>
              <OptionButton selected={!answers.rmu_vervangen} onClick={() => set({ rmu_vervangen: false, rmu_merk: null, rmu_configuratie_id: null, rmu_velden: 3 })}>
                <div className="flex items-center gap-2"><Minus className="h-4 w-4" style={{ color: "#a0abc3" }} /><span className="text-sm">Geen RMU</span></div>
              </OptionButton>
            </div>

            {answers.rmu_vervangen && (
              <div className="space-y-3 animate-fade-in">
                <p className="text-xs font-semibold" style={{ color: "#a0abc3" }}>Welk merk?</p>
                <div className="grid grid-cols-3 gap-2">
                  {(merken.length > 0 ? merken : ["ABB", "Siemens", "Magnefix"]).map(m => (
                    <OptionButton key={m} selected={answers.rmu_merk === m} onClick={() => set({ rmu_merk: m, rmu_configuratie_id: null })}>
                      <span className="text-sm font-medium">{m}</span>
                    </OptionButton>
                  ))}
                </div>

                {answers.rmu_merk && (
                  <div className="space-y-2 animate-fade-in">
                    <p className="text-xs font-semibold" style={{ color: "#a0abc3" }}>Configuratie</p>
                    <div className="flex flex-wrap gap-2">
                      {merkConfigs.map(c => (
                        <button key={c.id} onClick={() => { set({ rmu_configuratie_id: c.id, rmu_velden: c.velden }); }} className="px-3 py-2 rounded-lg text-xs font-medium transition-all" style={{
                          background: answers.rmu_configuratie_id === c.id ? "rgba(63,255,139,0.1)" : "rgba(10,26,48,0.7)",
                          border: `1.5px solid ${answers.rmu_configuratie_id === c.id ? "rgba(63,255,139,0.3)" : "rgba(106,118,140,0.15)"}`,
                          color: "#dae6ff",
                        }}>
                          <span className="font-bold">{c.code}</span> · {c.velden}-velds
                        </button>
                      ))}
                      <button onClick={() => setShowNewRmu(true)} className="px-3 py-2 rounded-lg text-xs" style={{ border: "1px dashed rgba(106,118,140,0.15)", color: "#a0abc3" }}>+ Niet in lijst</button>
                    </div>

                    {showNewRmu && (
                      <div className="flex gap-2 items-end p-3 rounded-xl" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
                        <div className="flex-1">
                          <label className="text-[10px] block mb-1" style={{ color: "#a0abc3" }}>Code</label>
                          <input value={newRmu.code} onChange={e => setNewRmu(p => ({ ...p, code: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg text-xs" style={inputStyle} placeholder="FCV" />
                        </div>
                        <div className="w-20">
                          <label className="text-[10px] block mb-1" style={{ color: "#a0abc3" }}>Velden</label>
                          <input type="number" value={newRmu.velden} onChange={e => setNewRmu(p => ({ ...p, velden: parseInt(e.target.value) || 3 }))} min={2} max={12} className="w-full px-2 py-1.5 rounded-lg text-xs text-center" style={inputStyle} />
                        </div>
                        <button onClick={handleAddRmu} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: "#3fff8b" }}>Toevoegen</button>
                      </div>
                    )}

                    {selectedRmu && (
                      <div className="rounded-xl p-3 animate-fade-in" style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)" }}>
                        <p className="text-xs font-semibold" style={{ color: "#3fff8b" }}>Op basis van {selectedRmu.merk} {selectedRmu.code} ({selectedRmu.velden}-velds):</p>
                        <p className="text-xs mt-1" style={{ color: "#dae6ff" }}>✓ R320010 Basis MS-installatie (1×)</p>
                        {selectedRmu.velden > 3 && <p className="text-xs" style={{ color: "#dae6ff" }}>✓ R320020 Extra MS-veld ({selectedRmu.velden - 3}×)</p>}
                        <p className="text-xs mt-1" style={{ color: "#a0abc3" }}>Kabelvelden: {selectedRmu.velden - 1} → suggestie {selectedRmu.velden - 1}× moffen + {selectedRmu.velden - 1}× eindsluitingen</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );

      // ═══ STAP 2 — MS EXTRA ═══
      case 1:
        return (
          <div className="space-y-3">
            <h3 className="text-base font-bold" style={{ color: "#dae6ff" }}>MS extra werkzaamheden</h3>
            <CheckRow checked={answers.ims_ombouw} onChange={v => set({ ims_ombouw: v })} label="Ombouw naar iMS" tarief={getSpec("R320030")?.tarief} eenheid="st" />
            {answers.ims_ombouw && <NumberStepper value={answers.ims_aantal} onChange={v => set({ ims_aantal: v })} min={1} max={5} label="Aantal ombouw" />}
            <CheckRow checked={answers.trafokabel} onChange={v => set({ trafokabel: v })}
              label={isCompact ? "Trafokabel compactstation" : "Trafokabel betreedbaar station"}
              tarief={getSpec(isCompact ? "R330040" : "R330030")?.tarief} eenheid="st"
              hint="Kabel tussen trafo en LS-rek" />
            {!answers.ims_ombouw && !answers.trafokabel && <p className="text-xs italic" style={{ color: "#a0abc3" }}>Geen extra MS werkzaamheden</p>}
          </div>
        );

      // ═══ STAP 3 — TRAFO ═══
      case 2:
        return (
          <div className="space-y-3">
            <h3 className="text-base font-bold" style={{ color: "#dae6ff" }}>Transformator</h3>
            <div className="space-y-2">
              {([
                { val: "nieuw" as const, icon: "🔄", label: "Nieuwe trafo plaatsen", code: "R330010" },
                { val: "draaien" as const, icon: "↩", label: "Trafo draaien", code: "R330020" },
                { val: "vrijschakelen" as const, icon: "🔒", label: "Vrijschakelen (geen vervanging)", code: "R330050" },
                { val: "geen" as const, icon: "—", label: "Geen trafo werkzaamheden", code: null },
              ] as const).map(o => (
                <OptionButton key={o.val} selected={answers.trafo_situatie === o.val} onClick={() => set({ trafo_situatie: o.val })}>
                  <div className="flex items-center gap-2">
                    <span>{o.icon}</span>
                    <div>
                      <p className="text-sm font-medium">{o.label}</p>
                      {o.code && <p className="text-[11px]" style={{ color: "#a0abc3", fontFamily: "DM Mono, monospace" }}>{o.code} — {euro(getSpec(o.code)?.tarief || 0)}</p>}
                    </div>
                  </div>
                </OptionButton>
              ))}
            </div>
          </div>
        );

      // ═══ STAP 4 — LS-REK ═══
      case 3:
        return (
          <div className="space-y-3">
            <h3 className="text-base font-bold" style={{ color: "#dae6ff" }}>LS-rek installatie</h3>
            <div className="space-y-2">
              {([
                { val: "klein" as const, label: "≤630 kVA — Nieuw LS-rek", code: "R340010" },
                { val: "groot" as const, label: ">630 kVA — Nieuw LS-rek", code: "R340020" },
                { val: "uitbreiden" as const, label: "Uitbreiden bestaand rek", code: "R340030" },
                { val: "geen" as const, label: "Geen LS-rek werkzaamheden", code: null },
              ] as const).map(o => (
                <OptionButton key={o.val} selected={answers.ls_rek === o.val} onClick={() => set({ ls_rek: o.val })}>
                  <div>
                    <p className="text-sm font-medium">{o.label}</p>
                    {o.code && <p className="text-[11px]" style={{ color: "#a0abc3", fontFamily: "DM Mono, monospace" }}>{o.code} — {euro(getSpec(o.code)?.tarief || 0)}</p>}
                  </div>
                </OptionButton>
              ))}
            </div>
            {answers.ls_rek === "uitbreiden" && <NumberStepper value={answers.ls_rek_aantal} onChange={v => set({ ls_rek_aantal: v })} min={1} max={5} label="Aantal uitbreidingsrekken" />}
            <div className="pt-2" style={{ borderTop: "1px solid rgba(106,118,140,0.15)" }}>
              <NumberStepper value={answers.ls_stroken} onChange={v => set({ ls_stroken: v })} max={30} label="LS stroken herschikken/toevoegen" tarief={getSpec("R340040")?.tarief} eenheid="st" />
              <NumberStepper value={answers.ls_kabels} onChange={v => set({ ls_kabels: v })} max={30} label="LS kabels aansluiten" tarief={getSpec("R340050")?.tarief} eenheid="st" />
              <NumberStepper value={answers.zekeringen} onChange={v => set({ zekeringen: v })} max={50} label="Zekeringen wisselen" tarief={getSpec("R340060")?.tarief} eenheid="st" />
            </div>
          </div>
        );

      // ═══ STAP 5 — BOUWKUNDIG ═══
      case 4: {
        const allZero = answers.boren === 0 && answers.dichtzetten === 0 && answers.ggi === 0 && answers.traanplaat === 0;
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold" style={{ color: "#dae6ff" }}>Bouwkundige werkzaamheden</h3>
              {allZero && <button onClick={() => setStep(s => s + 1)} className="text-xs px-3 py-1.5 rounded-lg" style={{ border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>Overslaan →</button>}
            </div>
            {allZero && <p className="text-xs italic" style={{ color: "#a0abc3" }}>Vul in als van toepassing, of sla over</p>}
            <NumberStepper value={answers.boren} onChange={v => set({ boren: v })} max={10} label="Boren gaten" tarief={getSpec("R310010")?.tarief} eenheid="st" hint="Nieuwe kabelinvoeren" />
            <NumberStepper value={answers.dichtzetten} onChange={v => set({ dichtzetten: v })} max={10} label="Dichtzetten doorvoeringen" tarief={getSpec("R310020")?.tarief} eenheid="st" hint="Oude doorvoeringen dichten" />
            <NumberStepper value={answers.ggi} onChange={v => set({ ggi: v })} max={10} label="GGI" tarief={getSpec("R310030")?.tarief} eenheid="st" hint="Verlichting, schakelaars per ruimte" />
            <NumberStepper value={answers.traanplaat} onChange={v => set({ traanplaat: v })} max={10} label="Traanplaat" tarief={getSpec("R310040")?.tarief} eenheid="st" hint="Vloersparingen afdekken" />
          </div>
        );
      }

      // ═══ STAP 6 — MS KABELS ═══
      case 5:
        return (
          <div className="space-y-3">
            <h3 className="text-base font-bold" style={{ color: "#dae6ff" }}>MS moffen & eindsluitingen</h3>
            {answers.rmu_vervangen && selectedRmu && (
              <div className="rounded-xl p-3" style={{ background: "rgba(110,155,255,0.1)", border: "1px solid rgba(110,155,255,0.3)" }}>
                <p className="text-xs font-semibold" style={{ color: "#6e9bff" }}>Suggestie op basis van {selectedRmu.merk} {selectedRmu.code} ({selectedRmu.velden - 1} kabelvelden):</p>
                <p className="text-xs mt-1" style={{ color: "#dae6ff" }}>{suggestie.moffen}× MS moffen + {suggestie.eindsluitingen}× eindsluitingen</p>
                <div className="flex gap-2 mt-2">
                  <button onClick={overneemSuggestie} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: "#3fff8b" }}>Overnemen</button>
                  <button className="px-3 py-1.5 rounded-lg text-xs" style={{ border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>Zelf invullen</button>
                </div>
              </div>
            )}
            {isProvisiorium && (
              <div className="flex gap-2 p-3 rounded-r-xl" style={{ background: "rgba(254,179,0,0.08)", borderLeft: "3px solid #feb300" }}>
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#feb300" }} />
                <p className="text-xs font-medium" style={{ color: "#feb300" }}>Provisorium — vul eindsluitingen handmatig in. Niet automatisch afgeleid.</p>
              </div>
            )}
            <NumberStepper value={answers.ms_moffen} onChange={v => set({ ms_moffen: v })} max={20} label="MS moffen" tarief={getSpec("R410010")?.tarief} eenheid="st" hint="Binnen het station" />
            <NumberStepper value={answers.ms_eindsluitingen} onChange={v => set({ ms_eindsluitingen: v })} max={20} label="MS eindsluitingen" tarief={getSpec("R410020")?.tarief} eenheid="st" hint="Per kabelaansluiting" />
          </div>
        );

      // ═══ STAP 7 — LS KABELS ═══
      case 6: {
        const allZero = answers.ls_moffen === 0 && answers.ls_eindsluitingen === 0;
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold" style={{ color: "#dae6ff" }}>LS moffen & eindsluitingen</h3>
              {allZero && <button onClick={() => setStep(s => s + 1)} className="text-xs px-3 py-1.5 rounded-lg" style={{ border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>Overslaan →</button>}
            </div>
            <NumberStepper value={answers.ls_moffen} onChange={v => set({ ls_moffen: v })} max={50} label="LS verbindingsmoffen" tarief={getSpec("R420010")?.tarief} eenheid="st" />
            <NumberStepper value={answers.ls_eindsluitingen} onChange={v => set({ ls_eindsluitingen: v })} max={50} label="LS eindsluitingen" tarief={getSpec("R420020")?.tarief} eenheid="st" />
          </div>
        );
      }

      // ═══ STAP 8 — AANSLUIT & OV ═══
      case 7: {
        const allZero = answers.huisaansluitingen === 0 && answers.ls_kast_verwijderen === 0 && answers.ls_kast_aansluiten === 0 && answers.ov_kast === 0 && answers.ov_meter === 0;
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold" style={{ color: "#dae6ff" }}>Aansluitingen & OV</h3>
              {allZero && <button onClick={() => setStep(s => s + 1)} className="text-xs px-3 py-1.5 rounded-lg" style={{ border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>Overslaan →</button>}
            </div>
            <NumberStepper value={answers.huisaansluitingen} onChange={v => set({ huisaansluitingen: v })} max={30} label="Huisaansluitingen overzetten" tarief={getSpec("R430010")?.tarief} eenheid="st" hint="Bij kabelvervanging in de straat" />
            <NumberStepper value={answers.ls_kast_verwijderen} onChange={v => set({ ls_kast_verwijderen: v })} max={10} label="LS kasten verwijderen" tarief={getSpec("R430020")?.tarief} eenheid="st" />
            <NumberStepper value={answers.ls_kast_aansluiten} onChange={v => set({ ls_kast_aansluiten: v })} max={10} label="LS kasten aansluiten" tarief={getSpec("R370020")?.tarief} eenheid="st" />
            <NumberStepper value={answers.ov_kast} onChange={v => set({ ov_kast: v })} max={10} label="OV kasten" tarief={getSpec("R360010")?.tarief} eenheid="st" />
            <NumberStepper value={answers.ov_meter} onChange={v => set({ ov_meter: v })} max={10} label="OV kWh-meters" tarief={getSpec("R360020")?.tarief} eenheid="st" />
          </div>
        );
      }

      // ═══ STAP 9 — VRIJSCHAKELEN ═══
      case 8: {
        const allZero = answers.kabeldeel_vrijschakelen === 0;
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold" style={{ color: "#dae6ff" }}>Vrijschakelen</h3>
              {allZero && <button onClick={() => setStep(s => s + 1)} className="text-xs px-3 py-1.5 rounded-lg" style={{ border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>Overslaan →</button>}
            </div>
            <NumberStepper value={answers.kabeldeel_vrijschakelen} onChange={v => set({ kabeldeel_vrijschakelen: v })} max={10} label="Kabeldelen vrijschakelen" tarief={getSpec("R440030")?.tarief} eenheid="keer" hint="Voor LS werkzaamheden in het veld" />
          </div>
        );
      }

      // ═══ STAP 10 — AARDING & REVISIE ═══
      case 9:
        return (
          <div className="space-y-4">
            <h3 className="text-base font-bold" style={{ color: "#dae6ff" }}>Aarding & revisie</h3>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#a0abc3" }}>Aarding</p>
              <CheckRow checked={answers.aardweerstand} onChange={v => set({ aardweerstand: v })} label="Aardweerstand meten" tarief={getSpec("R350010")?.tarief} eenheid="keer" />
              <NumberStepper value={answers.vereffeningsleiding} onChange={v => set({ vereffeningsleiding: v })} max={10} label="Vereffeningsleiding" tarief={getSpec("R350020")?.tarief} eenheid="st" hint={answers.rmu_vervangen ? "Standaard 2 bij MS vervanging" : undefined} />
            </div>
            <div style={{ borderTop: "1px solid rgba(106,118,140,0.15)", paddingTop: 12 }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#a0abc3" }}>Opleverdossier</p>
              <div className="space-y-2">
                {([
                  { val: "geen" as const, label: "Geen revisie", icon: "—", code: null, hint: null },
                  { val: "volledig" as const, label: "Volledig", icon: "📄", code: "R500010", hint: "Inclusief ondergronds opleverdossier" },
                  { val: "excl_civiel" as const, label: "Excl civiel", icon: "📄", code: "R500020", hint: "Alleen elektrotechnisch dossier" },
                ] as const).map(o => (
                  <OptionButton key={o.val} selected={answers.revisie === o.val} onClick={() => set({ revisie: o.val })}>
                    <div className="flex items-center gap-2">
                      <span>{o.icon}</span>
                      <div>
                        <p className="text-sm font-medium">{o.label}</p>
                        {o.code && <p className="text-[11px]" style={{ color: "#a0abc3", fontFamily: "DM Mono, monospace" }}>{o.code} — {euro(getSpec(o.code)?.tarief || 0)}</p>}
                        {o.hint && <p className="text-[11px]" style={{ color: "#a0abc3" }}>{o.hint}</p>}
                      </div>
                    </div>
                  </OptionButton>
                ))}
              </div>
            </div>
          </div>
        );

      // ═══ STAP 11 — WV & PERSONEEL ═══
      case 10: {
        const defaultWv = isProvisiorium ? 32 : 16;
        return (
          <div className="space-y-4">
            <h3 className="text-base font-bold" style={{ color: "#dae6ff" }}>WV & personeel</h3>
            <div>
              <ToggleRow checked={answers.wv} onChange={v => set({ wv: v, wv_uren: v && answers.wv_uren === 0 ? defaultWv : answers.wv_uren })} label="WV-er inzetten (R440010)" hint={`€110,00/uur`} />
              {answers.wv && (
                <div className="ml-4 animate-fade-in">
                  <NumberStepper value={answers.wv_uren} onChange={v => set({ wv_uren: v })} step={8} max={999} label="Uren WV-er" tarief={110} eenheid="uur" />
                  <p className="text-[11px] italic" style={{ color: "#a0abc3" }}>Standaard {defaultWv}u voor {project.case_type || "dit type"}</p>
                </div>
              )}
            </div>
            <div>
              <ToggleRow checked={answers.wv_io} onChange={v => set({ wv_io: v, wv_io_uren: v && answers.wv_io_uren === 0 ? defaultWv : answers.wv_io_uren })} label="WV-er io inzetten (R440020)" hint={`€50,00/uur`} />
              {answers.wv_io && (
                <div className="ml-4 animate-fade-in">
                  <NumberStepper value={answers.wv_io_uren} onChange={v => set({ wv_io_uren: v })} step={8} max={999} label="Uren WV-er io" tarief={50} eenheid="uur" />
                </div>
              )}
            </div>
            <div style={{ borderTop: "1px solid rgba(106,118,140,0.15)", paddingTop: 12 }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#a0abc3" }}>Extra personeel (optioneel)</p>
              <NumberStepper value={answers.vp_uren} onChange={v => set({ vp_uren: v })} max={999} step={8} label="VP uren" tarief={getSpec("R610040")?.tarief} eenheid="uur" hint="Vakbekwaam persoon" />
              <NumberStepper value={answers.avp_uren} onChange={v => set({ avp_uren: v })} max={999} step={8} label="AVP uren" tarief={getSpec("R610050")?.tarief} eenheid="uur" hint="Algemeen vakbekwaam persoon" />
              <NumberStepper value={answers.vop_uren} onChange={v => set({ vop_uren: v })} max={999} step={8} label="VOP uren" tarief={getSpec("R610060")?.tarief} eenheid="uur" hint="Voldoend onderricht persoon" />
            </div>
          </div>
        );
      }

      // ═══ STAP 12 — OVERZICHT ═══
      case 11:
        return (
          <div className="space-y-3">
            <div>
              <h3 className="text-base font-bold" style={{ color: "#dae6ff" }}>Overzicht forecast</h3>
              <p className="text-xs" style={{ color: "#a0abc3" }}>Controleer en pas aan indien nodig</p>
            </div>
            {overzichtRegels.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: "#a0abc3" }}>Geen codes geselecteerd. Ga terug en vul de stappen in.</p>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(106,118,140,0.15)" }}>
                {groepen.map(([groep, regels]) => {
                  const isOpen = openGroups.has(groep);
                  const groepOmzet = regels.reduce((s, r) => s + r.tarief * r.aantal, 0);
                  return (
                    <div key={groep}>
                      <button onClick={() => setOpenGroups(prev => { const n = new Set(prev); if (n.has(groep)) n.delete(groep); else n.add(groep); return n; })} className="w-full flex items-center justify-between px-3 py-2" style={{ background: "#102038" }}>
                        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#a0abc3", letterSpacing: "0.5px" }}>
                          {GROEP_LABELS[groep] || groep} ({regels.length})
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium" style={{ color: "#a0abc3", fontFamily: "DM Mono, monospace" }}>{euroShort(groepOmzet)}</span>
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" style={{ color: "#a0abc3" }} /> : <ChevronRight className="h-3.5 w-3.5" style={{ color: "#a0abc3" }} />}
                        </div>
                      </button>
                      {isOpen && regels.map(r => (
                        <div key={r.spec_code} className="flex items-center gap-2 px-3 py-2" style={{ borderTop: "1px solid rgba(106,118,140,0.15)" }}>
                          <span className="text-[10px] font-bold shrink-0 w-16" style={{ color: "#a0abc3", fontFamily: "DM Mono, monospace" }}>{r.spec_code}</span>
                          <span className="text-xs flex-1 min-w-0 truncate" style={{ color: "#dae6ff" }}>{r.label}</span>
                          <div className="flex items-center gap-0 shrink-0">
                            <button onClick={() => { const nv = Math.max(r.min_aantal, r.aantal - 1); setAnswers(a => { const key = getAnswerKey(r.spec_code, a); if (key) return { ...a, [key]: nv }; return a; }); }} className="w-6 h-6 rounded-l flex items-center justify-center" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)" }}>
                              <Minus className="h-3 w-3" style={{ color: "#a0abc3" }} />
                            </button>
                            <div className="w-8 h-6 flex items-center justify-center text-[11px] font-bold" style={{ background: "#030e20", borderTop: "1px solid rgba(106,118,140,0.15)", borderBottom: "1px solid rgba(106,118,140,0.15)", fontFamily: "DM Mono, monospace", color: "#dae6ff" }}>{r.aantal}</div>
                            <button onClick={() => { const nv = Math.min(r.max_aantal, r.aantal + 1); setAnswers(a => { const key = getAnswerKey(r.spec_code, a); if (key) return { ...a, [key]: nv }; return a; }); }} className="w-6 h-6 rounded-r flex items-center justify-center" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)" }}>
                              <Plus className="h-3 w-3" style={{ color: "#a0abc3" }} />
                            </button>
                          </div>
                          <span className="text-[10px] shrink-0 w-10 text-right" style={{ color: "#a0abc3", fontFamily: "DM Mono, monospace" }}>{euro(r.tarief)}</span>
                          <span className="text-[11px] font-bold shrink-0 w-16 text-right" style={{ color: "#3fff8b", fontFamily: "DM Mono, monospace" }}>{euroShort(r.tarief * r.aantal)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {/* Totaal */}
                <div className="px-3 py-3 text-right" style={{ borderTop: "2px solid rgba(63,255,139,0.3)" }}>
                  <p className="text-[11px] uppercase tracking-wider" style={{ color: "#a0abc3" }}>Totaal omzet (Van Gelder)</p>
                  <p className="text-lg font-bold" style={{ color: "#3fff8b", fontFamily: "DM Mono, monospace" }}>{euro(totaalOmzet)}</p>
                </div>
              </div>
            )}
          </div>
        );

      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full sm:max-w-lg max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl" style={{ background: "#030e20" }}>
        {/* Header */}
        <div className="shrink-0 px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(106,118,140,0.15)" }}>
          <div>
            <p className="text-sm font-bold" style={{ color: "#dae6ff" }}>Forecast intake</p>
            <p className="text-[11px]" style={{ color: "#a0abc3" }}>{project.nummer} · {project.naam}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(10,26,48,0.7)" }}>
            <X className="h-4 w-4" style={{ color: "#a0abc3" }} />
          </button>
        </div>

        {/* Progress */}
        <div className="shrink-0 px-4 py-2">
          <div className="flex gap-1">
            {STAPPEN.map((_, i) => (
              <div key={i} className="flex-1 h-1 rounded-full" style={{ background: i < step ? "#3fff8b" : i === step ? "#3fff8b" : "#102038" }} />
            ))}
          </div>
          <p className="text-[11px] mt-1.5" style={{ color: "#a0abc3" }}>
            Stap {step + 1} van {totalSteps} — <span className="font-semibold" style={{ color: step === totalSteps - 1 ? "#3fff8b" : "#a0abc3" }}>{STAPPEN[step]}</span>
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {renderStep()}
        </div>

        {/* Navigation */}
        <div className="shrink-0 px-4 py-3 flex gap-2" style={{ borderTop: "1px solid rgba(106,118,140,0.15)" }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-1" style={{ border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>
              <ChevronLeft className="h-4 w-4" /> Vorige
            </button>
          )}
          <div className="flex-1" />
          {isOverzicht ? (
            <button onClick={handleSave} disabled={saving || overzichtRegels.length === 0} className="px-6 py-2.5 rounded-xl text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)" }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Forecast aanmaken
            </button>
          ) : (
            <button onClick={() => setStep(s => s + 1)} className="px-6 py-2.5 rounded-xl text-sm font-bold text-white flex items-center gap-1" style={{ background: "#3fff8b" }}>
              Volgende <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Map spec_code back to answer key for inline editing in overzicht
function getAnswerKey(specCode: string, a: IntakeAntwoorden): keyof IntakeAntwoorden | null {
  const map: Record<string, keyof IntakeAntwoorden> = {
    "R310010": "boren", "R310020": "dichtzetten", "R310030": "ggi", "R310040": "traanplaat",
    "R320020": "rmu_velden", "R320030": "ims_aantal",
    "R340040": "ls_stroken", "R340050": "ls_kabels", "R340060": "zekeringen",
    "R350020": "vereffeningsleiding",
    "R410010": "ms_moffen", "R410020": "ms_eindsluitingen",
    "R420010": "ls_moffen", "R420020": "ls_eindsluitingen",
    "R430010": "huisaansluitingen", "R430020": "ls_kast_verwijderen",
    "R370020": "ls_kast_aansluiten", "R360010": "ov_kast", "R360020": "ov_meter",
    "R440010": "wv_uren", "R440020": "wv_io_uren", "R440030": "kabeldeel_vrijschakelen",
    "R610040": "vp_uren", "R610050": "avp_uren", "R610060": "vop_uren",
  };
  return map[specCode] || null;
}

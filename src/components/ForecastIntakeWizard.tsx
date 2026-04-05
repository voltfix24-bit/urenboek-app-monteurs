import { useState, useEffect, useCallback } from "react";
import { X, Check, Minus, Plus, Zap, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { mutate } from "@/lib/supabaseHelpers";
import { toast } from "sonner";
import {
  IntakeAnswers, RmuConfiguratie, ForecastRegel,
  defaultAnswers, berekenForecastRegels, suggesteerEindsluitingen,
} from "@/lib/forecastIntake";

interface Props {
  projectId: string;
  project: { nummer: string; naam: string; case_type: string | null };
  onClose: () => void;
  onComplete: () => void;
}

const STEP_LABELS = ["RMU", "Trafo", "LS", "Kabels", "Overig", "Overzicht"];

export function ForecastIntakeWizard({ projectId, project, onClose, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<IntakeAnswers>(() => {
    const wv = project.case_type === "NSA-case" || project.case_type === "Compactstation" ? 24 : project.case_type === "Provisorium" ? 32 : 0;
    return { ...defaultAnswers, wv_uren: wv };
  });
  const [rmuConfigs, setRmuConfigs] = useState<RmuConfiguratie[]>([]);
  const [saving, setSaving] = useState(false);
  const [overzichtRegels, setOverzichtRegels] = useState<ForecastRegel[]>([]);

  // New RMU config form
  const [showNewRmu, setShowNewRmu] = useState(false);
  const [newRmu, setNewRmu] = useState({ code: "", velden: 3 });

  useEffect(() => {
    supabase.from("rmu_configuraties").select("*").eq("actief", true).order("volgorde")
      .then(({ data }) => { if (data) setRmuConfigs(data as RmuConfiguratie[]); });
  }, []);

  const selectedRmu = rmuConfigs.find(c => c.id === answers.rmu_configuratie_id) || null;

  const updateAnswer = useCallback(<K extends keyof IntakeAnswers>(key: K, val: IntakeAnswers[K]) => {
    setAnswers(a => ({ ...a, [key]: val }));
  }, []);

  // Recalculate overview when entering step 5
  useEffect(() => {
    if (step === 5) {
      setOverzichtRegels(berekenForecastRegels(answers, project.case_type, selectedRmu));
    }
  }, [step, answers, project.case_type, selectedRmu]);

  // On step 1 config select -> auto-suggest eindsluitingen for step 4
  useEffect(() => {
    if (answers.rmu_configuratie_id && selectedRmu) {
      const sug = suggesteerEindsluitingen(selectedRmu);
      setAnswers(a => ({ ...a, ms_eindsluitingen: sug.eindsluitingen, ms_moffen: sug.moffen }));
    }
  }, [answers.rmu_configuratie_id]);

  const filteredConfigs = rmuConfigs.filter(c => c.merk === answers.rmu_merk);

  async function addNewRmuConfig() {
    if (!newRmu.code.trim() || !answers.rmu_merk) return;
    const label = `${answers.rmu_merk} ${newRmu.code.trim()}`;
    const { data, error } = await supabase.from("rmu_configuraties").insert({
      merk: answers.rmu_merk, code: newRmu.code.trim(), velden: newRmu.velden, label,
      volgorde: filteredConfigs.length + 1,
    }).select().single();
    if (error) { toast.error("Kon configuratie niet toevoegen"); return; }
    setRmuConfigs(prev => [...prev, data as RmuConfiguratie]);
    updateAnswer("rmu_configuratie_id", data.id);
    updateAnswer("rmu_velden", newRmu.velden);
    setShowNewRmu(false);
    setNewRmu({ code: "", velden: 3 });
  }

  async function handleSave() {
    setSaving(true);
    try {
      // 1. Upsert forecast
      const { data: existing } = await supabase.from("project_forecast").select("id").eq("project_id", projectId).maybeSingle();
      let forecastId: string;
      if (existing) {
        forecastId = existing.id;
        await supabase.from("forecast_regels").delete().eq("forecast_id", forecastId);
      } else {
        const { data: newF, error } = await supabase.from("project_forecast").insert({ project_id: projectId, methode: "stuks" }).select("id").single();
        if (error || !newF) throw error;
        forecastId = newF.id;
      }

      // 2. Insert regels
      if (overzichtRegels.length > 0) {
        const rows = overzichtRegels.map(r => ({
          forecast_id: forecastId,
          type: "stuks" as const,
          spec_code: r.code,
          spec_omschrijving: r.spec_omschrijving,
          tarief_terrevolt: r.tarief_terrevolt,
          tarief_inkoop: r.tarief_inkoop,
          aantal: r.aantal,
        }));
        await supabase.from("forecast_regels").insert(rows);
      }

      // 3. Update project
      const projectUpdate: any = { intake_gedaan: true };
      if (answers.rmu_merk) projectUpdate.rmu_merk = answers.rmu_merk;
      if (answers.rmu_configuratie_id) projectUpdate.rmu_configuratie_id = answers.rmu_configuratie_id;
      await supabase.from("projects").update(projectUpdate).eq("id", projectId);

      onComplete();
    } catch (e) {
      toast.error("Fout bij opslaan forecast");
    } finally {
      setSaving(false);
    }
  }

  function canNext(): boolean {
    if (step === 0) return answers.rmu_vervangen !== null && (answers.rmu_vervangen === false || !!answers.rmu_configuratie_id);
    if (step === 1) return answers.trafo_situatie !== null;
    if (step === 2) return answers.ls_rek !== null;
    return true;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div className="relative w-[90vw] max-w-[640px] max-h-[85vh] overflow-y-auto rounded-[20px] p-7" style={{ background: "var(--bg-base)" }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              <Zap className="h-4 w-4" style={{ color: "var(--accent)" }} /> Forecast intake
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{project.nummer} — {project.naam}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--bg-surface-2)" }}>
            <X className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>

        {/* Progress */}
        <div className="flex gap-1 mb-1">
          {STEP_LABELS.map((_, i) => (
            <div key={i} className="flex-1 h-1 rounded-full transition-colors" style={{ background: i < step ? "var(--success)" : i === step ? "var(--accent)" : "var(--bg-surface-2)" }} />
          ))}
        </div>
        <div className="flex justify-between mb-5">
          {STEP_LABELS.map((l, i) => (
            <span key={i} className="text-[10px]" style={{ color: i < step ? "var(--success)" : i === step ? "var(--accent)" : "var(--text-muted)", fontWeight: i === step ? 600 : 400 }}>{l}</span>
          ))}
        </div>
        <p className="text-[11px] mb-4" style={{ color: "var(--text-muted)" }}>Stap {step + 1} van 6</p>

        {/* Steps */}
        {step === 0 && <Step1RMU answers={answers} updateAnswer={updateAnswer} filteredConfigs={filteredConfigs} selectedRmu={selectedRmu} showNewRmu={showNewRmu} setShowNewRmu={setShowNewRmu} newRmu={newRmu} setNewRmu={setNewRmu} addNewRmuConfig={addNewRmuConfig} />}
        {step === 1 && <Step2Trafo answers={answers} updateAnswer={updateAnswer} />}
        {step === 2 && <Step3LS answers={answers} updateAnswer={updateAnswer} />}
        {step === 3 && <Step4Kabels answers={answers} updateAnswer={updateAnswer} selectedRmu={selectedRmu} />}
        {step === 4 && <Step5Overig answers={answers} updateAnswer={updateAnswer} caseType={project.case_type} />}
        {step === 5 && <Step6Overzicht regels={overzichtRegels} setRegels={setOverzichtRegels} />}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          {step > 0 ? (
            <button onClick={() => setStep(s => s - 1)} className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-1" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              <ChevronLeft className="h-4 w-4" /> Vorige
            </button>
          ) : <div />}
          {step < 5 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={!canNext()} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white flex items-center gap-1 disabled:opacity-40" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
              Volgende <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button onClick={handleSave} disabled={saving} className="flex-1 ml-3 py-3 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Forecast aanmaken
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────── Choice Button ──────── */
function ChoiceBtn({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="w-full text-left px-5 py-4 rounded-[14px] text-[15px] font-medium transition-all" style={{
      background: selected ? "var(--accent-light)" : "var(--bg-surface)",
      border: selected ? "1.5px solid var(--accent-border)" : "1.5px solid var(--border)",
      color: selected ? "var(--accent)" : "var(--text-primary)",
      fontWeight: selected ? 600 : 500,
    }}>
      {children}
    </button>
  );
}

/* ──────── Counter ──────── */
function Counter({ value, onChange, min = 0, label }: { value: number; onChange: (v: number) => void; min?: number; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm" style={{ color: "var(--text-primary)" }}>{label}</span>
      <div className="flex items-center gap-3">
        <button onClick={() => onChange(Math.max(min, value - 1))} className="w-9 h-9 rounded-[10px] flex items-center justify-center text-lg" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-[48px] text-center text-xl font-bold" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-primary)" }}>{value}</span>
        <button onClick={() => onChange(value + 1)} className="w-9 h-9 rounded-[10px] flex items-center justify-center text-lg" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ──────── Info block ──────── */
function InfoBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3 mt-3 text-xs space-y-1" style={{ background: "var(--success-light)", border: "1px solid var(--success-border)", color: "var(--success)" }}>
      {children}
    </div>
  );
}

/* ──────── STEP 1 — RMU ──────── */
function Step1RMU({ answers, updateAnswer, filteredConfigs, selectedRmu, showNewRmu, setShowNewRmu, newRmu, setNewRmu, addNewRmuConfig }: any) {
  const merken = ["ABB Safe Plus", "Siemens 8DJH", "Magnefix"];
  const merkMap: Record<string, string> = { "ABB Safe Plus": "ABB", "Siemens 8DJH": "Siemens", "Magnefix": "Magnefix" };

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>RMU installatie</h3>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Wordt de RMU vervangen of nieuw geplaatst?</p>
      <div className="space-y-2">
        <ChoiceBtn selected={answers.rmu_vervangen === true} onClick={() => updateAnswer("rmu_vervangen", true)}>✓ Ja, RMU wordt vervangen/geplaatst</ChoiceBtn>
        <ChoiceBtn selected={answers.rmu_vervangen === false} onClick={() => { updateAnswer("rmu_vervangen", false); updateAnswer("rmu_merk", null); updateAnswer("rmu_configuratie_id", null); }}>✗ Nee, geen RMU werkzaamheden</ChoiceBtn>
      </div>

      {answers.rmu_vervangen && (
        <>
          <p className="text-sm font-medium mt-4" style={{ color: "var(--text-primary)" }}>Welk merk RMU?</p>
          <div className="grid grid-cols-3 gap-2">
            {merken.map(m => (
              <ChoiceBtn key={m} selected={answers.rmu_merk === merkMap[m]} onClick={() => { updateAnswer("rmu_merk", merkMap[m]); updateAnswer("rmu_configuratie_id", null); }}>
                {m}
              </ChoiceBtn>
            ))}
          </div>

          {answers.rmu_merk && (
            <>
              <p className="text-sm font-medium mt-4" style={{ color: "var(--text-primary)" }}>Welke configuratie?</p>
              <div className="flex flex-wrap gap-1.5">
                {filteredConfigs.map((c: RmuConfiguratie) => (
                  <button key={c.id} onClick={() => { updateAnswer("rmu_configuratie_id", c.id); updateAnswer("rmu_velden", c.velden); }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] transition-all" style={{
                      background: answers.rmu_configuratie_id === c.id ? "var(--accent-light)" : "var(--bg-surface)",
                      border: answers.rmu_configuratie_id === c.id ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
                    }}>
                    <span className="text-[15px] font-bold" style={{ color: answers.rmu_configuratie_id === c.id ? "var(--accent)" : "var(--text-primary)" }}>{c.code}</span>
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.velden}-velds</span>
                  </button>
                ))}
              </div>

              {!showNewRmu ? (
                <button onClick={() => setShowNewRmu(true)} className="text-xs mt-1" style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>
                  + Configuratie niet in lijst
                </button>
              ) : (
                <div className="rounded-xl p-3 space-y-2 mt-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Nieuwe {answers.rmu_merk} configuratie</p>
                  <div className="flex gap-2">
                    <input value={newRmu.code} onChange={e => setNewRmu((n: any) => ({ ...n, code: e.target.value }))} placeholder="Code bijv. FCCVV" className="flex-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                    <input type="number" value={newRmu.velden} onChange={e => setNewRmu((n: any) => ({ ...n, velden: parseInt(e.target.value) || 3 }))} min={2} max={10} className="w-20 px-3 py-2 rounded-lg text-sm text-center" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "DM Mono" }} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowNewRmu(false)} className="flex-1 py-2 rounded-lg text-xs font-medium" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Annuleren</button>
                    <button onClick={addNewRmuConfig} className="flex-1 py-2 rounded-lg text-xs font-bold text-white" style={{ background: "var(--accent)" }}>Toevoegen</button>
                  </div>
                </div>
              )}
            </>
          )}

          {selectedRmu && (
            <InfoBlock>
              <p className="font-semibold">Op basis van {selectedRmu.label} ({selectedRmu.velden}-velds):</p>
              <p>✓ {answers.rmu_merk === "Compactstation" ? "R320040" : "R320010"} — MS-installatie (1×)</p>
              {selectedRmu.velden > 3 && <p>✓ R320020 — Extra MS-veld ({selectedRmu.velden - 3}×)</p>}
              <p className="mt-1 opacity-80">Suggestie kabelvelden: {selectedRmu.velden - 1}× eindsluiting + {selectedRmu.velden - 1}× mof</p>
            </InfoBlock>
          )}
        </>
      )}
    </div>
  );
}

/* ──────── STEP 2 — Trafo ──────── */
function Step2Trafo({ answers, updateAnswer }: any) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Trafo werkzaamheden</h3>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Wat zijn de trafo werkzaamheden?</p>
      <div className="space-y-2">
        <ChoiceBtn selected={answers.trafo_situatie === "nieuw"} onClick={() => updateAnswer("trafo_situatie", "nieuw")}>🔄 Nieuwe trafo plaatsen</ChoiceBtn>
        <ChoiceBtn selected={answers.trafo_situatie === "draaien"} onClick={() => updateAnswer("trafo_situatie", "draaien")}>↩ Trafo draaien</ChoiceBtn>
        <ChoiceBtn selected={answers.trafo_situatie === "geen"} onClick={() => updateAnswer("trafo_situatie", "geen")}>— Geen trafo werkzaamheden</ChoiceBtn>
      </div>
      {answers.trafo_situatie === "nieuw" && <InfoBlock><p>✓ R330010 — Plaatsen trafo (1×)</p></InfoBlock>}
      {answers.trafo_situatie === "draaien" && <InfoBlock><p>✓ R330020 — Draaien trafo (1×)</p></InfoBlock>}
    </div>
  );
}

/* ──────── STEP 3 — LS ──────── */
function Step3LS({ answers, updateAnswer }: any) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>LS installatie</h3>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Nieuw LS-rek?</p>
      <div className="space-y-2">
        <ChoiceBtn selected={answers.ls_rek === "klein"} onClick={() => updateAnswer("ls_rek", "klein")}>≤630 kVA LS-rek</ChoiceBtn>
        <ChoiceBtn selected={answers.ls_rek === "groot"} onClick={() => updateAnswer("ls_rek", "groot")}>&gt;630 kVA LS-rek</ChoiceBtn>
        <ChoiceBtn selected={answers.ls_rek === "geen"} onClick={() => updateAnswer("ls_rek", "geen")}>Geen nieuw LS-rek</ChoiceBtn>
      </div>
      <div className="space-y-3 mt-4">
        <Counter label="LS stroken aanpassen" value={answers.ls_stroken} onChange={v => updateAnswer("ls_stroken", v)} />
        <Counter label="LS kabels aansluiten" value={answers.ls_kabels} onChange={v => updateAnswer("ls_kabels", v)} />
      </div>
    </div>
  );
}

/* ──────── STEP 4 — Kabels ──────── */
function Step4Kabels({ answers, updateAnswer, selectedRmu }: any) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>MS kabels & eindsluitingen</h3>
      {selectedRmu && (
        <InfoBlock>
          <p className="font-semibold">Suggestie op basis van RMU configuratie:</p>
          <p>{selectedRmu.velden - 1}× eindsluiting, {selectedRmu.velden - 1}× mof</p>
        </InfoBlock>
      )}
      <div className="space-y-4 mt-2">
        <div>
          <Counter label="MS eindsluitingen" value={answers.ms_eindsluitingen} onChange={v => updateAnswer("ms_eindsluitingen", v)} />
          <p className="text-[11px] mt-0.5 ml-1" style={{ color: "var(--text-muted)" }}>R410010 — Per eindsluiting binnen het station</p>
        </div>
        <div>
          <Counter label="MS verbindingsmoffen" value={answers.ms_moffen} onChange={v => updateAnswer("ms_moffen", v)} />
          <p className="text-[11px] mt-0.5 ml-1" style={{ color: "var(--text-muted)" }}>R410020 — Per verbindingsmof buiten het station</p>
        </div>
      </div>
    </div>
  );
}

/* ──────── STEP 5 — Overig ──────── */
function Step5Overig({ answers, updateAnswer, caseType }: any) {
  const checks: { key: keyof IntakeAnswers; label: string; code: string }[] = [
    { key: "vereffeningsleiding", label: "Vereffeningsleiding", code: "R350020" },
    { key: "aardweerstand", label: "Aardweerstand meten", code: "R350010" },
    { key: "ggi", label: "GGI (boren & coördinatie)", code: "R310030" },
    { key: "boren", label: "Boren/coördinatie", code: "R310010" },
    { key: "revisie", label: "Revisie excl. civiel", code: "R500020" },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Overige werkzaamheden</h3>
      <div className="space-y-2">
        {checks.map(c => (
          <label key={c.key} className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <input type="checkbox" checked={!!answers[c.key]} onChange={e => updateAnswer(c.key, e.target.checked)}
              className="w-4 h-4 rounded accent-[var(--accent)]" style={{ accentColor: "var(--accent)" }} />
            <div className="flex-1">
              <span className="text-sm" style={{ color: "var(--text-primary)" }}>{c.label}</span>
              <span className="text-[11px] ml-2" style={{ color: "var(--text-muted)" }}>{c.code}</span>
            </div>
          </label>
        ))}
      </div>
      <Counter label="WV-er uren" value={answers.wv_uren} onChange={v => updateAnswer("wv_uren", v)} />
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>R440010 — Per uur WV-er</p>

      {caseType && (
        <div className="text-xs space-y-0.5 mt-2" style={{ color: "var(--text-muted)" }}>
          {caseType === "NSA-case" && <p>✓ R370030 NSA (auto)</p>}
          {caseType === "Provisorium" && <p>✓ R370010 Provisorium (auto)</p>}
          {caseType === "Compactstation" && <p>✓ R320040 Compactstation wordt gebruikt i.p.v. R320010</p>}
        </div>
      )}
    </div>
  );
}

/* ──────── STEP 6 — Overzicht ──────── */
function Step6Overzicht({ regels, setRegels }: { regels: ForecastRegel[]; setRegels: (r: ForecastRegel[]) => void }) {
  const totOmzet = regels.reduce((s, r) => s + r.tarief_terrevolt * r.aantal, 0);
  const totKosten = regels.reduce((s, r) => s + r.tarief_inkoop * r.aantal, 0);
  const marge = totOmzet > 0 ? ((totOmzet - totKosten) / totOmzet) * 100 : 0;
  const margeColor = marge >= 30 ? "var(--success)" : marge >= 15 ? "var(--warn-dot)" : "var(--danger)";

  function updateAantal(i: number, delta: number) {
    setRegels(regels.map((r, idx) => idx === i ? { ...r, aantal: Math.max(0, r.aantal + delta) } : r));
  }
  function removeRegel(i: number) {
    setRegels(regels.filter((_, idx) => idx !== i));
  }

  const fmt = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Overzicht forecast</h3>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Controleer de voorgestelde spec-codes en pas aan indien nodig</p>

      <div className="rounded-[14px] overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        {/* Header */}
        <div className="grid grid-cols-12 gap-1 px-3.5 py-2" style={{ background: "var(--bg-surface-2)" }}>
          <span className="col-span-2 text-[10px] uppercase font-semibold" style={{ color: "var(--text-muted)" }}>Code</span>
          <span className="col-span-4 text-[10px] uppercase font-semibold" style={{ color: "var(--text-muted)" }}>Omschrijving</span>
          <span className="col-span-2 text-[10px] uppercase font-semibold text-center" style={{ color: "var(--text-muted)" }}>Aantal</span>
          <span className="col-span-2 text-[10px] uppercase font-semibold text-right" style={{ color: "var(--text-muted)" }}>Liander</span>
          <span className="col-span-2 text-[10px] uppercase font-semibold text-right" style={{ color: "var(--text-muted)" }}>Kosten</span>
        </div>
        {/* Rows */}
        {regels.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-1 px-3.5 py-2.5 items-center group" style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--border)" }}>
            <span className="col-span-2 text-xs font-mono font-semibold" style={{ color: "var(--accent)" }}>{r.code}</span>
            <span className="col-span-4 text-xs truncate" style={{ color: "var(--text-primary)" }}>{r.spec_omschrijving}</span>
            <div className="col-span-2 flex items-center justify-center gap-1">
              <button onClick={() => updateAantal(i, -1)} className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
                <Minus className="h-3 w-3" style={{ color: "var(--text-muted)" }} />
              </button>
              <span className="text-sm font-bold min-w-[24px] text-center" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-primary)" }}>{r.aantal}</span>
              <button onClick={() => updateAantal(i, 1)} className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
                <Plus className="h-3 w-3" style={{ color: "var(--text-muted)" }} />
              </button>
            </div>
            <span className="col-span-2 text-xs text-right" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-primary)" }}>{fmt(r.tarief_terrevolt * r.aantal)}</span>
            <div className="col-span-2 flex items-center justify-end gap-1">
              <span className="text-xs text-right" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-primary)" }}>{fmt(r.tarief_inkoop * r.aantal)}</span>
              <button onClick={() => removeRegel(i)} className="w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--danger)" }}>
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <div className="flex justify-between text-sm">
          <span style={{ color: "var(--text-secondary)" }}>Totaal omzet (Liander)</span>
          <span className="font-bold" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-primary)" }}>{fmt(totOmzet)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span style={{ color: "var(--text-secondary)" }}>Totaal kosten</span>
          <span className="font-bold" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-primary)" }}>{fmt(totKosten)}</span>
        </div>
        <div className="flex justify-between text-sm pt-1" style={{ borderTop: "1px solid var(--border)" }}>
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Marge</span>
          <span className="font-bold" style={{ fontFamily: "DM Mono, monospace", color: margeColor }}>{fmt(totOmzet - totKosten)} ({marge.toFixed(1)}%)</span>
        </div>
      </div>
    </div>
  );
}

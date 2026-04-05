import { useState, useEffect, useCallback } from "react";
import { X, Check, Minus, Plus, Zap, ChevronLeft, ChevronRight, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  IntakeAntwoorden, RmuConfiguratie, BerekendeRegel, IntakeRegel,
  defaultAntwoorden, berekenRegels, suggesteerEindsluitingen,
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
  const [answers, setAnswers] = useState<IntakeAntwoorden>(() => {
    const isNsaCompact = project.case_type === "NSA-case" || project.case_type === "Compactstation";
    const isProv = project.case_type === "Provisorium";
    return {
      ...defaultAntwoorden,
      wv_uren: isProv ? 32 : 16,
      wv_io_uren: isProv ? 32 : 16,
      wv: isNsaCompact || isProv,
      wv_io: isNsaCompact || isProv,
    };
  });
  const [rmuConfigs, setRmuConfigs] = useState<RmuConfiguratie[]>([]);
  const [dbRegels, setDbRegels] = useState<IntakeRegel[]>([]);
  const [saving, setSaving] = useState(false);
  const [overzichtRegels, setOverzichtRegels] = useState<BerekendeRegel[]>([]);
  const [showNewRmu, setShowNewRmu] = useState(false);
  const [newRmu, setNewRmu] = useState({ code: "", velden: 3 });

  useEffect(() => {
    Promise.all([
      supabase.from("rmu_configuraties").select("*").eq("actief", true).order("volgorde"),
      supabase.from("intake_regels").select("*").eq("actief", true).order("volgorde"),
    ]).then(([rmu, regels]) => {
      if (rmu.data) setRmuConfigs(rmu.data as RmuConfiguratie[]);
      if (regels.data) setDbRegels(regels.data as IntakeRegel[]);
    });
  }, []);

  const selectedRmu = rmuConfigs.find(c => c.id === answers.rmu_configuratie_id) || null;

  const update = useCallback(<K extends keyof IntakeAntwoorden>(key: K, val: IntakeAntwoorden[K]) => {
    setAnswers(a => ({ ...a, [key]: val }));
  }, []);

  useEffect(() => {
    if (step === 5) {
      setOverzichtRegels(berekenRegels(answers, project.case_type, dbRegels));
    }
  }, [step, answers, project.case_type, dbRegels]);

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
    update("rmu_configuratie_id", data.id);
    update("rmu_velden", newRmu.velden);
    setShowNewRmu(false);
    setNewRmu({ code: "", velden: 3 });
  }

  async function handleSave() {
    setSaving(true);
    try {
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

      if (overzichtRegels.length > 0) {
        const rows = overzichtRegels.map(r => ({
          forecast_id: forecastId,
          type: "stuks" as const,
          spec_code: r.spec_code,
          spec_omschrijving: r.label,
          tarief: r.tarief,
          eigen_kosten: r.eigen_kosten,
          aantal: r.aantal,
        }));
        await supabase.from("forecast_regels").insert(rows);
      }

      const projectUpdate: any = { intake_gedaan: true };
      if (answers.rmu_merk) projectUpdate.rmu_merk = answers.rmu_merk;
      if (answers.rmu_configuratie_id) projectUpdate.rmu_configuratie_id = answers.rmu_configuratie_id;
      await supabase.from("projects").update(projectUpdate).eq("id", projectId);

      onComplete();
    } catch {
      toast.error("Fout bij opslaan forecast");
    } finally {
      setSaving(false);
    }
  }

  function canNext(): boolean {
    if (step === 0) return answers.rmu_vervangen === false || !!answers.rmu_configuratie_id;
    if (step === 1) return answers.trafo_situatie !== "geen" || true; // always can proceed
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
        {step === 0 && <Step1RMU answers={answers} update={update} filteredConfigs={filteredConfigs} selectedRmu={selectedRmu} showNewRmu={showNewRmu} setShowNewRmu={setShowNewRmu} newRmu={newRmu} setNewRmu={setNewRmu} addNewRmuConfig={addNewRmuConfig} />}
        {step === 1 && <Step2Trafo answers={answers} update={update} />}
        {step === 2 && <Step3LS answers={answers} update={update} />}
        {step === 3 && <Step4Kabels answers={answers} update={update} selectedRmu={selectedRmu} caseType={project.case_type} />}
        {step === 4 && <Step5Overig answers={answers} update={update} caseType={project.case_type} />}
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

/* ──── Shared Components ──── */
function ChoiceBtn({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="w-full text-left px-5 py-4 rounded-[14px] text-[15px] font-medium transition-all" style={{
      background: selected ? "var(--accent-light)" : "var(--bg-surface)",
      border: selected ? "1.5px solid var(--accent-border)" : "1.5px solid var(--border)",
      color: selected ? "var(--accent)" : "var(--text-primary)",
      fontWeight: selected ? 600 : 500,
    }}>{children}</button>
  );
}

function Counter({ value, onChange, min = 0, max = 99, label, hint, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string; hint?: string; step?: number }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>{label}</span>
        <div className="flex items-center gap-3">
          <button onClick={() => onChange(Math.max(min, value - step))} className="w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-[48px] text-center text-xl font-bold" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-primary)" }}>{value}</span>
          <button onClick={() => onChange(Math.min(max, value + step))} className="w-9 h-9 rounded-[10px] flex items-center justify-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      {hint && <p className="text-[11px] mt-0.5 ml-1" style={{ color: "var(--text-muted)" }}>{hint}</p>}
    </div>
  );
}

function InfoBlock({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl p-3 mt-3 text-xs space-y-1" style={{ background: "var(--success-light)", border: "1px solid var(--success-border)", color: "var(--success)" }}>{children}</div>;
}

function CheckRow({ checked, onChange, label, code, children }: { checked: boolean; onChange: (v: boolean) => void; label: string; code: string; children?: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-3 px-3.5 py-3 rounded-xl cursor-pointer mb-1.5" style={{
        background: checked ? "var(--accent-light)" : "var(--bg-surface)",
        border: checked ? "1px solid var(--accent-border)" : "1px solid var(--border)",
      }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-[18px] h-[18px] rounded" style={{ accentColor: "var(--accent)" }} />
        <div className="flex-1">
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>{label}</span>
          <span className="text-[11px] ml-2" style={{ color: "var(--text-muted)" }}>{code}</span>
        </div>
      </label>
      {checked && children && <div className="ml-8 mb-2">{children}</div>}
    </div>
  );
}

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between px-3.5 py-3 rounded-xl mb-1.5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div>
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>{label}</span>
        {hint && <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)", fontStyle: "italic" }}>{hint}</p>}
      </div>
      <button onClick={() => onChange(!on)} className="w-11 h-6 rounded-full relative transition-colors" style={{ background: on ? "var(--accent)" : "var(--bg-surface-2)" }}>
        <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform" style={{ left: on ? 22 : 2 }} />
      </button>
    </div>
  );
}

/* ──── STEP 1 — RMU ──── */
function Step1RMU({ answers, update, filteredConfigs, selectedRmu, showNewRmu, setShowNewRmu, newRmu, setNewRmu, addNewRmuConfig }: any) {
  const merken = ["ABB Safe Plus", "Siemens 8DJH", "Magnefix"];
  const merkMap: Record<string, string> = { "ABB Safe Plus": "ABB", "Siemens 8DJH": "Siemens", "Magnefix": "Magnefix" };

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>RMU installatie</h3>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Wordt de RMU vervangen of nieuw geplaatst?</p>
      <div className="space-y-2">
        <ChoiceBtn selected={answers.rmu_vervangen === true} onClick={() => update("rmu_vervangen", true)}>✓ Ja, RMU wordt vervangen/geplaatst</ChoiceBtn>
        <ChoiceBtn selected={answers.rmu_vervangen === false} onClick={() => { update("rmu_vervangen", false); update("rmu_merk", null); update("rmu_configuratie_id", null); }}>✗ Nee, geen RMU werkzaamheden</ChoiceBtn>
      </div>

      {answers.rmu_vervangen && (
        <>
          <p className="text-sm font-medium mt-4" style={{ color: "var(--text-primary)" }}>Welk merk RMU?</p>
          <div className="grid grid-cols-3 gap-2">
            {merken.map(m => (
              <ChoiceBtn key={m} selected={answers.rmu_merk === merkMap[m]} onClick={() => { update("rmu_merk", merkMap[m]); update("rmu_configuratie_id", null); }}>{m}</ChoiceBtn>
            ))}
          </div>

          {answers.rmu_merk && (
            <>
              <p className="text-sm font-medium mt-4" style={{ color: "var(--text-primary)" }}>Welke configuratie?</p>
              <div className="flex flex-wrap gap-1.5">
                {filteredConfigs.map((c: RmuConfiguratie) => (
                  <button key={c.id} onClick={() => { update("rmu_configuratie_id", c.id); update("rmu_velden", c.velden); }}
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
                <button onClick={() => setShowNewRmu(true)} className="text-xs mt-1" style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>+ Configuratie niet in lijst</button>
              ) : (
                <div className="rounded-xl p-3 space-y-2 mt-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Nieuwe {answers.rmu_merk} configuratie</p>
                  <div className="flex gap-2">
                    <input value={newRmu.code} onChange={(e: any) => setNewRmu((n: any) => ({ ...n, code: e.target.value }))} placeholder="Code bijv. FCCVV" className="flex-1 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                    <input type="number" value={newRmu.velden} onChange={(e: any) => setNewRmu((n: any) => ({ ...n, velden: parseInt(e.target.value) || 3 }))} min={2} max={10} className="w-20 px-3 py-2 rounded-lg text-sm text-center" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "DM Mono" }} />
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
              <p>✓ MS-installatie (1×)</p>
              {selectedRmu.velden > 3 && <p>✓ Extra MS-veld ({selectedRmu.velden - 3}×)</p>}
              <p className="mt-1 opacity-80">Suggestie: {selectedRmu.velden - 1}× eindsluiting + {selectedRmu.velden - 1}× mof</p>
            </InfoBlock>
          )}
        </>
      )}
    </div>
  );
}

/* ──── STEP 2 — Trafo ──── */
function Step2Trafo({ answers, update }: any) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Trafo werkzaamheden</h3>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Wat zijn de trafo werkzaamheden?</p>
      <div className="space-y-2">
        <ChoiceBtn selected={answers.trafo_situatie === "nieuw"} onClick={() => update("trafo_situatie", "nieuw")}>🔄 Nieuwe trafo plaatsen</ChoiceBtn>
        <ChoiceBtn selected={answers.trafo_situatie === "draaien"} onClick={() => update("trafo_situatie", "draaien")}>↩ Trafo draaien</ChoiceBtn>
        <ChoiceBtn selected={answers.trafo_situatie === "geen"} onClick={() => update("trafo_situatie", "geen")}>— Geen trafo werkzaamheden</ChoiceBtn>
      </div>
      {answers.trafo_situatie === "nieuw" && <InfoBlock><p>✓ R330010 — Plaatsen trafo (1×)</p></InfoBlock>}
      {answers.trafo_situatie === "draaien" && <InfoBlock><p>✓ R330020 — Draaien trafo (1×)</p></InfoBlock>}
    </div>
  );
}

/* ──── STEP 3 — LS ──── */
function Step3LS({ answers, update }: any) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>LS installatie</h3>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Nieuw LS-rek?</p>
      <div className="space-y-2">
        <ChoiceBtn selected={answers.ls_rek === "klein"} onClick={() => update("ls_rek", "klein")}>≤630 kVA LS-rek</ChoiceBtn>
        <ChoiceBtn selected={answers.ls_rek === "groot"} onClick={() => update("ls_rek", "groot")}>&gt;630 kVA LS-rek</ChoiceBtn>
        <ChoiceBtn selected={answers.ls_rek === "geen"} onClick={() => update("ls_rek", "geen")}>Geen nieuw LS-rek</ChoiceBtn>
      </div>
      <div className="space-y-3 mt-4">
        <Counter label="LS stroken aanpassen" value={answers.ls_stroken} onChange={v => update("ls_stroken", v)} />
        <Counter label="LS kabels aansluiten" value={answers.ls_kabels} onChange={v => update("ls_kabels", v)} />
      </div>
    </div>
  );
}

/* ──── STEP 4 — Kabels ──── */
function Step4Kabels({ answers, update, selectedRmu, caseType }: any) {
  const isProv = caseType?.toLowerCase() === "provisorium";

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>MS kabels & eindsluitingen</h3>

      {isProv && (
        <div className="flex gap-2 items-start rounded-xl p-3" style={{ background: "var(--warn-bg)", border: "1.5px solid var(--warn-border)" }}>
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--warn-text)" }} />
          <p className="text-[13px] font-medium" style={{ color: "var(--warn-text)" }}>Let op: vul eindsluitingen in tbv het provisorium. Deze zijn niet automatisch afgeleid.</p>
        </div>
      )}

      {selectedRmu && (
        <InfoBlock>
          <p className="font-semibold">Suggestie op basis van {selectedRmu.label}:</p>
          <p>{selectedRmu.velden - 1} kabelvelden → {selectedRmu.velden - 1}× eindsluiting + {selectedRmu.velden - 1}× mof</p>
        </InfoBlock>
      )}

      <div className="space-y-4 mt-2">
        <Counter label="MS eindsluitingen (R410010)" value={answers.ms_eindsluitingen} onChange={v => update("ms_eindsluitingen", v)} hint="Binnen het station, per kabelaansluiting" />
        <Counter label="MS verbindingsmoffen (R410020)" value={answers.ms_moffen} onChange={v => update("ms_moffen", v)} hint="Buiten het station" />
      </div>
    </div>
  );
}

/* ──── STEP 5 — Overig ──── */
function Step5Overig({ answers, update, caseType }: any) {
  const isNsaCompact = caseType === "NSA-case" || caseType === "Compactstation";
  const isProv = caseType === "Provisorium";
  const defaultWv = isProv ? 32 : 16;

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Overige werkzaamheden</h3>

      <CheckRow checked={answers.vereffeningsleiding} onChange={v => update("vereffeningsleiding", v)} label="Vereffeningsleiding" code="R350020">
        <Counter label="Aantal" value={answers.vereffeningsleiding_aantal} onChange={v => update("vereffeningsleiding_aantal", v)} min={1} max={10} hint="Standaard 2, aanpasbaar" />
      </CheckRow>

      <CheckRow checked={answers.ggi} onChange={v => update("ggi", v)} label="GGI" code="R310030">
        <Counter label="Aantal" value={answers.ggi_aantal} onChange={v => update("ggi_aantal", v)} min={1} max={10} hint="Standaard 2, aanpasbaar" />
      </CheckRow>

      <CheckRow checked={answers.boren} onChange={v => update("boren", v)} label="Boren / coördinatie" code="R310010" />
      <CheckRow checked={answers.aardweerstand} onChange={v => update("aardweerstand", v)} label="Aardweerstand meten" code="R350010" />
      <CheckRow checked={answers.revisie} onChange={v => update("revisie", v)} label="Revisie excl. civiel" code="R500020" />

      <div className="pt-2" style={{ borderTop: "1px solid var(--border)" }}>
        <Toggle on={answers.wv} onChange={v => update("wv", v)} label="WV-er inzetten (R440010)"
          hint={isNsaCompact || isProv ? `Standaard ${defaultWv}u voor ${caseType}` : undefined} />
        {answers.wv && (
          <div className="ml-4 mb-3">
            <Counter label="Uren WV-er" value={answers.wv_uren} onChange={v => update("wv_uren", v)} step={8} max={999} />
          </div>
        )}

        <Toggle on={answers.wv_io} onChange={v => update("wv_io", v)} label="WV-er io inzetten (R440020)"
          hint={isNsaCompact || isProv ? `Standaard ${defaultWv}u voor ${caseType}` : undefined} />
        {answers.wv_io && (
          <div className="ml-4 mb-3">
            <Counter label="Uren WV-er io" value={answers.wv_io_uren} onChange={v => update("wv_io_uren", v)} step={8} max={999} />
          </div>
        )}
      </div>

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

/* ──── STEP 6 — Overzicht ──── */
function Step6Overzicht({ regels, setRegels }: { regels: BerekendeRegel[]; setRegels: (r: BerekendeRegel[]) => void }) {
  const totOmzet = regels.reduce((s, r) => s + r.tarief * r.aantal, 0);

  function updateAantal(i: number, delta: number) {
    setRegels(regels.map((r, idx) => idx === i ? { ...r, aantal: Math.max(r.min_aantal, Math.min(r.max_aantal, r.aantal + delta)) } : r));
  }
  function removeRegel(i: number) { setRegels(regels.filter((_, idx) => idx !== i)); }

  const fmt = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Overzicht forecast</h3>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Controleer de voorgestelde spec-codes en pas aan indien nodig</p>

      <div className="rounded-[14px] overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <div className="grid grid-cols-12 gap-1 px-3.5 py-2" style={{ background: "var(--bg-surface-2)" }}>
          <span className="col-span-2 text-[10px] uppercase font-semibold" style={{ color: "var(--text-muted)" }}>Code</span>
          <span className="col-span-5 text-[10px] uppercase font-semibold" style={{ color: "var(--text-muted)" }}>Omschrijving</span>
          <span className="col-span-2 text-[10px] uppercase font-semibold text-center" style={{ color: "var(--text-muted)" }}>Aantal</span>
          <span className="col-span-3 text-[10px] uppercase font-semibold text-right" style={{ color: "var(--text-muted)" }}>Omzet</span>
        </div>
        {regels.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-1 px-3.5 py-2.5 items-center group" style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--border)" }}>
            <span className="col-span-2 text-xs font-mono font-semibold" style={{ color: "var(--accent)" }}>{r.spec_code}</span>
            <div className="col-span-5">
              <span className="text-xs truncate block" style={{ color: "var(--text-primary)" }}>{r.label}</span>
              {r.waarschuwing && <span className="text-[10px] block" style={{ color: "var(--warn-text)" }}>⚠ {r.waarschuwing}</span>}
            </div>
            <div className="col-span-2 flex items-center justify-center gap-1">
              {r.aanpasbaar ? (
                <>
                  <button onClick={() => updateAantal(i, -1)} className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}><Minus className="h-3 w-3" style={{ color: "var(--text-muted)" }} /></button>
                  <span className="text-sm font-bold min-w-[24px] text-center" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-primary)" }}>{r.aantal}</span>
                  <button onClick={() => updateAantal(i, 1)} className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}><Plus className="h-3 w-3" style={{ color: "var(--text-muted)" }} /></button>
                </>
              ) : (
                <span className="text-sm font-bold" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-primary)" }}>{r.aantal}</span>
              )}
            </div>
            <div className="col-span-3 flex items-center justify-end gap-1">
              <span className="text-xs text-right" style={{ fontFamily: "DM Mono, monospace", color: "var(--success)" }}>{fmt(r.tarief * r.aantal)}</span>
              <button onClick={() => removeRegel(i)} className="w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--danger)" }}><X className="h-3 w-3" /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <div className="flex justify-between text-sm font-semibold">
          <span style={{ color: "var(--text-primary)" }}>Totaal omzet (Van Gelder)</span>
          <span className="font-bold" style={{ fontFamily: "DM Mono, monospace", color: "var(--success)" }}>{fmt(totOmzet)}</span>
        </div>
      </div>
    </div>
  );
}

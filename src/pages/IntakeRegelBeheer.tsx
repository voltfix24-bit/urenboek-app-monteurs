import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { BottomNav } from "@/components/BottomNav";
import { useNavBadges } from "@/hooks/useNavBadges";
import { ArrowLeft, Plus, Pencil, Trash2, X, Check, ToggleLeft, ToggleRight, FlaskConical, Loader2 } from "lucide-react";
import { SPEC_CODES } from "@/lib/specCodes";
import { IntakeRegel, IntakeAntwoorden, BerekendeRegel, LEGE_ANTWOORDEN, berekenRegels } from "@/lib/forecastIntake";

const TRIGGER_TYPES = ["altijd", "case_type", "antwoord", "rmu_velden_gt"];
const TRIGGER_VELDEN = ["rmu_vervangen", "rmu_velden", "trafo_situatie", "ls_rek", "ls_stroken", "ls_kabels", "vereffeningsleiding", "aardweerstand", "ggi", "boren", "dichtzetten", "traanplaat", "revisie", "wv", "wv_io", "ims_ombouw", "trafokabel", "zekeringen", "ls_moffen", "ls_eindsluitingen", "huisaansluitingen", "ls_kast_verwijderen", "ls_kast_aansluiten", "ov_kast", "ov_meter", "kabeldeel_vrijschakelen", "vp_uren", "avp_uren", "vop_uren", "case_type"];
const TRIGGER_BADGES: Record<string, { bg: string; color: string }> = {
  altijd: { bg: "var(--bg-surface-2)", color: "var(--text-secondary)" },
  case_type: { bg: "var(--info-light)", color: "var(--info)" },
  antwoord: { bg: "var(--accent-light)", color: "var(--accent)" },
  rmu_velden_gt: { bg: "var(--warn-light)", color: "var(--warn-text)" },
};

const emptyRegel: Partial<IntakeRegel> = {
  actief: true, volgorde: 0, trigger_type: "antwoord", trigger_veld: "", trigger_waarde: "",
  spec_code: "", label: "", standaard_aantal: 1, min_aantal: 0, max_aantal: 99, aanpasbaar: true,
  waarschuwing: null, hint: null, vereist_code: null, sluit_uit_code: null, sluit_uit_reden: null,
};

export default function IntakeRegelBeheer() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const { badges } = useNavBadges();
  const [regels, setRegels] = useState<IntakeRegel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<IntakeRegel>>(emptyRegel);
  const [isNew, setIsNew] = useState(false);
  const [filterActief, setFilterActief] = useState<"alle" | "actief" | "inactief">("alle");
  const [filterType, setFilterType] = useState<string>("alle");
  const [showSim, setShowSim] = useState(false);
  const [simCaseType, setSimCaseType] = useState<string>("");
  const [simAnswers, setSimAnswers] = useState<IntakeAntwoorden>(LEGE_ANTWOORDEN);
  const [simResult, setSimResult] = useState<BerekendeRegel[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchRegels = useCallback(async () => {
    const { data } = await supabase.from("intake_regels").select("*").order("volgorde");
    if (data) setRegels(data as IntakeRegel[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRegels(); }, [fetchRegels]);
  useEffect(() => { if (!isManager) navigate("/"); }, [isManager, navigate]);

  const filtered = regels.filter(r => {
    if (filterActief === "actief" && !r.actief) return false;
    if (filterActief === "inactief" && r.actief) return false;
    if (filterType !== "alle" && r.trigger_type !== filterType) return false;
    return true;
  });

  async function toggleActief(r: IntakeRegel) {
    await supabase.from("intake_regels").update({ actief: !r.actief }).eq("id", r.id);
    fetchRegels();
  }

  function startEdit(r: IntakeRegel) {
    setEditId(r.id);
    setEditForm({ ...r });
    setIsNew(false);
  }

  function startNew() {
    setEditId("new");
    setEditForm({ ...emptyRegel, volgorde: (regels.length + 1) * 10 });
    setIsNew(true);
  }

  async function saveEdit() {
    if (!editForm.spec_code || !editForm.label || !editForm.trigger_type) {
      toast.error("Vul verplichte velden in"); return;
    }
    const data: any = {
      actief: editForm.actief, volgorde: editForm.volgorde, trigger_type: editForm.trigger_type,
      trigger_veld: editForm.trigger_veld || null, trigger_waarde: editForm.trigger_waarde || null,
      spec_code: editForm.spec_code, label: editForm.label,
      standaard_aantal: editForm.standaard_aantal, min_aantal: editForm.min_aantal, max_aantal: editForm.max_aantal,
      aanpasbaar: editForm.aanpasbaar, waarschuwing: editForm.waarschuwing || null, hint: editForm.hint || null,
      vereist_code: editForm.vereist_code || null, sluit_uit_code: editForm.sluit_uit_code || null,
      sluit_uit_reden: editForm.sluit_uit_reden || null,
    };
    if (isNew) {
      const { error } = await supabase.from("intake_regels").insert(data);
      if (error) { toast.error("Fout bij toevoegen"); return; }
      toast.success("Regel toegevoegd");
    } else {
      const { error } = await supabase.from("intake_regels").update(data).eq("id", editId);
      if (error) { toast.error("Fout bij opslaan"); return; }
      toast.success("Regel opgeslagen");
    }
    setEditId(null);
    fetchRegels();
  }

  async function deleteRegel(id: string) {
    await supabase.from("intake_regels").delete().eq("id", id);
    setConfirmDeleteId(null);
    toast.success("Regel verwijderd");
    fetchRegels();
  }

  function runSimulation() {
    setSimResult(berekenRegels(simAnswers, simCaseType || null, regels));
  }

  const inputStyle = { background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
    <>
      <DesktopSidebar badges={badges} />
      <div className="lg:ml-[240px] min-h-screen" style={{ background: "var(--bg-base)" }}>
        <header className="flex items-center gap-3 px-6 lg:px-10 pt-6 pb-4">
          <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-lg flex items-center justify-center lg:hidden" style={{ background: "var(--bg-surface-2)" }}><ArrowLeft className="h-4 w-4" style={{ color: "var(--text-secondary)" }} /></button>
          <div className="flex-1">
            <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Intake regelmotor</h1>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Beheer de automatische forecast logica</p>
          </div>
          <button onClick={() => setShowSim(!showSim)} className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
            <FlaskConical className="h-3.5 w-3.5" /> Testen
          </button>
          <button onClick={startNew} className="px-3 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1.5" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
            <Plus className="h-3.5 w-3.5" /> Nieuwe regel
          </button>
        </header>

        {/* Simulator */}
        {showSim && (
          <div className="mx-6 lg:mx-10 mb-4 rounded-[14px] p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>🧪 Regel simulator</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <select value={simCaseType} onChange={e => setSimCaseType(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs" style={inputStyle}>
                <option value="">Geen case type</option>
                <option value="NSA-case">NSA-case</option>
                <option value="Compactstation">Compactstation</option>
                <option value="Provisorium">Provisorium</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-primary)" }}>
                <input type="checkbox" checked={simAnswers.rmu_vervangen} onChange={e => setSimAnswers(a => ({ ...a, rmu_vervangen: e.target.checked }))} style={{ accentColor: "var(--accent)" }} /> RMU
              </label>
              <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-primary)" }}>
                Vereff:
                <input type="number" value={simAnswers.vereffeningsleiding} onChange={e => setSimAnswers(a => ({ ...a, vereffeningsleiding: parseInt(e.target.value) || 0 }))} min={0} max={10} className="w-14 px-2 py-1 rounded text-center" style={inputStyle} />
              </label>
              <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-primary)" }}>
                <input type="checkbox" checked={simAnswers.wv} onChange={e => setSimAnswers(a => ({ ...a, wv: e.target.checked }))} style={{ accentColor: "var(--accent)" }} /> WV
              </label>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <select value={simAnswers.trafo_situatie} onChange={e => setSimAnswers(a => ({ ...a, trafo_situatie: e.target.value as any }))} className="px-2 py-1.5 rounded-lg text-xs" style={inputStyle}>
                <option value="geen">Trafo: geen</option>
                <option value="nieuw">Trafo: nieuw</option>
                <option value="draaien">Trafo: draaien</option>
              </select>
              <select value={simAnswers.ls_rek} onChange={e => setSimAnswers(a => ({ ...a, ls_rek: e.target.value as any }))} className="px-2 py-1.5 rounded-lg text-xs" style={inputStyle}>
                <option value="geen">LS: geen</option>
                <option value="klein">LS: ≤630kVA</option>
                <option value="groot">LS: &gt;630kVA</option>
              </select>
              <div className="flex items-center gap-1 text-xs" style={{ color: "var(--text-primary)" }}>
                RMU velden:
                <input type="number" value={simAnswers.rmu_velden} onChange={e => setSimAnswers(a => ({ ...a, rmu_velden: parseInt(e.target.value) || 0 }))} min={0} max={10} className="w-14 px-2 py-1 rounded text-center" style={inputStyle} />
              </div>
            </div>
            <button onClick={runSimulation} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ background: "var(--accent)" }}>Berekenen</button>
            {simResult.length > 0 && (
              <div className="rounded-xl overflow-hidden mt-2" style={{ border: "1px solid var(--border)" }}>
                {simResult.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 text-xs" style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, background: "var(--bg-base)" }}>
                    <span className="font-mono font-semibold" style={{ color: "var(--accent)" }}>{r.spec_code}</span>
                    <span className="flex-1" style={{ color: "var(--text-primary)" }}>{r.label}</span>
                    <span className="font-mono font-bold" style={{ color: "var(--text-primary)" }}>{r.aantal}×</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 px-6 lg:px-10 mb-3 flex-wrap">
          {(["alle", "actief", "inactief"] as const).map(f => (
            <button key={f} onClick={() => setFilterActief(f)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{
              background: filterActief === f ? "var(--accent-light)" : "var(--bg-surface)",
              border: filterActief === f ? "1px solid var(--accent)" : "1px solid var(--border)",
              color: filterActief === f ? "var(--accent)" : "var(--text-secondary)",
            }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
          ))}
          <span className="text-[10px] uppercase tracking-wider ml-2" style={{ color: "var(--text-muted)" }}>Type:</span>
          {["alle", ...TRIGGER_TYPES].map(t => (
            <button key={t} onClick={() => setFilterType(t)} className="px-2.5 py-1 rounded-lg text-[11px] font-medium" style={{
              background: filterType === t ? "var(--accent-light)" : "var(--bg-surface)",
              border: filterType === t ? "1px solid var(--accent)" : "1px solid var(--border)",
              color: filterType === t ? "var(--accent)" : "var(--text-secondary)",
            }}>{t}</button>
          ))}
          <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>{filtered.length} regels</span>
        </div>

        {/* Edit form */}
        {editId && (
          <div className="mx-6 lg:mx-10 mb-4 rounded-[14px] p-4 space-y-3" style={{ background: "var(--accent-light)", border: "1.5px solid var(--accent-border)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{isNew ? "Nieuwe regel" : "Regel bewerken"}</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Trigger type</label>
                <select value={editForm.trigger_type} onChange={e => setEditForm(f => ({ ...f, trigger_type: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5" style={inputStyle}>
                  {TRIGGER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Trigger veld</label>
                <select value={editForm.trigger_veld || ""} onChange={e => setEditForm(f => ({ ...f, trigger_veld: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5" style={inputStyle}>
                  <option value="">—</option>
                  {TRIGGER_VELDEN.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Trigger waarde</label>
                <input value={editForm.trigger_waarde || ""} onChange={e => setEditForm(f => ({ ...f, trigger_waarde: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5" style={inputStyle} placeholder="bijv. ja, nieuw, 3" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Spec code</label>
                <select value={editForm.spec_code} onChange={e => {
                  const spec = SPEC_CODES.find(s => s.code === e.target.value);
                  setEditForm(f => ({ ...f, spec_code: e.target.value, label: spec?.omschrijving || f.label || "" }));
                }} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5" style={inputStyle}>
                  <option value="">Kies...</option>
                  {SPEC_CODES.map(s => <option key={s.code} value={s.code}>{s.code} — {s.omschrijving}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Label</label>
                <input value={editForm.label} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5" style={inputStyle} />
              </div>
              <div className="grid grid-cols-3 gap-1">
                <div>
                  <label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Aantal</label>
                  <input type="number" value={editForm.standaard_aantal} onChange={e => setEditForm(f => ({ ...f, standaard_aantal: Number(e.target.value) }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5 text-center" style={inputStyle} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Min</label>
                  <input type="number" value={editForm.min_aantal} onChange={e => setEditForm(f => ({ ...f, min_aantal: Number(e.target.value) }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5 text-center" style={inputStyle} />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Max</label>
                  <input type="number" value={editForm.max_aantal} onChange={e => setEditForm(f => ({ ...f, max_aantal: Number(e.target.value) }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5 text-center" style={inputStyle} />
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Volgorde</label>
                <input type="number" value={editForm.volgorde} onChange={e => setEditForm(f => ({ ...f, volgorde: Number(e.target.value) }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5 text-center" style={inputStyle} />
              </div>
              <label className="flex items-center gap-2 text-xs mt-4" style={{ color: "var(--text-primary)" }}>
                <input type="checkbox" checked={editForm.aanpasbaar} onChange={e => setEditForm(f => ({ ...f, aanpasbaar: e.target.checked }))} style={{ accentColor: "var(--accent)" }} /> Aanpasbaar
              </label>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Waarschuwing</label>
                <textarea value={editForm.waarschuwing || ""} onChange={e => setEditForm(f => ({ ...f, waarschuwing: e.target.value }))} rows={2} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5 resize-none" style={inputStyle} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Hint</label>
                <input value={editForm.hint || ""} onChange={e => setEditForm(f => ({ ...f, hint: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5" style={inputStyle} />
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Sluit uit code</label>
                <select value={editForm.sluit_uit_code || ""} onChange={e => setEditForm(f => ({ ...f, sluit_uit_code: e.target.value || null }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5" style={inputStyle}>
                  <option value="">Geen</option>
                  {SPEC_CODES.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Sluit uit reden</label>
                <input value={editForm.sluit_uit_reden || ""} onChange={e => setEditForm(f => ({ ...f, sluit_uit_reden: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5" style={inputStyle} />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Vereist code</label>
                <select value={editForm.vereist_code || ""} onChange={e => setEditForm(f => ({ ...f, vereist_code: e.target.value || null }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5" style={inputStyle}>
                  <option value="">Geen</option>
                  {SPEC_CODES.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditId(null)} className="flex-1 py-2 rounded-xl text-xs font-medium" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Annuleren</button>
              <button onClick={saveEdit} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>{isNew ? "Toevoegen" : "Opslaan"}</button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="mx-6 lg:mx-10 pb-24 rounded-[14px] overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <div className="grid grid-cols-12 gap-1 px-3.5 py-2" style={{ background: "var(--bg-surface-2)" }}>
            <span className="col-span-2 text-[10px] uppercase font-semibold tracking-[0.5px]" style={{ color: "var(--text-muted)" }}>Trigger</span>
            <span className="col-span-2 text-[10px] uppercase font-semibold tracking-[0.5px]" style={{ color: "var(--text-muted)" }}>Waarde</span>
            <span className="col-span-2 text-[10px] uppercase font-semibold tracking-[0.5px]" style={{ color: "var(--text-muted)" }}>Spec code</span>
            <span className="col-span-2 text-[10px] uppercase font-semibold tracking-[0.5px]" style={{ color: "var(--text-muted)" }}>Label</span>
            <span className="col-span-1 text-[10px] uppercase font-semibold tracking-[0.5px] text-center" style={{ color: "var(--text-muted)" }}>Aantal</span>
            <span className="col-span-1 text-[10px] uppercase font-semibold tracking-[0.5px] text-center" style={{ color: "var(--text-muted)" }}>Actief</span>
            <span className="col-span-2 text-[10px] uppercase font-semibold tracking-[0.5px] text-right" style={{ color: "var(--text-muted)" }}>Acties</span>
          </div>
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--accent)" }} /></div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-xs" style={{ color: "var(--text-muted)" }}>Geen regels gevonden</div>
          ) : (
            filtered.map(r => (
              <div key={r.id} className="grid grid-cols-12 gap-1 px-3.5 py-2.5 items-center group" style={{ borderTop: "1px solid var(--border)", background: "var(--bg-surface)", opacity: r.actief ? 1 : 0.5 }}>
                <span className="col-span-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={TRIGGER_BADGES[r.trigger_type] || TRIGGER_BADGES.altijd}>{r.trigger_type}</span>
                </span>
                <span className="col-span-2 text-xs truncate" style={{ color: "var(--text-primary)" }}>
                  {r.trigger_veld && <span className="font-medium">{r.trigger_veld}</span>}
                  {r.trigger_waarde && <span style={{ color: "var(--text-muted)" }}> = {r.trigger_waarde}</span>}
                </span>
                <span className="col-span-2 text-xs font-mono font-semibold" style={{ color: "var(--accent)" }}>{r.spec_code}</span>
                <span className="col-span-2 text-xs truncate" style={{ color: "var(--text-primary)" }}>{r.label}</span>
                <span className="col-span-1 text-xs text-center font-mono font-bold" style={{ color: "var(--text-primary)" }}>{r.standaard_aantal}</span>
                <span className="col-span-1 flex justify-center">
                  <button onClick={() => toggleActief(r)} className="w-8 h-5 rounded-full relative" style={{ background: r.actief ? "var(--accent)" : "var(--bg-surface-2)" }}>
                    <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" style={{ left: r.actief ? 16 : 2 }} />
                  </button>
                </span>
                <div className="col-span-2 flex items-center justify-end gap-1">
                  <button onClick={() => startEdit(r)} className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
                    <Pencil className="h-3 w-3" style={{ color: "var(--text-muted)" }} />
                  </button>
                  {confirmDeleteId === r.id ? (
                    <div className="flex gap-1">
                      <button onClick={() => setConfirmDeleteId(null)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
                        <X className="h-3 w-3" style={{ color: "var(--text-muted)" }} />
                      </button>
                      <button onClick={() => deleteRegel(r.id)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--danger)", color: "#fff" }}>
                        <Check className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(r.id)} className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "var(--danger-light)", border: "1px solid var(--danger-border)" }}>
                      <Trash2 className="h-3 w-3" style={{ color: "var(--danger)" }} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <BottomNav badges={badges} />
    </>
  );
}

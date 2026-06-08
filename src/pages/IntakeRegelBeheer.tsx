import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { BottomNav } from "@/components/BottomNav";
import { useNavBadges } from "@/hooks/useNavBadges";
import { ArrowLeft, Plus, Pencil, Trash2, X, Check, FlaskConical, AlertTriangle, ChevronDown, ChevronRight, Settings, LayoutList } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { SPEC_CODES, GROEP_LABELS } from "@/lib/specCodes";
import { IntakeRegel, IntakeAntwoorden, BerekendeRegel, LEGE_ANTWOORDEN, berekenRegels } from "@/lib/forecastIntake";
import { euroDecimals as euro } from "@/lib/formatting";

// ─── Constants ───

const TRIGGER_TYPES = ["altijd", "case_type", "antwoord", "rmu_velden_gt"];
const TRIGGER_VELDEN = ["rmu_vervangen", "rmu_velden", "trafo_situatie", "ls_rek", "ls_stroken", "ls_kabels", "vereffeningsleiding", "aardweerstand", "ggi", "boren", "dichtzetten", "traanplaat", "revisie", "wv", "wv_io", "ims_ombouw", "trafokabel", "zekeringen", "ls_moffen", "ls_eindsluitingen", "huisaansluitingen", "ls_kast_verwijderen", "ls_kast_aansluiten", "ov_kast", "ov_meter", "kabeldeel_vrijschakelen", "vp_uren", "avp_uren", "vop_uren", "case_type"];
const TRIGGER_BADGES: Record<string, { bg: string; color: string }> = {
  altijd: { bg: "var(--bg-surface-2)", color: "var(--text-muted)" },
  case_type: { bg: "rgba(110,155,255,0.1)", color: "var(--info)" },
  antwoord: { bg: "var(--accent-light)", color: "var(--accent)" },
  rmu_velden_gt: { bg: "var(--warn-light)", color: "var(--warn-text)" },
};

const emptyRegel: Partial<IntakeRegel> = {
  actief: true, volgorde: 0, trigger_type: "antwoord", trigger_veld: "", trigger_waarde: "",
  spec_code: "", label: "", standaard_aantal: 1, min_aantal: 0, max_aantal: 99, aanpasbaar: true,
  waarschuwing: null, hint: null, vereist_code: null, sluit_uit_code: null, sluit_uit_reden: null,
};

const CATEGORIE_MAP: Record<string, string[]> = {
  "Case type": ["case_type"],
  "RMU werkzaamheden": ["rmu_vervangen", "rmu_velden_gt", "rmu_velden"],
  "MS extra": ["ims_ombouw", "trafokabel"],
  "Trafo": ["trafo_situatie"],
  "LS-rek": ["ls_rek", "ls_stroken", "ls_kabels", "zekeringen"],
  "Bouwkundig": ["boren", "dichtzetten", "ggi", "traanplaat"],
  "MS kabels": ["ms_moffen", "ms_eindsluitingen"],
  "LS kabels": ["ls_moffen", "ls_eindsluitingen"],
  "Aansluitingen & OV": ["huisaansluitingen", "ls_kast_verwijderen", "ls_kast_aansluiten", "ov_kast", "ov_meter"],
  "Vrijschakelen": ["kabeldeel_vrijschakelen"],
  "Aarding": ["aardweerstand", "vereffeningsleiding"],
  "Revisie": ["revisie"],
  "WV & personeel": ["wv", "wv_io", "vp_uren", "avp_uren", "vop_uren"],
  "Altijd": ["altijd"],
};

const VELD_LABELS: Record<string, string> = {
  rmu_vervangen: "RMU vervangen", rmu_velden: "RMU velden", trafo_situatie: "trafo situatie",
  ls_rek: "LS-rek", ls_stroken: "LS stroken", ls_kabels: "LS kabels", zekeringen: "zekeringen",
  boren: "boren", dichtzetten: "dichtzetten", ggi: "GGI", traanplaat: "traanplaat",
  ms_moffen: "MS moffen", ms_eindsluitingen: "MS eindsluitingen",
  ls_moffen: "LS moffen", ls_eindsluitingen: "LS eindsluitingen",
  huisaansluitingen: "huisaansluitingen", ls_kast_verwijderen: "LS kast verwijderen",
  ls_kast_aansluiten: "LS kast aansluiten", ov_kast: "OV kast", ov_meter: "OV meter",
  kabeldeel_vrijschakelen: "kabeldeel vrijschakelen",
  aardweerstand: "aardweerstand", vereffeningsleiding: "vereffeningsleiding",
  revisie: "revisie", wv: "WV-er", wv_io: "WV-er io",
  ims_ombouw: "iMS ombouw", trafokabel: "trafokabel",
  vp_uren: "VP uren", avp_uren: "AVP uren", vop_uren: "VOP uren",
  case_type: "case type",
};

const WAARDE_LABELS: Record<string, string> = {
  ja: "ja", gt0: "> 0", nieuw: "nieuw", draaien: "draaien", vrijschakelen: "vrijschakelen",
  klein: "≤630kVA", groot: ">630kVA", uitbreiden: "uitbreiden", geen: "geen",
  volledig: "volledig", excl_civiel: "excl civiel",
  "nsa-case": "NSA", compactstation: "Compactstation", provisorium: "Provisorium",
};

// Situatie dropdown options for simple edit
const SITUATIE_OPTIES = [
  { label: "─── Case type ───", disabled: true },
  { label: "NSA-case", type: "case_type", veld: "case_type", waarde: "nsa-case" },
  { label: "Compactstation", type: "case_type", veld: "case_type", waarde: "compactstation" },
  { label: "Provisorium", type: "case_type", veld: "case_type", waarde: "provisorium" },
  { label: "─── RMU ───", disabled: true },
  { label: "RMU wordt vervangen", type: "antwoord", veld: "rmu_vervangen", waarde: "ja" },
  { label: "RMU heeft meer dan 3 velden", type: "rmu_velden_gt", veld: "rmu_velden", waarde: "3" },
  { label: "─── MS extra ───", disabled: true },
  { label: "iMS ombouw", type: "antwoord", veld: "ims_ombouw", waarde: "ja" },
  { label: "Trafokabel vervangen", type: "antwoord", veld: "trafokabel", waarde: "ja" },
  { label: "─── Trafo ───", disabled: true },
  { label: "Nieuwe trafo plaatsen", type: "antwoord", veld: "trafo_situatie", waarde: "nieuw" },
  { label: "Trafo draaien", type: "antwoord", veld: "trafo_situatie", waarde: "draaien" },
  { label: "Trafo vrijschakelen", type: "antwoord", veld: "trafo_situatie", waarde: "vrijschakelen" },
  { label: "─── LS-rek ───", disabled: true },
  { label: "LS-rek ≤630kVA", type: "antwoord", veld: "ls_rek", waarde: "klein" },
  { label: "LS-rek >630kVA", type: "antwoord", veld: "ls_rek", waarde: "groot" },
  { label: "LS-rek uitbreiden", type: "antwoord", veld: "ls_rek", waarde: "uitbreiden" },
  { label: "─── Werkzaamheden ───", disabled: true },
  { label: "Boren (aantal > 0)", type: "antwoord", veld: "boren", waarde: "gt0" },
  { label: "Dichtzetten (aantal > 0)", type: "antwoord", veld: "dichtzetten", waarde: "gt0" },
  { label: "GGI (aantal > 0)", type: "antwoord", veld: "ggi", waarde: "gt0" },
  { label: "Traanplaat (aantal > 0)", type: "antwoord", veld: "traanplaat", waarde: "gt0" },
  { label: "LS stroken (aantal > 0)", type: "antwoord", veld: "ls_stroken", waarde: "gt0" },
  { label: "LS kabels (aantal > 0)", type: "antwoord", veld: "ls_kabels", waarde: "gt0" },
  { label: "Zekeringen (aantal > 0)", type: "antwoord", veld: "zekeringen", waarde: "gt0" },
  { label: "MS moffen (aantal > 0)", type: "antwoord", veld: "ms_moffen", waarde: "gt0" },
  { label: "MS eindsluitingen (aantal > 0)", type: "antwoord", veld: "ms_eindsluitingen", waarde: "gt0" },
  { label: "LS moffen (aantal > 0)", type: "antwoord", veld: "ls_moffen", waarde: "gt0" },
  { label: "LS eindsluitingen (aantal > 0)", type: "antwoord", veld: "ls_eindsluitingen", waarde: "gt0" },
  { label: "Huisaansluitingen (aantal > 0)", type: "antwoord", veld: "huisaansluitingen", waarde: "gt0" },
  { label: "LS kast verwijderen (aantal > 0)", type: "antwoord", veld: "ls_kast_verwijderen", waarde: "gt0" },
  { label: "LS kast aansluiten (aantal > 0)", type: "antwoord", veld: "ls_kast_aansluiten", waarde: "gt0" },
  { label: "OV kast (aantal > 0)", type: "antwoord", veld: "ov_kast", waarde: "gt0" },
  { label: "OV meter (aantal > 0)", type: "antwoord", veld: "ov_meter", waarde: "gt0" },
  { label: "Kabeldeel vrijschakelen (aantal > 0)", type: "antwoord", veld: "kabeldeel_vrijschakelen", waarde: "gt0" },
  { label: "Altijd (elk project)", type: "altijd", veld: null, waarde: null },
  { label: "─── Aarding & revisie ───", disabled: true },
  { label: "Vereffeningsleiding (aantal > 0)", type: "antwoord", veld: "vereffeningsleiding", waarde: "gt0" },
  { label: "Aardweerstand meten", type: "antwoord", veld: "aardweerstand", waarde: "ja" },
  { label: "Revisie volledig", type: "antwoord", veld: "revisie", waarde: "volledig" },
  { label: "Revisie excl civiel", type: "antwoord", veld: "revisie", waarde: "excl_civiel" },
  { label: "─── WV ───", disabled: true },
  { label: "WV-er inzetten", type: "antwoord", veld: "wv", waarde: "ja" },
  { label: "WV-er io inzetten", type: "antwoord", veld: "wv_io", waarde: "ja" },
  { label: "VP uren (aantal > 0)", type: "antwoord", veld: "vp_uren", waarde: "gt0" },
  { label: "AVP uren (aantal > 0)", type: "antwoord", veld: "avp_uren", waarde: "gt0" },
  { label: "VOP uren (aantal > 0)", type: "antwoord", veld: "vop_uren", waarde: "gt0" },
] as const;



// ─── Helpers ───

function regelConditieTekst(r: IntakeRegel): string {
  if (r.trigger_type === "altijd") return "Altijd";
  if (r.trigger_type === "case_type") return `Als case type = ${WAARDE_LABELS[r.trigger_waarde || ""] || r.trigger_waarde}`;
  if (r.trigger_type === "rmu_velden_gt") return `Als RMU meer dan ${r.trigger_waarde} velden`;
  if (r.trigger_type === "antwoord") {
    const veldLabel = VELD_LABELS[r.trigger_veld || ""] || r.trigger_veld;
    if (r.trigger_waarde === "ja") return `Als ${veldLabel}`;
    if (r.trigger_waarde === "gt0") return `Als ${veldLabel} > 0`;
    const waardeLabel = WAARDE_LABELS[r.trigger_waarde || ""] || r.trigger_waarde;
    return `Als ${veldLabel} = ${waardeLabel}`;
  }
  return r.trigger_type;
}

function categoriseRegel(r: IntakeRegel): string {
  if (r.trigger_type === "altijd") return "Altijd";
  if (r.trigger_type === "case_type") return "Case type";
  if (r.trigger_type === "rmu_velden_gt") return "RMU werkzaamheden";
  const veld = r.trigger_veld || "";
  for (const [cat, velden] of Object.entries(CATEGORIE_MAP)) {
    if (velden.includes(veld)) return cat;
  }
  return "Overig";
}

function findSituatieIndex(r: Partial<IntakeRegel>): number {
  return SITUATIE_OPTIES.findIndex(o => !("disabled" in o) && o.type === r.trigger_type && o.veld === (r.trigger_veld || null) && o.waarde === (r.trigger_waarde || null));
}

// ─── Component ───

export default function IntakeRegelBeheer() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const { badges } = useNavBadges();
  const [regels, setRegels] = useState<IntakeRegel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<IntakeRegel>>(emptyRegel);
  const [isNew, setIsNew] = useState(false);
  const [viewMode, setViewMode] = useState<"simple" | "advanced">(() => (localStorage.getItem("intake_view") as any) || "simple");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(Object.keys(CATEGORIE_MAP)));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Filters (advanced only)
  const [filterActief, setFilterActief] = useState<"alle" | "actief" | "inactief">("alle");
  const [filterType, setFilterType] = useState<string>("alle");

  // Simulator
  const [showSim, setShowSim] = useState(false);
  const [simCaseType, setSimCaseType] = useState<string>("");
  const [simRmu, setSimRmu] = useState(false);
  const [simVelden, setSimVelden] = useState(3);
  const [simTrafo, setSimTrafo] = useState<string>("geen");
  const [simLsRek, setSimLsRek] = useState<string>("geen");
  const [simResult, setSimResult] = useState<BerekendeRegel[]>([]);

  const fetchRegels = useCallback(async () => {
    const { data } = await supabase.from("intake_regels").select("*").order("volgorde");
    if (data) setRegels(data as IntakeRegel[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRegels(); }, [fetchRegels]);
  useEffect(() => { if (!isManager) navigate("/"); }, [isManager, navigate]);
  useEffect(() => { localStorage.setItem("intake_view", viewMode); }, [viewMode]);

  const filtered = regels.filter(r => {
    if (filterActief === "actief" && !r.actief) return false;
    if (filterActief === "inactief" && r.actief) return false;
    if (filterType !== "alle" && r.trigger_type !== filterType) return false;
    return true;
  });

  // Group by category for simple view
  const grouped = useMemo(() => {
    const map = new Map<string, IntakeRegel[]>();
    for (const r of regels) {
      const cat = categoriseRegel(r);
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(r);
    }
    // Sort by CATEGORIE_MAP order
    const ordered: [string, IntakeRegel[]][] = [];
    for (const cat of Object.keys(CATEGORIE_MAP)) {
      if (map.has(cat)) ordered.push([cat, map.get(cat)!]);
    }
    if (map.has("Overig")) ordered.push(["Overig", map.get("Overig")!]);
    return ordered;
  }, [regels]);

  async function toggleActief(r: IntakeRegel) {
    await supabase.from("intake_regels").update({ actief: !r.actief }).eq("id", r.id);
    fetchRegels();
  }

  function startEdit(r: IntakeRegel) { setEditId(r.id); setEditForm({ ...r }); setIsNew(false); }
  function startNew() { setEditId("new"); setEditForm({ ...emptyRegel, volgorde: (regels.length + 1) * 10 }); setIsNew(true); }

  async function saveEdit() {
    if (!editForm.spec_code || !editForm.label || !editForm.trigger_type) { toast.error("Vul verplichte velden in"); return; }
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
    setEditId(null); fetchRegels();
  }

  async function deleteRegel(id: string) {
    await supabase.from("intake_regels").delete().eq("id", id);
    setConfirmDeleteId(null); toast.success("Regel verwijderd"); fetchRegels();
  }

  function runSimulation() {
    const a: IntakeAntwoorden = {
      ...LEGE_ANTWOORDEN,
      rmu_vervangen: simRmu, rmu_velden: simVelden,
      trafo_situatie: simTrafo as any, ls_rek: simLsRek as any,
      wv: true, wv_uren: simCaseType.toLowerCase().includes("provisorium") ? 32 : 16,
      wv_io: true, wv_io_uren: simCaseType.toLowerCase().includes("provisorium") ? 32 : 16,
    };
    setSimResult(berekenRegels(a, simCaseType || null, regels));
  }

  // Build trigger label from result's own trigger info
  function resultTriggerLabel(r: BerekendeRegel): string | null {
    if (!r.trigger_type) return null;
    const fakeRegel = { trigger_type: r.trigger_type, trigger_veld: r.trigger_veld ?? null, trigger_waarde: r.trigger_waarde ?? null } as IntakeRegel;
    return regelConditieTekst(fakeRegel);
  }

  const inputStyle = { background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" };

  const handleSituatieChange = (idx: number) => {
    const opt = SITUATIE_OPTIES[idx];
    if (!opt || "disabled" in opt) return;
    setEditForm(f => ({
      ...f,
      trigger_type: opt.type,
      trigger_veld: opt.veld || "",
      trigger_waarde: opt.waarde || "",
    }));
  };

  // ─── Simple edit form ───
  const renderSimpleEditForm = () => (
    <div className="mx-6 lg:mx-10 mb-4 rounded-[14px] p-5 space-y-4" style={{ background: "var(--accent-light)", border: "1.5px solid var(--accent-border)" }}>
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{isNew ? "Nieuwe regel" : "Regel bewerken"}</p>

      <div>
        <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Wanneer:</label>
        <select value={findSituatieIndex(editForm)} onChange={e => handleSituatieChange(Number(e.target.value))} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle}>
          <option value={-1}>Kies een situatie...</option>
          {SITUATIE_OPTIES.map((o, i) => "disabled" in o
            ? <option key={i} disabled className="font-bold">{o.label}</option>
            : <option key={i} value={i}>{o.label}</option>
          )}
        </select>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Dan voeg toe:</label>
        <select value={editForm.spec_code} onChange={e => {
          const spec = SPEC_CODES.find(s => s.code === e.target.value);
          setEditForm(f => ({ ...f, spec_code: e.target.value, label: spec?.omschrijving || f.label || "" }));
        }} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle}>
          <option value="">Kies spec code...</option>
          {SPEC_CODES.map(s => <option key={s.code} value={s.code}>{s.code} — {s.omschrijving} ({euro(s.tarief)}/{s.eenheid})</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Aantal:</label>
          <input type="number" value={editForm.standaard_aantal} onChange={e => setEditForm(f => ({ ...f, standaard_aantal: Number(e.target.value) }))} className="w-full px-3 py-2 rounded-xl text-sm text-center" style={inputStyle} />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm pb-2" style={{ color: "var(--text-primary)" }}>
            <input type="checkbox" checked={editForm.aanpasbaar} onChange={e => setEditForm(f => ({ ...f, aanpasbaar: e.target.checked }))} style={{ accentColor: "var(--accent)" }} />
            Aanpasbaar in wizard
          </label>
        </div>
      </div>

      {editForm.aanpasbaar && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Min – Max:</label>
            <div className="flex items-center gap-2">
              <input type="number" value={editForm.min_aantal} onChange={e => setEditForm(f => ({ ...f, min_aantal: Number(e.target.value) }))} className="w-full px-3 py-2 rounded-xl text-sm text-center" style={inputStyle} />
              <span style={{ color: "var(--text-muted)" }}>–</span>
              <input type="number" value={editForm.max_aantal} onChange={e => setEditForm(f => ({ ...f, max_aantal: Number(e.target.value) }))} className="w-full px-3 py-2 rounded-xl text-sm text-center" style={inputStyle} />
            </div>
          </div>
          <div />
        </div>
      )}

      <div>
        <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Vervangt code (optioneel):</label>
        <select value={editForm.sluit_uit_code || ""} onChange={e => setEditForm(f => ({ ...f, sluit_uit_code: e.target.value || null }))} className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle}>
          <option value="">Geen</option>
          {SPEC_CODES.map(s => <option key={s.code} value={s.code}>{s.code} — {s.omschrijving}</option>)}
        </select>
        <p className="text-[10px] mt-1 italic" style={{ color: "var(--text-muted)" }}>Als deze code actief is, wordt de andere verwijderd</p>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Waarschuwing (optioneel):</label>
        <textarea value={editForm.waarschuwing || ""} onChange={e => setEditForm(f => ({ ...f, waarschuwing: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-xl text-sm resize-none" style={inputStyle} placeholder="Toon een waarschuwing in de wizard als deze regel getriggerd wordt" />
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={() => setEditId(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ border: "1px solid var(--planning-border-soft)", color: "var(--text-muted)" }}>Annuleren</button>
        <button onClick={saveEdit} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>{isNew ? "Toevoegen" : "Opslaan"}</button>
      </div>
    </div>
  );

  // ─── Advanced edit form (original) ───
  const renderAdvancedEditForm = () => (
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
          <div><label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Aantal</label><input type="number" value={editForm.standaard_aantal} onChange={e => setEditForm(f => ({ ...f, standaard_aantal: Number(e.target.value) }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5 text-center" style={inputStyle} /></div>
          <div><label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Min</label><input type="number" value={editForm.min_aantal} onChange={e => setEditForm(f => ({ ...f, min_aantal: Number(e.target.value) }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5 text-center" style={inputStyle} /></div>
          <div><label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Max</label><input type="number" value={editForm.max_aantal} onChange={e => setEditForm(f => ({ ...f, max_aantal: Number(e.target.value) }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5 text-center" style={inputStyle} /></div>
        </div>
        <div><label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Volgorde</label><input type="number" value={editForm.volgorde} onChange={e => setEditForm(f => ({ ...f, volgorde: Number(e.target.value) }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5 text-center" style={inputStyle} /></div>
        <label className="flex items-center gap-2 text-xs mt-4" style={{ color: "var(--text-primary)" }}><input type="checkbox" checked={editForm.aanpasbaar} onChange={e => setEditForm(f => ({ ...f, aanpasbaar: e.target.checked }))} style={{ accentColor: "var(--accent)" }} /> Aanpasbaar</label>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <div><label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Waarschuwing</label><textarea value={editForm.waarschuwing || ""} onChange={e => setEditForm(f => ({ ...f, waarschuwing: e.target.value }))} rows={2} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5 resize-none" style={inputStyle} /></div>
        <div><label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Hint</label><input value={editForm.hint || ""} onChange={e => setEditForm(f => ({ ...f, hint: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5" style={inputStyle} /></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <div><label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Sluit uit code</label><select value={editForm.sluit_uit_code || ""} onChange={e => setEditForm(f => ({ ...f, sluit_uit_code: e.target.value || null }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5" style={inputStyle}><option value="">Geen</option>{SPEC_CODES.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}</select></div>
        <div><label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Sluit uit reden</label><input value={editForm.sluit_uit_reden || ""} onChange={e => setEditForm(f => ({ ...f, sluit_uit_reden: e.target.value }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5" style={inputStyle} /></div>
        <div><label className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Vereist code</label><select value={editForm.vereist_code || ""} onChange={e => setEditForm(f => ({ ...f, vereist_code: e.target.value || null }))} className="w-full px-2 py-1.5 rounded-lg text-xs mt-0.5" style={inputStyle}><option value="">Geen</option>{SPEC_CODES.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}</select></div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => setEditId(null)} className="flex-1 py-2 rounded-xl text-xs font-medium" style={{ border: "1px solid var(--planning-border-soft)", color: "var(--text-muted)" }}>Annuleren</button>
        <button onClick={saveEdit} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>{isNew ? "Toevoegen" : "Opslaan"}</button>
      </div>
    </div>
  );

  return (
    <>
      <DesktopSidebar badges={badges} />
      <div className="lg:ml-[240px] min-h-screen" style={{ background: "var(--app-navy)" }}>
        <header className="flex items-center gap-3 px-6 lg:px-10 pt-6 pb-4">
          <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-lg flex items-center justify-center lg:hidden" style={{ background: "var(--bg-surface-2)" }}><ArrowLeft className="h-4 w-4" style={{ color: "var(--text-muted)" }} /></button>
          <div className="flex-1">
            <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Intake regelmotor</h1>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Beheer de automatische forecast logica</p>
          </div>
          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--planning-border-soft)" }}>
            <button onClick={() => setViewMode("simple")} className="px-3 py-1.5 text-xs font-medium flex items-center gap-1.5" style={{
              background: viewMode === "simple" ? "var(--accent-light)" : "var(--bg-surface)",
              color: viewMode === "simple" ? "var(--accent)" : "var(--text-muted)",
              borderRight: "1px solid var(--planning-border-soft)",
            }}><LayoutList className="h-3.5 w-3.5" /> Eenvoudig</button>
            <button onClick={() => setViewMode("advanced")} className="px-3 py-1.5 text-xs font-medium flex items-center gap-1.5" style={{
              background: viewMode === "advanced" ? "var(--accent-light)" : "var(--bg-surface)",
              color: viewMode === "advanced" ? "var(--accent)" : "var(--text-muted)",
            }}><Settings className="h-3.5 w-3.5" /> Geavanceerd</button>
          </div>
          <button onClick={() => setShowSim(!showSim)} className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5" style={{ border: "1px solid var(--planning-border-soft)", color: "var(--text-muted)" }}>
            <FlaskConical className="h-3.5 w-3.5" /> Testen
          </button>
          <button onClick={startNew} className="px-3 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1.5" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
            <Plus className="h-3.5 w-3.5" /> Nieuwe regel
          </button>
        </header>

        {/* ─── Simulator ─── */}
        {showSim && (
          <div className="mx-6 lg:mx-10 mb-4 rounded-[14px] p-4 space-y-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>🧪 Scenario testen</p>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Wat voor case?</p>
                <div className="flex gap-2 flex-wrap">
                  {["NSA-case", "Compactstation", "Provisorium", "Overig"].map(ct => (
                    <button key={ct} onClick={() => setSimCaseType(ct === "Overig" ? "" : ct)} className="px-3 py-2 rounded-xl text-xs font-medium" style={{
                      background: (ct === "Overig" ? !simCaseType : simCaseType === ct) ? "var(--accent-light)" : "var(--app-navy)",
                      border: `1.5px solid ${(ct === "Overig" ? !simCaseType : simCaseType === ct) ? "var(--accent-border)" : "var(--planning-border-soft)"}`,
                      color: "var(--text-primary)",
                    }}>{ct}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>RMU vervangen?</p>
                <div className="flex gap-2">
                  <button onClick={() => setSimRmu(true)} className="px-4 py-2 rounded-xl text-xs font-medium" style={{ background: simRmu ? "var(--accent-light)" : "var(--app-navy)", border: `1.5px solid ${simRmu ? "var(--accent-border)" : "var(--planning-border-soft)"}`, color: "var(--text-primary)" }}>Ja</button>
                  <button onClick={() => setSimRmu(false)} className="px-4 py-2 rounded-xl text-xs font-medium" style={{ background: !simRmu ? "var(--accent-light)" : "var(--app-navy)", border: `1.5px solid ${!simRmu ? "var(--accent-border)" : "var(--planning-border-soft)"}`, color: "var(--text-primary)" }}>Nee</button>
                  {simRmu && (
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>Velden:</span>
                      {[3, 4, 5, 6].map(v => (
                        <button key={v} onClick={() => setSimVelden(v)} className="w-8 h-8 rounded-lg text-xs font-bold" style={{ background: simVelden === v ? "var(--accent-light)" : "var(--app-navy)", border: `1.5px solid ${simVelden === v ? "var(--accent-border)" : "var(--planning-border-soft)"}`, color: "var(--text-primary)" }}>{v}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Trafo?</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {([["Nieuw", "nieuw"], ["Draaien", "draaien"], ["Vrijschakelen", "vrijschakelen"], ["Geen", "geen"]] as const).map(([l, v]) => (
                      <button key={v} onClick={() => setSimTrafo(v)} className="px-3 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: simTrafo === v ? "var(--accent-light)" : "var(--app-navy)", border: `1px solid ${simTrafo === v ? "var(--accent-border)" : "var(--planning-border-soft)"}`, color: "var(--text-primary)" }}>{l}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>LS-rek?</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {([["≤630kVA", "klein"], [">630kVA", "groot"], ["Uitbreiden", "uitbreiden"], ["Geen", "geen"]] as const).map(([l, v]) => (
                      <button key={v} onClick={() => setSimLsRek(v)} className="px-3 py-1.5 rounded-lg text-[11px] font-medium" style={{ background: simLsRek === v ? "var(--accent-light)" : "var(--app-navy)", border: `1px solid ${simLsRek === v ? "var(--accent-border)" : "var(--planning-border-soft)"}`, color: "var(--text-primary)" }}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={runSimulation} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>Berekenen →</button>
            </div>

            {simResult.length > 0 && (
              <div className="rounded-[14px] overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
                <div className="grid grid-cols-12 gap-1 px-3.5 py-2" style={{ background: "var(--bg-surface-2)" }}>
                  <span className="col-span-2 text-[10px] uppercase font-semibold" style={{ color: "var(--text-muted)" }}>Code</span>
                  <span className="col-span-4 text-[10px] uppercase font-semibold" style={{ color: "var(--text-muted)" }}>Omschrijving</span>
                  <span className="col-span-1 text-[10px] uppercase font-semibold text-center" style={{ color: "var(--text-muted)" }}>Aantal</span>
                  <span className="col-span-2 text-[10px] uppercase font-semibold text-right" style={{ color: "var(--text-muted)" }}>Tarief</span>
                  <span className="col-span-3 text-[10px] uppercase font-semibold text-right" style={{ color: "var(--text-muted)" }}>Totaal</span>
                </div>
                {simResult.map((r, i) => (
                  <div key={i} style={{ borderTop: "1px solid var(--planning-border-soft)" }}>
                    <div className="grid grid-cols-12 gap-1 px-3.5 py-2 items-center">
                      <span className="col-span-2 text-xs font-bold" style={{ color: "var(--accent)", fontFamily: "DM Mono, monospace" }}>{r.spec_code}</span>
                      <span className="col-span-4 text-xs" style={{ color: "var(--text-primary)" }}>{r.label}</span>
                      <span className="col-span-1 text-xs text-center font-bold" style={{ color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }}>{r.aantal}×</span>
                      <span className="col-span-2 text-xs text-right" style={{ color: "var(--text-muted)", fontFamily: "DM Mono, monospace" }}>{euro(r.tarief)}</span>
                      <span className="col-span-3 text-xs text-right font-bold" style={{ color: "var(--accent)", fontFamily: "DM Mono, monospace" }}>{euro(r.tarief * r.aantal)}</span>
                    </div>
                    {resultTriggerLabel(r) && (
                      <p className="px-3.5 pb-2 -mt-1 text-[10px] italic" style={{ color: "var(--text-muted)" }}>Toegevoegd door: {resultTriggerLabel(r)}</p>
                    )}
                  </div>
                ))}
                <div className="px-3.5 py-3 text-right" style={{ borderTop: "2px solid var(--accent-border)" }}>
                  <span className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Totaal omzet </span>
                  <span className="text-base font-bold ml-2" style={{ color: "var(--accent)", fontFamily: "DM Mono, monospace" }}>{euro(simResult.reduce((s, r) => s + r.tarief * r.aantal, 0))}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Edit form ─── */}
        {editId && (viewMode === "simple" ? renderSimpleEditForm() : renderAdvancedEditForm())}

        {/* ─── Simple view ─── */}
        {viewMode === "simple" && (
          <div className="px-6 lg:px-10 pb-24 space-y-3">
            {loading ? (
              <Spinner size="sm" padding="py-8" />
            ) : grouped.map(([cat, catRegels]) => {
              const isOpen = openCats.has(cat);
              return (
                <div key={cat} className="rounded-[14px] overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
                  <button onClick={() => setOpenCats(prev => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; })} className="w-full flex items-center justify-between px-4 py-2.5" style={{ background: "var(--bg-surface-2)" }}>
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)", letterSpacing: "0.5px" }}>{cat}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{catRegels.length} regels</span>
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} /> : <ChevronRight className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />}
                    </div>
                  </button>
                  {isOpen && catRegels.map(r => (
                    <div key={r.id} className="flex items-start gap-3 px-4 py-3" style={{ borderTop: "1px solid var(--planning-border-soft)", opacity: r.actief ? 1 : 0.5, background: r.actief ? undefined : "var(--app-navy)" }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{regelConditieTekst(r)}</p>
                        <p className="text-sm font-medium mt-0.5" style={{ color: "var(--text-primary)" }}>
                          → {r.label} <span style={{ color: "var(--accent)", fontFamily: "DM Mono, monospace", fontSize: 12 }}>{r.spec_code}</span>
                          <span className="ml-1 text-xs" style={{ color: "var(--text-muted)", fontFamily: "DM Mono, monospace" }}>({r.standaard_aantal}×)</span>
                        </p>
                        {r.sluit_uit_code && (
                          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>vervangt {r.sluit_uit_code}{r.sluit_uit_reden ? ` — ${r.sluit_uit_reden}` : ""}</p>
                        )}
                        {r.waarschuwing && (
                          <p className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: "var(--warn-text)" }}>
                            <AlertTriangle className="h-3 w-3 shrink-0" /> {r.waarschuwing}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 pt-1">
                        <button onClick={() => startEdit(r)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)" }}>
                          <Pencil className="h-3 w-3" style={{ color: "var(--text-muted)" }} />
                        </button>
                        <button onClick={() => toggleActief(r)} className="w-10 h-5 rounded-full relative" style={{ background: r.actief ? "var(--accent)" : "var(--bg-surface-2)" }}>
                          <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" style={{ left: r.actief ? 22 : 2 }} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* ─── Advanced view (original table) ─── */}
        {viewMode === "advanced" && (
          <>
            <div className="flex items-center gap-2 px-6 lg:px-10 mb-3 flex-wrap">
              {(["alle", "actief", "inactief"] as const).map(f => (
                <button key={f} onClick={() => setFilterActief(f)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{
                  background: filterActief === f ? "var(--accent-light)" : "var(--bg-surface)",
                  border: filterActief === f ? "1px solid var(--accent)" : "1px solid var(--planning-border-soft)",
                  color: filterActief === f ? "var(--accent)" : "var(--text-muted)",
                }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
              ))}
              <span className="text-[10px] uppercase tracking-wider ml-2" style={{ color: "var(--text-muted)" }}>Type:</span>
              {["alle", ...TRIGGER_TYPES].map(t => (
                <button key={t} onClick={() => setFilterType(t)} className="px-2.5 py-1 rounded-lg text-[11px] font-medium" style={{
                  background: filterType === t ? "var(--accent-light)" : "var(--bg-surface)",
                  border: filterType === t ? "1px solid var(--accent)" : "1px solid var(--planning-border-soft)",
                  color: filterType === t ? "var(--accent)" : "var(--text-muted)",
                }}>{t}</button>
              ))}
              <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>{filtered.length} regels</span>
            </div>

            <div className="mx-6 lg:mx-10 pb-24 rounded-[14px] overflow-hidden" style={{ border: "1px solid var(--planning-border-soft)" }}>
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
                <Spinner size="sm" padding="py-8" />
              ) : filtered.length === 0 ? (
                <div className="py-8 text-center text-xs" style={{ color: "var(--text-muted)" }}>Geen regels gevonden</div>
              ) : filtered.map(r => (
                <div key={r.id} className="grid grid-cols-12 gap-1 px-3.5 py-2.5 items-center group" style={{ borderTop: "1px solid var(--planning-border-soft)", background: "var(--bg-surface)", opacity: r.actief ? 1 : 0.5 }}>
                  <span className="col-span-2"><span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={TRIGGER_BADGES[r.trigger_type] || TRIGGER_BADGES.altijd}>{r.trigger_type}</span></span>
                  <span className="col-span-2 text-xs truncate" style={{ color: "var(--text-primary)" }}>{r.trigger_veld && <span className="font-medium">{r.trigger_veld}</span>}{r.trigger_waarde && <span style={{ color: "var(--text-muted)" }}> = {r.trigger_waarde}</span>}</span>
                  <span className="col-span-2 text-xs font-mono font-semibold" style={{ color: "var(--accent)" }}>{r.spec_code}</span>
                  <span className="col-span-2 text-xs truncate" style={{ color: "var(--text-primary)" }}>{r.label}</span>
                  <span className="col-span-1 text-xs text-center font-mono font-bold" style={{ color: "var(--text-primary)" }}>{r.standaard_aantal}</span>
                  <span className="col-span-1 flex justify-center">
                    <button onClick={() => toggleActief(r)} className="w-8 h-5 rounded-full relative" style={{ background: r.actief ? "var(--accent)" : "var(--bg-surface-2)" }}>
                      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform" style={{ left: r.actief ? 16 : 2 }} />
                    </button>
                  </span>
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <button onClick={() => startEdit(r)} className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)" }}><Pencil className="h-3 w-3" style={{ color: "var(--text-muted)" }} /></button>
                    {confirmDeleteId === r.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => setConfirmDeleteId(null)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)" }}><X className="h-3 w-3" style={{ color: "var(--text-muted)" }} /></button>
                        <button onClick={() => deleteRegel(r.id)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--danger)", color: "#fff" }}><Check className="h-3 w-3" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(r.id)} className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "var(--danger-light)", border: "1px solid var(--danger-border)" }}><Trash2 className="h-3 w-3" style={{ color: "var(--danger)" }} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <BottomNav badges={badges} />
    </>
  );
}

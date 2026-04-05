import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, X, Save, Check, Plus, Minus, GripVertical, FileText, Trash2 } from "lucide-react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { getISOWeek, startOfISOWeek, addDays, format, getISOWeekYear } from "date-fns";
import { nl } from "date-fns/locale";

// ── Color palette ──
const COLORS = [
  { id: "c1", hex: "#4A7C2F", name: "TerreVolt" },
  { id: "c2", hex: "#86C232", name: "Subco" },
  { id: "c3", hex: "#F4D03F", name: "Levering" },
  { id: "c4", hex: "#E67E22", name: "Civiel" },
  { id: "c5", hex: "#E74C3C", name: "Blokkade" },
  { id: "c6", hex: "#9B59B6", name: "Inspectie" },
  { id: "c7", hex: "#3498DB", name: "Liander" },
  { id: "c8", hex: "#1ABC9C", name: "Gereed" },
  { id: "c9", hex: "#95A5A6", name: "Wachten" },
  { id: "c10", hex: "#2C3E50", name: "Derden" },
  { id: "c11", hex: "#F1948A", name: "Risico" },
  { id: "c12", hex: "#A9CCE3", name: "Overig" },
];

const TEMPLATES = [
  { name: "NSA-case", desc: "Standaard NSA vervanging", activities: ["Civiele werkzaamheden", "Levering NSA", "MS-installatie", "LS-aansluiting", "Inbedrijfstelling", "Revisie & oplevering"] },
  { name: "Compactstation", desc: "Nieuw compactstation plaatsen", activities: ["Civiele werkzaamheden", "Levering Compactstation", "MS-aansluiting", "LS-configuratie", "Inbedrijfstelling", "Oplevering"] },
  { name: "Provisorium", desc: "Tijdelijke voorziening", activities: ["Levering Provisorium", "Plaatsen RMU Magnefix", "Kabelaansluiting MS", "LS tijdelijk", "Inbedrijfstelling", "Definitief terugplaatsen"] },
];

const TRAFO_OPTIONS = ["—", "160 kVA", "250 kVA", "400 kVA", "630 kVA", "800 kVA", "1000 kVA"];
const DAY_LABELS = ["Ma", "Di", "Wo", "Do", "Vr"];
const CELL_SIZE = 52;
const SIDEBAR_W = 200;

interface CellData { color: string; medewerker_id: string | null; note: string; }
interface MatrixState {
  year: number; weekNrs: number[]; numWeeks: number; activities: string[];
  cells: Record<string, CellData>;
  weekComments: Record<string, string>;
  msType: string; trafo: string; caseType: string; wvTerrevolt: string;
  stationName: string; aannemerBouwkunde: string; gsuGeu: string; notes: string;
  werkplanToggles: { MSH: boolean; LSH: boolean; MSR: boolean; LSR: boolean };
}

interface Monteur { id: string; full_name: string; uurtarief: number | null; }
interface Project { id: string; nummer: string; naam: string; stationsnaam: string | null; case_type: string | null; }

function getDefaultState(): MatrixState {
  const now = new Date();
  const currentWeek = getISOWeek(now);
  const weekNrs = Array.from({ length: 8 }, (_, i) => {
    const w = currentWeek + i;
    return w > 52 ? w - 52 : w;
  });
  return {
    year: getISOWeekYear(now), weekNrs, numWeeks: 8,
    activities: ["Civiele werkzaamheden", "Levering Provisorium/NSA", "MS-installatie", "LS-aansluiting", "Inbedrijfstelling", "Revisie & oplevering"],
    cells: {}, weekComments: {},
    msType: "", trafo: "", caseType: "", wvTerrevolt: "", stationName: "", aannemerBouwkunde: "", gsuGeu: "", notes: "",
    werkplanToggles: { MSH: false, LSH: false, MSR: false, LSR: false },
  };
}

function dateFromWeek(year: number, weekNr: number, dayIdx: number): Date {
  // dayIdx: 0=Mon ... 4=Fri
  const jan4 = new Date(year, 0, 4);
  const start = startOfISOWeek(jan4);
  const weekStart = addDays(start, (weekNr - 1) * 7);
  return addDays(weekStart, dayIdx);
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function contrastText(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#2D4A1E" : "#FFFFFF";
}

export default function ProjectPlanning() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { isManager } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [state, setState] = useState<MatrixState>(getDefaultState());
  const [monteurs, setMonteurs] = useState<Monteur[]>([]);
  const [planningStatus, setPlanningStatus] = useState<{ is_definitief: boolean; definitief_op: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; key: string } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showDefinitiefDialog, setShowDefinitiefDialog] = useState(false);
  const [showConceptDialog, setShowConceptDialog] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const footerScrollRef = useRef<HTMLDivElement>(null);
  const scrollLock = useRef(false);

  const isDef = planningStatus?.is_definitief || false;

  // ── Load data ──
  useEffect(() => {
    if (!projectId) return;
    (async () => {
      setLoading(true);
      const [projRes, matrixRes, statusRes, profilesRes, rolesRes] = await Promise.all([
        supabase.from("projects").select("id, nummer, naam, stationsnaam, case_type").eq("id", projectId).single(),
        supabase.from("project_planning_matrix").select("*").eq("project_id", projectId).maybeSingle(),
        supabase.from("project_planning_status").select("*").eq("project_id", projectId).maybeSingle(),
        supabase.from("profiles").select("id, full_name, uurtarief"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (projRes.data) setProject(projRes.data as any);
      if (matrixRes.data?.state_json) {
        setState(matrixRes.data.state_json as unknown as MatrixState);
      } else if (projRes.data) {
        setState(prev => ({ ...prev, stationName: projRes.data!.stationsnaam || "", caseType: projRes.data!.case_type || "" }));
      }
      setPlanningStatus(statusRes.data ? { is_definitief: statusRes.data.is_definitief, definitief_op: statusRes.data.definitief_op } : null);

      // Filter monteurs
      const monteurUserIds = new Set((rolesRes.data || []).filter((r: any) => r.role === "monteur").map((r: any) => r.user_id));
      const allProfiles = profilesRes.data || [];
      setMonteurs(allProfiles.filter((p: any) => monteurUserIds.has(p.user_id)).map((p: any) => ({ id: p.id, full_name: p.full_name, uurtarief: p.uurtarief })));
      setLoading(false);
    })();
  }, [projectId]);

  // ── Auto-save with debounce ──
  const saveState = useCallback(async (s: MatrixState) => {
    if (!projectId) return;
    setSaveStatus("saving");
    const { error } = await supabase.from("project_planning_matrix").upsert({
      project_id: projectId,
      state_json: s as any,
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_id" });
    if (error) { toast.error("Opslaan mislukt"); setSaveStatus("idle"); return; }
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }, [projectId]);

  const updateState = useCallback((updater: (prev: MatrixState) => MatrixState) => {
    setState(prev => {
      const next = updater(prev);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveState(next), 1500);
      return next;
    });
  }, [saveState]);

  // ── Scroll sync ──
  const syncScroll = useCallback((source: "header" | "body" | "footer") => {
    if (scrollLock.current) return;
    scrollLock.current = true;
    requestAnimationFrame(() => {
      const srcRef = source === "header" ? headerScrollRef : source === "body" ? bodyScrollRef : footerScrollRef;
      const left = srcRef.current?.scrollLeft || 0;
      if (headerScrollRef.current && source !== "header") headerScrollRef.current.scrollLeft = left;
      if (bodyScrollRef.current && source !== "body") bodyScrollRef.current.scrollLeft = left;
      if (footerScrollRef.current && source !== "footer") footerScrollRef.current.scrollLeft = left;
      scrollLock.current = false;
    });
  }, []);

  // ── Close context menu on click outside ──
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  // ── Cell helpers ──
  const getCell = (key: string): CellData | undefined => state.cells[key];
  const setCell = (key: string, data: Partial<CellData>) => {
    updateState(s => ({
      ...s,
      cells: { ...s.cells, [key]: { color: s.cells[key]?.color || COLORS[0].hex, medewerker_id: s.cells[key]?.medewerker_id || null, note: s.cells[key]?.note || "", ...data } },
    }));
  };
  const clearCell = (key: string) => {
    updateState(s => {
      const cells = { ...s.cells };
      delete cells[key];
      return { ...s, cells };
    });
  };

  // ── Definitief flow ──
  const makeDefinitief = async () => {
    if (!projectId) return;
    // Save matrix
    await saveState(state);
    // Upsert planning status
    await supabase.from("project_planning_status").upsert({
      project_id: projectId,
      is_definitief: true,
      definitief_op: new Date().toISOString(),
    }, { onConflict: "project_id" });

    // Create planning entries for cells with medewerker
    const entries: any[] = [];
    for (const [key, cell] of Object.entries(state.cells)) {
      if (!cell.medewerker_id) continue;
      const [actIdx, weekIdx, dayIdx] = key.split("-").map(Number);
      const weekNr = state.weekNrs[weekIdx];
      if (weekNr === undefined) continue;
      const datum = dateFromWeek(state.year, weekNr, dayIdx);
      const datumStr = format(datum, "yyyy-MM-dd");
      entries.push({
        medewerker_id: cell.medewerker_id,
        project_id: projectId,
        datum: datumStr,
        starttijd: "07:00",
        eindtijd: "16:00",
        notitie: cell.note || state.activities[actIdx] || "",
        created_by: cell.medewerker_id, // Will be overwritten
      });
    }
    // Deduplicate by medewerker_id + datum
    const seen = new Set<string>();
    const unique = entries.filter(e => {
      const k = `${e.medewerker_id}-${e.datum}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (unique.length > 0) {
      // Check existing
      const { data: existing } = await supabase.from("planning").select("medewerker_id, datum").eq("project_id", projectId);
      const existingKeys = new Set((existing || []).map((e: any) => `${e.medewerker_id}-${e.datum}`));
      const toInsert = unique.filter(e => !existingKeys.has(`${e.medewerker_id}-${e.datum}`));
      if (toInsert.length > 0) {
        await supabase.from("planning").insert(toInsert);
      }
    }

    setPlanningStatus({ is_definitief: true, definitief_op: new Date().toISOString() });
    setShowDefinitiefDialog(false);
    toast.success("Planning gepubliceerd — Monteurs kunnen hun planning nu inzien.");
  };

  const makeConcept = async () => {
    if (!projectId) return;
    await supabase.from("project_planning_status").upsert({
      project_id: projectId,
      is_definitief: false,
      definitief_op: null,
    }, { onConflict: "project_id" });
    setPlanningStatus({ is_definitief: false, definitief_op: null });
    setShowConceptDialog(false);
    toast.success("Planning terug naar concept gezet.");
  };

  // ── Drag & drop activities ──
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); };
  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); return; }
    updateState(s => {
      const acts = [...s.activities];
      const [moved] = acts.splice(dragIdx, 1);
      acts.splice(targetIdx, 0, moved);
      // Remap cells
      const oldToNew = new Map<number, number>();
      s.activities.forEach((_, i) => {
        const newIdx = i === dragIdx ? targetIdx : i < Math.min(dragIdx, targetIdx) ? i : i > Math.max(dragIdx, targetIdx) ? i : dragIdx < targetIdx ? i - 1 : i + 1;
      });
      // Simplified: just remap by rebuilding
      const newCells: Record<string, CellData> = {};
      const mapping: number[] = [];
      s.activities.forEach((_, i) => mapping.push(i));
      mapping.splice(dragIdx, 1);
      mapping.splice(targetIdx, 0, dragIdx);
      const reverseMap: number[] = new Array(s.activities.length);
      mapping.forEach((oldIdx, newIdx) => { reverseMap[oldIdx] = newIdx; });
      for (const [key, val] of Object.entries(s.cells)) {
        const [actIdx, ...rest] = key.split("-");
        const newActIdx = reverseMap[Number(actIdx)];
        if (newActIdx !== undefined) newCells[`${newActIdx}-${rest.join("-")}`] = val;
      }
      return { ...s, activities: acts, cells: newCells };
    });
    setDragIdx(null);
  };

  const monteurMap = useMemo(() => new Map(monteurs.map(m => [m.id, m])), [monteurs]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F5F7F0" }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#4A7C2F", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F5F7F0" }}>
        <p style={{ color: "#8AAD6E" }}>Project niet gevonden</p>
      </div>
    );
  }

  const totalW = state.numWeeks * 5 * CELL_SIZE;

  // ── Selected cell panel ──
  const renderCellPanel = () => {
    if (!selectedCell) return null;
    const cell = getCell(selectedCell);
    const [actIdx, weekIdx, dayIdx] = selectedCell.split("-").map(Number);
    const weekNr = state.weekNrs[weekIdx];
    const datum = weekNr !== undefined ? dateFromWeek(state.year, weekNr, dayIdx) : null;

    return (
      <div className="fixed top-0 right-0 h-full z-50 flex flex-col" style={{ width: 320, background: "#EBF0E4", borderLeft: "1px solid #C5D4B2", animation: "slideInRight 0.25s ease" }}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid #C5D4B2" }}>
          <div>
            <p className="text-sm font-bold" style={{ color: "#2D4A1E" }}>{state.activities[actIdx] || "Activiteit"}</p>
            <p className="text-[11px]" style={{ color: "#8AAD6E" }}>
              {datum ? `${DAY_LABELS[dayIdx]} ${format(datum, "d MMM yyyy", { locale: nl })}` : ""}
            </p>
          </div>
          <button onClick={() => setSelectedCell(null)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: "#5A7A42" }}><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Color picker */}
          <div>
            <p className="text-[10px] uppercase font-semibold tracking-wider mb-2" style={{ color: "#8AAD6E" }}>Type activiteit</p>
            <div className="grid grid-cols-4 gap-2">
              {COLORS.map(c => (
                <button key={c.id} title={c.name} onClick={() => setCell(selectedCell, { color: c.hex })}
                  className="w-7 h-7 rounded-lg transition-all" style={{ background: c.hex, outline: cell?.color === c.hex ? "2px solid #2D4A1E" : "none", outlineOffset: 2 }} />
              ))}
            </div>
          </div>

          {/* Medewerker */}
          <div>
            <p className="text-[10px] uppercase font-semibold tracking-wider mb-2" style={{ color: "#8AAD6E" }}>Medewerker koppelen</p>
            <div className="space-y-1.5">
              {monteurs.map(m => (
                <button key={m.id} onClick={() => setCell(selectedCell, { medewerker_id: cell?.medewerker_id === m.id ? null : m.id })}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 transition-all"
                  style={{ background: cell?.medewerker_id === m.id ? "#D4E8C2" : "#F5F7F0", border: "1px solid #C5D4B2" }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: cell?.medewerker_id === m.id ? "#4A7C2F" : "#C5D4B2" }} />
                  <span style={{ color: "#2D4A1E" }}>{m.full_name}</span>
                  {m.uurtarief && <span className="ml-auto font-mono text-[10px]" style={{ color: "#8AAD6E" }}>€{m.uurtarief}/u</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <p className="text-[10px] uppercase font-semibold tracking-wider mb-2" style={{ color: "#8AAD6E" }}>Notitie</p>
            <textarea rows={2} value={cell?.note || ""} onChange={e => setCell(selectedCell, { note: e.target.value })}
              placeholder="Optionele opmerking..." className="w-full rounded-lg px-3 py-2 text-xs resize-none"
              style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#2D4A1E" }} />
          </div>
        </div>

        <div className="p-4 space-y-2" style={{ borderTop: "1px solid #C5D4B2" }}>
          <button onClick={() => setSelectedCell(null)} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "#4A7C2F" }}>Opslaan</button>
          <button onClick={() => { clearCell(selectedCell); setSelectedCell(null); }} className="w-full py-2 rounded-xl text-xs font-medium" style={{ border: "1px solid #E8A09A", color: "#C0392B" }}>Cel leegmaken</button>
        </div>
      </div>
    );
  };

  // ── Templates modal ──
  const renderTemplatesModal = () => {
    if (!showTemplates) return null;
    const [selected, setSelected] = useState<number | null>(null);
    return <TemplateModal onClose={() => setShowTemplates(false)} onApply={(acts) => {
      updateState(s => ({ ...s, activities: acts, cells: {} }));
      setShowTemplates(false);
      toast.success("Template geladen");
    }} />;
  };

  return (
    <div className="min-h-screen" style={{ background: "#F5F7F0" }}>
      {/* Header */}
      <header className="sticky top-0 z-40 px-4 py-3 flex items-center gap-3 flex-wrap" style={{ background: "rgba(235,240,228,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid #C5D4B2" }}>
        <button onClick={() => navigate("/projecten")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#DFE8D6", color: "#5A7A42" }}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        <HeaderLogo />
        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold font-mono" style={{ background: "#D4E8C2", color: "#4A7C2F" }}>
          {project.nummer} — {project.naam}
        </span>

        <div className="flex-1" />

        {/* Save status */}
        <span className="text-[11px]" style={{ color: saveStatus === "saving" ? "#8AAD6E" : saveStatus === "saved" ? "#2D7A3A" : "transparent" }}>
          {saveStatus === "saving" ? "Opslaan..." : saveStatus === "saved" ? "Opgeslagen ✓" : "·"}
        </span>

        {/* Status badge */}
        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: isDef ? "#D4EDD8" : "#FFF3CD", color: isDef ? "#2D7A3A" : "#8B6914" }}>
          ● {isDef ? "Definitief" : "Concept"}
        </span>

        <button onClick={() => setShowTemplates(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ border: "1px solid #C5D4B2", color: "#5A7A42" }}>
          <FileText className="h-3.5 w-3.5 inline mr-1" />Templates
        </button>
        <button onClick={() => saveState(state)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ border: "1px solid #4A7C2F", color: "#4A7C2F" }}>
          <Save className="h-3.5 w-3.5 inline mr-1" />Opslaan
        </button>

        {isDef ? (
          <button onClick={() => setShowConceptDialog(true)} className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "#2D7A3A" }}>
            ✓ Gepubliceerd
          </button>
        ) : (
          <button onClick={() => setShowDefinitiefDialog(true)} className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "#2D5A8A" }}>
            Definitief maken
          </button>
        )}
      </header>

      {/* Info grid */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl p-4" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <InfoField label="Casenummer" value={project.nummer} readonly />
            <InfoField label="Type MS installatie" value={state.msType} onChange={v => updateState(s => ({ ...s, msType: v }))} />
            <InfoField label="WV TerreVolt" value={state.wvTerrevolt} onChange={v => updateState(s => ({ ...s, wvTerrevolt: v }))} />
            <InfoField label="Stationsnaam" value={project.stationsnaam || ""} readonly />
            <div>
              <label className="text-[10px] uppercase font-semibold tracking-wider block mb-1" style={{ color: "#8AAD6E" }}>Te plaatsen trafo</label>
              <select value={state.trafo} onChange={e => updateState(s => ({ ...s, trafo: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-lg text-xs" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#2D4A1E" }}>
                {TRAFO_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <InfoField label="Aannemer bouwkunde" value={state.aannemerBouwkunde} onChange={v => updateState(s => ({ ...s, aannemerBouwkunde: v }))} />
            <InfoField label="GSU / GEU" value={state.gsuGeu} onChange={v => updateState(s => ({ ...s, gsuGeu: v }))} />
            <InfoField label="Case type" value={project.case_type || ""} readonly />
            <div>
              <label className="text-[10px] uppercase font-semibold tracking-wider block mb-1" style={{ color: "#8AAD6E" }}>Werkplan beschikbaar</label>
              <div className="flex gap-1.5">
                {(["MSH", "LSH", "MSR", "LSR"] as const).map(k => (
                  <button key={k} onClick={() => updateState(s => ({ ...s, werkplanToggles: { ...s.werkplanToggles, [k]: !s.werkplanToggles[k] } }))}
                    className="px-2 py-1 rounded-md text-[10px] font-semibold transition-all"
                    style={{ background: state.werkplanToggles[k] ? "#D4E8C2" : "#EBF0E4", color: state.werkplanToggles[k] ? "#2D4A1E" : "#8AAD6E", border: "1px solid #C5D4B2" }}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-2xl p-4" style={{ background: "#FFF8DC", border: "1px solid #E8D070" }}>
          <label className="text-xs font-bold block mb-2" style={{ color: "#8B6914" }}>Notities</label>
          <textarea value={state.notes} onChange={e => updateState(s => ({ ...s, notes: e.target.value }))}
            placeholder="Aandachtspunten, bijzonderheden..." rows={5}
            className="w-full bg-transparent text-xs resize-none outline-none italic" style={{ color: "#8B6914" }} />
        </div>
      </div>

      {/* Matrix */}
      <div className="mx-4 mb-4 rounded-2xl overflow-hidden" style={{ background: "white", border: "1px solid #C5D4B2" }}>
        {/* Week headers - synced scroll */}
        <div className="flex" style={{ borderBottom: "1px solid #C5D4B2" }}>
          <div className="flex-shrink-0 flex items-center px-3 text-xs font-semibold" style={{ width: SIDEBAR_W, background: "#D4E8C2", color: "#2D4A1E", borderRight: "1px solid #C5D4B2" }}>
            Planning {state.year}
            <select value={state.year} onChange={e => updateState(s => ({ ...s, year: Number(e.target.value) }))}
              className="ml-1 bg-transparent text-xs font-semibold outline-none" style={{ color: "#4A7C2F" }}>
              {[2025, 2026, 2027, 2028, 2029].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div ref={headerScrollRef} className="flex-1 overflow-x-auto" onScroll={() => syncScroll("header")} style={{ scrollbarWidth: "none" }}>
            <div className="flex" style={{ width: totalW }}>
              {state.weekNrs.map((wn, wi) => (
                <div key={wi} style={{ width: 5 * CELL_SIZE }}>
                  <div className="text-center py-1 text-[10px] font-semibold" style={{ background: "#D4E8C2", color: "#2D4A1E", borderBottom: "1px solid #C5D4B2" }}>
                    Week <input type="number" value={wn} min={1} max={53}
                      onChange={e => updateState(s => {
                        const nrs = [...s.weekNrs];
                        nrs[wi] = Math.max(1, Math.min(53, Number(e.target.value)));
                        return { ...s, weekNrs: nrs };
                      })}
                      className="w-8 bg-transparent text-center font-bold outline-none" style={{ color: "#4A7C2F" }} />
                  </div>
                  <div className="flex">
                    {DAY_LABELS.map((d, di) => {
                      const dt = dateFromWeek(state.year, wn, di);
                      return (
                        <div key={di} className="text-center py-0.5 text-[8px]" style={{ width: CELL_SIZE, color: "#8AAD6E", borderRight: "1px solid rgba(197,212,178,0.3)" }}>
                          {d}<br />{format(dt, "d/M")}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex">
          {/* Activities sidebar */}
          <div className="flex-shrink-0" style={{ width: SIDEBAR_W, borderRight: "1px solid #C5D4B2" }}>
            {state.activities.map((act, ai) => (
              <div key={ai} draggable onDragStart={() => handleDragStart(ai)} onDragOver={e => handleDragOver(e, ai)} onDrop={() => handleDrop(ai)}
                className="flex items-center gap-1 px-2 group" style={{ height: CELL_SIZE, borderBottom: "1px solid rgba(197,212,178,0.3)", opacity: dragIdx === ai ? 0.5 : 1 }}>
                <GripVertical className="h-3 w-3 cursor-grab opacity-30 group-hover:opacity-70 flex-shrink-0" style={{ color: "#8AAD6E" }} />
                <input value={act} onChange={e => updateState(s => {
                  const acts = [...s.activities];
                  acts[ai] = e.target.value;
                  return { ...s, activities: acts };
                })} className="flex-1 bg-transparent text-xs outline-none min-w-0" style={{ color: "#2D4A1E" }} />
                <button onClick={() => updateState(s => {
                  const acts = s.activities.filter((_, i) => i !== ai);
                  const cells: Record<string, CellData> = {};
                  for (const [k, v] of Object.entries(s.cells)) {
                    const idx = Number(k.split("-")[0]);
                    if (idx === ai) continue;
                    const newIdx = idx > ai ? idx - 1 : idx;
                    cells[`${newIdx}-${k.split("-").slice(1).join("-")}`] = v;
                  }
                  return { ...s, activities: acts, cells };
                })} className="opacity-0 group-hover:opacity-70 flex-shrink-0" style={{ color: "#C0392B" }}>
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button onClick={() => updateState(s => ({ ...s, activities: [...s.activities, ""] }))}
              className="w-full py-2 text-[11px] font-medium flex items-center justify-center gap-1" style={{ color: "#4A7C2F", borderBottom: "1px solid rgba(197,212,178,0.3)" }}>
              <Plus className="h-3 w-3" /> Activiteit toevoegen
            </button>
          </div>

          {/* Grid */}
          <div ref={bodyScrollRef} className="flex-1 overflow-x-auto" onScroll={() => syncScroll("body")}>
            <div style={{ width: totalW }}>
              {state.activities.map((_, ai) => (
                <div key={ai} className="flex" style={{ height: CELL_SIZE }}>
                  {state.weekNrs.map((_, wi) =>
                    DAY_LABELS.map((_, di) => {
                      const key = `${ai}-${wi}-${di}`;
                      const cell = getCell(key);
                      const monteur = cell?.medewerker_id ? monteurMap.get(cell.medewerker_id) : null;
                      return (
                        <div key={key} className="relative cursor-pointer transition-opacity hover:opacity-85"
                          style={{
                            width: CELL_SIZE, height: CELL_SIZE,
                            background: cell?.color || "transparent",
                            borderRight: "1px solid rgba(197,212,178,0.2)",
                            borderBottom: "1px solid rgba(197,212,178,0.2)",
                          }}
                          onClick={() => {
                            if (!cell) setCell(key, { color: COLORS[0].hex });
                            setSelectedCell(key);
                          }}
                          onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, key }); }}
                        >
                          {monteur && (
                            <span className="absolute top-0.5 left-0.5 text-[8px] font-bold rounded px-0.5" style={{ color: contrastText(cell?.color || "#4A7C2F") }}>
                              {getInitials(monteur.full_name)}
                            </span>
                          )}
                          {cell?.note && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      );
                    })
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Comments strip */}
        <div className="flex" style={{ borderTop: "1px solid #C5D4B2" }}>
          <div className="flex-shrink-0 px-3 flex items-center text-[10px] uppercase font-semibold tracking-wider" style={{ width: SIDEBAR_W, color: "#8AAD6E", borderRight: "1px solid #C5D4B2", height: 48 }}>
            Opmerkingen
          </div>
          <div ref={footerScrollRef} className="flex-1 overflow-x-auto" onScroll={() => syncScroll("footer")} style={{ scrollbarWidth: "none" }}>
            <div className="flex" style={{ width: totalW }}>
              {state.weekNrs.map((wn, wi) => (
                <div key={wi} style={{ width: 5 * CELL_SIZE }}>
                  <textarea value={state.weekComments[wi] || ""} onChange={e => updateState(s => ({ ...s, weekComments: { ...s.weekComments, [wi]: e.target.value } }))}
                    placeholder={`Week ${wn}...`} className="w-full h-12 text-[10px] px-2 py-1 resize-none outline-none bg-transparent"
                    style={{ color: "#2D4A1E", borderRight: "1px solid rgba(197,212,178,0.3)" }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend + controls */}
      <div className="px-4 pb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap gap-3">
          {COLORS.map(c => (
            <span key={c.id} className="flex items-center gap-1 text-[9px]" style={{ color: "#5A7A42" }}>
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: c.hex }} />{c.name}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => updateState(s => {
            const newWeek = (s.weekNrs[s.weekNrs.length - 1] || 1) + 1;
            return { ...s, weekNrs: [...s.weekNrs, newWeek > 52 ? newWeek - 52 : newWeek], numWeeks: s.numWeeks + 1 };
          })} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ border: "1px solid #4A7C2F", color: "#4A7C2F" }}>
            <Plus className="h-3 w-3 inline mr-1" />Week toevoegen
          </button>
          <button disabled={state.numWeeks <= 1} onClick={() => updateState(s => ({
            ...s, weekNrs: s.weekNrs.slice(0, -1), numWeeks: s.numWeeks - 1,
          }))} className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40" style={{ border: "1px solid #C5D4B2", color: "#5A7A42" }}>
            <Minus className="h-3 w-3 inline mr-1" />Week verwijderen
          </button>
        </div>
      </div>

      {/* Cell panel */}
      {renderCellPanel()}

      {/* Context menu */}
      {contextMenu && (
        <div className="fixed z-50 rounded-xl p-3 space-y-3 shadow-lg" style={{
          left: Math.min(contextMenu.x, window.innerWidth - 260), top: Math.min(contextMenu.y, window.innerHeight - 300),
          width: 240, background: "#EBF0E4", border: "1px solid #C5D4B2",
        }} onMouseDown={e => e.stopPropagation()}>
          <p className="text-[10px] font-bold" style={{ color: "#2D4A1E" }}>
            {state.activities[Number(contextMenu.key.split("-")[0])] || "Cel"} — {DAY_LABELS[Number(contextMenu.key.split("-")[2])]}
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {COLORS.map(c => (
              <button key={c.id} title={c.name} onClick={() => { setCell(contextMenu.key, { color: c.hex }); setContextMenu(null); }}
                className="w-6 h-6 rounded-md" style={{ background: c.hex }} />
            ))}
          </div>
          <textarea value={getCell(contextMenu.key)?.note || ""} rows={2}
            onChange={e => setCell(contextMenu.key, { note: e.target.value })}
            placeholder="Notitie..." className="w-full rounded-lg px-2 py-1 text-[10px] resize-none"
            style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#2D4A1E" }} />
          <button onClick={() => { clearCell(contextMenu.key); setContextMenu(null); }}
            className="text-[10px] font-medium" style={{ color: "#C0392B" }}>Cel leegmaken</button>
        </div>
      )}

      {/* Templates modal */}
      {showTemplates && (
        <TemplateModal onClose={() => setShowTemplates(false)} onApply={acts => {
          updateState(s => ({ ...s, activities: acts, cells: {} }));
          setShowTemplates(false);
          toast.success("Template geladen");
        }} />
      )}

      {/* Definitief dialog */}
      {showDefinitiefDialog && (
        <ConfirmDialog
          title="Planning definitief maken?"
          text="Monteurs kunnen de planning inzien zodra je dit bevestigt. Je kunt dit later ongedaan maken."
          confirmLabel="Definitief maken →"
          confirmColor="#2D5A8A"
          onCancel={() => setShowDefinitiefDialog(false)}
          onConfirm={makeDefinitief}
        />
      )}

      {/* Concept dialog */}
      {showConceptDialog && (
        <ConfirmDialog
          title="Terug naar concept?"
          text="Monteurs kunnen de planning dan niet meer inzien."
          confirmLabel="Terug naar concept"
          confirmColor="#C0392B"
          onCancel={() => setShowConceptDialog(false)}
          onConfirm={makeConcept}
        />
      )}

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ──

function InfoField({ label, value, onChange, readonly }: { label: string; value: string; onChange?: (v: string) => void; readonly?: boolean }) {
  return (
    <div>
      <label className="text-[10px] uppercase font-semibold tracking-wider block mb-1" style={{ color: "#8AAD6E" }}>{label}</label>
      <input value={value} readOnly={readonly} onChange={e => onChange?.(e.target.value)}
        className="w-full px-2 py-1.5 rounded-lg text-xs" style={{ background: readonly ? "#DFE8D6" : "#F5F7F0", border: "1px solid #C5D4B2", color: "#2D4A1E" }} />
    </div>
  );
}

function TemplateModal({ onClose, onApply }: { onClose: () => void; onApply: (acts: string[]) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmLoad, setConfirmLoad] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="rounded-2xl p-6 w-full max-w-lg space-y-4" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold" style={{ color: "#2D4A1E" }}>Planning templates</h3>
          <button onClick={onClose}><X className="h-4 w-4" style={{ color: "#5A7A42" }} /></button>
        </div>

        <div className="space-y-3">
          {TEMPLATES.map((t, i) => (
            <button key={i} onClick={() => setSelected(i)} className="w-full text-left p-4 rounded-xl transition-all"
              style={{ background: selected === i ? "#D4E8C2" : "#EBF0E4", border: selected === i ? "1.5px solid #4A7C2F" : "1px solid #C5D4B2" }}>
              <p className="text-sm font-bold" style={{ color: "#2D4A1E" }}>{t.name}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "#8AAD6E" }}>{t.desc}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {t.activities.map((a, j) => (
                  <span key={j} className="px-2 py-0.5 rounded-full text-[9px]" style={{ background: "#F5F7F0", color: "#5A7A42" }}>{a}</span>
                ))}
              </div>
            </button>
          ))}
        </div>

        {confirmLoad ? (
          <div className="p-3 rounded-xl" style={{ background: "#FFF3CD", border: "1px solid #E8D070" }}>
            <p className="text-xs font-medium mb-2" style={{ color: "#8B6914" }}>Huidige activiteiten worden vervangen. Doorgaan?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmLoad(false)} className="flex-1 py-1.5 rounded-lg text-xs" style={{ border: "1px solid #C5D4B2", color: "#5A7A42" }}>Annuleren</button>
              <button onClick={() => selected !== null && onApply(TEMPLATES[selected].activities)} className="flex-1 py-1.5 rounded-lg text-xs text-white" style={{ background: "#4A7C2F" }}>Laden</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2 rounded-lg text-xs" style={{ border: "1px solid #C5D4B2", color: "#5A7A42" }}>Annuleren</button>
            <button disabled={selected === null} onClick={() => setConfirmLoad(true)} className="flex-1 py-2 rounded-lg text-xs text-white disabled:opacity-40" style={{ background: "#4A7C2F" }}>Template laden</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConfirmDialog({ title, text, confirmLabel, confirmColor, onCancel, onConfirm }: {
  title: string; text: string; confirmLabel: string; confirmColor: string; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="rounded-2xl p-6 w-full max-w-sm space-y-4" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2" }}>
        <h3 className="text-base font-bold" style={{ color: "#2D4A1E" }}>{title}</h3>
        <p className="text-sm" style={{ color: "#5A7A42" }}>{text}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 rounded-lg text-xs" style={{ border: "1px solid #C5D4B2", color: "#5A7A42" }}>Annuleren</button>
          <button onClick={onConfirm} className="flex-1 py-2 rounded-lg text-xs text-white" style={{ background: confirmColor }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { ArrowLeft, X, Save, Check, Plus, Minus, GripVertical, FileText, Trash2, Loader2, Download } from "lucide-react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { BottomNav } from "@/components/BottomNav";
import { useNavBadges } from "@/hooks/useNavBadges";
import { getISOWeek, startOfISOWeek, addDays, format, getISOWeekYear } from "date-fns";
import { nl } from "date-fns/locale";

// ── Color palette ──
const COLORS = [
  { id: "c1", hex: "var(--accent)", name: "TerreVolt" },
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
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "var(--text-primary)" : "#FFFFFF";
}

export default function ProjectPlanning() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { isManager, user } = useAuth();
  const { profileId: profileIdFromContext } = useProfile();
  const { badges } = useNavBadges();

  const [project, setProject] = useState<Project | null>(null);
  const [state, setState] = useState<MatrixState>(getDefaultState());
  const [monteurs, setMonteurs] = useState<Monteur[]>([]);
  const [planningStatus, setPlanningStatus] = useState<{ is_definitief: boolean; definitief_op: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [otherMatrices, setOtherMatrices] = useState<{ projectNaam: string; projectNummer: string; year: number; weekNrs: number[]; cells: Record<string, CellData> }[]>([]);
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
  const myProfileId = useRef<string | null>(null);
  const syncForecastRef = useRef<((s: MatrixState) => Promise<void>) | null>(null);

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
        supabase.from("profiles").select("id, user_id, full_name, uurtarief"),
        supabase.from("user_roles").select("user_id, role"),
      ]);

      myProfileId.current = profileIdFromContext;

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

      // Fetch other project matrices for cross-project conflict detection
      const { data: otherData } = await supabase
        .from("project_planning_matrix")
        .select("project_id, state_json, projects!project_planning_matrix_project_id_fkey(naam, nummer)")
        .neq("project_id", projectId);
      if (otherData) {
        setOtherMatrices(otherData.filter((d: any) => d.state_json).map((d: any) => {
          const s = d.state_json as unknown as MatrixState;
          return { projectNaam: d.projects?.naam ?? "", projectNummer: d.projects?.nummer ?? "", year: s.year, weekNrs: s.weekNrs, cells: s.cells };
        }));
      }

      setLoading(false);
    })();
  }, [projectId, user]);

  // ── Auto-save with debounce ──
  const saveState = useCallback(async (s: MatrixState) => {
    if (!projectId) return;
    setSaveStatus("saving");
    if (!await mutate(supabase.from("project_planning_matrix").upsert({
      project_id: projectId,
      state_json: s as any,
      updated_at: new Date().toISOString(),
      updated_by: myProfileId.current,
    }, { onConflict: "project_id" }))) { setSaveStatus("idle"); return; }
    // Sync forecast in background
    syncForecastRef.current?.(s);
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
      definitief_door: myProfileId.current,
    }, { onConflict: "project_id" });

    // Create planning entries for cells with medewerker — with dedup check
    const cellEntries: { key: string; cell: CellData; datumStr: string; actIdx: number }[] = [];
    for (const [key, cell] of Object.entries(state.cells)) {
      if (!cell.medewerker_id) continue;
      const [actIdx, weekIdx, dayIdx] = key.split("-").map(Number);
      const weekNr = state.weekNrs[weekIdx];
      if (weekNr === undefined) continue;
      const datum = dateFromWeek(state.year, weekNr, dayIdx);
      const datumStr = format(datum, "yyyy-MM-dd");
      cellEntries.push({ key, cell, datumStr, actIdx });
    }

    let newCount = 0;
    if (cellEntries.length > 0) {
      // Deduplicate by medewerker_id + datum within our entries
      const seen = new Set<string>();
      const unique = cellEntries.filter(e => {
        const k = `${e.cell.medewerker_id}-${e.datumStr}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      // Check existing entries in DB in parallel
      const results = await Promise.all(unique.map(async (e) => {
        const { data } = await supabase.from("planning").select("id")
          .eq("medewerker_id", e.cell.medewerker_id!)
          .eq("datum", e.datumStr)
          .eq("project_id", projectId)
          .limit(1);
        return { entry: e, exists: (data && data.length > 0) };
      }));

      const toInsert = results.filter(r => !r.exists).map(r => ({
        medewerker_id: r.entry.cell.medewerker_id!,
        project_id: projectId,
        datum: r.entry.datumStr,
        starttijd: "07:00",
        eindtijd: "16:00",
        notitie: r.entry.cell.note || state.activities[r.entry.actIdx] || "",
        created_by: myProfileId.current || r.entry.cell.medewerker_id!,
      }));

      newCount = toInsert.length;
      if (toInsert.length > 0) {
        await supabase.from("planning").insert(toInsert);
      }
    }

    setPlanningStatus({ is_definitief: true, definitief_op: new Date().toISOString() });
    setShowDefinitiefDialog(false);
    toast.success(`Planning gepubliceerd — ${newCount} nieuwe dagen ingepland voor monteurs.`);
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

  // ── Overplanning warnings (>5 days per week per monteur) ──
  const overplanningWarnings = useMemo(() => {
    // Count days per monteur per week
    const countMap: Record<string, Record<number, Set<number>>> = {}; // mId -> weekIdx -> Set<dayIdx>
    for (const [key, cell] of Object.entries(state.cells)) {
      if (!cell.medewerker_id) continue;
      const [, weekIdx, dayIdx] = key.split("-").map(Number);
      if (!countMap[cell.medewerker_id]) countMap[cell.medewerker_id] = {};
      if (!countMap[cell.medewerker_id][weekIdx]) countMap[cell.medewerker_id][weekIdx] = new Set();
      countMap[cell.medewerker_id][weekIdx].add(dayIdx);
    }
    const warnings: { name: string; weekNr: number; days: number }[] = [];
    for (const [mId, weeks] of Object.entries(countMap)) {
      for (const [weekIdx, daySet] of Object.entries(weeks)) {
        if (daySet.size > 5) {
          const m = monteurMap.get(mId);
          warnings.push({ name: m?.full_name ?? "Onbekend", weekNr: state.weekNrs[Number(weekIdx)] ?? 0, days: daySet.size });
        }
      }
    }
    return warnings;
  }, [state.cells, state.weekNrs, monteurMap]);

  // ── Cross-project conflict warnings ──
  const crossProjectConflicts = useMemo(() => {
    // Build set of (medewerker_id, year, weekNr, dayIdx) for current project
    const currentAssignments: Record<string, Set<string>> = {}; // mId -> Set<"year-week-day">
    for (const [key, cell] of Object.entries(state.cells)) {
      if (!cell.medewerker_id) continue;
      const [, weekIdx, dayIdx] = key.split("-").map(Number);
      const weekNr = state.weekNrs[weekIdx];
      if (weekNr == null) continue;
      const dateKey = `${state.year}-${weekNr}-${dayIdx}`;
      if (!currentAssignments[cell.medewerker_id]) currentAssignments[cell.medewerker_id] = new Set();
      currentAssignments[cell.medewerker_id].add(dateKey);
    }

    const conflicts: { name: string; datum: string; otherProject: string }[] = [];
    for (const other of otherMatrices) {
      for (const [key, cell] of Object.entries(other.cells)) {
        if (!cell.medewerker_id) continue;
        const myDates = currentAssignments[cell.medewerker_id];
        if (!myDates) continue;
        const [, weekIdx, dayIdx] = key.split("-").map(Number);
        const weekNr = other.weekNrs[weekIdx];
        if (weekNr == null) continue;
        const dateKey = `${other.year}-${weekNr}-${dayIdx}`;
        if (myDates.has(dateKey)) {
          const m = monteurMap.get(cell.medewerker_id);
          const d = dateFromWeek(other.year, weekNr, dayIdx);
          const datumStr = format(d, "EEE d MMM", { locale: nl });
          conflicts.push({ name: m?.full_name ?? "Onbekend", datum: datumStr, otherProject: `${other.projectNummer} ${other.projectNaam}` });
        }
      }
    }
    // Deduplicate
    const seen = new Set<string>();
    return conflicts.filter(c => {
      const k = `${c.name}-${c.datum}-${c.otherProject}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [state.cells, state.year, state.weekNrs, otherMatrices, monteurMap]);

  // ── Cost estimate breakdown per monteur ──
  const planningCostBreakdown = useMemo(() => {
    const cellsPerMonteur: Record<string, number> = {};
    for (const cell of Object.values(state.cells)) {
      if (cell.medewerker_id) {
        cellsPerMonteur[cell.medewerker_id] = (cellsPerMonteur[cell.medewerker_id] || 0) + 1;
      }
    }
    const rows: { name: string; days: number; tarief: number; subtotal: number }[] = [];
    let total = 0;
    for (const [mId, count] of Object.entries(cellsPerMonteur)) {
      const m = monteurMap.get(mId);
      const tarief = m?.uurtarief ?? 0;
      const subtotal = count * 8 * tarief;
      rows.push({ name: m?.full_name ?? "Onbekend", days: count, tarief, subtotal });
      total += subtotal;
    }
    rows.sort((a, b) => b.subtotal - a.subtotal);
    return { rows, total };
  }, [state.cells, monteurMap]);

  // ── Sync forecast_regels when saving ──
  const syncForecast = useCallback(async (s: MatrixState) => {
    if (!projectId) return;
    // Check if forecast exists with methode='uren'
    const { data: forecast } = await supabase
      .from("project_forecast")
      .select("id")
      .eq("project_id", projectId)
      .eq("methode", "uren")
      .maybeSingle();
    if (!forecast) return;

    // Count cells per monteur
    const cellsPerMonteur: Record<string, number> = {};
    for (const cell of Object.values(s.cells)) {
      if (cell.medewerker_id) {
        cellsPerMonteur[cell.medewerker_id] = (cellsPerMonteur[cell.medewerker_id] || 0) + 1;
      }
    }

    // Upsert forecast_regels for each monteur
    for (const [mId, count] of Object.entries(cellsPerMonteur)) {
      const m = monteurMap.get(mId);
      const uren = count * 8;
      // Try to find existing regel
      const { data: existing } = await supabase
        .from("forecast_regels")
        .select("id")
        .eq("forecast_id", forecast.id)
        .eq("medewerker_id", mId)
        .eq("type", "monteur")
        .maybeSingle();

      if (existing) {
        await supabase.from("forecast_regels").update({
          geplande_uren: uren,
          uurtarief_snap: m?.uurtarief ?? null,
        }).eq("id", existing.id);
      } else {
        await supabase.from("forecast_regels").insert({
          forecast_id: forecast.id,
          medewerker_id: mId,
          type: "monteur",
          geplande_uren: uren,
          uurtarief_snap: m?.uurtarief ?? null,
        });
      }
    }
  }, [projectId, monteurMap]);

  // Keep ref updated for use in saveState callback
  syncForecastRef.current = syncForecast;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <p style={{ color: "var(--text-muted)" }}>Project niet gevonden</p>
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
      <div className="fixed top-0 right-0 h-full z-50 flex flex-col" style={{ width: 320, background: "var(--bg-surface)", borderLeft: "1px solid var(--border)", animation: "slideInRight 0.25s ease" }}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{state.activities[actIdx] || "Activiteit"}</p>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {datum ? `${DAY_LABELS[dayIdx]} ${format(datum, "d MMM yyyy", { locale: nl })}` : ""}
            </p>
          </div>
          <button onClick={() => setSelectedCell(null)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ color: "var(--text-secondary)" }}><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Color picker */}
          <div>
            <p className="text-[10px] uppercase font-semibold tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Type activiteit</p>
            <div className="grid grid-cols-4 gap-2">
              {COLORS.map(c => (
                <button key={c.id} title={c.name} onClick={() => setCell(selectedCell, { color: c.hex })}
                  className="w-7 h-7 rounded-lg transition-all" style={{ background: c.hex, outline: cell?.color === c.hex ? "2px solid var(--text-primary)" : "none", outlineOffset: 2 }} />
              ))}
            </div>
          </div>

          {/* Medewerker */}
          <div>
            <p className="text-[10px] uppercase font-semibold tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Medewerker koppelen</p>
            <div className="space-y-1.5">
              {monteurs.map(m => (
                <button key={m.id} onClick={() => setCell(selectedCell, { medewerker_id: cell?.medewerker_id === m.id ? null : m.id })}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2 transition-all"
                  style={{ background: cell?.medewerker_id === m.id ? "var(--accent-light)" : "var(--bg-base)", border: "1px solid var(--border)" }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: cell?.medewerker_id === m.id ? "var(--accent)" : "var(--border)" }} />
                  <span style={{ color: "var(--text-primary)" }}>{m.full_name}</span>
                  {m.uurtarief && <span className="ml-auto font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>€{m.uurtarief}/u</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <p className="text-[10px] uppercase font-semibold tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Notitie</p>
            <textarea rows={2} value={cell?.note || ""} onChange={e => setCell(selectedCell, { note: e.target.value })}
              placeholder="Optionele opmerking..." className="w-full rounded-lg px-3 py-2 text-xs resize-none"
              style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
          </div>
        </div>

        <div className="p-4 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
          <button onClick={() => setSelectedCell(null)} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>Opslaan</button>
          <button onClick={() => { clearCell(selectedCell); setSelectedCell(null); }} className="w-full py-2 rounded-xl text-xs font-medium" style={{ border: "1px solid var(--danger-border)", color: "var(--danger)" }}>Cel leegmaken</button>
        </div>
      </div>
    );
  };

  // ── Templates modal ──
  const renderTemplatesModal = () => {
    if (!showTemplates) return null;
    return <TemplateModal onClose={() => setShowTemplates(false)} onApply={(acts) => {
      updateState(s => ({ ...s, activities: acts, cells: {} }));
      setShowTemplates(false);
      toast.success("Template geladen");
    }} />;
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      {/* Header */}
      <header className="sticky top-0 z-40 px-4 py-3 flex items-center gap-3 flex-wrap" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
        <button onClick={() => navigate("/projecten")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        <HeaderLogo />
        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold font-mono" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
          {project.nummer} — {project.naam}
        </span>

        <div className="flex-1" />

        {/* Save status */}
        <span className="text-[11px]" style={{ color: saveStatus === "saving" ? "var(--text-muted)" : saveStatus === "saved" ? "var(--success)" : "transparent" }}>
          {saveStatus === "saving" ? "Opslaan..." : saveStatus === "saved" ? "Opgeslagen" : "·"}
        </span>

        {/* Status badge */}
        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1" style={{ background: isDef ? "var(--success-light)" : "var(--warn-light)", color: isDef ? "var(--success)" : "var(--warn-text)" }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: isDef ? "var(--success)" : "var(--warn-text)" }} />
          {isDef ? "Definitief" : "Concept"}
        </span>

        <button onClick={() => setShowTemplates(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
          <FileText className="h-3.5 w-3.5 inline mr-1" />Templates
        </button>
        <button onClick={() => saveState(state)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ border: "1px solid var(--accent)", color: "var(--accent)" }}>
          <Save className="h-3.5 w-3.5 inline mr-1" />Opslaan
        </button>

        {isDef ? (
          <button onClick={() => setShowConceptDialog(true)} className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white flex items-center gap-1" style={{ background: "var(--success)" }}>
            <Check className="h-3.5 w-3.5" /> Gepubliceerd
          </button>
        ) : (
          <button onClick={() => setShowDefinitiefDialog(true)} className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "var(--info)" }}>
            Definitief maken
          </button>
        )}
      </header>

      {/* Info grid */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <InfoField label="Casenummer" value={project.nummer} readonly />
            <InfoField label="Type MS installatie" value={state.msType} onChange={v => updateState(s => ({ ...s, msType: v }))} />
            <InfoField label="WV TerreVolt" value={state.wvTerrevolt} onChange={v => updateState(s => ({ ...s, wvTerrevolt: v }))} />
            <InfoField label="Stationsnaam" value={project.stationsnaam || ""} readonly />
            <div>
              <label className="text-[10px] uppercase font-semibold tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Te plaatsen trafo</label>
              <select value={state.trafo} onChange={e => updateState(s => ({ ...s, trafo: e.target.value }))}
                className="w-full px-2 py-1.5 rounded-lg text-xs" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                {TRAFO_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <InfoField label="Aannemer bouwkunde" value={state.aannemerBouwkunde} onChange={v => updateState(s => ({ ...s, aannemerBouwkunde: v }))} />
            <InfoField label="GSU / GEU" value={state.gsuGeu} onChange={v => updateState(s => ({ ...s, gsuGeu: v }))} />
            <InfoField label="Case type" value={project.case_type || ""} readonly />
            <div>
              <label className="text-[10px] uppercase font-semibold tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Werkplan beschikbaar</label>
              <div className="flex gap-1.5">
                {(["MSH", "LSH", "MSR", "LSR"] as const).map(k => (
                  <button key={k} onClick={() => updateState(s => ({ ...s, werkplanToggles: { ...s.werkplanToggles, [k]: !s.werkplanToggles[k] } }))}
                    className="px-2 py-1 rounded-md text-[10px] font-semibold transition-all"
                    style={{ background: state.werkplanToggles[k] ? "var(--accent-light)" : "var(--bg-surface)", color: state.werkplanToggles[k] ? "var(--text-primary)" : "var(--text-muted)", border: "1px solid var(--border)" }}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="rounded-2xl p-4" style={{ background: "var(--warn-bg)", border: "1px solid var(--warn-border)" }}>
          <label className="text-xs font-bold block mb-2" style={{ color: "var(--warn-text)" }}>Notities</label>
          <textarea value={state.notes} onChange={e => updateState(s => ({ ...s, notes: e.target.value }))}
            placeholder="Aandachtspunten, bijzonderheden..." rows={5}
            className="w-full bg-transparent text-xs resize-none outline-none italic" style={{ color: "var(--warn-text)" }} />
        </div>
      </div>

      {/* Matrix */}
      <div className="mx-4 mb-4 rounded-2xl overflow-hidden" style={{ background: "white", border: "1px solid var(--border)" }}>
        {/* Week headers - synced scroll */}
        <div className="flex" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex-shrink-0 flex items-center px-3 text-xs font-semibold" style={{ width: SIDEBAR_W, background: "var(--accent-light)", color: "var(--text-primary)", borderRight: "1px solid var(--border)" }}>
            Planning {state.year}
            <select value={state.year} onChange={e => updateState(s => ({ ...s, year: Number(e.target.value) }))}
              className="ml-1 bg-transparent text-xs font-semibold outline-none" style={{ color: "var(--accent)" }}>
              {[2025, 2026, 2027, 2028, 2029].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div ref={headerScrollRef} className="flex-1 overflow-x-auto" onScroll={() => syncScroll("header")} style={{ scrollbarWidth: "none" }}>
            <div className="flex" style={{ width: totalW }}>
              {state.weekNrs.map((wn, wi) => (
                <div key={wi} style={{ width: 5 * CELL_SIZE }}>
                  <div className="text-center py-1 text-[10px] font-semibold" style={{ background: "var(--accent-light)", color: "var(--text-primary)", borderBottom: "1px solid var(--border)" }}>
                    Week <input type="number" value={wn} min={1} max={53}
                      onChange={e => updateState(s => {
                        const nrs = [...s.weekNrs];
                        nrs[wi] = Math.max(1, Math.min(53, Number(e.target.value)));
                        return { ...s, weekNrs: nrs };
                      })}
                      className="w-8 bg-transparent text-center font-bold outline-none" style={{ color: "var(--accent)" }} />
                  </div>
                  <div className="flex">
                    {DAY_LABELS.map((d, di) => {
                      const date = dateFromWeek(state.year, wn, di);
                      return (
                        <div key={di} className="text-center py-0.5 text-[8px]" style={{ width: CELL_SIZE, color: "var(--text-muted)", borderRight: di < 4 ? "1px solid rgba(197,212,178,0.3)" : "none" }}>
                          {d} {format(date, "d/M")}
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
          <div className="flex-shrink-0" style={{ width: SIDEBAR_W, borderRight: "1px solid var(--border)" }}>
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ background: "hsl(120,25%,90%)", color: "var(--text-secondary)", height: 30, display: "flex", alignItems: "center" }}>
              Activiteiten
            </div>
            {state.activities.map((act, ai) => (
              <div key={ai} draggable onDragStart={() => handleDragStart(ai)} onDragOver={e => handleDragOver(e, ai)} onDrop={() => handleDrop(ai)}
                className="flex items-center gap-1.5 px-2 group" style={{ height: CELL_SIZE, borderBottom: "1px solid var(--border)", cursor: "grab", opacity: dragIdx === ai ? 0.5 : 1 }}>
                <GripVertical className="h-3 w-3 shrink-0" style={{ color: "var(--border)" }} />
                <input value={act} onChange={e => updateState(s => {
                  const acts = [...s.activities];
                  acts[ai] = e.target.value;
                  return { ...s, activities: acts };
                })} className="flex-1 bg-transparent text-[11px] font-medium outline-none min-w-0" style={{ color: "var(--text-primary)" }} />
                <button onClick={() => updateState(s => {
                  const acts = s.activities.filter((_, i) => i !== ai);
                  const cells: Record<string, CellData> = {};
                  for (const [key, val] of Object.entries(s.cells)) {
                    const [aIdx, ...rest] = key.split("-");
                    const idx = Number(aIdx);
                    if (idx === ai) continue;
                    cells[`${idx > ai ? idx - 1 : idx}-${rest.join("-")}`] = val;
                  }
                  return { ...s, activities: acts, cells };
                })} className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="h-3 w-3" style={{ color: "var(--danger)" }} />
                </button>
              </div>
            ))}
            <button onClick={() => updateState(s => ({ ...s, activities: [...s.activities, ""] }))}
              className="w-full text-center py-2 text-[11px] font-medium" style={{ color: "var(--accent)", borderBottom: "1px dashed var(--border)" }}>
              <Plus className="h-3 w-3 inline mr-1" />Activiteit toevoegen
            </button>
          </div>

          {/* Grid body */}
          <div ref={bodyScrollRef} className="flex-1 overflow-x-auto" onScroll={() => syncScroll("body")}
            style={{ scrollbarWidth: "thin", scrollbarColor: "var(--border) var(--bg-surface)" }}>
            <div style={{ width: totalW }}>
              {/* Spacer for activity header */}
              <div style={{ height: 30 }} />
              {state.activities.map((_, ai) => (
                <div key={ai} className="flex" style={{ height: CELL_SIZE }}>
                  {state.weekNrs.map((wn, wi) =>
                    DAY_LABELS.map((_, di) => {
                      const key = `${ai}-${wi}-${di}`;
                      const cell = getCell(key);
                      const monteur = cell?.medewerker_id ? monteurMap.get(cell.medewerker_id) : null;
                      return (
                        <div key={key} className="relative transition-opacity"
                          style={{
                            width: CELL_SIZE, height: CELL_SIZE,
                            background: cell ? cell.color : "transparent",
                            borderRight: "1px solid rgba(197,212,178,0.2)",
                            borderBottom: "1px solid var(--border)",
                            cursor: "pointer",
                          }}
                          onClick={() => {
                            if (!cell) setCell(key, { color: COLORS[0].hex });
                            setSelectedCell(key);
                          }}
                          onContextMenu={e => {
                            e.preventDefault();
                            setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 300), key });
                          }}
                        >
                          {monteur && (
                            <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold"
                              style={{ background: "rgba(255,255,255,0.9)", color: cell?.color || "var(--text-primary)" }}>
                              {getInitials(monteur.full_name)}
                            </span>
                          )}
                          {cell?.note && (
                            <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full" style={{ background: "white" }} />
                          )}
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
        <div className="flex" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex-shrink-0 px-3 flex items-center text-[10px] font-semibold uppercase tracking-wider" style={{ width: SIDEBAR_W, color: "var(--text-muted)", borderRight: "1px solid var(--border)", height: 44 }}>
            Opmerkingen
          </div>
          <div ref={footerScrollRef} className="flex-1 overflow-x-auto" onScroll={() => syncScroll("footer")} style={{ scrollbarWidth: "none" }}>
            <div className="flex" style={{ width: totalW }}>
              {state.weekNrs.map((wn, wi) => (
                <div key={wi} style={{ width: 5 * CELL_SIZE }}>
                  <textarea value={state.weekComments[wi] || ""} onChange={e => updateState(s => ({ ...s, weekComments: { ...s.weekComments, [wi]: e.target.value } }))}
                    placeholder={`Opmerking week ${wn}...`}
                    className="w-full bg-transparent text-[10px] px-2 py-1 resize-none outline-none" style={{ height: 44, color: "var(--text-primary)", borderRight: "1px solid var(--border)" }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend + controls */}
      <div className="mx-4 mb-20 lg:mb-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-wrap gap-3">
          {COLORS.map(c => (
            <div key={c.id} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.hex }} />
              <span className="text-[9px]" style={{ color: "var(--text-secondary)" }}>{c.name}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => updateState(s => {
            const lastWn = s.weekNrs[s.weekNrs.length - 1] || 1;
            const nextWn = lastWn >= 52 ? 1 : lastWn + 1;
            return { ...s, weekNrs: [...s.weekNrs, nextWn], numWeeks: s.numWeeks + 1 };
          })} className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1" style={{ border: "1px solid var(--accent)", color: "var(--accent)" }}>
            <Plus className="h-3 w-3" /> Week toevoegen
          </button>
          <button disabled={state.numWeeks <= 1} onClick={() => updateState(s => ({
            ...s, weekNrs: s.weekNrs.slice(0, -1), numWeeks: s.numWeeks - 1,
          }))} className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 disabled:opacity-30" style={{ border: "1px solid var(--text-muted)", color: "var(--text-muted)" }}>
            <Minus className="h-3 w-3" /> Week verwijderen
          </button>
        </div>
      </div>

      {/* Overplanning warnings */}
      {overplanningWarnings.length > 0 && (
        <div className="mx-4 mb-3 rounded-xl p-3 space-y-1" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
          <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: "var(--warn-text)" }}>
            ⚠️ Overplanning gedetecteerd
          </p>
          {overplanningWarnings.map((w, i) => (
            <p key={i} className="text-[11px]" style={{ color: "var(--warn-text)" }}>
              <span className="font-semibold">{w.name}</span> is {w.days} dagen ingepland in week {w.weekNr} (max 5)
            </p>
          ))}
        </div>
      )}

      {/* Cross-project conflict warnings */}
      {crossProjectConflicts.length > 0 && (
        <div className="mx-4 mb-3 rounded-xl p-3 space-y-1" style={{ background: "hsl(0 60% 15%)", border: "1px solid hsl(0 50% 35%)" }}>
          <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: "hsl(0 80% 70%)" }}>
            🔴 Dubbele inplanning gedetecteerd
          </p>
          {crossProjectConflicts.slice(0, 10).map((c, i) => (
            <p key={i} className="text-[11px]" style={{ color: "hsl(0 60% 75%)" }}>
              <span className="font-semibold">{c.name}</span> is op <span className="font-mono">{c.datum}</span> ook ingepland bij <span className="font-semibold">{c.otherProject}</span>
            </p>
          ))}
          {crossProjectConflicts.length > 10 && (
            <p className="text-[10px] italic" style={{ color: "hsl(0 40% 60%)" }}>
              ...en {crossProjectConflicts.length - 10} meer
            </p>
          )}
        </div>
      )}

      {planningCostBreakdown.total > 0 && (
        <div className="mx-4 mb-20 lg:mb-4 rounded-xl overflow-hidden" style={{ background: "var(--accent-light)", border: "1px solid var(--accent-border)" }}>
          <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ borderBottom: "1px solid var(--accent-border)" }}>
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Geschatte kosten op basis van huidige planning
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const header = "Monteur;Dagen;Uren;Uurtarief;Subtotaal";
                  const lines = planningCostBreakdown.rows.map(r =>
                    `${r.name};${r.days};${r.days * 8};€${r.tarief};€${r.subtotal}`
                  );
                  lines.push(`;;;;;;`);
                  lines.push(`Totaal;;;;€${planningCostBreakdown.total}`);
                  const csv = [header, ...lines].join("\n");
                  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `kostenschatting-${project?.nummer ?? "project"}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success("CSV gedownload");
                }}
                className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
                title="Exporteer als CSV"
              >
                <Download className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
              </button>
              <span className="text-sm font-bold font-mono" style={{ color: "var(--accent)" }}>
                € {planningCostBreakdown.total.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
          <div className="px-4 py-2 space-y-1">
            <div className="flex text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              <span className="flex-1">Monteur</span>
              <span className="w-16 text-right">Dagen</span>
              <span className="w-20 text-right">Tarief</span>
              <span className="w-24 text-right">Subtotaal</span>
            </div>
            {planningCostBreakdown.rows.map((row, i) => (
              <div key={i} className="flex items-center text-xs py-1" style={{ borderTop: i > 0 ? "1px solid color-mix(in srgb, var(--accent-border) 50%, transparent)" : "none" }}>
                <span className="flex-1 font-medium truncate" style={{ color: "var(--text-primary)" }}>{row.name}</span>
                <span className="w-16 text-right font-mono" style={{ color: "var(--text-secondary)" }}>{row.days}d</span>
                <span className="w-20 text-right font-mono" style={{ color: "var(--text-secondary)" }}>€{row.tarief}</span>
                <span className="w-24 text-right font-mono font-semibold" style={{ color: "var(--accent)" }}>
                  € {row.subtotal.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {renderCellPanel()}
      {renderTemplatesModal()}

      {/* Context menu */}
      {contextMenu && (
        <div className="fixed z-50 rounded-xl p-3 space-y-3 shadow-lg" style={{ left: contextMenu.x, top: contextMenu.y, background: "var(--bg-base)", border: "1px solid var(--border)", width: 200 }}
          onMouseDown={e => e.stopPropagation()}>
          <p className="text-[10px] font-bold" style={{ color: "var(--text-primary)" }}>
            {state.activities[Number(contextMenu.key.split("-")[0])] || "Activiteit"} — {DAY_LABELS[Number(contextMenu.key.split("-")[2])]}
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {COLORS.map(c => (
              <button key={c.id} title={c.name} onClick={() => { setCell(contextMenu.key, { color: c.hex }); setContextMenu(null); }}
                className="w-7 h-7 rounded-lg" style={{ background: c.hex }} />
            ))}
          </div>
          <textarea placeholder="Notitie..." value={getCell(contextMenu.key)?.note || ""}
            onChange={e => setCell(contextMenu.key, { note: e.target.value })}
            className="w-full rounded-lg px-2 py-1 text-[10px] resize-none" rows={2}
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
          <button onClick={() => { clearCell(contextMenu.key); setContextMenu(null); }} className="w-full text-center text-[10px] font-medium py-1 rounded-lg" style={{ color: "var(--danger)", border: "1px solid var(--danger-border)" }}>
            Cel leegmaken
          </button>
        </div>
      )}

      {/* Definitief dialog */}
      {showDefinitiefDialog && (
        <ConfirmDialog title="Planning definitief maken?" text="Monteurs kunnen de planning inzien zodra je dit bevestigt. Je kunt dit later ongedaan maken."
          confirmLabel="Definitief maken" confirmColor="var(--info)" onCancel={() => setShowDefinitiefDialog(false)} onConfirm={makeDefinitief} />
      )}
      {showConceptDialog && (
        <ConfirmDialog title="Terug naar concept?" text="Monteurs kunnen de planning dan niet meer inzien."
          confirmLabel="Terug naar concept" confirmColor="var(--danger)" onCancel={() => setShowConceptDialog(false)} onConfirm={makeConcept} />
      )}

      {/* Mobile bottom nav */}
      <div className="lg:hidden">
        <BottomNav badges={badges} />
      </div>

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
      <label className="text-[10px] uppercase font-semibold tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>{label}</label>
      <input value={value} readOnly={readonly} onChange={e => onChange?.(e.target.value)}
        className="w-full px-2 py-1.5 rounded-lg text-xs" style={{ background: readonly ? "var(--bg-surface-2)" : "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
    </div>
  );
}

function TemplateModal({ onClose, onApply }: { onClose: () => void; onApply: (acts: string[]) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmLoad, setConfirmLoad] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div className="rounded-2xl p-6 w-full max-w-lg space-y-4" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Planning templates</h3>
          <button onClick={onClose}><X className="h-4 w-4" style={{ color: "var(--text-secondary)" }} /></button>
        </div>

        <div className="space-y-3">
          {TEMPLATES.map((t, i) => (
            <button key={i} onClick={() => setSelected(i)} className="w-full text-left p-4 rounded-xl transition-all"
              style={{ background: selected === i ? "var(--accent-light)" : "var(--bg-surface)", border: selected === i ? "1.5px solid var(--accent)" : "1px solid var(--border)" }}>
              <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{t.name}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{t.desc}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {t.activities.map((a, j) => (
                  <span key={j} className="px-2 py-0.5 rounded-full text-[9px]" style={{ background: "var(--bg-base)", color: "var(--text-secondary)" }}>{a}</span>
                ))}
              </div>
            </button>
          ))}
        </div>

        {confirmLoad ? (
          <div className="p-3 rounded-xl" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
            <p className="text-xs font-medium mb-2" style={{ color: "var(--warn-text)" }}>Huidige activiteiten worden vervangen. Doorgaan?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmLoad(false)} className="flex-1 py-1.5 rounded-lg text-xs" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Annuleren</button>
              <button onClick={() => selected !== null && onApply(TEMPLATES[selected].activities)} className="flex-1 py-1.5 rounded-lg text-xs text-white" style={{ background: "var(--accent)" }}>Laden</button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2 rounded-lg text-xs" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Annuleren</button>
            <button disabled={selected === null} onClick={() => setConfirmLoad(true)} className="flex-1 py-2 rounded-lg text-xs text-white disabled:opacity-40" style={{ background: "var(--accent)" }}>Template laden</button>
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
      <div className="rounded-2xl p-6 w-full max-w-sm space-y-4" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
        <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>{title}</h3>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{text}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 rounded-lg text-xs" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Annuleren</button>
          <button onClick={onConfirm} className="flex-1 py-2 rounded-lg text-xs text-white" style={{ background: confirmColor }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

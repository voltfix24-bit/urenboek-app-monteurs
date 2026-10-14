import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { addDays, addWeeks, format, getISOWeek, isSameDay, startOfISOWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { ChevronDown, ChevronLeft, ChevronRight, Copy, Crosshair, Lock, Keyboard, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { useNavBadges } from "@/hooks/useNavBadges";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HerhaalDialoog, type RepeatChoice } from "./HerhaalDialoog";
import { copyDays, transferTargets, splitCellKey, type GridPoint, type ClipboardDay } from "@/lib/weekPlanningV2";
import { Spinner } from "@/components/ui/Spinner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { generatePersoneelsPdf, generatePlanningPdf } from "@/lib/planningPdf";
import { formatUren, formatUrenGetal } from "@/lib/formatting";
import { useWeekPlanningData } from "@/hooks/useWeekPlanningData";
import { groepeerRijen, filterToon, vrijOpDag, wijzigingenOpDag, bouwLiveRegels, dubbeleBoekingTekst, berekenWeekUren, vergelijkBoeking, isLegeWerkdag, type GroepMode, type ToonMode } from "@/lib/weekPlanningV2";
import {
  actieVoorBewerken, actieVoorVerwijderen, bepaalAfwezigheid, berekenUren, bouwCellen, bouwNieuwConcepten,
  celBezet, celKey, celTelt, ELDERS_TYPE, parseWeekParam, telConcepten, TIJDBLOKKEN, type Cel, type PlanWaarden,
} from "@/lib/weekPlanning";
import { ActieBalk, doelenVoorCellen, type SelCel, type WijzigKeuze } from "./ActieBalk";
import { BewerkPaneel } from "./BewerkPaneel";
import { PubliceerDialoog } from "./PubliceerDialoog";
import { PerKlusWeergave } from "./PerKlusWeergave";
import { bewaarRecent, leesRecent, DAG_KORT, initialen, korteNaam, projectKleur, rolLabel } from "./wpUtils";

type ConceptInsert = TablesInsert<"planning_concept">;

interface Drag { r0: number; c0: number; r1: number; c1: number; base: Set<string>; additief: boolean; moving?: boolean; copy?: boolean; sources?: Set<string> }

const AFW_CEL: Record<string, string> = { verlof: "Verlof", ziek: "Ziek", vrij: "Vaste vrije dag", elders: "Andere opdracht" };

export default function DesktopWeekPlanning() {
  const { badges } = useNavBadges();
  const { profile, profileId } = useProfile();
  const [searchParams] = useSearchParams();
  const urlProject = searchParams.get("project");
  const [weekStart, setWeekStart] = useState(() => parseWeekParam(searchParams.get("week")) ?? startOfISOWeek(new Date()));
  const [weeksCount, setWeeksCount] = useState<1 | 2 | 4>(1);
  const [groepMode, setGroepMode] = useState<GroepMode>("geen");
  const [toonMode, setToonMode] = useState<ToonMode>("iedereen");
  const [vrijFilter, setVrijFilter] = useState<string | null>(null);
  const { gelezen, planning, concepten, medewerkers, projects, beschikbaarheid, boekingen, detacheringen, weekgrens, loading, refetch } = useWeekPlanningData(weekStart, weeksCount);
  const [aandachtFilter, setAandachtFilter] = useState<null | "dubbel" | "weekgrens" | "leeg" | "afwijkend">(null);

  const conceptModus = true;
  const [cursor, setCursor] = useState<GridPoint | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardDay[]>([]);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const undoStack = useRef<Array<() => Promise<void>>>([]);
  const undoBusy = useRef(false);
  const pendingCursor = useRef<(GridPoint & { week: string }) | null>(null);
  const lastTime = useRef<[string, string]>(["07:00", "16:00"]);
  const [view, setView] = useState<"grid" | "klus">("grid");
  const [filterProject, setFilterProject] = useState<string | null>(urlProject);
  const [barProject, setBarProject] = useState<string | null>(urlProject);
  const [selSet, setSelSet] = useState<Set<string>>(() => new Set());
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragging = !!drag;
  const [panelKey, setPanelKey] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const mutationBusy = useRef(false);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  const weekNumber = getISOWeek(weekStart);
  const weekDates = useMemo(() => Array.from({ length: 5 * weeksCount }, (_, i) => addDays(weekStart, 7 * Math.floor(i / 5) + (i % 5))), [weekStart, weeksCount]);
  const datums = useMemo(() => weekDates.map((d) => format(d, "yyyy-MM-dd")), [weekDates]);
  const compact = weeksCount > 1;
  const isHuidigeWeek = isSameDay(weekStart, startOfISOWeek(new Date()));
  const vandaag = format(new Date(), "yyyy-MM-dd");

  const cellen = useMemo(() => bouwCellen(planning, concepten), [planning, concepten]);
  const celLijst = useMemo(() => Array.from(cellen.values()), [cellen]);
  const medMap = useMemo(() => new Map(medewerkers.map((m) => [m.id, m])), [medewerkers]);
  const projMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const weekProjectIds = useMemo(() => {
    const tel = new Map<string, number>();
    celLijst.forEach((c) => { if (c.project_id) tel.set(c.project_id, (tel.get(c.project_id) ?? 0) + 1); });
    const ids = Array.from(tel.entries()).sort((a, b) => b[1] - a[1]).map(([id]) => id);
    if (urlProject && !ids.includes(urlProject) && projMap.has(urlProject)) ids.push(urlProject);
    return ids;
  }, [celLijst, urlProject, projMap]);

  const zichtbareMedewerkers = useMemo(() => {
    let m = filterToon(medewerkers, toonMode);
    if (vrijFilter) { const ids = new Set(vrijOpDag(vrijFilter, m, cellen, beschikbaarheid).map((x) => x.id)); m = m.filter((x) => ids.has(x.id)); }
    return m;
  }, [medewerkers, toonMode, vrijFilter, cellen, beschikbaarheid]);
  const rijen = useMemo(() => [...zichtbareMedewerkers].sort((a, b) => {
    const ah = datums.some((d) => celBezet(cellen.get(celKey(a.id, d))));
    const bh = datums.some((d) => celBezet(cellen.get(celKey(b.id, d))));
    if (ah !== bh) return ah ? -1 : 1;
    return a.full_name.localeCompare(b.full_name, "nl", { sensitivity: "base" });
  }), [zichtbareMedewerkers, cellen, datums]);
  const naamVoor = useCallback((id: string) => korteNaam(medMap.get(id)?.full_name ?? "?"), [medMap]);
  const rowIndexOf = useMemo(() => new Map(rijen.map((r, i) => [r.id, i])), [rijen]);
  const groepen = useMemo(() => groepeerRijen(rijen, groepMode, {
    rolLabel: (rol) => (rolLabel(rol) ?? "Monteurs").toUpperCase(),
    isUitleenAlleen: (id) => { const dagen = datums.map((d) => cellen.get(celKey(id, d))).filter(celTelt); return dagen.length > 0 && dagen.every((c) => projMap.get(c.project_id ?? "")?.soort === "uitleen"); },
    naamVoor,
  }), [rijen, groepMode, datums, cellen, projMap, naamVoor]);

  // Overplanning (bestaande regel: meer dan 5 unieke dagen per week), inclusief concepten
  const overgepland = useMemo(() => {
    const tel = new Map<string, Set<string>>();
    celLijst.filter(celTelt).forEach((c) => {
      const s = tel.get(c.medewerker_id) ?? new Set<string>();
      s.add(c.datum); tel.set(c.medewerker_id, s);
    });
    return new Set(Array.from(tel.entries()).filter(([, s]) => s.size > 5).map(([id]) => id));
  }, [celLijst]);

  // Stap 3: live regels per medewerker+datum (voor dubbele-boeking-detectie, buiten de 1-rij-per-cel van bouwCellen om).
  const liveRegels = useMemo(() => bouwLiveRegels(planning, concepten), [planning, concepten]);
  const dubbelTekst = useCallback((cel: Cel | undefined) => {
    if (!celTelt(cel)) return null;
    const regels = liveRegels.get(celKey(cel.medewerker_id, cel.datum)) ?? [];
    return dubbeleBoekingTekst(regels.map((r) => ({ naam: projMap.get(r.project_id ?? "")?.naam ?? "Onbekend project", starttijd: r.starttijd, eindtijd: r.eindtijd })));
  }, [liveRegels, projMap]);
  const isDubbel = useCallback((cel: Cel | undefined) => {
    if (!celTelt(cel)) return false;
    if (dubbelTekst(cel)) return true;
    return !!bepaalAfwezigheid(medMap.get(cel.medewerker_id), cel.datum, beschikbaarheid);
  }, [dubbelTekst, medMap, beschikbaarheid]);

  const conflictTekst = useCallback((cel: Cel | undefined) => {
    if (!celTelt(cel)) return null;
    const dubbel = dubbelTekst(cel);
    if (dubbel) return dubbel;
    const naam = medMap.get(cel.medewerker_id)?.full_name ?? "Medewerker";
    const delen: string[] = [];
    const afw = bepaalAfwezigheid(medMap.get(cel.medewerker_id), cel.datum, beschikbaarheid);
    if (afw) delen.push(`${AFW_CEL[afw]} maar wel ingepland op ${projMap.get(cel.project_id ?? "")?.naam ?? "een project"}`);
    return delen.length ? `${naam}: ${delen.join(" · ")}` : null;
  }, [medMap, projMap, beschikbaarheid, dubbelTekst]);

  const alleConflicten = useMemo(() => celLijst.map(conflictTekst).filter((x): x is string => !!x), [celLijst, conflictTekst]);
  const tellers = telConcepten(concepten);
  const conceptAantal = concepten.length;
  const geraakteNamen = Array.from(new Set(concepten.map((c) => c.medewerker_id))).map((id) => korteNaam(medMap.get(id)?.full_name ?? "?"));
  const ingeplandAantal = new Set(celLijst.filter(celTelt).map((c) => c.medewerker_id)).size;
  // Medewerkers die de hele week niet beschikbaar zijn (verlof, ziek, vrij, andere opdracht) tellen niet als "niet ingepland"
  const inzetbaarAantal = medewerkers.filter((m) => datums.some((d) => celTelt(cellen.get(celKey(m.id, d))) || !bepaalAfwezigheid(m, d, beschikbaarheid))).length;

  // ── Selectie (set losse cellen) ──
  const rectKeys = (d: Drag) => {
    const keys: string[] = [];
    for (let r = Math.min(d.r0, d.r1); r <= Math.max(d.r0, d.r1); r++)
      for (let c = Math.min(d.c0, d.c1); c <= Math.max(d.c0, d.c1); c++)
        if (rijen[r]) keys.push(celKey(rijen[r].id, datums[c]));
    return keys;
  };
  const effSel = useMemo(() => (drag && !drag.moving ? new Set([...drag.base, ...rectKeys(drag)]) : selSet), [drag, selSet, rijen, datums]); // eslint-disable-line react-hooks/exhaustive-deps
  const selCellen: SelCel[] = Array.from(selSet).map((k) => { const i = k.indexOf("|"); return { medId: k.slice(0, i), datum: k.slice(i + 1) }; });
  const selKeyStr = Array.from(selSet).sort().join(",");
  const inSel = (r: number, c: number) => !!rijen[r] && effSel.has(celKey(rijen[r].id, datums[c]));
  const wisSel = () => setSelSet(new Set());

  useEffect(() => {
    if (!dragging) return;
    const up = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const enkel = d.r0 === d.r1 && d.c0 === d.c1;
      const key = rijen[d.r0] ? celKey(rijen[d.r0].id, datums[d.c0]) : null;
      if (!enkel && d.moving) { void transfer(d); return; }
      if (enkel && key && d.additief) {
        const next = new Set(d.base);
        if (next.has(key)) next.delete(key); else next.add(key);
        setSelSet(next);
      } else if (enkel && key && celBezet(cellen.get(key))) {
        setPanelKey(key); setSelSet(new Set());
      } else {
        setSelSet(new Set([...d.base, ...rectKeys(d)]));
      }
    };
    document.addEventListener("mouseup", up);
    return () => document.removeEventListener("mouseup", up);
  }, [dragging, rijen, datums, cellen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setSelSet(new Set()); setPanelKey(null); if (!pendingCursor.current) setCursor(null); }, [weekStart]);
  useEffect(() => {
    if (loading || !pendingCursor.current || pendingCursor.current.week !== datums[0]) return;
    const p = pendingCursor.current;
    pendingCursor.current = null;
    const med = rijen[p.row];
    if (med) { setCursor(p); setSelSet(new Set([celKey(med.id, datums[p.day])])); }
  }, [loading, datums, rijen]);

  // ── Schrijfacties ──
  const run = async (fn: () => Promise<void>) => {
    if (mutationBusy.current) return;
    mutationBusy.current = true;
    setBusy(true);
    try { await fn(); } catch (err) { console.error(err); toast.error("Er ging iets mis. Probeer opnieuw."); } finally { await refetch(); mutationBusy.current = false; setBusy(false); }
  };

  const plan = (paren: SelCel[], tijd: [string, string], notitie: string, uitleen?: Pick<PlanWaarden, "werklocatie" | "contactpersoon" | "contact_telefoon">) => run(async () => {
    if (!profileId || !barProject) return;
    const { doelen, overgeslagen } = doelenVoorCellen(paren, cellen, medewerkers, beschikbaarheid);
    if (doelen.length === 0) { toast.error("Niets ingepland: geen lege, beschikbare dagen geselecteerd."); return; }
    const waarden: PlanWaarden = { project_id: barProject, starttijd: tijd[0], eindtijd: tijd[1], notitie, ...(uitleen ?? {}) };
    const rows = bouwNieuwConcepten(doelen, waarden, profileId);
    const projectNaam = projMap.get(barProject)?.naam ?? "project";
    const undo = await capture(rows);
    const { data, error } = await supabase.from("planning_concept").insert(rows as ConceptInsert[]).select("id");
    if (error) throw error;
    const ids = (data ?? []).map((r) => r.id);
    lastTime.current = tijd;
    bewaarRecent(barProject);
    wisSel();
    rememberUndo(undo);
    toast.success(`${ids.length} ${ids.length === 1 ? "dag" : "dagen"} ingepland op ${projectNaam} (concept)`, undoToast(undo));
    if (overgeslagen.length > 0) toast.info(`${overgeslagen.length} ${overgeslagen.length === 1 ? "dag" : "dagen"} overgeslagen (verlof, ziek of vrij)`);
  });

  /**
   * Vult de geselecteerde lege dagen vooraf met de actieve uitleen (detachering)
   * van de gekozen medewerker(s). Zelfde logica als inplannen en herhalen: alleen
   * lege dagen, verlof/ziek/vrije dagen worden overgeslagen. Alles blijft concept.
   */
  const planDetachering = (projectId: string, paren: SelCel[]) => run(async () => {
    if (!profileId) return;
    const { doelen, overgeslagen } = doelenVoorCellen(paren, cellen, medewerkers, beschikbaarheid);
    if (doelen.length === 0) { toast.error("Niets in te vullen: geen lege, beschikbare dagen geselecteerd."); return; }
    const p = projMap.get(projectId);
    const uitleen = p?.soort === "uitleen"
      ? { werklocatie: p.adres || null, contactpersoon: p.contactpersoon_naam || null, contact_telefoon: p.contactpersoon_tel || null }
      : {};
    const [starttijd, eindtijd] = TIJDBLOKKEN[0];
    const waarden: PlanWaarden = { project_id: projectId, starttijd, eindtijd, notitie: "", ...uitleen };
    const rows = bouwNieuwConcepten(doelen, waarden, profileId);
    const undo = await capture(rows);
    const { data, error } = await supabase.from("planning_concept").insert(rows as ConceptInsert[]).select("id");
    if (error) throw error;
    const ids = (data ?? []).map((r) => r.id);
    bewaarRecent(projectId);
    wisSel();
    rememberUndo(undo);
    toast.success(`${ids.length} ${ids.length === 1 ? "dag" : "dagen"} ingevuld op ${p?.naam ?? "uitleen"} (concept)`, undoToast(undo));
    if (overgeslagen.length > 0) toast.info(`${overgeslagen.length} ${overgeslagen.length === 1 ? "dag" : "dagen"} overgeslagen (verlof, ziek of vrij)`);
  });

  /** Voert verwijder-acties uit voor een set cellen. */
  const verwijderCellen = async (doel: Cel[]) => {
    let beschermd = 0;
    const deleteIds: string[] = [];
    const upserts: ConceptInsert[] = [];
    doel.forEach((c) => {
      const a = actieVoorVerwijderen(c, profileId ?? "");
      if (a.type === "delete-concept") deleteIds.push(a.id);
      else if (a.type === "upsert") upserts.push(a.rij as ConceptInsert);
      else if (a.type === "beschermd") beschermd++;
    });
    if (deleteIds.length) { const { error } = await supabase.from("planning_concept").delete().in("id", deleteIds); if (error) throw error; }
    if (upserts.length) { const { error } = await supabase.from("planning_concept").upsert(upserts, { onConflict: "medewerker_id,datum" }); if (error) throw error; }
    return { aantal: deleteIds.length + upserts.length, beschermd };
  };

  const dagenTekst = (n: number) => `${n} ${n === 1 ? "dag" : "dagen"}`;

  const verwijderSel = (doel: Cel[]) => run(async () => {
    if (!profileId) return;
    const undo = await capture(doel);
    const { aantal, beschermd } = await verwijderCellen(doel);
    rememberUndo(undo);
    wisSel();
    toast.success(`${dagenTekst(aantal)} verwijderd (concept)`, undoToast(undo));
    if (beschermd) toast.warning(`${beschermd} ${beschermd === 1 ? "dag komt" : "dagen komen"} uit de Planner-koppeling en ${beschermd === 1 ? "is" : "zijn"} niet aangepast`);
  });

  /** Wijzigt alleen de geselecteerde cellen (niet de hele ploeg) en alleen de gekozen velden. */
  const wijzigSel = (doel: Cel[], keuze: WijzigKeuze) => run(async () => {
    if (!profileId) return;
    let beschermd = 0;
    let aantal = 0;
    const undo = await capture(doel);
    {
      for (const c of doel) {
        const waarden: PlanWaarden = {
          project_id: keuze.project_id ?? c.project_id ?? "",
          starttijd: keuze.tijd?.[0] ?? c.starttijd ?? "07:00",
          eindtijd: keuze.tijd?.[1] ?? c.eindtijd ?? "16:00",
          notitie: keuze.notitie ?? c.notitie ?? "",
          ...(keuze.uitleen ?? {}),
        };
        if (!waarden.project_id) continue;
        const a = actieVoorBewerken(c, waarden, profileId);
        if (a.type === "update-concept") { const { error } = await supabase.from("planning_concept").update(a.patch).eq("id", a.id); if (error) throw error; aantal++; }
        else if (a.type === "upsert") { const { error } = await supabase.from("planning_concept").upsert(a.rij as ConceptInsert, { onConflict: "medewerker_id,datum" }); if (error) throw error; aantal++; }
        else if (a.type === "beschermd") beschermd++;
      }

    }
    if (aantal) rememberUndo(undo);
    if (keuze.tijd) lastTime.current = keuze.tijd;
    if (keuze.project_id) bewaarRecent(keuze.project_id);
    wisSel();
    toast.success(`${dagenTekst(aantal)} gewijzigd (concept)`, undoToast(undo));
    if (beschermd) toast.warning("Dagen uit de Planner-koppeling zijn niet aangepast");
  });

  /** Zzp'ers: dagen markeren als "andere opdracht" (niet beschikbaar) of weer vrijgeven. Raakt de planning zelf niet. */
  const zetBeschikbaarheid = (paren: SelCel[], beschikbaar: boolean) => run(async () => {
    if (!profileId || !paren.length) return;
    if (!beschikbaar) {
      const rijen = paren.map((p) => ({ medewerker_id: p.medId, type: ELDERS_TYPE, datum_van: p.datum, datum_tot: p.datum, status: "goedgekeurd", reden: "Andere opdracht", behandeld_door: profileId }));
      const { data, error } = await supabase.from("beschikbaarheid").insert(rijen).select("id");
      if (error) throw error;
      const ids = (data ?? []).map((r) => r.id);
      wisSel();
      toast.success(`${dagenTekst(ids.length)} niet beschikbaar (andere opdracht)`, {
        action: { label: "Ongedaan maken", onClick: async () => { await supabase.from("beschikbaarheid").delete().in("id", ids); refetch(); } },
      });
      return;
    }
    const dag = (d: string, n: number) => format(addDays(new Date(`${d}T12:00:00`), n), "yyyy-MM-dd");
    for (const p of paren) {
      const recs = beschikbaarheid.filter((b) => b.id && b.medewerker_id === p.medId && b.type === ELDERS_TYPE && p.datum >= b.datum_van && p.datum <= b.datum_tot);
      for (const b of recs) {
        if (b.datum_van === b.datum_tot) { const { error } = await supabase.from("beschikbaarheid").delete().eq("id", b.id ?? ""); if (error) throw error; continue; }
        if (b.datum_van === p.datum) { await supabase.from("beschikbaarheid").update({ datum_van: dag(p.datum, 1) }).eq("id", b.id ?? ""); continue; }
        if (b.datum_tot === p.datum) { await supabase.from("beschikbaarheid").update({ datum_tot: dag(p.datum, -1) }).eq("id", b.id ?? ""); continue; }
        await supabase.from("beschikbaarheid").update({ datum_tot: dag(p.datum, -1) }).eq("id", b.id ?? "");
        await supabase.from("beschikbaarheid").insert({ medewerker_id: p.medId, type: ELDERS_TYPE, datum_van: dag(p.datum, 1), datum_tot: b.datum_tot, status: "goedgekeurd", reden: "Andere opdracht", behandeld_door: profileId });
      }
    }
    wisSel();
    toast.success(`${dagenTekst(paren.length)} weer beschikbaar`);
  });

  const ploegVan = (cel: Cel) => cel.planning_group_id
    ? celLijst.filter((c) => c.planning_group_id === cel.planning_group_id && c.datum === cel.datum && c.status !== "verwijderd")
    : [cel];

  const panelCel = panelKey ? cellen.get(panelKey) : undefined;

  const bewaar = (waarden: PlanWaarden, helePloeg: boolean) => run(async () => {
    if (!panelCel || !profileId) return;
    const doel = helePloeg ? ploegVan(panelCel) : [panelCel];
    let beschermd = 0;
    const undo = await capture(doel);
    {
      for (const c of doel) {
        const a = actieVoorBewerken(c, waarden, profileId);
        if (a.type === "update-concept") { const { error } = await supabase.from("planning_concept").update(a.patch).eq("id", a.id); if (error) throw error; }
        else if (a.type === "upsert") { const { error } = await supabase.from("planning_concept").upsert(a.rij as ConceptInsert, { onConflict: "medewerker_id,datum" }); if (error) throw error; }
        else if (a.type === "beschermd") beschermd++;
      }
    }
    rememberUndo(undo);
    bewaarRecent(waarden.project_id);
    setPanelKey(null);
    toast.success(`${doel.length > 1 ? "Planning bijgewerkt voor hele ploeg" : "Planning bijgewerkt"} (concept)`, undoToast(undo));
    if (beschermd) toast.warning("Dagen uit de Planner-koppeling zijn niet aangepast");
  });

  const verwijder = (helePloeg: boolean) => run(async () => {
    if (!panelCel) return;
    const doel = helePloeg ? ploegVan(panelCel) : [panelCel];
    const undo = await capture(doel);
    const { beschermd } = await verwijderCellen(doel);
    rememberUndo(undo);
    setPanelKey(null);
    toast.success("Verwijderd (concept)", undoToast(undo));
    if (beschermd) toast.warning("Dagen uit de Planner-koppeling zijn niet verwijderd");
  });

  const terugdraaien = () => run(async () => {
    if (!panelCel?.concept) return;
    const undo = await capture([panelCel]);
    const { error } = await supabase.from("planning_concept").delete().eq("id", panelCel.concept.id);
    if (error) throw error;
    setPanelKey(null);
    rememberUndo(undo);
    toast.success("Concept teruggedraaid", undoToast(undo));
  });

  const kopieerVorigeWeek = () => run(async () => {
    if (!profileId) return;
    const vorige = addWeeks(weekStart, -1);
    const { data, error } = await supabase.from("planning")
      .select("medewerker_id, project_id, datum, starttijd, eindtijd, notitie, activiteit, activiteit_kleur, collega_ids, planning_group_id, werklocatie, contactpersoon, contact_telefoon")
      .gte("datum", format(vorige, "yyyy-MM-dd")).lte("datum", format(addDays(vorige, 4), "yyyy-MM-dd"));
    if (error) throw error;
    const gezien = new Set<string>();
    const groepMap = new Map<string, string>();
    let overgeslagen = 0;
    const rows = (data ?? []).flatMap((r) => {
      const doelDatum = format(addDays(new Date(`${r.datum}T12:00:00`), 7), "yyyy-MM-dd");
      const key = celKey(r.medewerker_id, doelDatum);
      if (gezien.has(key)) return [];
      gezien.add(key);
      if (celBezet(cellen.get(key)) || bepaalAfwezigheid(medMap.get(r.medewerker_id), doelDatum, beschikbaarheid)) { overgeslagen++; return []; }
      let groep: string | null = null;
      if (r.planning_group_id) { groep = groepMap.get(r.planning_group_id) ?? crypto.randomUUID(); groepMap.set(r.planning_group_id, groep); }
      return [{
        medewerker_id: r.medewerker_id, project_id: r.project_id, datum: doelDatum, starttijd: r.starttijd.slice(0, 5), eindtijd: r.eindtijd.slice(0, 5),
        notitie: r.notitie ?? "", activiteit: r.activiteit, activiteit_kleur: r.activiteit_kleur, collega_ids: r.collega_ids, planning_group_id: groep, created_by: profileId,
        werklocatie: r.werklocatie, contactpersoon: r.contactpersoon, contact_telefoon: r.contact_telefoon,
      }];
    });
    if (rows.length) {
      const undo = await capture(rows);
      const { error: insErr } = await supabase.from("planning_concept").insert(rows.map((r) => ({ ...r, actie: "nieuw" as const })));
      if (insErr) throw insErr;
      rememberUndo(undo);
      toast.success(`${rows.length} dagen gekopieerd uit week ${getISOWeek(vorige)} (concept)${overgeslagen ? ` · ${overgeslagen} overgeslagen` : ""}`, undoToast(undo));
    }
    if (!rows.length) toast.info("Geen beschikbare dagen om te kopiëren");
  });

  const rememberUndo = (undo: () => Promise<void>) => { undoStack.current.push(undo); if (undoStack.current.length > 30) undoStack.current.shift(); };
  const undoToast = (undo: () => Promise<void>) => ({ action: { label: "Ongedaan maken", onClick: () => void run(async () => {
    const i = undoStack.current.indexOf(undo);
    if (i < 0) return;
    if (i !== undoStack.current.length - 1) { toast.info("Maak eerst de laatste wijziging ongedaan"); return; }
    await undo(); undoStack.current.pop();
  }) } });
  const capture = async (targets: Array<{ medewerker_id: string; datum: string }>) => {
    const unique = [...new Map(targets.map((p) => [celKey(p.medewerker_id, p.datum), p])).values()];
    const keys = new Set(unique.map((p) => celKey(p.medewerker_id, p.datum)));
    const ids = [...new Set(unique.map((p) => p.medewerker_id))];
    const dates = unique.map((p) => p.datum).sort();
    const load = async () => {
      if (!ids.length) return [];
      const { data, error } = await supabase.from("planning_concept").select("*").in("medewerker_id", ids).gte("datum", dates[0]).lte("datum", dates[dates.length - 1]);
      if (error) throw error;
      return (data ?? []).filter((p) => keys.has(celKey(p.medewerker_id, p.datum)));
    };
    const before: ConceptInsert[] = await load();
    let used = false;
    return async () => {
      if (used) return;
      const current = await load();
      if (current.length) { const { error } = await supabase.from("planning_concept").delete().in("id", current.map((p) => p.id)); if (error) throw error; }
      if (before.length) { const { error } = await supabase.from("planning_concept").insert(before); if (error) throw error; }
      used = true;
    };
  };
  const transfer = (d: Drag) => run(async () => {
    const sources = d.sources ?? new Set<string>();
    const items = copyDays(sources, rijen, datums, cellen);
    const points = [...sources].map(splitCellKey);
    const top = Math.min(...points.map((p) => rijen.findIndex((r) => r.id === p.medewerker_id)));
    const left = Math.min(...points.map((p) => datums.indexOf(p.datum)));
    await paste(items, { row: top + d.r1 - d.r0, day: left + d.c1 - d.c0 }, !d.copy);
  });
  const paste = async (items: ClipboardDay[], anchor: GridPoint, moving = false) => {
    if (!profileId) return;
    const { targets, skipped } = transferTargets(items, anchor, rijen, datums, cellen, beschikbaarheid, moving);
    const sources = moving ? targets.flatMap((t) => { const c = cellen.get(t.source.sourceKey); return c ? [c] : []; }) : [];
    if (!targets.length) { toast.info(`Geen dagen ${moving ? "verplaatst" : "geplakt"} · ${skipped.length} overgeslagen`); return; }
    const undo = await capture([...sources, ...targets]);
    const rows: ConceptInsert[] = targets.map((t) => ({ ...t.source.waarden, medewerker_id: t.medewerker_id, datum: t.datum, actie: "nieuw", planning_id: null, created_by: profileId, planning_group_id: null, collega_ids: [] }));
    const { error } = await supabase.from("planning_concept").insert(rows);
    if (error) throw error;
    try { if (moving) await verwijderCellen(sources); } catch (error) { await undo(); throw error; }
    rememberUndo(undo); wisSel();
    toast.success(`${targets.length} dagen ${moving ? "verplaatst" : "gekopieerd"} (concept)${skipped.length ? ` · ${skipped.length} overgeslagen (${[...new Set(skipped)].join(", ")})` : ""}`, undoToast(undo));
  };
  const repeatCheck = async (choice: RepeatChoice) => {
    const ids = [...new Set(selCellen.map((s) => s.medId))];
    const from = choice.dates[0], to = choice.dates.at(-1);
    if (!from || !to || !ids.length) return { count: 0, skipped: [], same: 0, rows: [] as ConceptInsert[] };
    const [p, c, b] = await Promise.all([
      supabase.from("planning").select("*").in("medewerker_id", ids).gte("datum", from).lte("datum", to),
      supabase.from("planning_concept").select("*").in("medewerker_id", ids).gte("datum", from).lte("datum", to),
      supabase.from("beschikbaarheid").select("*").in("medewerker_id", ids).eq("status", "goedgekeurd").lte("datum_van", to).gte("datum_tot", from),
    ]);
    if (p.error || c.error || b.error) throw p.error ?? c.error ?? b.error;
    const all = bouwCellen(p.data ?? [], c.data ?? []);
    const skipped: string[] = [], rows: ConceptInsert[] = []; let same = 0;
    for (const id of ids) for (const datum of choice.dates) {
      const existing = all.get(celKey(id, datum));
      if (celTelt(existing) && existing.project_id === choice.projectId) { same++; continue; }
      const afw = bepaalAfwezigheid(medMap.get(id), datum, b.data ?? []);
      if (afw || celBezet(existing)) { skipped.push(`${korteNaam(medMap.get(id)?.full_name ?? "")} ${format(new Date(`${datum}T12:00:00`), "d/M")} (${afw ?? "al ingepland"})`); continue; }
      const project = projMap.get(choice.projectId);
      rows.push({ medewerker_id: id, datum, project_id: choice.projectId, starttijd: "07:00", eindtijd: "16:00", notitie: "", actie: "nieuw", planning_id: null, created_by: profileId, ...(project?.soort === "uitleen" ? { werklocatie: project.adres, contactpersoon: project.contactpersoon_naam, contact_telefoon: project.contactpersoon_tel } : {}) });
    }
    return { count: rows.length, same, skipped, rows };
  };
  const repeat = (choice: RepeatChoice) => run(async () => {
    const result = await repeatCheck(choice);
    if (!result.rows.length) return;
    const undo = await capture(result.rows.map((r) => ({ medewerker_id: r.medewerker_id, datum: r.datum })));
    const { error } = await supabase.from("planning_concept").upsert(result.rows, { onConflict: "medewerker_id,datum" });
    if (error) throw error;
    rememberUndo(undo); bewaarRecent(choice.projectId); setRepeatOpen(false);
    toast.success(`${result.count} dagen ingepland (concept) · ${result.skipped.length} overgeslagen`, undoToast(undo));
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLElement && (target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="combobox"]') || target.isContentEditable)) return;
      if (e.key === "Alt") { setDrag((d) => d ? { ...d, copy: e.type === "keydown" } : d); return; }
      if (e.type !== "keydown" || panelKey || repeatOpen || view !== "grid") return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (!busy && !undoBusy.current) { const undo = undoStack.current.pop(); if (undo) { undoBusy.current = true; void run(async () => { try { await undo(); toast.success("Ongedaan gemaakt"); } finally { undoBusy.current = false; } }); } } return; }
      if (e.key === "Escape") { wisSel(); return; }
      if (mod && e.key.toLowerCase() === "c") { const copied = copyDays(selSet, rijen, datums, cellen); if (copied.length) { e.preventDefault(); const previous = clipboard; setClipboard(copied); toast.success(`${copied.length} dagen gekopieerd`, { action: { label: "Ongedaan maken", onClick: () => setClipboard(previous) } }); } return; }
      const selected = [...selSet].map(splitCellKey).map((p) => ({ row: rijen.findIndex((m) => m.id === p.medewerker_id), day: datums.indexOf(p.datum) })).filter((p) => p.row >= 0 && p.day >= 0);
      const anchor = cursor ?? (selected.length ? { row: Math.min(...selected.map((p) => p.row)), day: Math.min(...selected.map((p) => p.day)) } : null);
      if (mod && e.key.toLowerCase() === "v" && clipboard.length && anchor) { e.preventDefault(); void run(() => paste(clipboard, anchor)); return; }
      if (["Delete", "Backspace"].includes(e.key) && selSet.size) { e.preventDefault(); void verwijderSel([...selSet].map((k) => cellen.get(k)).filter((c): c is Cel => celTelt(c))); return; }
      if (e.key === "Enter" && selCellen.length) { e.preventDefault(); const project = barProject ?? leesRecent().find((id) => projMap.has(id)); if (project) { setBarProject(project); const empty = selCellen.filter((p) => !celBezet(cellen.get(celKey(p.medId, p.datum)))); void quickPlan(empty, project); } return; }
      if (!e.key.startsWith("Arrow")) return;
      e.preventDefault(); let next = anchor ?? { row: 0, day: 0 };
      next = { row: Math.max(0, Math.min(rijen.length - 1, next.row + (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0))), day: next.day + (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0) };
      if (next.day < 0 || next.day > 4) {
        const nextWeek = addWeeks(weekStart, next.day < 0 ? -1 : 1);
        pendingCursor.current = { row: next.row, day: next.day < 0 ? 4 : 0, week: format(nextWeek, "yyyy-MM-dd") };
        setWeekStart(nextWeek); return;
      }
      const med = rijen[next.row]; if (!med) return;
      setCursor(next); const key = celKey(med.id, datums[next.day]);
      if (e.shiftKey) setSelSet(new Set([...selSet, key]));
      else if (selected.length > 1 && anchor) {
        const dr = next.row - anchor.row, dc = next.day - anchor.day;
        setSelSet(new Set(selected.flatMap((p) => { const m = rijen[p.row + dr], date = datums[p.day + dc]; return m && date ? [celKey(m.id, date)] : []; })));
      } else setSelSet(new Set([key]));
    };
    document.addEventListener("keydown", onKey); document.addEventListener("keyup", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("keyup", onKey); };
  });
  const quickPlan = (pairs: SelCel[], projectId: string) => run(async () => {
    if (!profileId) return;
    const { doelen, overgeslagen } = doelenVoorCellen(pairs, cellen, medewerkers, beschikbaarheid);
    const project = projMap.get(projectId);
    const rows = bouwNieuwConcepten(doelen, { project_id: projectId, starttijd: lastTime.current[0], eindtijd: lastTime.current[1], notitie: "", ...(project?.soort === "uitleen" ? { werklocatie: project.adres, contactpersoon: project.contactpersoon_naam, contact_telefoon: project.contactpersoon_tel } : {}) }, profileId);
    if (!rows.length) { toast.info("Geen beschikbare lege dagen"); return; }
    const undo = await capture(rows);
    const { error } = await supabase.from("planning_concept").insert(rows);
    if (error) throw error;
    rememberUndo(undo); bewaarRecent(projectId); wisSel();
    toast.success(`${rows.length} dagen ingepland (concept) · ${overgeslagen.length} overgeslagen`, undoToast(undo));
  });

  const herinnerGelezen = async (med: typeof medewerkers[number]) => {
    if (!profileId) return;
    const { error } = await supabase.functions.invoke("mededeling-verzenden", {
      body: { titel: "Nieuwe planning", inhoud: "Er staat een nieuwe planning voor je klaar. Open de app om hem te bekijken.", ontvangerType: "persoon", ontvangerId: med.id, profileId },
    });
    if (error) toast.error("Versturen van de herinnering is mislukt");
    else toast.success(`Herinnering verstuurd naar ${korteNaam(med.full_name)}`);
  };

  const publiceer = () => run(async () => {
    const { data, error } = await supabase.rpc("publiceer_planning", { p_van: datums[0], p_tot: datums[4] });
    if (error) throw error;
    undoStack.current = [];
    toast.dismiss();
    const res = (data ?? {}) as { nieuw?: number; gewijzigd?: number; verwijderd?: number; overgeslagen?: Array<{ medewerker_id: string; datum: string; reden: string }>; medewerker_ids?: string[] };
    setPublishOpen(false);
    const n = res.medewerker_ids?.length ?? 0;
    toast.success(`Week ${weekNumber} gepubliceerd — ${n} ${n === 1 ? "monteur ziet" : "monteurs zien"} de wijzigingen`);
    if (res.overgeslagen?.length) {
      toast.warning(`Overgeslagen: ${res.overgeslagen.map((o) => `${korteNaam(medMap.get(o.medewerker_id)?.full_name ?? "?")} ${format(new Date(`${o.datum}T12:00:00`), "EEEEEE d/M", { locale: nl })}${o.reden === "planner_beschermd" ? " (Planner-koppeling)" : o.reden === "al_ingepland" ? " (al ingepland)" : ""}`).join(", ")}`);
    }
  });

  const pdfArgs = () => [weekNumber, weekStart, planning.map((p) => ({ ...p, starttijd: p.starttijd.slice(0, 5), eindtijd: p.eindtijd.slice(0, 5) })), medewerkers, projects, profile?.full_name || "Manager"] as const;
  const downloadOverzicht = async () => {
    try { const [w, s, e, m, p, n] = pdfArgs(); await generatePlanningPdf(w, s, addDays(s, 4), e, m, p, n); } catch (err) { console.error(err); toast.error("PDF genereren mislukt"); }
  };
  const downloadPersoneel = async () => {
    try { const [w, s, e, m, p, n] = pdfArgs(); await generatePersoneelsPdf(w, s, e, m, p, n); } catch (err) { console.error(err); toast.error("PDF genereren mislukt"); }
  };

  // ── Render ──
  const dagVrij = useMemo(() => datums.map((d) => vrijOpDag(d, medewerkers, cellen, beschikbaarheid)), [datums, medewerkers, cellen, beschikbaarheid]);
  const dagWijzig = useMemo(() => datums.map((d) => wijzigingenOpDag(concepten, d)), [datums, concepten]);
  const dagTotalen = datums.map((d) => {
    const c = celLijst.filter((x) => x.datum === d && celTelt(x));
    return { aantal: new Set(c.map((x) => x.medewerker_id)).size, uren: c.reduce((s, x) => s + berekenUren(x.starttijd, x.eindtijd), 0) };
  });
  const weekTotaal = dagTotalen.reduce((s, d) => s + d.uren, 0);

  // Stap 3: weekgrens — per weergegeven week (5 werkdagen) de netto uren per medewerker.
  const weekChunks = useMemo(() => Array.from({ length: weeksCount }, (_, w) => datums.slice(w * 5, w * 5 + 5)), [datums, weeksCount]);
  const weekUrenPerChunk = useMemo(() => weekChunks.map((chunk) => berekenWeekUren(celLijst.filter(celTelt), chunk, berekenUren)), [weekChunks, celLijst]);
  const bovenWeekgrens = useCallback((medewerkerId: string) => weekChunks.some((chunk, i) => (weekUrenPerChunk[i].get(medewerkerId) ?? 0) > weekgrens), [weekChunks, weekUrenPerChunk, weekgrens]);

  // Stap 5: boekingen (alleen lezen) en lege dagen.
  const boekingMap = useMemo(() => { const m = new Map<string, number>(); boekingen.forEach((b) => m.set(celKey(b.medewerker_id, b.datum), (m.get(celKey(b.medewerker_id, b.datum)) ?? 0) + b.uren)); return m; }, [boekingen]);
  const isLeeg = useCallback((med: typeof medewerkers[number], datum: string) => isLegeWerkdag(celBezet(cellen.get(celKey(med.id, datum))), !!bepaalAfwezigheid(med, datum, beschikbaarheid)), [cellen, beschikbaarheid]);

  // Aandachtspunten: aantallen voor de chips rechts in de bedieningsrij.
  const aandachtAantallen = useMemo(() => {
    let dubbel = 0, afwijkend = 0, leeg = 0;
    const weekgrensMeds = new Set<string>();
    zichtbareMedewerkers.forEach((med) => {
      if (bovenWeekgrens(med.id)) weekgrensMeds.add(med.id);
      datums.forEach((d) => {
        const cel = cellen.get(celKey(med.id, d));
        if (celTelt(cel) && isDubbel(cel)) dubbel++;
        if (isLeeg(med, d)) leeg++;
        if (celTelt(cel) && d < vandaag) {
          const geboekt = boekingMap.get(celKey(med.id, d)) ?? 0;
          if (vergelijkBoeking(berekenUren(cel.starttijd, cel.eindtijd), geboekt) === "afwijkend") afwijkend++;
        }
      });
    });
    return { dubbel, weekgrens: weekgrensMeds.size, leeg, afwijkend };
  }, [zichtbareMedewerkers, datums, cellen, isDubbel, isLeeg, boekingMap, bovenWeekgrens, vandaag]);

  const matchtAandacht = useCallback((med: typeof medewerkers[number], datum: string, cel: Cel | undefined) => {
    if (!aandachtFilter) return true;
    if (aandachtFilter === "dubbel") return celTelt(cel) && isDubbel(cel);
    if (aandachtFilter === "weekgrens") return bovenWeekgrens(med.id);
    if (aandachtFilter === "leeg") return isLeeg(med, datum);
    if (aandachtFilter === "afwijkend") return celTelt(cel) && datum < vandaag && vergelijkBoeking(berekenUren(cel.starttijd, cel.eindtijd), boekingMap.get(celKey(med.id, datum)) ?? 0) === "afwijkend";
    return true;
  }, [aandachtFilter, isDubbel, bovenWeekgrens, isLeeg, boekingMap, vandaag]);

  const renderCel = (med: typeof rijen[number], r: number, c: number) => {
    const datum = datums[c];
    const cel = cellen.get(celKey(med.id, datum));
    const afw = bepaalAfwezigheid(med, datum, beschikbaarheid);
    const gevuld = celBezet(cel);
    const conflict = conflictTekst(cel);
    const kleur = projectKleur(cel?.project_id ?? null, weekProjectIds);
    const proj = cel?.project_id ? projMap.get(cel.project_id) : undefined;
    const cls = ["wp-cell"];
    if (gevuld) cls.push("is-filled");
    if (cel?.status === "nieuw" || cel?.status === "gewijzigd") cls.push("is-concept");
    if (cel?.status === "verwijderd") cls.push("is-deleted");
    if (!gevuld && afw) cls.push(`is-${afw}`);
    if (conflict) cls.push("is-conflict");
    if (inSel(r, c)) cls.push("is-selected");
    if (cursor?.row === r && cursor.day === c) cls.push("is-cursor");
    if (drag?.moving && (drag.r0 !== drag.r1 || drag.c0 !== drag.c1)) {
      const sourceKeys = drag.sources ?? new Set<string>();
      if (!drag.copy && sourceKeys.has(celKey(med.id, datum))) cls.push("is-move-source");
      const dr = drag.r1 - drag.r0, dc = drag.c1 - drag.c0;
      const isTarget = [...sourceKeys].some((key) => { const p = splitCellKey(key); return rijen.findIndex((m) => m.id === p.medewerker_id) + dr === r && datums.indexOf(p.datum) + dc === c; });
      if (isTarget) cls.push(afw || gevuld ? "is-drop-blocked" : "is-drop-target");
    }
    if (filterProject && gevuld && cel?.project_id !== filterProject) cls.push("is-dimmed");
    if (!matchtAandacht(med, datum, cel)) cls.push("is-dimmed");
    const legDezeDag = isLeeg(med, datum);
    if (aandachtFilter === "leeg" && legDezeDag) cls.push("is-leeg-actief");
    if (c % 5 === 0 && c > 0) cls.push("wp-weeksep");
    const uren = cel ? berekenUren(cel.starttijd, cel.eindtijd) : 0;
    const regels = cel ? liveRegels.get(celKey(med.id, datum)) ?? [] : [];
    const boekInfo = gevuld && cel && datum < vandaag ? (() => {
      const geboekt = boekingMap.get(celKey(med.id, datum)) ?? 0;
      return { geboekt, vergelijking: vergelijkBoeking(berekenUren(cel.starttijd, cel.eindtijd), geboekt) };
    })() : null;
    if (boekInfo) cls.push(`wp-boek-${boekInfo.vergelijking}`);
    const label = gevuld
      ? `${med.full_name}, ${DAG_KORT[c]}: ${proj?.naam ?? "project"}, ${formatUrenGetal(uren)} uur${cel?.status !== "pub" ? `, concept ${cel?.status}` : ""}`
      : `${med.full_name}, ${DAG_KORT[c]}${afw ? `, ${AFW_CEL[afw]}` : ""}, leeg`;

    const inhoud = (
      <div
        key={datum}
        role="gridcell"
        tabIndex={0}
        aria-label={label}
        aria-selected={inSel(r, c)}
        className={cls.join(" ")}
        style={gevuld ? ({ "--cell-color": kleur.color, "--cell-tint": kleur.tint } as CSSProperties) : undefined}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault(); setPanelKey(null);
          const additief = e.shiftKey || e.ctrlKey || e.metaKey;
          setCursor({ row: r, day: c });
          const key = celKey(med.id, datum);
          const moving = celTelt(cel) && !additief;
          setDrag({ r0: r, c0: c, r1: r, c1: c, base: additief ? new Set(selSet) : new Set(), additief, moving, copy: e.altKey, sources: moving ? (selSet.has(key) ? new Set(selSet) : new Set([key])) : undefined });
        }}
        onMouseEnter={(e) => { if (dragging) setDrag((s) => (s ? { ...s, r1: r, c1: c, copy: e.altKey } : s)); }}
      >
        {gevuld && cel ? (
          compact ? (
            <div className="wp-cell-compact"><i style={{ background: kleur.color }} /><span>{proj?.naam || proj?.nummer || "Onbekend project"}</span></div>
          ) : regels.length >= 2 ? (
            <>
              <div className="wp-cell-stack">
                {regels.map((r, i) => (
                  <div key={i} className="wp-cell-stack-row">{projMap.get(r.project_id ?? "")?.naam ?? "Onbekend project"} {r.starttijd}–{r.eindtijd}</div>
                ))}
              </div>
              {conflict && <span className="wp-conflict-dot" aria-hidden="true">!</span>}
            </>
          ) : (
          <>
            <div className="wp-cell-title"><i /><span>{proj?.naam || proj?.nummer || "Onbekend project"}</span></div>
            <div className="wp-cell-meta">{formatUrenGetal(uren)} u · {cel.starttijd}–{cel.eindtijd}{cel.notitie ? " · ✎" : ""}</div>
            {conflict ? <span className="wp-conflict-dot" aria-hidden="true">!</span>
              : cel.status !== "pub" && <span className="wp-cell-tag">{cel.status === "gewijzigd" ? "gewijzigd" : cel.status}</span>}
            {cel.beschermd && <Lock className="wp-cell-lock" aria-label="Planner-koppeling" />}
            {cel.werklocatie && <Crosshair className="wp-cell-loc" aria-label={`Werklocatie: ${cel.werklocatie}`}><title>{cel.werklocatie}</title></Crosshair>}
          </>
          )
        ) : afw ? <span className="wp-afw-label">{AFW_CEL[afw]}</span> : null}
        {boekInfo && boekInfo.vergelijking !== "gelijk" && (
          <span className="wp-boek-label">{boekInfo.vergelijking === "niet-geboekt" ? "nog niet geboekt" : `geboekt ${formatUrenGetal(boekInfo.geboekt)} u`}</span>
        )}
      </div>
    );
    const tooltipText = conflict ?? (boekInfo ? `Gepland ${formatUrenGetal(uren)} u, geboekt ${formatUrenGetal(boekInfo.geboekt)} u` : null);
    if (!tooltipText) return inhoud;
    return <Tooltip key={datum}><TooltipTrigger asChild>{inhoud}</TooltipTrigger><TooltipContent>{tooltipText}</TooltipContent></Tooltip>;
  };

  const panelMed = panelCel ? medMap.get(panelCel.medewerker_id) : undefined;

  return (
    <>
      <DesktopSidebar badges={badges} />
      <div className="wp-page">
        <header className="wp-header">
          <div className="wp-week-nav">
            <button type="button" className="wp-icon-btn" aria-label="Vorige week" onClick={() => setWeekStart((w) => addWeeks(w, -1))}><ChevronLeft size={18} /></button>
            <div>
              <h1>Week {weekNumber}</h1>
              <p>{format(weekStart, "d MMM", { locale: nl })} – {format(addDays(weekStart, 4), "d MMM", { locale: nl })} · {ingeplandAantal} van {inzetbaarAantal} ingepland</p>
            </div>
            <button type="button" className="wp-icon-btn" aria-label="Volgende week" onClick={() => setWeekStart((w) => addWeeks(w, 1))}><ChevronRight size={18} /></button>
            {!isHuidigeWeek && <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfISOWeek(new Date()))}>Deze week</Button>}
          </div>
          <div className="wp-header-actions">
            <Popover><PopoverTrigger asChild><Button variant="outline"><Keyboard size={15} />Sneltoetsen</Button></PopoverTrigger><PopoverContent className="wp-shortcuts" align="end">{[["Slepen", "Verplaatsen"], ["Alt + slepen", "Kopiëren"], ["Shift + klik / slepen", "Selectie toevoegen"], ["Ctrl/Cmd + C / V", "Kopiëren / plakken, ook in een andere week"], ["← ↑ → ↓", "Cursor verplaatsen"], ["Shift + pijl", "Selectie uitbreiden"], ["Enter", "Inplannen met het laatst gebruikte project"], ["Delete / Backspace", "Verwijderen"], ["Ctrl/Cmd + Z", "Ongedaan maken"], ["Esc", "Selectie wissen"]].map(([key, text]) => <div key={key}><kbd>{key}</kbd><span>{text}</span></div>)}</PopoverContent></Popover>
            <Button variant="outline" onClick={kopieerVorigeWeek} disabled={busy}><Copy size={15} />Vorige week kopiëren</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline">PDF <ChevronDown size={15} /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={downloadOverzicht}>Weekplanning (overzicht)</DropdownMenuItem>
                <DropdownMenuItem onSelect={downloadPersoneel}>Persoonlijke planning per monteur</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {conceptModus && (
              <>
                <span className="wp-divider" />
                <span className={`wp-status-chip ${conceptAantal ? "is-concept" : ""}`}><i />{conceptAantal ? `${conceptAantal} ${conceptAantal === 1 ? "wijziging" : "wijzigingen"} in concept` : "Alles gepubliceerd"}</span>
                <Button className="wp-btn-primary" disabled={conceptAantal === 0 || busy} onClick={() => setPublishOpen(true)}>Publiceren…</Button>
              </>
            )}
          </div>
        </header>

        <div className="wp-controls">
          <div className="wp-segmented" aria-label="Weergave">
            {(["grid", "klus"] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{v === "grid" ? "Overzicht" : "Per klus"}</button>)}
          </div>
          <div className="wp-segmented" aria-label="Aantal weken">
            {([1, 2, 4] as const).map((n) => <button key={n} type="button" aria-pressed={weeksCount === n} onClick={() => setWeeksCount(n)}>{n} {n === 1 ? "week" : "weken"}</button>)}
          </div>
          <select className="wp-select" aria-label="Groeperen" value={groepMode} onChange={(e) => setGroepMode(e.target.value as GroepMode)}>
            <option value="geen">Groeperen: geen</option>
            <option value="rol">Groeperen: rol</option>
            <option value="ploeg">Groeperen: ploeg</option>
          </select>
          <select className="wp-select" aria-label="Toon" value={toonMode} onChange={(e) => setToonMode(e.target.value as ToonMode)}>
            <option value="iedereen">Toon: iedereen</option>
            <option value="monteurs">Toon: monteurs</option>
            <option value="leerlingen">Toon: leerlingen</option>
          </select>
          {vrijFilter && (
            <button type="button" className="wp-chip" aria-pressed onClick={() => setVrijFilter(null)}>
              Alleen vrij op {format(new Date(`${vrijFilter}T12:00:00`), "EEE d MMM", { locale: nl })} ×
            </button>
          )}
          {weekProjectIds.length > 0 && (
            <>
              <span className="wp-filter-label">Project</span>
              <div className="wp-chips">
                <button type="button" className="wp-chip" aria-pressed={filterProject === null} onClick={() => setFilterProject(null)}>Alle projecten</button>
                {weekProjectIds.map((id) => {
                  const p = projMap.get(id);
                  if (!p) return null;
                  return (
                    <button key={id} type="button" className="wp-chip" title={`${p.nummer} · ${p.naam}`} aria-pressed={filterProject === id}
                      onClick={() => { setFilterProject((cur) => (cur === id ? null : id)); setBarProject(id); }}>
                      <i style={{ background: projectKleur(id, weekProjectIds).color }} /><span>{p.naam || p.nummer}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <span className="wp-controls-spacer" />
          {aandachtAantallen.dubbel > 0 && (
            <button type="button" className="wp-chip wp-chip-attn" aria-pressed={aandachtFilter === "dubbel"} onClick={() => setAandachtFilter((f) => (f === "dubbel" ? null : "dubbel"))}>{aandachtAantallen.dubbel} dubbel geboekt</button>
          )}
          {aandachtAantallen.weekgrens > 0 && (
            <button type="button" className="wp-chip wp-chip-attn" aria-pressed={aandachtFilter === "weekgrens"} onClick={() => setAandachtFilter((f) => (f === "weekgrens" ? null : "weekgrens"))}>{aandachtAantallen.weekgrens} boven {weekgrens} u</button>
          )}
          {aandachtAantallen.leeg > 0 && (
            <button type="button" className="wp-chip wp-chip-attn" aria-pressed={aandachtFilter === "leeg"} onClick={() => setAandachtFilter((f) => (f === "leeg" ? null : "leeg"))}>{aandachtAantallen.leeg} lege werkdagen</button>
          )}
          {aandachtAantallen.afwijkend > 0 && (
            <button type="button" className="wp-chip wp-chip-attn" aria-pressed={aandachtFilter === "afwijkend"} onClick={() => setAandachtFilter((f) => (f === "afwijkend" ? null : "afwijkend"))}>{aandachtAantallen.afwijkend} afwijkend geboekt</button>
          )}
        </div>

        <main className="wp-body">
          {clipboard.length > 0 && <div className="wp-clipboard"><Copy size={14} /><span>Gekopieerd: {clipboard.length} dagen · klik een dag en druk Ctrl+V (ook in een andere week)</span><Button variant="ghost" size="icon" aria-label="Kopie wissen" onClick={() => setClipboard([])}><X size={15} /></Button></div>}
          {loading ? <Spinner padding="py-16" /> : view === "klus" ? (
            <PerKlusWeergave cellen={celLijst} weekDates={weekDates} projects={projects} medewerkers={medewerkers} weekProjectIds={weekProjectIds} filterProject={filterProject} onVrijOpDag={(datum) => { setView("grid"); setVrijFilter(datum); }} />
          ) : (
            <>
              <div className="wp-grid-scroll" style={{ overflowX: "auto" }}>
              <div className="wp-grid" role="grid" aria-label={`Weekplanning week ${weekNumber}`} style={{ gridTemplateColumns: `240px repeat(${5 * weeksCount}, minmax(${compact ? 76 : 120}px, 1fr)) 96px`, minWidth: 240 + 5 * weeksCount * (compact ? 76 : 120) + 96 }}>
                <div className="wp-head" role="columnheader">Medewerker</div>
                {weekDates.map((d, i) => {
                  const datum = datums[i];
                  const isWeekStart = i % 5 === 0;
                  const vrij = dagVrij[i];
                  const wijzig = dagWijzig[i];
                  return (
                    <div key={datum} role="columnheader" className={`wp-head ${datum === vandaag ? "is-today" : ""} ${isWeekStart && i > 0 ? "wp-weeksep" : ""}`}>
                      {isWeekStart && <span className="wp-wk-label">WK {getISOWeek(d)}</span>}
                      <span>{DAG_KORT[i % 5]}</span><strong>{format(d, "d MMM", { locale: nl })}</strong>
                      {!compact && (
                        <div className="wp-head-pills">
                          {vrij.length > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" className="wp-pill" aria-pressed={vrijFilter === datum} onClick={() => setVrijFilter((cur) => (cur === datum ? null : datum))}>{vrij.length} vrij</button>
                              </TooltipTrigger>
                              <TooltipContent>{vrij.map((m) => m.full_name).join(", ")}</TooltipContent>
                            </Tooltip>
                          )}
                          {wijzig > 0 && <span className="wp-pill wp-pill-blue">{wijzig} wijzigingen</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="wp-head is-total" role="columnheader">Totaal</div>

                {groepen.map((g) => (
                  <div className="contents" key={g.label || "__all"}>
                    {g.label && <div className="wp-group-head" role="row">{g.label.toUpperCase()} · {g.rows.length}</div>}
                    {g.rows.map((med) => {
                      const r = rowIndexOf.get(med.id) ?? 0;
                      const rolTekst = rolLabel(med.role);
                      const partners = med.planning_partner_ids.map((p) => medMap.get(p)?.full_name).filter((n): n is string => !!n).map(korteNaam);
                      const vrijDagen = med.vaste_vrije_dagen.filter((d) => d >= 1 && d <= 5).map((d) => DAG_KORT[d - 1].toLowerCase());
                      const sub = [rolTekst, partners.length ? `Vaste ploeg met ${partners.join(", ")}` : null, vrijDagen.length ? `Vrij op ${vrijDagen.join(", ")}` : null].filter(Boolean).join(" · ");
                      const telt = datums.map((d) => cellen.get(celKey(med.id, d))).filter(celTelt);
                      const uren = telt.reduce((s, c) => s + berekenUren(c.starttijd, c.eindtijd), 0);
                      const over = overgepland.has(med.id);
                      const gl = gelezen?.get(med.id);
                      const ongelezen = gl?.laatst_gepubliceerd_op && (!gl.gelezen_op || gl.gelezen_op < gl.laatst_gepubliceerd_op);
                      const overGrens = bovenWeekgrens(med.id);
                      const legeDagenAantal = datums.filter((d) => isLeeg(med, d)).length;
                      const totaal = (
                        <div className={`wp-total ${over ? "is-over" : ""}`} role="gridcell">
                          <strong>{formatUren(uren)}</strong><small>{telt.length} {telt.length === 1 ? "dag" : "dagen"}</small>
                          {overGrens && <small className="wp-total-grens">boven {weekgrens} u</small>}
                          {legeDagenAantal > 0 && <small className="wp-total-leeg">{legeDagenAantal} {legeDagenAantal === 1 ? "dag" : "dagen"} leeg</small>}
                        </div>
                      );
                      return (
                        <div className="contents" role="row" key={med.id} style={med.niet_planbaar ? { opacity: 0.55 } : undefined}>
                          <div className="wp-name" role="rowheader">
                            <span className="wp-avatar" aria-hidden="true">{initialen(med.full_name)}</span>
                            <span className="min-w-0">
                              <strong title={med.full_name}>{med.full_name}</strong>
                              {med.niet_planbaar && <small style={{ color: "var(--text-muted)" }}>niet planbaar</small>}
                              {sub && <small title={sub}>{sub}</small>}
                              {gl?.laatst_gepubliceerd_op && (ongelezen ? (
                                <button type="button" className="wp-gelezen is-ongelezen" onClick={() => void herinnerGelezen(med)}>● Nieuwe planning nog niet geopend</button>
                              ) : (
                                <span className="wp-gelezen is-gelezen">✓ Gelezen {gl.gelezen_op ? format(new Date(gl.gelezen_op), "EEE HH:mm", { locale: nl }) : ""}</span>
                              ))}
                            </span>
                          </div>
                          {datums.map((_, c) => renderCel(med, r, c))}
                          {over ? <Tooltip><TooltipTrigger asChild>{totaal}</TooltipTrigger><TooltipContent>Meer dan 5 dagen ingepland deze week</TooltipContent></Tooltip> : totaal}
                        </div>
                      );
                    })}
                  </div>
                ))}

                <div className="wp-foot"><strong>Dagtotaal</strong></div>
                {dagTotalen.map((d, i) => (
                  <div key={datums[i]} className="wp-foot"><span>{d.aantal} {d.aantal === 1 ? "monteur" : "monteurs"}</span><strong>{formatUren(d.uren)}</strong></div>
                ))}
                <div className="wp-foot is-total"><span>Week</span><strong>{formatUren(weekTotaal)}</strong></div>
              </div>
              </div>

              <div className="wp-legend">
                <span>Sleep een ingevulde dag om te verplaatsen (Alt = kopiëren) · Shift+klik voegt dagen toe · Ctrl+C / Ctrl+V · pijltjes + Enter · Delete</span>
                <span className="flex-1" />
                {conceptModus && <span><i style={{ boxShadow: "inset 0 0 0 1.5px var(--wp-concept-dot)", background: "var(--bg-surface)" }} />Concept</span>}
                <span><i style={{ boxShadow: "inset 0 0 0 2px var(--danger)", background: "var(--bg-surface)" }} />Conflict</span>
                <span><i style={{ background: "repeating-linear-gradient(135deg, var(--wp-verlof-a) 0 3px, var(--wp-verlof-b) 3px 6px)" }} />Verlof</span>
                <span><i style={{ background: "var(--wp-vrij-bg)" }} />Vaste vrije dag</span>
                <span><Lock size={13} aria-hidden="true" />Planner-koppeling</span>
                <span><i style={{ background: "rgba(16,185,129,.55)" }} />Geboekt gelijk aan gepland</span>
                <span><i style={{ background: "var(--wp-boek-afwijkend)" }} />Afwijkend geboekt</span>
                <span><i style={{ background: "var(--wp-boek-niet)" }} />Nog niet geboekt</span>
                <span><i style={{ background: "var(--wp-leeg-bg)", boxShadow: "inset 0 0 0 1.5px var(--wp-leeg-border)" }} />Lege werkdag (filter actief)</span>
              </div>
            </>
          )}
        </main>
      </div>

      {drag?.moving && (drag.r0 !== drag.r1 || drag.c0 !== drag.c1) && <div className="wp-drag-pill">{drag.copy ? "Kopiëren" : "Verplaatsen"}: {copyDays(drag.sources ?? new Set(), rijen, datums, cellen).length} dagen → {format(weekDates[drag.c1], "EEE d MMM", { locale: nl })} · {rijen[drag.r1]?.full_name} · Houd Alt ingedrukt om te kopiëren</div>}
      {repeatOpen && <HerhaalDialoog open onClose={() => setRepeatOpen(false)} projects={projects} initialProject={selCellen.map((p) => cellen.get(celKey(p.medId, p.datum))).find(celTelt)?.project_id ?? barProject ?? leesRecent()[0] ?? null} initialDays={[...new Set(selCellen.map((p) => datums.indexOf(p.datum)))].filter((d) => d >= 0)} start={weekStart} busy={busy} onPreview={repeatCheck} onConfirm={repeat} />}
      {!dragging && !panelKey && selCellen.length > 0 && (
        <ActieBalk
          key={selKeyStr}
          medewerkers={medewerkers}
          selCellen={selCellen}
          weekDates={weekDates}
          cellen={cellen}
          beschikbaarheid={beschikbaarheid}
          projects={projects}
          weekProjectIds={weekProjectIds}
          projectId={barProject}
          busy={busy}
          conceptModus={conceptModus}
          weekgrens={weekgrens}
          weekChunks={weekChunks}
          weekUrenPerChunk={weekUrenPerChunk}
          onProjectChange={setBarProject}
          onPlan={plan}
          onVerwijder={verwijderSel}
          onWijzig={wijzigSel}
          onBeschikbaarheid={zetBeschikbaarheid}
          onRepeat={() => setRepeatOpen(true)}
          detacheringen={detacheringen}
          onDetacheringVullen={planDetachering}
          enterProjectId={barProject ?? leesRecent()[0] ?? null}
          onClose={wisSel}
        />
      )}

      {panelCel && panelMed && (
        <BewerkPaneel
          key={panelKey ?? "panel"}
          cel={panelCel}
          naam={panelMed.full_name}
          weekNumber={weekNumber}
          projects={projects}
          weekProjectIds={weekProjectIds}
          afwezigheid={bepaalAfwezigheid(panelMed, panelCel.datum, beschikbaarheid)}
          ploegGrootte={ploegVan(panelCel).length}
          conceptModus={conceptModus}
          busy={busy}
          onSave={bewaar}
          onDelete={verwijder}
          onRevert={terugdraaien}
          onClose={() => setPanelKey(null)}
        />
      )}

      <PubliceerDialoog
        open={publishOpen}
        weekNumber={weekNumber}
        tellers={tellers}
        namen={geraakteNamen}
        conflicten={alleConflicten}
        busy={busy}
        onOpenChange={setPublishOpen}
        onConfirm={publiceer}
      />
    </>
  );
}

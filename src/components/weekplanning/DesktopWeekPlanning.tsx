import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { addDays, addWeeks, format, getISOWeek, isSameDay, startOfISOWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { ChevronDown, ChevronLeft, ChevronRight, Copy, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { useNavBadges } from "@/hooks/useNavBadges";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/Spinner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { generatePersoneelsPdf, generatePlanningPdf } from "@/lib/planningPdf";
import { formatUren, formatUrenGetal } from "@/lib/formatting";
import { useWeekPlanningData } from "@/hooks/useWeekPlanningData";
import {
  actieVoorBewerken, actieVoorVerwijderen, bepaalAfwezigheid, bepaalDoelen, berekenUren, bouwCellen, bouwNieuwConcepten,
  celBezet, celKey, celTelt, parseWeekParam, telConcepten, type Cel, type PlanWaarden,
} from "@/lib/weekPlanning";
import { ActieBalk } from "./ActieBalk";
import { BewerkPaneel } from "./BewerkPaneel";
import { PubliceerDialoog } from "./PubliceerDialoog";
import { PerKlusWeergave } from "./PerKlusWeergave";
import { bewaarRecent, DAG_KORT, initialen, korteNaam, projectKleur, rolLabel } from "./wpUtils";

type ConceptInsert = TablesInsert<"planning_concept">;
type PlanningInsert = TablesInsert<"planning">;
interface Sel { r0: number; c0: number; r1: number; c1: number }

const AFW_CEL: Record<string, string> = { verlof: "Verlof", ziek: "Ziek", vrij: "Vaste vrije dag" };

export default function DesktopWeekPlanning() {
  const { badges } = useNavBadges();
  const { profile, profileId } = useProfile();
  const [searchParams] = useSearchParams();
  const urlProject = searchParams.get("project");
  const [weekStart, setWeekStart] = useState(() => parseWeekParam(searchParams.get("week")) ?? startOfISOWeek(new Date()));
  const { planning, concepten, medewerkers, projects, beschikbaarheid, conceptModus, loading, refetch } = useWeekPlanningData(weekStart);

  const [view, setView] = useState<"grid" | "klus">("grid");
  const [filterProject, setFilterProject] = useState<string | null>(urlProject);
  const [barProject, setBarProject] = useState<string | null>(urlProject);
  const [tijd, setTijd] = useState<[string, string]>(["07:00", "16:00"]);
  const [sel, setSel] = useState<Sel | null>(null);
  const [dragging, setDragging] = useState(false);
  const [panelKey, setPanelKey] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const selRef = useRef<Sel | null>(null);
  selRef.current = sel;

  const weekNumber = getISOWeek(weekStart);
  const weekDates = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const datums = useMemo(() => weekDates.map((d) => format(d, "yyyy-MM-dd")), [weekDates]);
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

  const rijen = useMemo(() => [...medewerkers].sort((a, b) => {
    const ah = datums.some((d) => celBezet(cellen.get(celKey(a.id, d))));
    const bh = datums.some((d) => celBezet(cellen.get(celKey(b.id, d))));
    if (ah !== bh) return ah ? -1 : 1;
    return a.full_name.localeCompare(b.full_name, "nl", { sensitivity: "base" });
  }), [medewerkers, cellen, datums]);

  // Overplanning (bestaande regel: meer dan 5 unieke dagen per week), inclusief concepten
  const overgepland = useMemo(() => {
    const tel = new Map<string, Set<string>>();
    celLijst.filter(celTelt).forEach((c) => {
      const s = tel.get(c.medewerker_id) ?? new Set<string>();
      s.add(c.datum); tel.set(c.medewerker_id, s);
    });
    return new Set(Array.from(tel.entries()).filter(([, s]) => s.size > 5).map(([id]) => id));
  }, [celLijst]);

  const conflictTekst = useCallback((cel: Cel | undefined) => {
    if (!celTelt(cel)) return null;
    const afw = bepaalAfwezigheid(medMap.get(cel.medewerker_id), cel.datum, beschikbaarheid);
    if (!afw) return null;
    return `${medMap.get(cel.medewerker_id)?.full_name ?? "Medewerker"}: ${AFW_CEL[afw]} maar wel ingepland op ${projMap.get(cel.project_id ?? "")?.naam ?? "een project"}`;
  }, [medMap, projMap, beschikbaarheid]);

  const alleConflicten = useMemo(() => celLijst.map(conflictTekst).filter((x): x is string => !!x), [celLijst, conflictTekst]);
  const tellers = telConcepten(concepten);
  const conceptAantal = concepten.length;
  const geraakteNamen = Array.from(new Set(concepten.map((c) => c.medewerker_id))).map((id) => korteNaam(medMap.get(id)?.full_name ?? "?"));
  const ingeplandAantal = new Set(celLijst.filter(celTelt).map((c) => c.medewerker_id)).size;

  // ── Selectie ──
  const norm = sel ? { rmin: Math.min(sel.r0, sel.r1), rmax: Math.max(sel.r0, sel.r1), cmin: Math.min(sel.c0, sel.c1), cmax: Math.max(sel.c0, sel.c1) } : null;
  const selMedIds = norm ? rijen.slice(norm.rmin, norm.rmax + 1).map((m) => m.id) : [];
  const selColumns = norm ? Array.from({ length: norm.cmax - norm.cmin + 1 }, (_, i) => norm.cmin + i) : [];
  const inSel = (r: number, c: number) => !!norm && r >= norm.rmin && r <= norm.rmax && c >= norm.cmin && c <= norm.cmax;

  useEffect(() => {
    if (!dragging) return;
    const up = () => {
      setDragging(false);
      const s = selRef.current;
      if (s && s.r0 === s.r1 && s.c0 === s.c1) {
        const med = rijen[s.r0];
        const key = celKey(med.id, datums[s.c0]);
        if (celBezet(cellen.get(key))) { setPanelKey(key); setSel(null); }
      }
    };
    document.addEventListener("mouseup", up);
    return () => document.removeEventListener("mouseup", up);
  }, [dragging, rijen, datums, cellen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !panelKey) setSel(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [panelKey]);

  useEffect(() => { setSel(null); setPanelKey(null); }, [weekStart]);

  // ── Schrijfacties ──
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (err) { console.error(err); toast.error("Er ging iets mis. Probeer opnieuw."); } finally { setBusy(false); refetch(); }
  };

  /** Project met fase "nieuw" gaat naar "gepland" zodra er een concept of planning voor bestaat. */
  const markeerGepland = async (projectIds: string[]) => {
    const ids = Array.from(new Set(projectIds));
    if (!ids.length || !profileId) return;
    await supabase.from("projects").update({ status: "gepland", status_gewijzigd_op: new Date().toISOString(), status_gewijzigd_door: profileId })
      .in("id", ids).eq("status", "nieuw");
  };

  /** Directe modus: inplannen zet het project op definitief, zodat monteurs uren kunnen boeken. */
  const markeerDefinitief = async (projectIds: (string | null | undefined)[]) => {
    const ids = Array.from(new Set(projectIds.filter((x): x is string => !!x)));
    if (!ids.length || !profileId) return;
    const nu = new Date().toISOString();
    const { error } = await supabase.from("project_planning_status").upsert(
      ids.map((project_id) => ({ project_id, is_definitief: true, definitief_op: nu, definitief_door: profileId })),
      { onConflict: "project_id" },
    );
    if (error) throw error;
  };

  const plan = (medIds: string[], doelDatums: string[], notitie: string) => run(async () => {
    if (!profileId || !barProject) return;
    const { doelen, overgeslagen } = bepaalDoelen(medIds, doelDatums, cellen, medewerkers, beschikbaarheid);
    if (doelen.length === 0) { toast.error("Niets ingepland: alle dagen zijn bezet of niet beschikbaar."); return; }
    const waarden: PlanWaarden = { project_id: barProject, starttijd: tijd[0], eindtijd: tijd[1], notitie };
    const rows = bouwNieuwConcepten(doelen, waarden, profileId);
    const projectNaam = projMap.get(barProject)?.naam ?? "project";
    let ids: string[] = [];
    if (conceptModus) {
      const { data, error } = await supabase.from("planning_concept").insert(rows as ConceptInsert[]).select("id");
      if (error) throw error;
      ids = (data ?? []).map((r) => r.id);
    } else {
      const direct: PlanningInsert[] = rows.map(({ actie: _a, planning_id: _p, ...r }) => r);
      const { data, error } = await supabase.from("planning").insert(direct).select("id");
      if (error) throw error;
      ids = (data ?? []).map((r) => r.id);
    }
    bewaarRecent(barProject);
    await markeerGepland([barProject]);
    setSel(null);
    const tabel = conceptModus ? "planning_concept" : "planning";
    toast.success(`${ids.length} ${ids.length === 1 ? "dag" : "dagen"} ingepland op ${projectNaam}${conceptModus ? " (concept)" : ""}`, {
      action: { label: "Ongedaan maken", onClick: async () => { await supabase.from(tabel).delete().in("id", ids); refetch(); } },
    });
    if (overgeslagen.length > 0) toast.info(`${overgeslagen.length} ${overgeslagen.length === 1 ? "dag" : "dagen"} overgeslagen (verlof, vrij of al ingepland)`);
  });

  /** Voert verwijder-acties uit voor een set cellen. */
  const verwijderCellen = async (doel: Cel[]) => {
    let beschermd = 0;
    if (!conceptModus) {
      const ids = doel.filter((c) => c.planning && !c.beschermd && c.status === "pub").map((c) => c.planning!.id);
      beschermd = doel.filter((c) => c.beschermd).length;
      if (ids.length) { const { error } = await supabase.from("planning").delete().in("id", ids); if (error) throw error; }
      return { aantal: ids.length, beschermd };
    }
    const deleteIds: string[] = [];
    const upserts: ConceptInsert[] = [];
    doel.forEach((c) => {
      const a = actieVoorVerwijderen(c, profileId!);
      if (a.type === "delete-concept") deleteIds.push(a.id);
      else if (a.type === "upsert") upserts.push(a.rij as ConceptInsert);
      else if (a.type === "beschermd") beschermd++;
    });
    if (deleteIds.length) { const { error } = await supabase.from("planning_concept").delete().in("id", deleteIds); if (error) throw error; }
    if (upserts.length) { const { error } = await supabase.from("planning_concept").upsert(upserts, { onConflict: "medewerker_id,datum" }); if (error) throw error; }
    return { aantal: deleteIds.length + upserts.length, beschermd };
  };

  const leegmaken = () => run(async () => {
    const doel = selMedIds.flatMap((m) => selColumns.map((c) => cellen.get(celKey(m, datums[c])))).filter((c): c is Cel => celBezet(c));
    const { aantal, beschermd } = await verwijderCellen(doel);
    setSel(null);
    toast.success(`${aantal} ${aantal === 1 ? "dag" : "dagen"} leeggemaakt${conceptModus ? " (concept)" : ""}`);
    if (beschermd) toast.warning(`${beschermd} ${beschermd === 1 ? "dag komt" : "dagen komen"} uit de Planner-koppeling en ${beschermd === 1 ? "is" : "zijn"} niet aangepast`);
  });

  const ploegVan = (cel: Cel) => cel.planning_group_id
    ? celLijst.filter((c) => c.planning_group_id === cel.planning_group_id && c.datum === cel.datum && c.status !== "verwijderd")
    : [cel];

  const panelCel = panelKey ? cellen.get(panelKey) : undefined;

  const bewaar = (waarden: PlanWaarden, helePloeg: boolean) => run(async () => {
    if (!panelCel || !profileId) return;
    const doel = helePloeg ? ploegVan(panelCel) : [panelCel];
    let beschermd = 0;
    if (!conceptModus) {
      const ids = doel.filter((c) => c.planning && !c.beschermd).map((c) => c.planning!.id);
      beschermd = doel.length - ids.length;
      if (ids.length) { const { error } = await supabase.from("planning").update(waarden).in("id", ids); if (error) throw error; }
    } else {
      for (const c of doel) {
        const a = actieVoorBewerken(c, waarden, profileId);
        if (a.type === "update-concept") { const { error } = await supabase.from("planning_concept").update(a.patch).eq("id", a.id); if (error) throw error; }
        else if (a.type === "upsert") { const { error } = await supabase.from("planning_concept").upsert(a.rij as ConceptInsert, { onConflict: "medewerker_id,datum" }); if (error) throw error; }
        else if (a.type === "beschermd") beschermd++;
      }
    }
    bewaarRecent(waarden.project_id);
    setPanelKey(null);
    toast.success(`${doel.length > 1 ? "Planning bijgewerkt voor hele ploeg" : "Planning bijgewerkt"}${conceptModus ? " (concept)" : ""}`);
    if (beschermd) toast.warning("Dagen uit de Planner-koppeling zijn niet aangepast");
  });

  const verwijder = (helePloeg: boolean) => run(async () => {
    if (!panelCel) return;
    const { beschermd } = await verwijderCellen(helePloeg ? ploegVan(panelCel) : [panelCel]);
    setPanelKey(null);
    toast.success(conceptModus ? "Verwijderd (concept)" : "Verwijderd");
    if (beschermd) toast.warning("Dagen uit de Planner-koppeling zijn niet verwijderd");
  });

  const terugdraaien = () => run(async () => {
    if (!panelCel?.concept) return;
    const { error } = await supabase.from("planning_concept").delete().eq("id", panelCel.concept.id);
    if (error) throw error;
    setPanelKey(null);
    toast.success("Concept teruggedraaid");
  });

  const kopieerVorigeWeek = () => run(async () => {
    if (!profileId) return;
    const vorige = addWeeks(weekStart, -1);
    const { data, error } = await supabase.from("planning")
      .select("medewerker_id, project_id, datum, starttijd, eindtijd, notitie, activiteit, activiteit_kleur, collega_ids, planning_group_id")
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
      }];
    });
    if (rows.length) {
      const { error: insErr } = conceptModus
        ? await supabase.from("planning_concept").insert(rows.map((r) => ({ ...r, actie: "nieuw" as const })))
        : await supabase.from("planning").insert(rows);
      if (insErr) throw insErr;
      await markeerGepland(rows.map((r) => r.project_id));
    }
    toast.success(`${rows.length} ${rows.length === 1 ? "dag" : "dagen"} gekopieerd uit week ${getISOWeek(vorige)}${conceptModus ? " (concept)" : ""}${overgeslagen ? ` · ${overgeslagen} overgeslagen` : ""}`);
  });

  const publiceer = () => run(async () => {
    const { data, error } = await supabase.rpc("publiceer_planning", { p_van: datums[0], p_tot: datums[4] });
    if (error) throw error;
    const res = (data ?? {}) as { nieuw?: number; gewijzigd?: number; verwijderd?: number; overgeslagen?: Array<{ medewerker_id: string; datum: string; reden: string }>; medewerker_ids?: string[] };
    setPublishOpen(false);
    const n = res.medewerker_ids?.length ?? 0;
    toast.success(`Week ${weekNumber} gepubliceerd — ${n} ${n === 1 ? "monteur ziet" : "monteurs zien"} de wijzigingen`);
    if (res.overgeslagen?.length) {
      toast.warning(`Overgeslagen: ${res.overgeslagen.map((o) => `${korteNaam(medMap.get(o.medewerker_id)?.full_name ?? "?")} ${format(new Date(`${o.datum}T12:00:00`), "EEEEEE d/M", { locale: nl })}${o.reden === "planner_beschermd" ? " (Planner-koppeling)" : ""}`).join(", ")}`);
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
  const dagTotalen = datums.map((d) => {
    const c = celLijst.filter((x) => x.datum === d && celTelt(x));
    return { aantal: new Set(c.map((x) => x.medewerker_id)).size, uren: c.reduce((s, x) => s + berekenUren(x.starttijd, x.eindtijd), 0) };
  });
  const weekTotaal = dagTotalen.reduce((s, d) => s + d.uren, 0);

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
    if (filterProject && gevuld && cel?.project_id !== filterProject) cls.push("is-dimmed");
    const uren = cel ? berekenUren(cel.starttijd, cel.eindtijd) : 0;
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
        onMouseDown={(e) => { if (e.button !== 0) return; e.preventDefault(); setPanelKey(null); setSel({ r0: r, c0: c, r1: r, c1: c }); setDragging(true); }}
        onMouseEnter={() => { if (dragging) setSel((s) => (s ? { ...s, r1: r, c1: c } : s)); }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          if (gevuld) setPanelKey(celKey(med.id, datum)); else setSel({ r0: r, c0: c, r1: r, c1: c });
        }}
      >
        {gevuld && cel ? (
          <>
            <div className="wp-cell-title"><i /><span>{proj?.naam || proj?.nummer || "Onbekend project"}</span></div>
            <div className="wp-cell-meta">{formatUrenGetal(uren)} u · {cel.starttijd}–{cel.eindtijd}{cel.notitie ? " · ✎" : ""}</div>
            {conflict ? <span className="wp-conflict-dot" aria-hidden="true">!</span>
              : cel.status !== "pub" && <span className="wp-cell-tag">{cel.status === "gewijzigd" ? "gewijzigd" : cel.status}</span>}
            {cel.beschermd && <Lock className="wp-cell-lock" aria-label="Planner-koppeling" />}
          </>
        ) : afw ? <span className="wp-afw-label">{AFW_CEL[afw]}</span> : null}
      </div>
    );
    if (!conflict) return inhoud;
    return <Tooltip key={datum}><TooltipTrigger asChild>{inhoud}</TooltipTrigger><TooltipContent>{conflict}</TooltipContent></Tooltip>;
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
              <p>{format(weekStart, "d MMM", { locale: nl })} – {format(addDays(weekStart, 4), "d MMM", { locale: nl })} · {ingeplandAantal} van {medewerkers.length} ingepland</p>
            </div>
            <button type="button" className="wp-icon-btn" aria-label="Volgende week" onClick={() => setWeekStart((w) => addWeeks(w, 1))}><ChevronRight size={18} /></button>
            {!isHuidigeWeek && <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfISOWeek(new Date()))}>Deze week</Button>}
          </div>
          <div className="wp-header-actions">
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
        </div>

        <main className="wp-body">
          {loading ? <Spinner padding="py-16" /> : view === "klus" ? (
            <PerKlusWeergave cellen={celLijst} weekDates={weekDates} projects={projects} medewerkers={medewerkers} weekProjectIds={weekProjectIds} filterProject={filterProject} />
          ) : (
            <>
              <div className="wp-grid" role="grid" aria-label={`Weekplanning week ${weekNumber}`}>
                <div className="wp-head" role="columnheader">Medewerker</div>
                {weekDates.map((d, i) => (
                  <div key={datums[i]} role="columnheader" className={`wp-head ${datums[i] === vandaag ? "is-today" : ""}`}>
                    <span>{DAG_KORT[i]}</span><strong>{format(d, "d MMM", { locale: nl })}</strong>
                  </div>
                ))}
                <div className="wp-head is-total" role="columnheader">Totaal</div>

                {rijen.map((med, r) => {
                  const rolTekst = rolLabel(med.role);
                  const partners = med.planning_partner_ids.map((p) => medMap.get(p)?.full_name).filter(Boolean).map((n) => korteNaam(n!));
                  const vrij = med.vaste_vrije_dagen.filter((d) => d >= 1 && d <= 5).map((d) => DAG_KORT[d - 1].toLowerCase());
                  const sub = [rolTekst, partners.length ? `Vaste ploeg met ${partners.join(", ")}` : null, vrij.length ? `Vrij op ${vrij.join(", ")}` : null].filter(Boolean).join(" · ");
                  const telt = datums.map((d) => cellen.get(celKey(med.id, d))).filter(celTelt);
                  const uren = telt.reduce((s, c) => s + berekenUren(c.starttijd, c.eindtijd), 0);
                  const over = overgepland.has(med.id);
                  const totaal = (
                    <div className={`wp-total ${over ? "is-over" : ""}`} role="gridcell">
                      <strong>{formatUren(uren)}</strong><small>{telt.length} {telt.length === 1 ? "dag" : "dagen"}</small>
                    </div>
                  );
                  return (
                    <div className="contents" role="row" key={med.id}>
                      <div className="wp-name" role="rowheader">
                        <span className="wp-avatar" aria-hidden="true">{initialen(med.full_name)}</span>
                        <span className="min-w-0"><strong title={med.full_name}>{med.full_name}</strong>{sub && <small title={sub}>{sub}</small>}</span>
                      </div>
                      {datums.map((_, c) => renderCel(med, r, c))}
                      {over ? <Tooltip><TooltipTrigger asChild>{totaal}</TooltipTrigger><TooltipContent>Meer dan 5 dagen ingepland deze week</TooltipContent></Tooltip> : totaal}
                    </div>
                  );
                })}

                <div className="wp-foot"><strong>Dagtotaal</strong></div>
                {dagTotalen.map((d, i) => (
                  <div key={datums[i]} className="wp-foot"><span>{d.aantal} {d.aantal === 1 ? "monteur" : "monteurs"}</span><strong>{formatUren(d.uren)}</strong></div>
                ))}
                <div className="wp-foot is-total"><span>Week</span><strong>{formatUren(weekTotaal)}</strong></div>
              </div>

              <div className="wp-legend">
                <span>Sleep over dagen en medewerkers om te selecteren · klik op een ingevulde dag om te bewerken</span>
                <span className="flex-1" />
                {conceptModus && <span><i style={{ boxShadow: "inset 0 0 0 1.5px var(--wp-concept-dot)", background: "var(--bg-surface)" }} />Concept</span>}
                <span><i style={{ boxShadow: "inset 0 0 0 2px var(--danger)", background: "var(--bg-surface)" }} />Conflict</span>
                <span><i style={{ background: "repeating-linear-gradient(135deg, var(--wp-verlof-a) 0 3px, var(--wp-verlof-b) 3px 6px)" }} />Verlof</span>
                <span><i style={{ background: "var(--wp-vrij-bg)" }} />Vaste vrije dag</span>
                <span><Lock size={13} aria-hidden="true" />Planner-koppeling</span>
              </div>
            </>
          )}
        </main>
      </div>

      {sel && !dragging && !panelKey && selMedIds.length > 0 && (
        <ActieBalk
          key={`${selMedIds.join(",")}|${selColumns.join(",")}`}
          medewerkers={medewerkers}
          selMedIds={selMedIds}
          selColumns={selColumns}
          weekDates={weekDates}
          cellen={cellen}
          beschikbaarheid={beschikbaarheid}
          projects={projects}
          weekProjectIds={weekProjectIds}
          projectId={barProject}
          tijd={tijd}
          busy={busy}
          conceptModus={conceptModus}
          onProjectChange={setBarProject}
          onTijdChange={setTijd}
          onPlan={plan}
          onClear={leegmaken}
          onClose={() => setSel(null)}
        />
      )}

      {panelCel && panelMed && (
        <BewerkPaneel
          key={panelKey!}
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

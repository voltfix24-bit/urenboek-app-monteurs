import { useState, useEffect, useCallback, useMemo } from "react";
import { MobileHeader } from "@/components/MobileHeader";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { PullToRefresh } from "@/components/PullToRefresh";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { AlertTriangle, ChevronLeft, ChevronRight, Copy, Download, FileDown, Plus } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { format, startOfISOWeek, addDays, addWeeks, getISOWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { generatePlanningPdf, generatePersoneelsPdf } from "@/lib/planningPdf";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TeamPlanningGrid } from "@/components/TeamPlanningGrid";
import { PlanningDialog } from "@/components/PlanningDialog";

interface PlanningEntry { id: string; medewerker_id: string; project_id: string; datum: string; starttijd: string; eindtijd: string; notitie: string; activiteit: string | null; activiteit_kleur: string | null; planning_group_id: string | null; }
interface MedewerkerInfo { id: string; full_name: string; vaste_vrije_dagen: number[]; planning_partner_ids: string[]; role?: string | null; }
interface ProjectInfo { id: string; naam: string; nummer: string; straat?: string | null; postcode?: string | null; stad?: string | null; adres?: string | null; }
interface BeschikbaarheidItem { medewerker_id: string; datum_van: string; datum_tot: string; type: string; status: string; }

const DAG_MAP = [1, 2, 3, 4, 5];

function getConflicts(medId: string, dateStr: string, dayIndex: number, entries: PlanningEntry[], medewerkers: MedewerkerInfo[], beschikbaarheid: BeschikbaarheidItem[], currentEditId: string | null, weekDateStrings?: string[]): string[] {
  const conflicts: string[] = [];
  const med = medewerkers.find(m => m.id === medId);
  const jsDayNum = DAG_MAP[dayIndex];
  if (med?.vaste_vrije_dagen?.includes(jsDayNum)) conflicts.push("Vaste vrije dag");
  const dubbel = entries.filter(e => e.medewerker_id === medId && e.datum === dateStr && e.id !== currentEditId);
  if (dubbel.length > 0) conflicts.push("Al ingepland");
  const verlof = beschikbaarheid.find(b => b.medewerker_id === medId && b.status === "goedgekeurd" && dateStr >= b.datum_van && dateStr <= b.datum_tot);
  if (verlof) conflicts.push(verlof.type === "ziek" ? "Ziekmelding" : "Op vakantie/verlof");
  if (weekDateStrings) {
    const uniqueDays = new Set(entries.filter(e => e.medewerker_id === medId && e.id !== currentEditId && weekDateStrings.includes(e.datum)).map(e => e.datum));
    uniqueDays.add(dateStr);
    if (uniqueDays.size > 5) conflicts.push("Meer dan 5 dagen ingepland deze week");
  }
  return conflicts;
}

function getOverplannedMedewerkers(entries: PlanningEntry[], medewerkers: MedewerkerInfo[], weekDateStrings: string[]): { id: string; name: string; days: number }[] {
  const result: { id: string; name: string; days: number }[] = [];
  for (const med of medewerkers) {
    const uniqueDays = new Set(entries.filter(e => e.medewerker_id === med.id && weekDateStrings.includes(e.datum)).map(e => e.datum));
    if (uniqueDays.size > 5) result.push({ id: med.id, name: med.full_name, days: uniqueDays.size });
  }
  return result;
}

function getModalStatus(medId: string, dateStr: string, medewerkers: MedewerkerInfo[], beschikbaarheid: BeschikbaarheidItem[], dateObj: Date): { label: string; color: string; bg: string } | null {
  const med = medewerkers.find(m => m.id === medId);
  const verlof = beschikbaarheid.find(b => b.medewerker_id === medId && b.status === "goedgekeurd" && dateStr >= b.datum_van && dateStr <= b.datum_tot);
  if (verlof) return { label: "Op vakantie", color: "var(--danger)", bg: "var(--danger-light)" };
  const jsDay = dateObj.getDay();
  if (med?.vaste_vrije_dagen?.includes(jsDay)) return { label: "Vaste vrije dag", color: "var(--warn-text)", bg: "var(--warn-bg)" };
  return { label: "Beschikbaar", color: "var(--accent)", bg: "var(--accent-light)" };
}

export default function ManagerPlanning() {
  const { isManager, user } = useAuth();
  const { profile, profileId: myProfileId } = useProfile();
  const [weekStart, setWeekStart] = useState(() => startOfISOWeek(new Date()));
  const [entries, setEntries] = useState<PlanningEntry[]>([]);
  const [medewerkers, setMedewerkers] = useState<MedewerkerInfo[]>([]);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [beschikbaarheid, setBeschikbaarheid] = useState<BeschikbaarheidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalForm, setModalForm] = useState({ medewerker_id: "", project_id: "", datum: "", starttijd: "07:00", eindtijd: "16:00", notitie: "" });
  const [modalDatums, setModalDatums] = useState<string[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [expandedMedewerker, setExpandedMedewerker] = useState<string | null>(null);
  const [planningView, setPlanningView] = useState<'grid' | 'klus'>('grid');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copyingWeek, setCopyingWeek] = useState(false);
  const [extraMedewerkerIds, setExtraMedewerkerIds] = useState<string[]>([]);

  const weekNumber = getISOWeek(weekStart);
  const weekDates = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
  const weekDateStrings = useMemo(() => weekDates.map(d => format(d, "yyyy-MM-dd")), [weekStart]);
  const overplanned = useMemo(() => getOverplannedMedewerkers(entries, medewerkers, weekDateStrings), [entries, medewerkers, weekDateStrings]);
  const weekHasPlanning = useMemo(() => entries.some(e => weekDateStrings.includes(e.datum)), [entries, weekDateStrings]);

  // Projecten met planning in deze week (voor filterchips)
  const weekProjectChips = useMemo(() => {
    const map = new Map<string, { id: string; naam: string; nummer: string; days: number }>();
    entries.forEach(e => {
      if (!weekDateStrings.includes(e.datum)) return;
      const p = projects.find(pp => pp.id === e.project_id);
      if (!p) return;
      const cur = map.get(p.id) || { id: p.id, naam: p.naam, nummer: p.nummer, days: 0 };
      cur.days++;
      map.set(p.id, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.days - a.days);
  }, [entries, projects, weekDateStrings]);

  // Reset filter als het geselecteerde project geen planning meer heeft in deze week
  useEffect(() => {
    if (selectedProjectId && !weekProjectChips.some(c => c.id === selectedProjectId)) {
      setSelectedProjectId(null);
    }
  }, [selectedProjectId, weekProjectChips]);

  const visibleEntries = useMemo(
    () => selectedProjectId ? entries.filter(e => e.project_id === selectedProjectId) : entries,
    [entries, selectedProjectId],
  );

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const startStr = format(weekStart, "yyyy-MM-dd");
    const endStr = format(addDays(weekStart, 4), "yyyy-MM-dd");
    const [{ data: planData }, { data: profData }, { data: projData }, { data: beschData }, { data: rolesData }] = await Promise.all([
      supabase.from("planning").select("*, activiteit, activiteit_kleur, planning_group_id").gte("datum", startStr).lte("datum", endStr),
      supabase.from("profiles").select("id, full_name, vaste_vrije_dagen, planning_partner_ids").eq("account_status", "active").order("full_name"),
      supabase.from("projects").select("id, naam, nummer, straat, postcode, stad, adres").eq("active", true).order("nummer"),
      supabase.from("beschikbaarheid").select("medewerker_id, datum_van, datum_tot, type, status").eq("status", "goedgekeurd").lte("datum_van", endStr).gte("datum_tot", startStr),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const profIdToUserId = new Map<string, string>();
    const profilesWithUser = await supabase.from("profiles").select("id, user_id").eq("account_status", "active");
    (profilesWithUser.data ?? []).forEach((p: any) => profIdToUserId.set(p.id, p.user_id));
    const userRoleMap = new Map<string, string>();
    const rolePriority: Record<string, number> = { manager: 5, uitvoerder: 4, wv: 3, schakelmonteur: 2, monteur: 1 };
    (rolesData ?? []).forEach((r: any) => {
      const prev = userRoleMap.get(r.user_id);
      if (!prev || (rolePriority[r.role] ?? 0) > (rolePriority[prev] ?? 0)) userRoleMap.set(r.user_id, r.role);
    });
    setEntries((planData ?? []).map((d: any) => ({ id: d.id, medewerker_id: d.medewerker_id, project_id: d.project_id, datum: d.datum, starttijd: d.starttijd?.slice(0, 5), eindtijd: d.eindtijd?.slice(0, 5), notitie: d.notitie || "", activiteit: d.activiteit || null, activiteit_kleur: d.activiteit_kleur || null, planning_group_id: d.planning_group_id || null })));
    setMedewerkers(((profData ?? []) as any[]).map((p) => ({ ...p, planning_partner_ids: p.planning_partner_ids || [], role: userRoleMap.get(profIdToUserId.get(p.id) || "") || null })) as any);
    setProjects((projData ?? []) as any);
    setBeschikbaarheid((beschData ?? []) as any);
    setLoading(false);

  }, [weekStart]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDownloadPdf = async () => {
    try {
      await generatePlanningPdf(
        weekNumber,
        weekStart,
        addDays(weekStart, 4),
        entries,
        medewerkers,
        projects,
        profile?.full_name || "Manager"
      );
    } catch (err) {
      console.error("PDF generation failed", err);
      toast.error("PDF genereren mislukt");
    }
  };

  const handleDownloadPersoneelsPdf = async () => {
    try {
      await generatePersoneelsPdf(
        weekNumber,
        weekStart,
        entries,
        medewerkers,
        projects,
        profile?.full_name || "Manager"
      );
    } catch (err) {
      console.error("PDF generation failed", err);
      toast.error("PDF genereren mislukt");
    }
  };

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel('manager-planning-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'planning' }, fetchAll).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);



  const openAddModal = (medewerker_id: string, datum: string) => {
    const existing = entries.find(e => e.medewerker_id === medewerker_id && e.datum === datum);
    if (existing) {
      setEditId(existing.id);
      setModalForm({ medewerker_id: existing.medewerker_id, project_id: existing.project_id, datum: existing.datum, starttijd: existing.starttijd, eindtijd: existing.eindtijd, notitie: existing.notitie });
      setModalDatums([existing.datum]);
    } else {
      setEditId(null);
      setModalForm({ medewerker_id, project_id: projects[0]?.id || "", datum, starttijd: "07:00", eindtijd: "16:00", notitie: "" });
      setModalDatums([datum]);
    }
    setExtraMedewerkerIds([]);
    setShowModal(true);
  };

  const toggleModalDatum = (datum: string) => {
    if (editId) return;
    setModalDatums(prev => {
      const next = prev.includes(datum) ? prev.filter(d => d !== datum) : [...prev, datum];
      return next.length > 0 ? next : [datum];
    });
    setModalForm(prev => ({ ...prev, datum }));
  };

  const savePlanning = async () => {
    if (!myProfileId) return;
    setSaving(true);
    try {
    if (editId) {
      const existing = entries.find(e => e.id === editId);
      const updatePayload = { project_id: modalForm.project_id, starttijd: modalForm.starttijd, eindtijd: modalForm.eindtijd, notitie: modalForm.notitie } as any;
      if (existing?.planning_group_id) {
        // update alle gekoppelde entries
        if (!await mutate(supabase.from("planning").update(updatePayload).eq("planning_group_id", existing.planning_group_id))) return;
        toast.success("Planning bijgewerkt voor hele ploeg");
      } else {
        if (!await mutate(supabase.from("planning").update(updatePayload).eq("id", editId))) return;
        toast.success("Planning bijgewerkt");
      }
      setShowModal(false); fetchAll();
    } else {
      // Verzamel ploeg = self + vaste collega's
      const me = medewerkers.find(m => m.id === modalForm.medewerker_id);
      const partners = (me?.planning_partner_ids || []).filter(pid => medewerkers.some(mm => mm.id === pid));
      const datums = [...(modalDatums.length > 0 ? modalDatums : [modalForm.datum])].sort();
      const skipped: Array<{ medId: string; datum: string }> = [];
      const rows = datums.flatMap((datum) => {
        const kandidaatGroep = Array.from(new Set([modalForm.medewerker_id, ...partners, ...extraMedewerkerIds]));
        const inGroup = kandidaatGroep.filter((medId) => {
          const bestaatAl = entries.some(e => e.medewerker_id === medId && e.datum === datum);
          if (bestaatAl) skipped.push({ medId, datum });
          return !bestaatAl;
        });
        const groupId = inGroup.length > 1 ? (crypto.randomUUID?.() ?? null) : null;

        return inGroup.map((medId) => ({
          medewerker_id: medId,
          project_id: modalForm.project_id,
          datum,
          starttijd: modalForm.starttijd,
          eindtijd: modalForm.eindtijd,
          notitie: modalForm.notitie,
          created_by: myProfileId,
          planning_group_id: groupId,
          collega_ids: inGroup.filter(x => x !== medId),
        }));
      }) as any;

      if (rows.length === 0) {
        toast.error("Geen planning toegevoegd: alle geselecteerde dagen zijn al bezet.");
        return;
      }

      if (!await mutate(supabase.from("planning").insert(rows))) return;
      if (datums.length > 1) {
        toast.success(`Ingepland voor ${datums.length} dagen`);
      } else if (rows.length > 1) {
        toast.success(`Ingepland voor ${rows.length} monteurs`);
      } else {
        toast.success("Ingepland!");
      }
      if (skipped.length > 0) {
        const tekst = skipped
          .slice(0, 4)
          .map(({ medId, datum }) => `${medewerkers.find(mm => mm.id === medId)?.full_name || "Medewerker"} ${format(new Date(datum + "T12:00:00"), "EEE d/M", { locale: nl })}`)
          .join(", ");
        toast.info(`Overgeslagen (al ingepland): ${tekst}${skipped.length > 4 ? "..." : ""}`);
      }
      setShowModal(false); fetchAll();
    }
    } finally {
      setSaving(false);
    }
  };

  const copyPreviousWeek = async () => {
    if (!myProfileId || copyingWeek) return;
    setCopyingWeek(true);
    try {
      const previousStart = addWeeks(weekStart, -1);
      const previousEnd = addDays(previousStart, 4);
      const { data, error } = await supabase.from("planning").select("medewerker_id, project_id, datum, starttijd, eindtijd, notitie, activiteit, activiteit_kleur, collega_ids").gte("datum", format(previousStart, "yyyy-MM-dd")).lte("datum", format(previousEnd, "yyyy-MM-dd"));
      if (error) throw error;
      const existing = new Set(entries.map((entry) => `${entry.medewerker_id}:${entry.datum}`));
      let skipped = 0;
      const rows = (data ?? []).flatMap((entry) => {
        const targetDate = format(addDays(new Date(`${entry.datum}T12:00:00`), 7), "yyyy-MM-dd");
        if (existing.has(`${entry.medewerker_id}:${targetDate}`)) { skipped += 1; return []; }
        return [{ ...entry, datum: targetDate, created_by: myProfileId }];
      });
      if (rows.length > 0 && !await mutate(supabase.from("planning").insert(rows as any))) return;
      toast.success(`${rows.length} planningregels gekopieerd${skipped ? ` · ${skipped} overgeslagen` : ""}`);
      fetchAll();
    } catch (error) {
      console.error("Week copy failed", error);
      toast.error("Vorige week kopiëren is mislukt");
    } finally {
      setCopyingWeek(false);
    }
  };

  const deletePlanning = async () => {
    if (!editId) return;
    const existing = entries.find(e => e.id === editId);
    if (existing?.planning_group_id) {
      if (!await mutate(supabase.from("planning").delete().eq("planning_group_id", existing.planning_group_id))) return;
      toast.success("Planning van ploeg verwijderd");
    } else {
      if (!await mutate(supabase.from("planning").delete().eq("id", editId))) return;
      toast.success("Verwijderd");
    }
    setShowModal(false); fetchAll();
  };


  const medName = (id: string) => medewerkers.find(m => m.id === id)?.full_name || "?";

  const modalStatus = useMemo(() => {
    if (!modalForm.medewerker_id || !modalForm.datum) return null;
    const dateObj = new Date(modalForm.datum + "T12:00:00");
    return getModalStatus(modalForm.medewerker_id, modalForm.datum, medewerkers, beschikbaarheid, dateObj);
  }, [modalForm.medewerker_id, modalForm.datum, medewerkers, beschikbaarheid]);

  const modalConflicts = useMemo(() => {
    if (!modalForm.medewerker_id || !modalForm.datum) return [];
    const datums = editId ? [modalForm.datum] : (modalDatums.length > 0 ? modalDatums : [modalForm.datum]);
    return datums.flatMap((datum) => {
      const dayIndex = weekDates.findIndex(d => format(d, "yyyy-MM-dd") === datum);
      if (dayIndex < 0) return [];
      const label = format(new Date(datum + "T12:00:00"), "EEE d/M", { locale: nl });
      return getConflicts(modalForm.medewerker_id, datum, dayIndex, entries, medewerkers, beschikbaarheid, editId, weekDateStrings)
        .map(c => datums.length > 1 ? `${label}: ${c}` : c);
    });
  }, [modalForm.medewerker_id, modalForm.datum, modalDatums, entries, medewerkers, beschikbaarheid, editId, weekDates, weekDateStrings]);

  const berekenUren = (starttijd: string | null, eindtijd: string | null): number => {
    const s = starttijd
      ? parseInt(starttijd.split(':')[0]) + parseFloat(starttijd.split(':')[1] || '0') / 60
      : 7;
    const e = eindtijd
      ? parseInt(eindtijd.split(':')[0]) + parseFloat(eindtijd.split(':')[1] || '0') / 60
      : s + 9;
    const klokuren = e - s;
    const productief = Math.max(0, klokuren - 1);
    return Math.round(productief);
  };

  if (!isManager) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-navy)" }}><p style={{ color: "var(--text-secondary)" }}>Alleen managers hebben toegang.</p></div>;
  }

  return (
    <PageShell>
      <PullToRefresh onRefresh={fetchAll}>
      <div style={{ background: "var(--app-navy)", minHeight: "100dvh", paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 120px)" }}>
        {/* HEADER */}
        <MobileHeader initials={profile?.full_name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?'} />

        <main style={{ padding: "24px 20px" }}>
          <section className="team-planning-topbar">
            <div>
              <h1>Week {weekNumber}</h1>
              <p>{format(weekStart, "d MMM", { locale: nl })} t/m {format(addDays(weekStart, 4), "d MMM", { locale: nl })} · {new Set(visibleEntries.map((entry) => entry.medewerker_id)).size} van {medewerkers.length} ingepland</p>
            </div>
            <div className="team-planning-actions">
              <Button type="button" variant="outline" className="team-planning-copy" onClick={copyPreviousWeek} disabled={copyingWeek}><Copy />{copyingWeek ? "Kopiëren…" : "Week kopiëren"}</Button>
              {[
                { label: "Vorige week", icon: <ChevronLeft />, action: () => setWeekStart((week) => addWeeks(week, -1)) },
                { label: "Planning als PDF downloaden", icon: <Download />, action: handleDownloadPdf },
                { label: "Persoonlijke planning downloaden", icon: <FileDown />, action: handleDownloadPersoneelsPdf },
                { label: "Volgende week", icon: <ChevronRight />, action: () => setWeekStart((week) => addWeeks(week, 1)) },
              ].map((item) => <Tooltip key={item.label}><TooltipTrigger asChild><Button type="button" variant="outline" size="icon" aria-label={item.label} onClick={item.action}>{item.icon}</Button></TooltipTrigger><TooltipContent>{item.label}</TooltipContent></Tooltip>)}
            </div>
          </section>

          <div className="team-planning-controls">
            <div className="team-planning-segmented" aria-label="Planningweergave">
              {[{ key: "grid", label: "Overzicht" }, { key: "klus", label: "Per klus" }].map((view) => <Button key={view.key} type="button" variant="ghost" aria-pressed={planningView === view.key} onClick={() => setPlanningView(view.key as "grid" | "klus")}>{view.label}</Button>)}
            </div>
            {planningView === "grid" && weekProjectChips.length > 0 && <div className="team-planning-filters"><span>Project</span><div><Button type="button" variant="outline" aria-pressed={selectedProjectId === null} onClick={() => setSelectedProjectId(null)}>Alle projecten</Button>{weekProjectChips.map((chip) => <Button key={chip.id} type="button" variant="outline" title={chip.naam} aria-pressed={selectedProjectId === chip.id} onClick={() => setSelectedProjectId((current) => current === chip.id ? null : chip.id)}>{chip.naam || chip.nummer}</Button>)}</div></div>}
          </div>

          {overplanned.length > 0 && <div className="team-planning-warning"><AlertTriangle aria-hidden="true" /><div><strong>Overplanning</strong>{overplanned.map((item) => <span key={item.id}>{item.name}: {item.days} dagen ingepland</span>)}</div></div>}

          {planningView === "grid" && (loading ? <Spinner padding="py-16" /> : <TeamPlanningGrid
            medewerkers={medewerkers}
            entries={visibleEntries}
            projects={projects}
            beschikbaarheid={beschikbaarheid}
            weekDates={weekDates}
            expandedMedewerker={expandedMedewerker}
            onToggleExpanded={(id) => setExpandedMedewerker((current) => current === id ? null : id)}
            onOpenCell={openAddModal}
            berekenUren={berekenUren}
            renderExpanded={(medewerker) => <div className="team-planning-detail-list">{weekDates.map((date) => { const datum = format(date, "yyyy-MM-dd"); const dayEntries = visibleEntries.filter((entry) => entry.medewerker_id === medewerker.id && entry.datum === datum); return <div key={datum} className="team-planning-detail-day"><strong>{format(date, "EEE", { locale: nl })}</strong>{dayEntries.length === 0 ? <span>Niet ingepland</span> : dayEntries.map((entry) => <span key={entry.id}>{projects.find((project) => project.id === entry.project_id)?.naam || "Onbekend project"} · {berekenUren(entry.starttijd, entry.eindtijd)}u</span>)}</div>; })}</div>}
          />)}

          {planningView === 'klus' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {Array.from(new Set(
                visibleEntries.filter(e => weekDateStrings.includes(e.datum)).map(e => e.project_id)
              )).map((projectId) => {
                const project = projects.find(p => p.id === projectId);
                const projectEntries = visibleEntries.filter(e => e.project_id === projectId && weekDateStrings.includes(e.datum));
                const totalUren = projectEntries.reduce((sum, e) => sum + berekenUren(e.starttijd, e.eindtijd), 0);
                const DAGEN_LBL = ['Ma','Di','Wo','Do','Vr'];
                return (
                  <div key={projectId} style={{
                    background: 'linear-gradient(135deg, var(--planning-card), var(--planning-card))',
                    backdropFilter: 'blur(12px)',
                    borderRadius: 20,
                    border: '1px solid var(--planning-border-soft)',
                    borderLeft: '4px solid var(--accent)',
                    overflow: 'hidden',
                  }}>
                    {/* PROJECT HEADER */}
                    <div style={{
                      padding: '16px 20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: '1px solid var(--planning-border-soft)',
                    }}>
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Hanken Grotesk', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--text-secondary)', marginBottom: 2 }}>
                          {project?.nummer || '—'}
                        </p>
                        <h3 style={{ fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>
                          {project?.naam || 'Onbekend project'}
                        </h3>
                        {project?.stad && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>location_on</span>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'Hanken Grotesk' }}>{project.stad}</span>
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Hanken Grotesk', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 4 }}>
                          Week totaal
                        </p>
                        <div style={{ padding: '4px 14px', borderRadius: 9999, background: 'var(--accent)', display: 'inline-block' }}>
                          <span style={{ fontFamily: 'Hanken Grotesk', fontWeight: 800, fontSize: 16, color: 'var(--on-accent)' }}>
                            {totalUren}u
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* DAG ROWS */}
                    {weekDates.map((date, di) => {
                      const dateStr = format(date, 'yyyy-MM-dd');
                      const dagEntries = projectEntries.filter(e => e.datum === dateStr);
                      if (dagEntries.length === 0) return null;
                      const dagTotaal = dagEntries.reduce((sum, e) => sum + berekenUren(e.starttijd, e.eindtijd), 0);
                      return (
                        <div key={dateStr}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 20px',
                            background: 'var(--planning-cell-empty)',
                          }}>
                            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Hanken Grotesk', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent)' }}>
                              {DAGEN_LBL[di]}{' '}
                              <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                                {format(date, 'd MMM', { locale: nl })}
                              </span>
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Hanken Grotesk', color: 'var(--text-secondary)' }}>
                              {dagTotaal}u totaal
                            </span>
                          </div>
                          {dagEntries.map((entry, ei) => {
                            const monteur = medewerkers.find(m => m.id === entry.medewerker_id);
                            const uren = berekenUren(entry.starttijd, entry.eindtijd);
                            const initials = monteur?.full_name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('') || 'XX';
                            return (
                              <div key={entry.id} style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '12px 20px',
                                gap: 12,
                                borderTop: ei > 0 ? '1px solid var(--planning-border-soft)' : 'none',
                                borderBottom: '1px solid var(--planning-border-soft)',
                              }}>
                                <div style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 10,
                                  background: 'var(--planning-avatar-bg)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontFamily: 'Hanken Grotesk',
                                  fontWeight: 700,
                                  fontSize: 11,
                                  color: 'var(--accent)',
                                  flexShrink: 0,
                                  border: '1px solid var(--accent-border)',
                                }}>
                                  {initials}
                                </div>
                                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, fontFamily: 'Hanken Grotesk', color: 'var(--text-primary)' }}>
                                  {monteur?.full_name || 'Onbekend'}
                                </span>
                                <div style={{
                                  padding: '4px 12px',
                                  borderRadius: 9999,
                                  background: 'var(--accent-light)',
                                  border: '1px solid var(--accent-border)',
                                }}>
                                  <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'Hanken Grotesk', color: 'var(--accent)' }}>
                                    {uren}u
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {entries.filter(e => weekDateStrings.includes(e.datum)).length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)', fontFamily: 'Hanken Grotesk' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 48, display: 'block', marginBottom: 12, opacity: 0.4 }}>
                    calendar_today
                  </span>
                  <p style={{ fontSize: 14 }}>
                    Geen planning voor week {weekNumber}
                  </p>
                </div>
              )}
            </div>
          )}
        </main>

        {/* FAB — alleen zichtbaar als de week nog leeg is */}
        {!weekHasPlanning && (
          <Button onClick={() => medewerkers[0] && openAddModal(medewerkers[0].id, format(weekDates[0], "yyyy-MM-dd"))} className="team-planning-fab" aria-label="Nieuwe planning toevoegen">
            <Plus size={20} aria-hidden="true" /> Inplannen
          </Button>
        )}
      </div>
      </PullToRefresh>

      <PlanningDialog
        open={showModal}
        editId={editId}
        weekNumber={weekNumber}
        weekDates={weekDates}
        medewerkerNaam={medName(modalForm.medewerker_id)}
        modalStatus={modalStatus}
        conflicts={modalConflicts}
        form={modalForm}
        selectedDates={modalDatums}
        projects={projects}
        medewerkers={medewerkers}
        existingDates={entries.filter((entry) => entry.medewerker_id === modalForm.medewerker_id).map((entry) => entry.datum)}
        saving={saving}
        extraMedewerkerIds={extraMedewerkerIds}
        onExtraMedewerkerIdsChange={setExtraMedewerkerIds}
        onOpenChange={setShowModal}
        onFormChange={setModalForm}
        onToggleDate={toggleModalDatum}
        onSave={savePlanning}
        onDelete={deletePlanning}
      />
    </PageShell>
  );
}


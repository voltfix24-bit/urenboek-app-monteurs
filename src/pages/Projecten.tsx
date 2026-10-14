import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useFocusParam, useClearFocusOnClose } from "@/hooks/useFocusParam";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useProjectenQuery } from "@/hooks/queries/useProjectenQuery";
import { ArrowLeft, Plus, Building2, X, FolderOpen, Pencil, Trash2, ToggleLeft, ToggleRight, MapPin, Phone, Mail } from "lucide-react";
import { PlanningStatusTab } from "@/components/PlanningStatusTab";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { BottomNav } from "@/components/BottomNav";
import { useNavBadges } from "@/hooks/useNavBadges";
import { ForecastIntakeWizard } from "@/components/ForecastIntakeWizard";
import { MobileHeader } from "@/components/MobileHeader";
import { ProjectFormFields, FormState, emptyForm } from "@/components/projecten/ProjectFormFields";
import { ProjectCard } from "@/components/projecten/ProjectCard";
import { DesktopProjectLijst } from "@/components/projecten/DesktopProjectLijst";
import { DesktopProjectDetail, DesktopFormPanel } from "@/components/projecten/DesktopProjectDetail";
import { valideer, projectSchema, projectEditSchema } from "@/lib/validatie";
import { ListSkeleton, ProjectCardSkeleton } from "@/components/ui/Skeletons";
import { Button } from "@/components/ui/button";
import { projectGroep } from "@/lib/projectStatus";
import { isLopend, openPunten } from "@/lib/projectChecklist";
import { UitleenUrenKaart } from "@/components/projecten/UitleenUrenKaart";
import { endOfISOWeek, format as fmtDatum, startOfISOWeek } from "date-fns";

interface Opdrachtgever { id: string; naam: string; }
interface Project {
  id: string; nummer: string; naam: string; active: boolean; opdrachtgever_id: string | null;
  stationsnaam: string | null; adres: string | null; case_type: string | null;
  contactpersoon_naam: string | null; contactpersoon_tel: string | null; contactpersoon_email: string | null;
  straat: string | null; postcode: string | null; stad: string | null;
  intake_gedaan: boolean; rmu_merk: string | null; rmu_configuratie_id: string | null;
  status: string;
  projectjaar: number | null;
  soort?: string;
  created_at?: string;
}

const formatUrenKort = (u: number) => `${Math.round(u * 10) / 10} u`.replace(".", ",");
const isUitleen = (p: { soort?: string | null }) => p.soort === "uitleen";
/** Nieuwste eerst (aanmaakdatum), gearchiveerde projecten onderaan. */
const sorteerProjecten = <T extends { active: boolean; created_at?: string }>(lijst: T[]) =>
  [...lijst].sort((a, b) => Number(b.active) - Number(a.active) || (b.created_at ?? "").localeCompare(a.created_at ?? ""));

export default function Projecten() {
  const { isManager, permissies } = useAuth(); const navigate = useNavigate();
  const { profile, profileId } = useProfile();
  const { badges } = useNavBadges();
  const queryClient = useQueryClient();
  const { data: projects = [], isLoading: projectsLoading, refetch: refetchProjects } = useProjectenQuery();
  const [opdrachtgevers, setOpdrachtgevers] = useState<Opdrachtgever[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [intakeProjectId, setIntakeProjectId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [margeMap, setMargeMap] = useState<Map<string, { omzet: number; kosten: number; marge: number }>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [desktopMode, setDesktopMode] = useState<"view" | "add" | "edit">("view");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [deskFase, setDeskFase] = useState<string>("alle");
  const [deskArchief, setDeskArchief] = useState(false);
  const [mobielArchief, setMobielArchief] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const { focus, clear: clearFocus } = useFocusParam();
  useClearFocusOnClose(selectedId !== null);
  const focusHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || projectsLoading) return;
    if (focusHandledRef.current === focus) return;
    const exists = projects.find(p => p.id === focus);
    focusHandledRef.current = focus;
    if (exists) {
      setSelectedId(focus);
      setDesktopMode("view");
    } else {
      toast.error("Project niet gevonden of geen toegang");
      clearFocus();
    }
  }, [focus, projects, projectsLoading, clearFocus]);

  // Fetch opdrachtgevers + marge data separately
  const fetchExtra = useCallback(async () => {
    const { data: o } = await supabase.from("opdrachtgevers").select("id, naam").order("naam");
    if (o) setOpdrachtgevers(o);
    if (permissies.zietProjectFinancien) {
      const { data: forecasts } = await supabase.from("project_forecast").select("id, project_id");
      if (forecasts && forecasts.length > 0) {
        const fIds = forecasts.map((f: any) => f.id);
        const { data: regels } = await supabase.from("forecast_regels").select("forecast_id, tarief, eigen_kosten, aantal, geplande_uren, uurtarief_snap, type").in("forecast_id", fIds);
        const fProject = new Map(forecasts.map((f: any) => [f.id, f.project_id]));
        const m = new Map<string, { omzet: number; kosten: number; marge: number }>();
        (regels ?? []).forEach((r: any) => {
          const pid = fProject.get(r.forecast_id);
          if (!pid) return;
          const cur = m.get(pid) || { omzet: 0, kosten: 0, marge: 0 };
          if (r.type === "spec" || r.type === "stuks") cur.omzet += (r.tarief || 0) * (r.aantal || 1);
          else if (r.type === "uren") cur.kosten += (r.geplande_uren || 0) * (r.uurtarief_snap || 0);
          m.set(pid, cur);
        });
        m.forEach((v) => { v.marge = v.omzet > 0 ? ((v.omzet - v.kosten) / v.omzet) * 100 : 0; });
        setMargeMap(m);
      }
    }
    setLoading(false);
  }, [permissies.zietProjectFinancien]);

  useEffect(() => { fetchExtra(); }, [fetchExtra]);

  // Uitleen: geboekte uren deze week per project (alleen lezen)
  const [uitleenWeekUren, setUitleenWeekUren] = useState<Map<string, number>>(new Map());
  const uitleenIds = useMemo(() => projects.filter(isUitleen).map(p => p.id).sort().join(","), [projects]);
  useEffect(() => {
    if (!uitleenIds) { setUitleenWeekUren(new Map()); return; }
    const nu = new Date();
    supabase.from("uren_boekingen").select("project_id, uren").in("project_id", uitleenIds.split(","))
      .gte("datum", fmtDatum(startOfISOWeek(nu), "yyyy-MM-dd")).lte("datum", fmtDatum(endOfISOWeek(nu), "yyyy-MM-dd"))
      .then(({ data }) => {
        const m = new Map<string, number>();
        (data ?? []).forEach((b: any) => m.set(b.project_id, (m.get(b.project_id) ?? 0) + (Number(b.uren) || 0)));
        setUitleenWeekUren(m);
      });
  }, [uitleenIds]);
  useEffect(() => { if (!projectsLoading) setLoading(false); }, [projectsLoading]);

  const fetchData = useCallback(() => {
    refetchProjects();
    fetchExtra();
  }, [refetchProjects, fetchExtra]);

  useEffect(() => {
    const channel = supabase.channel('projecten-rt').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects' }, () => fetchData()).subscribe();
    const handleStatusChange = () => fetchData();
    window.addEventListener("project-status-changed", handleStatusChange);
    return () => { supabase.removeChannel(channel); window.removeEventListener("project-status-changed", handleStatusChange); };
  }, [fetchData]);
  useEffect(() => { if (!isManager) navigate("/"); }, [isManager, navigate]);

  function getOgNaam(id: string | null) { return id ? opdrachtgevers.find(o => o.id === id)?.naam || null : null; }

  async function handleUitleenSubmit(isNew: boolean, id?: string) {
    const errs: Record<string, string> = {};
    if (!form.nummer.trim()) errs.nummer = "Nummer is verplicht";
    if (!form.naam.trim()) errs.naam = "Naam is verplicht";
    if (Object.keys(errs).length) { setFormErrors(errs); toast.error("Controleer de ingevulde gegevens"); return; }
    setFormErrors({});
    const data: any = {
      nummer: form.nummer.trim(), naam: form.naam.trim(), soort: "uitleen",
      opdrachtgever_id: form.opdrachtgever_id || null,
      adres: form.werklocatie.trim() || null,
      contactpersoon_naam: form.contactpersoon_naam.trim() || null,
      contactpersoon_tel: form.contactpersoon_tel.trim() || null,
    };
    if (isNew) {
      const { error } = await supabase.from("projects").insert(data);
      if (error) { if ((await supabase.from("projects").select("id").eq("nummer", form.nummer.trim())).data?.length) toast.error("Nummer bestaat al"); else toast.error("Fout bij aanmaken"); return; }
      toast.success("Uitleen toegevoegd"); setForm(emptyForm); setShowAdd(false); setDesktopMode("view"); fetchData();
    } else {
      if (!await mutate(supabase.from("projects").update(data).eq("id", id!))) return;
      toast.success("Uitleen gewijzigd"); setEditId(null); setDesktopMode("view"); setForm(emptyForm); fetchData();
    }
  }

  async function zetSoort(p: Project, soort: "project" | "uitleen") {
    if (!await mutate(supabase.from("projects").update({ soort } as any).eq("id", p.id))) return;
    toast.success(soort === "uitleen" ? "Omgezet naar uitleen" : "Omgezet naar klus"); fetchData();
  }

  async function handleSubmit(isNew: boolean, id?: string) {
    if (form.soort === "uitleen") return handleUitleenSubmit(isNew, id);
    const schema = isNew ? projectSchema : projectEditSchema;
    const vResult = valideer(schema, form);
    if (!vResult.success) {
      setFormErrors(vResult.errors);
      toast.error("Controleer de ingevulde gegevens");
      return;
    }
    setFormErrors({});
    const data: any = {
      nummer: form.nummer.trim(), naam: form.naam.trim(),
      straat: form.straat.trim(), postcode: form.postcode.trim(), stad: form.stad.trim(),
      adres: `${form.straat.trim()}, ${form.postcode.trim()} ${form.stad.trim()}`,
      opdrachtgever_id: form.opdrachtgever_id || null,
      stationsnaam: form.stationsnaam.trim() || null,
      case_type: form.case_type || null,
      projectjaar: form.projectjaar ? Number(form.projectjaar) : null,
    };
    if (isManager) {
      data.contactpersoon_naam = form.contactpersoon_naam.trim() || null;
      data.contactpersoon_tel = form.contactpersoon_tel.trim() || null;
      data.contactpersoon_email = form.contactpersoon_email.trim() || null;
    }
    if (isNew) {
      const { data: newP, error } = await supabase.from("projects").insert(data).select("id").single();
      if (error) { if ((await supabase.from("projects").select("id").eq("nummer", form.nummer.trim())).data?.length) toast.error("Casenummer bestaat al"); else toast.error("Fout bij aanmaken"); return; }
      // Auto-create forecast if method chosen
      if (newP && form.vergoed_methode) {
        await supabase.from("project_forecast").insert({ project_id: newP.id, methode: form.vergoed_methode });
      }
      toast.success("Project toegevoegd"); setForm(emptyForm); setShowAdd(false); setDesktopMode("view"); fetchData();
      if (newP) setIntakeProjectId(newP.id);
    } else {
      if (!await mutate(supabase.from("projects").update(data).eq("id", id!))) return;
      toast.success("Project gewijzigd"); setEditId(null); setDesktopMode("view"); setForm(emptyForm); fetchData();
    }
  }

  async function toggleActive(p: Project) {
    if (!await mutate(supabase.from("projects").update({ active: !p.active }).eq("id", p.id))) return;
    toast.success(p.active ? "Gedeactiveerd" : "Geactiveerd"); fetchData();
  }

  async function handleDelete(p: Project) {
    if (confirmDeleteId !== p.id) { setConfirmDeleteId(p.id); return; }
    setConfirmDeleteId(null);
    if (!await mutate(supabase.from("projects").delete().eq("id", p.id))) return;
    toast.success("Verwijderd"); setSearchQuery(""); setSelectedId(null); setDesktopMode("view"); fetchData();
  }

  function startEdit(p: Project) {
    setEditId(p.id); setExpandedId(null); setShowAdd(false);
    setForm({ nummer: p.nummer, naam: p.naam, opdrachtgever_id: p.opdrachtgever_id, stationsnaam: p.stationsnaam || "", straat: p.straat || "", postcode: p.postcode || "", stad: p.stad || "", case_type: p.case_type || "", contactpersoon_naam: p.contactpersoon_naam || "", contactpersoon_tel: p.contactpersoon_tel || "", contactpersoon_email: p.contactpersoon_email || "", vergoed_methode: "", projectjaar: p.projectjaar != null ? String(p.projectjaar) : "", soort: isUitleen(p) ? "uitleen" : "project", werklocatie: p.adres || "" });
  }

  function startDesktopEdit(p: Project) {
    setDesktopMode("edit"); setSelectedId(p.id);
    setForm({ nummer: p.nummer, naam: p.naam, opdrachtgever_id: p.opdrachtgever_id, stationsnaam: p.stationsnaam || "", straat: p.straat || "", postcode: p.postcode || "", stad: p.stad || "", case_type: p.case_type || "", contactpersoon_naam: p.contactpersoon_naam || "", contactpersoon_tel: p.contactpersoon_tel || "", contactpersoon_email: p.contactpersoon_email || "", vergoed_methode: "", projectjaar: p.projectjaar != null ? String(p.projectjaar) : "", soort: isUitleen(p) ? "uitleen" : "project", werklocatie: p.adres || "" });
  }

  const activeProjects = projects.filter(p => p.active);
  const inactiveProjects = projects.filter(p => !p.active);
  const filteredProjects = useMemo(() => {
    let result = projects;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => p.naam.toLowerCase().includes(q) || p.nummer.toLowerCase().includes(q));
    }
    if (statusFilter !== "alle") {
      result = result.filter(p => (p.status || "nieuw") === statusFilter);
    }
    return result;
  }, [projects, searchQuery, statusFilter]);
  const filteredActive = filteredProjects.filter(p => p.active);
  const filteredInactive = filteredProjects.filter(p => !p.active);
  const statusCounts = useMemo(() => {
    const base = searchQuery.trim()
      ? projects.filter(p => p.naam.toLowerCase().includes(searchQuery.toLowerCase()) || p.nummer.toLowerCase().includes(searchQuery.toLowerCase()))
      : projects;
    const counts: Record<string, number> = { alle: base.length };
    base.forEach(p => { const s = p.status || "nieuw"; counts[s] = (counts[s] || 0) + 1; });
    return counts;
  }, [projects, searchQuery]);
  const selectedProject = selectedId ? projects.find(p => p.id === selectedId) || null : null;


  const clearError = (field: string) => setFormErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
  const formFields = <ProjectFormFields form={form} setForm={setForm} opdrachtgevers={opdrachtgevers} isManager={isManager} errors={formErrors} clearError={clearError} variant={desktopMode === "edit" ? "desktop-edit" : "desktop-new"} toonSoortKeuze={desktopMode === "add"} />;

  // ── Desktop: fasefilters + archief ──
  const desktopBase = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects.filter(p => (deskArchief || p.active) && (!q || [p.naam, p.nummer, p.stad, p.stationsnaam].some(v => v?.toLowerCase().includes(q))));
  }, [projects, searchQuery, deskArchief]);
  const matchFase = (p: Project, f: string) => {
    if (f === "alle") return true;
    const g = projectGroep(p);
    if (f === "uitleen") return g === "uitleen";
    if (f === "lopend") return g === "lopend";
    if (f === "afgerond") return g === "afgerond";
    if (f === "aandacht") return g === "lopend" && openPunten(p) > 0;
    return (p.status || "nieuw") === f;
  };
  const deskCounts = useMemo(() => {
    const c: Record<string, number> = {};
    ["alle", "lopend", "aandacht", "uitleen", "afgerond"].forEach(f => { c[f] = desktopBase.filter(p => matchFase(p, f)).length; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktopBase]);
  const byDatumDesc = (a: Project, b: Project) => (b.created_at ?? "").localeCompare(a.created_at ?? "");
  const desktopProjects = useMemo(() => desktopBase.filter(p => matchFase(p, deskFase)).sort((a, b) => Number(b.active) - Number(a.active) || byDatumDesc(a, b)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [desktopBase, deskFase]);
  /** "Alles": drie groepen met kop, nieuwste bovenaan; archief onderaan alleen met "Archief tonen". */
  const desktopGroepen = useMemo(() => {
    const actief = desktopBase.filter(p => p.active);
    const groepen = [
      { label: "Lopende klussen", projects: actief.filter(p => projectGroep(p) === "lopend").sort(byDatumDesc) },
      { label: "Uitleen", projects: actief.filter(p => projectGroep(p) === "uitleen").sort(byDatumDesc) },
      { label: "Afgerond", projects: actief.filter(p => projectGroep(p) === "afgerond").sort(byDatumDesc) },
    ];
    if (deskArchief) groepen.push({ label: "Archief", projects: desktopBase.filter(p => !p.active).sort(byDatumDesc) });
    return groepen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktopBase, deskArchief]);
  const lopendTotaal = projects.filter(p => !isUitleen(p) && isLopend(p)).length;
  const aandachtTotaal = projects.filter(p => !isUitleen(p) && isLopend(p) && openPunten(p) > 0).length;

  // ── Mobiel: zelfde groepen en filters ──
  const zoekMatch = (p: Project) => !searchQuery.trim() || p.naam?.toLowerCase().includes(searchQuery.toLowerCase()) || p.nummer?.toLowerCase().includes(searchQuery.toLowerCase());
  const mobielBase = projects.filter(zoekMatch).filter(p => mobielArchief || p.active);
  const mobielGroepen = [
    { label: "Lopende klussen", items: mobielBase.filter(p => p.active && projectGroep(p) === "lopend").sort(byDatumDesc) },
    { label: "Uitleen", items: mobielBase.filter(p => p.active && projectGroep(p) === "uitleen").sort(byDatumDesc) },
    { label: "Afgerond", items: mobielBase.filter(p => p.active && projectGroep(p) === "afgerond").sort(byDatumDesc) },
    ...(mobielArchief ? [{ label: "Archief", items: mobielBase.filter(p => !p.active).sort(byDatumDesc) }] : []),
  ];
  const mobielLijst = sorteerProjecten(mobielBase.filter(p => matchFase(p, statusFilter)));
  const groepLabelStyle = { fontSize: 10, fontWeight: 700, fontFamily: "Hanken Grotesk", textTransform: "uppercase" as const, letterSpacing: "0.2em", color: "var(--text-muted)", marginBottom: 10 };

  const renderProjectCard = (project: Project) => {
    const uitleen = isUitleen(project);
    const isConcept = !uitleen && project.status === "concept";
    const borderColor = isConcept ? "var(--warn-text)" : "var(--accent)";
    return (
      <div key={project.id} onClick={() => setSelectedId(project.id)} style={{
        background: "var(--bg-surface)",
        backdropFilter: "blur(12px)", borderRadius: 20,
        border: "1px solid var(--planning-border-soft)", borderLeft: `4px solid ${borderColor}`,
        overflow: "hidden", cursor: "pointer",
      }}>
        <div style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <p style={{ fontSize: 10, fontFamily: "Hanken Grotesk", fontWeight: 700, color: "var(--text-muted)", fontVariant: "tabular-nums", marginBottom: 4 }}>ID #{project.nummer}</p>
              <h3 style={{ fontFamily: "Hanken Grotesk", fontWeight: 800, fontSize: 16, color: "var(--text-primary)", lineHeight: 1.3 }}>{project.naam}</h3>
              {project.stad && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: "var(--text-muted)" }}>location_on</span>
                  <span style={{ fontSize: 13, color: "var(--text-muted)", fontFamily: "Hanken Grotesk" }}>{project.stad}</span>
                </div>
              )}
            </div>
            <div style={{ padding: "4px 12px", borderRadius: 9999, background: isConcept ? "var(--warn-light)" : "var(--accent-light)", border: `1px solid ${borderColor}50` }}>
              <span style={{ fontSize: 9, fontWeight: 800, fontFamily: "Hanken Grotesk", textTransform: "uppercase", color: borderColor }}>
                {uitleen ? "UITLEEN" : isConcept ? "CONCEPT" : project.active ? "ACTIEF" : "AFGEROND"}
              </span>
            </div>
          </div>

          {/* Progress */}
          {uitleen && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "Hanken Grotesk" }}>{formatUrenKort(uitleenWeekUren.get(project.id) ?? 0)} deze week</p>
          )}
          {!isConcept && !uitleen && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "Hanken Grotesk" }}>
                  {margeMap.get(project.id)?.omzet ? `€ ${margeMap.get(project.id)!.omzet.toLocaleString("nl")}` : "0 uur geboekt"}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", fontFamily: "Hanken Grotesk" }}>
                  {margeMap.get(project.id)?.marge ? `${Math.round(margeMap.get(project.id)!.marge)}%` : "—"}
                </span>
              </div>
              <div style={{ height: 4, background: "var(--bg-surface-2)", borderRadius: 9999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, margeMap.get(project.id)?.marge || 0)}%`, background: "var(--accent)", borderRadius: 9999, boxShadow: "0 0 8px color-mix(in srgb, var(--accent) 35%, transparent)" }} />
              </div>
            </div>
          )}

          {/* Concept warning */}
          {isConcept && (
            <div style={{ background: "var(--warn-light)", borderTop: "1px solid rgba(254,179,0,0.15)", padding: "10px 0 0", display: "flex", alignItems: "center", gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: "var(--warn-text)", fontVariationSettings: "'FILL' 1" }}>warning</span>
              <span style={{ fontSize: 12, color: "var(--warn-text)", fontFamily: "Hanken Grotesk", fontWeight: 600 }}>Nog geen monteurs ingepland</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <DesktopSidebar badges={badges} />

      {/* DESKTOP */}
      <div className="pj-page">
        <header className="pj-header">
          <div>
            <h1>Projecten</h1>
            <p>{lopendTotaal} lopend · {aandachtTotaal} {aandachtTotaal === 1 ? "vraagt" : "vragen"} aandacht</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/opdrachtgevers")}><Building2 className="h-4 w-4" /> Opdrachtgevers</Button>
            <Button className="pj-btn-next" onClick={() => { setDesktopMode("add"); setSelectedId(null); setForm({ ...emptyForm, projectjaar: String(new Date().getFullYear()) }); }}>
              <Plus className="h-4 w-4" /> Nieuw project
            </Button>
          </div>
        </header>

        <div className="pj-filters" role="toolbar" aria-label="Filter op fase">
          {[{ key: "alle", label: "Alles", dot: null }, { key: "lopend", label: "Lopend", dot: null }, { key: "aandacht", label: "Aandacht nodig", dot: "var(--danger)" },
            { key: "uitleen", label: "Uitleen", dot: "var(--text-muted)" }, { key: "afgerond", label: "Afgerond", dot: null }].map(f => (
            <button key={f.key} type="button" className="pj-chip" aria-pressed={deskFase === f.key} onClick={() => setDeskFase(f.key)}>
              {f.dot && <i style={{ background: f.dot }} />}{f.label}<b>{deskCounts[f.key] ?? 0}</b>
            </button>
          ))}
          <span className="flex-1" />
          <button type="button" className="pj-chip" aria-pressed={deskArchief} onClick={() => setDeskArchief(v => !v)}>
            {deskArchief ? "Archief verbergen" : "Archief tonen"}
          </button>
        </div>

        <div className="pj-columns">
          <DesktopProjectLijst projects={desktopProjects} groepen={deskFase === "alle" ? desktopGroepen : undefined} searchQuery={searchQuery} setSearchQuery={setSearchQuery} selectedId={selectedId} onSelect={p => { setSelectedId(p.id); setDesktopMode("view"); setEditId(null); setForm(emptyForm); }} margeMap={margeMap} toonMarge={permissies.zietProjectFinancien} loading={loading} uitleenWeekUren={uitleenWeekUren} />

          <div className="pj-detail">
            {desktopMode === "add" ? (
              <DesktopFormPanel title="Nieuw project aanmaken" onCancel={() => setDesktopMode("view")} onSubmit={() => handleSubmit(true)} submitLabel="Project aanmaken">
                {formFields}
              </DesktopFormPanel>
            ) : desktopMode === "edit" && selectedProject ? (
              <DesktopFormPanel title="Project bewerken" onCancel={() => setDesktopMode("view")} onSubmit={() => handleSubmit(false, selectedId!)} submitLabel="Opslaan">
                {formFields}
              </DesktopFormPanel>
            ) : selectedProject ? (
              <DesktopProjectDetail key={selectedProject.id} project={selectedProject} ogNaam={getOgNaam(selectedProject.opdrachtgever_id)} isManager={isManager} zietFinancien={permissies.zietProjectFinancien} confirmDeleteId={confirmDeleteId} onEdit={() => startDesktopEdit(selectedProject)} onToggle={() => toggleActive(selectedProject)} onDelete={() => handleDelete(selectedProject)} onCancelDelete={() => setConfirmDeleteId(null)} navigate={navigate} onStartIntake={() => setIntakeProjectId(selectedProject.id)} onZetSoort={(soort) => zetSoort(selectedProject, soort)} />
            ) : (
              <div className="pj-empty">
                <FolderOpen className="mb-3 h-8 w-8" />
                <p className="font-medium">Selecteer een project</p>
                <p className="mt-1 text-xs">Klik op een project links om de details te bekijken</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MOBILE */}
      <div className="lg:hidden">
        <div style={{ background: "var(--app-navy)", minHeight: "100dvh", paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 190px)" }}>
          {/* HEADER */}
          <MobileHeader initials={profile?.full_name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?'} />

          <main style={{ padding: "24px 20px" }}>
            {/* SECTION HEADER */}
            <section style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 10, fontWeight: 700, fontFamily: "Hanken Grotesk", textTransform: "uppercase", letterSpacing: "0.2em", color: "var(--accent)", marginBottom: 4 }}>PROJECTEN</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <h2 style={{ fontFamily: "Hanken Grotesk", fontWeight: 800, fontSize: 26, color: "var(--text-primary)" }}>{activeProjects.length} actieve projecten</h2>
              </div>
            </section>

            {/* SEARCH */}
            <div style={{ position: "relative", marginBottom: 16 }}>
              <span className="material-symbols-outlined" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 20, color: "var(--text-muted)" }}>search</span>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Zoek op naam, adres of ID..." style={{ width: "100%", height: 52, paddingLeft: 44, paddingRight: 16, background: "var(--bg-surface-2)", border: "none", borderRadius: 14, color: "var(--text-primary)", fontFamily: "Hanken Grotesk", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
            </div>

            {/* FILTER CHIPS */}
            <div style={{ display: "flex", gap: 8, marginBottom: 24, overflowX: "auto", scrollbarWidth: "none" }}>
              {[
                { key: "alle", label: "Alles" },
                { key: "lopend", label: `Lopend (${projects.filter(p => matchFase(p, "lopend")).length})` },
                { key: "aandacht", label: `Aandacht nodig (${projects.filter(p => matchFase(p, "aandacht")).length})` },
                { key: "uitleen", label: `Uitleen (${projects.filter(isUitleen).length})` },
                { key: "afgerond", label: `Afgerond (${projects.filter(p => matchFase(p, "afgerond")).length})` },
              ].map(f => (
                <button key={f.key} onClick={() => setStatusFilter(f.key)} style={{
                  padding: "8px 16px", borderRadius: 9999,
                  border: statusFilter === f.key ? "none" : "1px solid var(--planning-border-soft)",
                  background: statusFilter === f.key ? "var(--accent)" : "var(--bg-surface-2)",
                  color: statusFilter === f.key ? "var(--accent-dark)" : "var(--text-muted)",
                  fontFamily: "Hanken Grotesk", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
                }}>{f.label}</button>
              ))}
            </div>

            {/* LOADING */}
            {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Laden...</div>}

            {/* ARCHIEF TOGGLE */}
            <button onClick={() => setMobielArchief(v => !v)} style={{ background: "none", border: "none", padding: 0, marginBottom: 16, fontSize: 12, fontWeight: 600, fontFamily: "Hanken Grotesk", color: "var(--text-muted)", cursor: "pointer" }}>
              {mobielArchief ? "Archief verbergen" : `Archief tonen (${projects.filter(p => !p.active).length})`}
            </button>

            {/* PROJECT CARDS */}
            {!loading && statusFilter === "alle" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {mobielGroepen.filter(g => g.items.length > 0).map(g => (
                  <section key={g.label}>
                    <p style={groepLabelStyle}>{g.label}</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{g.items.map(renderProjectCard)}</div>
                  </section>
                ))}
                {mobielGroepen.every(g => g.items.length === 0) && (
                  <p style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>Geen projecten gevonden</p>
                )}
              </div>
            )}
            {!loading && statusFilter !== "alle" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {mobielLijst.map(renderProjectCard)}
                {mobielLijst.length === 0 && (
                  <p style={{ textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: 13 }}>Geen projecten gevonden</p>
                )}
              </div>
            )}
          </main>

          {/* FAB */}
          <button onClick={() => { setShowAdd(true); setEditId(null); setExpandedId(null); setForm(emptyForm); }} style={{
            position: "fixed", bottom: "calc(88px + env(safe-area-inset-bottom, 34px))", right: 20, zIndex: 40,
            background: "var(--accent)", color: "#fff", border: "none", borderRadius: 9999,
            height: 52, padding: "0 20px", display: "flex", alignItems: "center", gap: 8,
            fontFamily: "Hanken Grotesk", fontWeight: 800, fontSize: 14, textTransform: "uppercase",
            letterSpacing: "0.1em", cursor: "pointer", boxShadow: "0 8px 24px var(--accent-border)", whiteSpace: "nowrap",
          }}>
            <Plus size={20} /> NIEUW PROJECT
          </button>

          {/* NEW PROJECT BOTTOM SHEET */}
          {showAdd && (
            <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <div onClick={() => setShowAdd(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
              <div style={{ position: "relative", background: "var(--app-navy)", borderRadius: "40px 40px 0 0", padding: 24, paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 32px)", borderTop: "1px solid var(--planning-border-soft)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                <div style={{ width: 48, height: 6, borderRadius: 9999, background: "var(--border-strong)", margin: "0 auto 24px" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h2 style={{ fontFamily: "Hanken Grotesk", fontWeight: 800, fontSize: 24, color: "var(--text-primary)" }}>Nieuw project</h2>
                  <button onClick={() => setShowAdd(false)} style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--bg-surface-2)", border: "none", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <X size={20} />
                  </button>
                </div>
                <ProjectFormFields form={form} setForm={setForm} opdrachtgevers={opdrachtgevers} isManager={isManager} errors={formErrors} clearError={clearError} toonSoortKeuze />
                <button onClick={() => handleSubmit(true)} style={{
                  width: "100%", height: 64, borderRadius: 16, background: "var(--accent)", border: "none", color: "var(--accent-dark)",
                  fontFamily: "Hanken Grotesk", fontWeight: 800, fontSize: 16, textTransform: "uppercase", letterSpacing: "0.1em",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  boxShadow: "0 8px 32px var(--accent-border)", marginTop: 24,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  PROJECT AANMAKEN
                </button>
              </div>
            </div>
          )}

          {/* PROJECT DETAIL BOTTOM SHEET (mobile) */}
          {selectedId && !showAdd && !editId && (() => {
            const p = projects.find(pr => pr.id === selectedId);
            if (!p) return null;
            const ogNaam = getOgNaam(p.opdrachtgever_id);
            return (
              <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div onClick={() => setSelectedId(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
                <div style={{ position: "relative", background: "var(--app-navy)", borderRadius: "32px 32px 0 0", padding: "16px 20px 48px", borderTop: "1px solid var(--planning-border-soft)", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                  <div style={{ width: 48, height: 6, borderRadius: 9999, background: "var(--border-strong)", margin: "0 auto 16px" }} />

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 11, fontFamily: "DM Mono, monospace", color: "var(--accent)", marginBottom: 4 }}>{p.nummer}</p>
                      <h2 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 20, color: "var(--text-primary)", lineHeight: 1.25, letterSpacing: "-0.025em" }}>{p.naam}</h2>
                      {ogNaam && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}><Building2 className="h-3 w-3" /> {ogNaam}</p>}
                    </div>
                    <button onClick={() => setSelectedId(null)} style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--bg-surface-2)", border: "none", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                      <X size={18} />
                    </button>
                  </div>

                  {isUitleen(p) && p.adres && (
                    <div className="rounded-xl p-3 mb-3 space-y-1" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
                      <p className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>Standaard werklocatie</p>
                      <p className="text-xs" style={{ color: "var(--text-primary)" }}>{p.adres}</p>
                      <a href={`https://maps.google.com/?q=${encodeURIComponent(p.adres)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs mt-1" style={{ color: "var(--accent)" }}>
                        <MapPin className="h-3 w-3" /> Bekijk op kaart ↗
                      </a>
                    </div>
                  )}

                  {(p.straat || p.stad) && (
                    <div className="rounded-xl p-3 mb-3 space-y-1" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
                      {p.straat && <p className="text-xs" style={{ color: "var(--text-primary)" }}>{p.straat}</p>}
                      {(p.postcode || p.stad) && <p className="text-xs" style={{ color: "var(--text-primary)" }}>{p.postcode} {p.stad}</p>}
                      {(p.straat && p.stad) && (
                        <a href={`https://maps.google.com/?q=${encodeURIComponent(`${p.straat}, ${p.postcode || ""} ${p.stad}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs mt-1" style={{ color: "var(--accent)" }}>
                          <MapPin className="h-3 w-3" /> Bekijk op kaart ↗
                        </a>
                      )}
                    </div>
                  )}

                  {isManager && (p.contactpersoon_naam || p.contactpersoon_tel || p.contactpersoon_email) && (
                    <div className="rounded-xl p-3 mb-3 space-y-1.5" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
                      <p className="text-[11px] font-semibold" style={{ color: "var(--warn-text)" }}>Contactpersoon opdrachtgever</p>
                      {p.contactpersoon_naam && <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{p.contactpersoon_naam}</p>}
                      {p.contactpersoon_tel && <a href={`tel:${p.contactpersoon_tel}`} className="text-xs flex items-center gap-1.5" style={{ color: "var(--accent)" }}><Phone className="h-3 w-3" /> {p.contactpersoon_tel}</a>}
                      {p.contactpersoon_email && <a href={`mailto:${p.contactpersoon_email}`} className="text-xs flex items-center gap-1.5" style={{ color: "var(--accent)" }}><Mail className="h-3 w-3" /> {p.contactpersoon_email}</a>}
                    </div>
                  )}

                  {isUitleen(p) && <UitleenUrenKaart projectId={p.id} compact />}

                  {/* Planning status — concept ↔ definitief toggle */}
                  {isManager && (
                    <div className="mb-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Planning</p>
                      <PlanningStatusTab projectId={p.id} profileId={profileId ?? undefined} onStatusChange={fetchData} />
                    </div>
                  )}

                  {isManager && (
                    <button onClick={() => zetSoort(p as any, isUitleen(p) ? "project" : "uitleen")} className="w-full py-2.5 mt-3 rounded-xl text-xs font-semibold" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>
                      {isUitleen(p) ? "Omzetten naar klus" : "Omzetten naar uitleen"}
                    </button>
                  )}

                  {isManager && (
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => { startEdit(p as any); setSelectedId(null); }} className="flex-1 py-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5" style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}>
                        <Pencil className="h-3.5 w-3.5" /> Bewerken
                      </button>
                      <button onClick={() => toggleActive(p as any)} className="flex-1 py-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5" style={{ background: p.active ? "var(--accent-light)" : "var(--bg-surface-2)", color: p.active ? "var(--accent)" : "var(--text-muted)" }}>
                        {p.active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />} {p.active ? "Actief" : "Inactief"}
                      </button>
                      <button onClick={() => { if (confirm(`"${p.naam}" verwijderen?`)) handleDelete(p as any); }} className="px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-center" style={{ background: "var(--danger-light)", color: "var(--danger)" }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* EDIT PROJECT BOTTOM SHEET (mobile) */}
          {editId && (() => {
            const p = projects.find(pr => pr.id === editId);
            if (!p) return null;
            return (
              <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div onClick={() => { setEditId(null); setForm(emptyForm); }} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
                <div style={{ position: "relative", background: "var(--app-navy)", borderRadius: "32px 32px 0 0", padding: 24, paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 32px)", borderTop: "1px solid var(--planning-border-soft)", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                  <div style={{ width: 48, height: 6, borderRadius: 9999, background: "var(--border-strong)", margin: "0 auto 16px" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <h2 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 22, color: "var(--text-primary)", letterSpacing: "-0.025em" }}>Project bewerken</h2>
                    <button onClick={() => { setEditId(null); setForm(emptyForm); }} style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--bg-surface-2)", border: "none", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <X size={18} />
                    </button>
                  </div>
                  <ProjectFormFields form={form} setForm={setForm} opdrachtgevers={opdrachtgevers} isManager={isManager} errors={formErrors} clearError={clearError} />
                  <button onClick={() => handleSubmit(false, editId)} style={{
                    width: "100%", height: 56, borderRadius: 16, background: "var(--accent)", border: "none", color: "var(--accent-dark)",
                    fontFamily: "DM Sans", fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.1em",
                    cursor: "pointer", marginTop: 24,
                  }}>
                    Opslaan
                  </button>
                </div>
              </div>
            );
          })()}

          <BottomNav badges={badges} />
        </div>
      </div>

      {intakeProjectId && (() => {
        const p = projects.find(pr => pr.id === intakeProjectId);
        return p ? (
          <ForecastIntakeWizard projectId={intakeProjectId} project={{ nummer: p.nummer, naam: p.naam, case_type: p.case_type }}
            onClose={() => setIntakeProjectId(null)} onComplete={() => { setIntakeProjectId(null); fetchData(); toast.success("Forecast aangemaakt op basis van intake ✓"); }} />
        ) : null;
      })()}
    </>
  );
}

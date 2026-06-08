import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
import { valideer, projectSchema } from "@/lib/validatie";
import { ListSkeleton, ProjectCardSkeleton } from "@/components/ui/Skeletons";

interface Opdrachtgever { id: string; naam: string; }
interface Project {
  id: string; nummer: string; naam: string; active: boolean; opdrachtgever_id: string | null;
  stationsnaam: string | null; adres: string | null; case_type: string | null;
  contactpersoon_naam: string | null; contactpersoon_tel: string | null; contactpersoon_email: string | null;
  straat: string | null; postcode: string | null; stad: string | null;
  intake_gedaan: boolean; rmu_merk: string | null; rmu_configuratie_id: string | null;
  status: string;
}

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
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

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

  async function handleSubmit(isNew: boolean, id?: string) {
    const vResult = valideer(projectSchema, form);
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
    setForm({ nummer: p.nummer, naam: p.naam, opdrachtgever_id: p.opdrachtgever_id, stationsnaam: p.stationsnaam || "", straat: p.straat || "", postcode: p.postcode || "", stad: p.stad || "", case_type: p.case_type || "", contactpersoon_naam: p.contactpersoon_naam || "", contactpersoon_tel: p.contactpersoon_tel || "", contactpersoon_email: p.contactpersoon_email || "", vergoed_methode: "" });
  }

  function startDesktopEdit(p: Project) {
    setDesktopMode("edit"); setSelectedId(p.id);
    setForm({ nummer: p.nummer, naam: p.naam, opdrachtgever_id: p.opdrachtgever_id, stationsnaam: p.stationsnaam || "", straat: p.straat || "", postcode: p.postcode || "", stad: p.stad || "", case_type: p.case_type || "", contactpersoon_naam: p.contactpersoon_naam || "", contactpersoon_tel: p.contactpersoon_tel || "", contactpersoon_email: p.contactpersoon_email || "", vergoed_methode: "" });
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
  const selectedProject = selectedId ? projects.find(p => p.id === selectedId) || null : null;

  const clearError = (field: string) => setFormErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
  const formFields = <ProjectFormFields form={form} setForm={setForm} opdrachtgevers={opdrachtgevers} isManager={isManager} errors={formErrors} clearError={clearError} />;

  return (
    <>
      <DesktopSidebar badges={badges} />

      {/* DESKTOP */}
      <div className="hidden lg:block" style={{ marginLeft: 240, minHeight: "100vh", background: "var(--app-navy)" }}>
        <header className="flex items-center justify-between px-10 pt-8 pb-4">
          <div>
            <h1 className="text-[22px] font-medium" style={{ color: "#dae6ff" }}>Projecten</h1>
            <p className="text-sm mt-0.5" style={{ color: "#a0abc3" }}>{activeProjects.length} projecten actief</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/opdrachtgevers")} className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>
              <Building2 className="h-3.5 w-3.5" /> Opdrachtgevers →
            </button>
            <button onClick={() => { setDesktopMode("add"); setSelectedId(null); setForm(emptyForm); }} className="px-3 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1.5" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)" }}>
              <Plus className="h-3.5 w-3.5" /> Nieuw project
            </button>
          </div>
        </header>

        <div className="flex px-10 pb-10" style={{ height: "calc(100vh - 100px)" }}>
          <DesktopProjectLijst activeProjects={filteredActive} inactiveProjects={filteredInactive} searchQuery={searchQuery} setSearchQuery={setSearchQuery} selectedId={selectedId} onSelect={p => { setSelectedId(p.id); setDesktopMode("view"); setEditId(null); setForm(emptyForm); }} margeMap={margeMap} getOgNaam={getOgNaam} loading={loading} statusFilter={statusFilter} onStatusFilter={setStatusFilter} />

          <div className="flex-1 overflow-y-auto pl-8">
            {desktopMode === "add" ? (
              <DesktopFormPanel title="Nieuw project aanmaken" onCancel={() => setDesktopMode("view")} onSubmit={() => handleSubmit(true)} submitLabel="Project aanmaken">
                {formFields}
              </DesktopFormPanel>
            ) : desktopMode === "edit" && selectedProject ? (
              <DesktopFormPanel title="Project bewerken" onCancel={() => setDesktopMode("view")} onSubmit={() => handleSubmit(false, selectedId!)} submitLabel="Opslaan">
                {formFields}
              </DesktopFormPanel>
            ) : selectedProject ? (
              <DesktopProjectDetail project={selectedProject} ogNaam={getOgNaam(selectedProject.opdrachtgever_id)} isManager={isManager} confirmDeleteId={confirmDeleteId} onEdit={() => startDesktopEdit(selectedProject)} onToggle={() => toggleActive(selectedProject)} onDelete={() => handleDelete(selectedProject)} onCancelDelete={() => setConfirmDeleteId(null)} navigate={navigate} onStartIntake={() => setIntakeProjectId(selectedProject.id)} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full" style={{ color: "#a0abc3" }}>
                <FolderOpen className="h-8 w-8 mb-3" />
                <p className="text-sm font-medium">Selecteer een project</p>
                <p className="text-xs mt-1">Klik op een project links om de details te bekijken</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MOBILE */}
      <div className="lg:hidden">
        <div style={{ background: "var(--app-navy)", minHeight: "100dvh", paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 120px)" }}>
          {/* HEADER */}
          <MobileHeader initials={profile?.full_name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?'} />

          <main style={{ padding: "24px 20px" }}>
            {/* SECTION HEADER */}
            <section style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.2em", color: "#3fff8b", marginBottom: 4 }}>PROJECTEN</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <h2 style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 26, color: "#dae6ff" }}>{activeProjects.length} actieve projecten</h2>
              </div>
            </section>

            {/* SEARCH */}
            <div style={{ position: "relative", marginBottom: 16 }}>
              <span className="material-symbols-outlined" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 20, color: "#a0abc3" }}>search</span>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Zoek op naam, adres of ID..." style={{ width: "100%", height: 52, paddingLeft: 44, paddingRight: 16, background: "#000000", border: "none", borderRadius: 14, color: "#dae6ff", fontFamily: "Inter", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
            </div>

            {/* FILTER CHIPS */}
            <div style={{ display: "flex", gap: 8, marginBottom: 24, overflowX: "auto", scrollbarWidth: "none" }}>
              {[
                { key: "alle", label: "Alles" },
                { key: "actief", label: `Actief (${activeProjects.length})` },
                { key: "concept", label: `Concept (${projects.filter(p => p.status === "concept").length})` },
                { key: "afgerond", label: "Voltooid" },
              ].map(f => (
                <button key={f.key} onClick={() => setStatusFilter(f.key)} style={{
                  padding: "8px 16px", borderRadius: 9999,
                  border: statusFilter === f.key ? "none" : "1px solid rgba(255,255,255,0.07)",
                  background: statusFilter === f.key ? "#3fff8b" : "#152640",
                  color: statusFilter === f.key ? "#005d2c" : "#a0abc3",
                  fontFamily: "Inter", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
                }}>{f.label}</button>
              ))}
            </div>

            {/* LOADING */}
            {loading && <div style={{ textAlign: "center", padding: 40, color: "#a0abc3" }}>Laden...</div>}

            {/* PROJECT CARDS */}
            {!loading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {projects
                  .filter(p => {
                    if (statusFilter === "actief") return p.active;
                    if (statusFilter === "concept") return p.status === "concept";
                    if (statusFilter === "afgerond") return !p.active;
                    return true;
                  })
                  .filter(p => !searchQuery || p.naam?.toLowerCase().includes(searchQuery.toLowerCase()) || p.nummer?.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((project) => {
                    const isConcept = project.status === "concept";
                    const borderColor = isConcept ? "#feb300" : "#3fff8b";
                    return (
                      <div key={project.id} onClick={() => setSelectedId(project.id)} style={{
                        background: "linear-gradient(135deg, rgba(10,26,48,0.7), rgba(6,19,39,0.8))",
                        backdropFilter: "blur(12px)", borderRadius: 20,
                        border: "1px solid rgba(106,118,140,0.15)", borderLeft: `4px solid ${borderColor}`,
                        overflow: "hidden", cursor: "pointer",
                      }}>
                        <div style={{ padding: 20 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                            <div>
                              <p style={{ fontSize: 10, fontFamily: "Inter", fontWeight: 700, color: "#a0abc3", fontVariant: "tabular-nums", marginBottom: 4 }}>ID #{project.nummer}</p>
                              <h3 style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 16, color: "#dae6ff", lineHeight: 1.3 }}>{project.naam}</h3>
                              {project.stad && (
                                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#a0abc3" }}>location_on</span>
                                  <span style={{ fontSize: 13, color: "#a0abc3", fontFamily: "Inter" }}>{project.stad}</span>
                                </div>
                              )}
                            </div>
                            <div style={{ padding: "4px 12px", borderRadius: 9999, background: isConcept ? "rgba(254,179,0,0.1)" : "rgba(63,255,139,0.1)", border: `1px solid ${borderColor}50` }}>
                              <span style={{ fontSize: 9, fontWeight: 800, fontFamily: "Inter", textTransform: "uppercase", color: borderColor }}>
                                {isConcept ? "CONCEPT" : project.active ? "ACTIEF" : "AFGEROND"}
                              </span>
                            </div>
                          </div>

                          {/* Progress */}
                          {!isConcept && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                <span style={{ fontSize: 12, color: "#a0abc3", fontFamily: "Inter" }}>
                                  {margeMap.get(project.id)?.omzet ? `€ ${margeMap.get(project.id)!.omzet.toLocaleString("nl")}` : "0 uur geboekt"}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#3fff8b", fontFamily: "Inter" }}>
                                  {margeMap.get(project.id)?.marge ? `${Math.round(margeMap.get(project.id)!.marge)}%` : "—"}
                                </span>
                              </div>
                              <div style={{ height: 4, background: "#000", borderRadius: 9999, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.min(100, margeMap.get(project.id)?.marge || 0)}%`, background: "#3fff8b", borderRadius: 9999, boxShadow: "0 0 8px rgba(63,255,139,0.5)" }} />
                              </div>
                            </div>
                          )}

                          {/* Concept warning */}
                          {isConcept && (
                            <div style={{ background: "rgba(254,179,0,0.08)", borderTop: "1px solid rgba(254,179,0,0.15)", padding: "10px 0 0", display: "flex", alignItems: "center", gap: 8 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#feb300", fontVariationSettings: "'FILL' 1" }}>warning</span>
                              <span style={{ fontSize: 12, color: "#feb300", fontFamily: "Inter", fontWeight: 600 }}>Nog geen monteurs ingepland</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </main>

          {/* FAB */}
          <button onClick={() => { setShowAdd(true); setEditId(null); setExpandedId(null); setForm(emptyForm); }} style={{
            position: "fixed", bottom: "calc(96px + env(safe-area-inset-bottom, 34px))", left: "50%", transform: "translateX(-50%)", zIndex: 40,
            background: "#3fff8b", color: "#005d2c", border: "none", borderRadius: 9999,
            height: 56, padding: "0 28px", display: "flex", alignItems: "center", gap: 8,
            fontFamily: "Manrope", fontWeight: 800, fontSize: 14, textTransform: "uppercase",
            letterSpacing: "0.1em", cursor: "pointer", boxShadow: "0 8px 24px rgba(63,255,139,0.3)", whiteSpace: "nowrap",
          }}>
            <Plus size={20} /> NIEUW PROJECT
          </button>

          {/* NEW PROJECT BOTTOM SHEET */}
          {showAdd && (
            <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <div onClick={() => setShowAdd(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
              <div style={{ position: "relative", background: "var(--app-navy)", borderRadius: "40px 40px 0 0", padding: 24, paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 32px)", borderTop: "1px solid rgba(255,255,255,0.1)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                <div style={{ width: 48, height: 6, borderRadius: 9999, background: "rgba(255,255,255,0.2)", margin: "0 auto 24px" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                  <h2 style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 24, color: "#dae6ff" }}>Nieuw project</h2>
                  <button onClick={() => setShowAdd(false)} style={{ width: 40, height: 40, borderRadius: "50%", background: "#142640", border: "none", color: "#a0abc3", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <X size={20} />
                  </button>
                </div>
                <ProjectFormFields form={form} setForm={setForm} opdrachtgevers={opdrachtgevers} isManager={isManager} errors={formErrors} clearError={clearError} />
                <button onClick={() => handleSubmit(true)} style={{
                  width: "100%", height: 64, borderRadius: 16, background: "#3fff8b", border: "none", color: "#005d2c",
                  fontFamily: "Manrope", fontWeight: 800, fontSize: 16, textTransform: "uppercase", letterSpacing: "0.1em",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  boxShadow: "0 8px 32px rgba(63,255,139,0.2)", marginTop: 24,
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
                <div style={{ position: "relative", background: "var(--app-navy)", borderRadius: "32px 32px 0 0", padding: "16px 20px 48px", borderTop: "1px solid rgba(255,255,255,0.1)", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                  <div style={{ width: 48, height: 6, borderRadius: 9999, background: "rgba(255,255,255,0.2)", margin: "0 auto 16px" }} />

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 11, fontFamily: "DM Mono, monospace", color: "#3fff8b", marginBottom: 4 }}>{p.nummer}</p>
                      <h2 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 20, color: "#dae6ff", lineHeight: 1.25, letterSpacing: "-0.025em" }}>{p.naam}</h2>
                      {ogNaam && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "#a0abc3" }}><Building2 className="h-3 w-3" /> {ogNaam}</p>}
                    </div>
                    <button onClick={() => setSelectedId(null)} style={{ width: 36, height: 36, borderRadius: "50%", background: "#142640", border: "none", color: "#a0abc3", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                      <X size={18} />
                    </button>
                  </div>

                  {(p.straat || p.stad) && (
                    <div className="rounded-xl p-3 mb-3 space-y-1" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
                      {p.straat && <p className="text-xs" style={{ color: "#dae6ff" }}>{p.straat}</p>}
                      {(p.postcode || p.stad) && <p className="text-xs" style={{ color: "#dae6ff" }}>{p.postcode} {p.stad}</p>}
                      {(p.straat && p.stad) && (
                        <a href={`https://maps.google.com/?q=${encodeURIComponent(`${p.straat}, ${p.postcode || ""} ${p.stad}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs mt-1" style={{ color: "#3fff8b" }}>
                          <MapPin className="h-3 w-3" /> Bekijk op kaart ↗
                        </a>
                      )}
                    </div>
                  )}

                  {isManager && (p.contactpersoon_naam || p.contactpersoon_tel || p.contactpersoon_email) && (
                    <div className="rounded-xl p-3 mb-3 space-y-1.5" style={{ background: "rgba(254,179,0,0.08)", border: "1px solid rgba(254,179,0,0.3)" }}>
                      <p className="text-[11px] font-semibold" style={{ color: "#feb300" }}>Contactpersoon opdrachtgever</p>
                      {p.contactpersoon_naam && <p className="text-sm font-medium" style={{ color: "#dae6ff" }}>{p.contactpersoon_naam}</p>}
                      {p.contactpersoon_tel && <a href={`tel:${p.contactpersoon_tel}`} className="text-xs flex items-center gap-1.5" style={{ color: "#3fff8b" }}><Phone className="h-3 w-3" /> {p.contactpersoon_tel}</a>}
                      {p.contactpersoon_email && <a href={`mailto:${p.contactpersoon_email}`} className="text-xs flex items-center gap-1.5" style={{ color: "#3fff8b" }}><Mail className="h-3 w-3" /> {p.contactpersoon_email}</a>}
                    </div>
                  )}

                  {/* Planning status — concept ↔ definitief toggle */}
                  {isManager && (
                    <div className="mb-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#a0abc3" }}>Planning</p>
                      <PlanningStatusTab projectId={p.id} profileId={profileId ?? undefined} onStatusChange={fetchData} />
                    </div>
                  )}

                  {isManager && (
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => { startEdit(p as any); setSelectedId(null); }} className="flex-1 py-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5" style={{ background: "#102038", color: "#dae6ff" }}>
                        <Pencil className="h-3.5 w-3.5" /> Bewerken
                      </button>
                      <button onClick={() => toggleActive(p as any)} className="flex-1 py-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5" style={{ background: p.active ? "rgba(63,255,139,0.1)" : "#102038", color: p.active ? "#3fff8b" : "#a0abc3" }}>
                        {p.active ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />} {p.active ? "Actief" : "Inactief"}
                      </button>
                      <button onClick={() => { if (confirm(`"${p.naam}" verwijderen?`)) handleDelete(p as any); }} className="px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-center" style={{ background: "rgba(255,113,108,0.1)", color: "#ff716c" }}>
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
                <div style={{ position: "relative", background: "var(--app-navy)", borderRadius: "32px 32px 0 0", padding: 24, paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 32px)", borderTop: "1px solid rgba(255,255,255,0.1)", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                  <div style={{ width: 48, height: 6, borderRadius: 9999, background: "rgba(255,255,255,0.2)", margin: "0 auto 16px" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <h2 style={{ fontFamily: "DM Sans", fontWeight: 700, fontSize: 22, color: "#dae6ff", letterSpacing: "-0.025em" }}>Project bewerken</h2>
                    <button onClick={() => { setEditId(null); setForm(emptyForm); }} style={{ width: 36, height: 36, borderRadius: "50%", background: "#142640", border: "none", color: "#a0abc3", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <X size={18} />
                    </button>
                  </div>
                  <ProjectFormFields form={form} setForm={setForm} opdrachtgevers={opdrachtgevers} isManager={isManager} errors={formErrors} clearError={clearError} />
                  <button onClick={() => handleSubmit(false, editId)} style={{
                    width: "100%", height: 56, borderRadius: 16, background: "#3fff8b", border: "none", color: "#005d2c",
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

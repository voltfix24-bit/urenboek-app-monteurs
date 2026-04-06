import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useProjectenQuery } from "@/hooks/queries/useProjectenQuery";
import { ArrowLeft, Plus, Building2, X, FolderOpen } from "lucide-react";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { BottomNav } from "@/components/BottomNav";
import { useNavBadges } from "@/hooks/useNavBadges";
import { ForecastIntakeWizard } from "@/components/ForecastIntakeWizard";
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
    setForm({ nummer: p.nummer, naam: p.naam, opdrachtgever_id: p.opdrachtgever_id, stationsnaam: p.stationsnaam || "", straat: p.straat || "", postcode: p.postcode || "", stad: p.stad || "", case_type: p.case_type || "", contactpersoon_naam: p.contactpersoon_naam || "", contactpersoon_tel: p.contactpersoon_tel || "", contactpersoon_email: p.contactpersoon_email || "" });
  }

  function startDesktopEdit(p: Project) {
    setDesktopMode("edit"); setSelectedId(p.id);
    setForm({ nummer: p.nummer, naam: p.naam, opdrachtgever_id: p.opdrachtgever_id, stationsnaam: p.stationsnaam || "", straat: p.straat || "", postcode: p.postcode || "", stad: p.stad || "", case_type: p.case_type || "", contactpersoon_naam: p.contactpersoon_naam || "", contactpersoon_tel: p.contactpersoon_tel || "", contactpersoon_email: p.contactpersoon_email || "" });
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
      <div className="hidden lg:block" style={{ marginLeft: 240, minHeight: "100vh", background: "var(--bg-base)" }}>
        <header className="flex items-center justify-between px-10 pt-8 pb-4">
          <div>
            <h1 className="text-[22px] font-medium" style={{ color: "var(--text-primary)" }}>Projecten</h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>{activeProjects.length} projecten actief</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/opdrachtgevers")} className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              <Building2 className="h-3.5 w-3.5" /> Opdrachtgevers →
            </button>
            <button onClick={() => { setDesktopMode("add"); setSelectedId(null); setForm(emptyForm); }} className="px-3 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1.5" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
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
              <div className="flex flex-col items-center justify-center h-full" style={{ color: "var(--text-muted)" }}>
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
        <div className="min-h-screen" style={{ background: "var(--bg-base)", maxWidth: 430, margin: "0 auto" }}>
          <header className="sticky top-0 z-30 px-4 py-3" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center gap-3">
              <button onClick={() => navigate("/")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}><ArrowLeft className="h-4 w-4" /></button>
              <h1 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Projecten</h1>
              <div className="flex-1" />
              <button onClick={() => navigate("/opdrachtgevers")} className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1" style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}><Building2 className="h-3.5 w-3.5" /> Opdrachtgevers</button>
              <button onClick={() => { setShowAdd(true); setEditId(null); setExpandedId(null); setForm(emptyForm); }} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--success-light)", border: "1px solid var(--success-border)" }}><Plus className="h-4 w-4" style={{ color: "var(--success)" }} /></button>
            </div>
          </header>
          <div className="px-4 py-4 space-y-4 pb-24">
            {showAdd && (
              <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "var(--bg-surface)", border: "1px solid var(--accent-border)" }}>
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Nieuw project</h3>
                {formFields}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Annuleren</button>
                  <button onClick={() => handleSubmit(true)} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>Toevoegen</button>
                </div>
              </div>
            )}
            {loading ? <ListSkeleton count={4} ItemSkeleton={ProjectCardSkeleton} /> : (
              <>
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider px-1" style={{ color: "var(--text-muted)" }}>Actief ({activeProjects.length})</p>
                  {activeProjects.map(p => (
                    <ProjectCard key={p.id} project={p} ogNaam={getOgNaam(p.opdrachtgever_id)} isManager={isManager}
                      isEditing={editId === p.id} isExpanded={expandedId === p.id} isConfirmingDelete={confirmDeleteId === p.id}
                      renderFormFields={() => formFields}
                      onEdit={() => startEdit(p)} onCancel={() => { setEditId(null); setForm(emptyForm); }}
                      onSave={() => handleSubmit(false, p.id)} onToggle={() => toggleActive(p)}
                      onDelete={() => handleDelete(p)} onCancelDelete={() => setConfirmDeleteId(null)}
                      onToggleExpand={() => setExpandedId(expandedId === p.id ? null : p.id)} />
                  ))}
                </div>
                {inactiveProjects.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider px-1" style={{ color: "var(--text-muted)" }}>Inactief ({inactiveProjects.length})</p>
                    {inactiveProjects.map(p => (
                      <ProjectCard key={p.id} project={p} ogNaam={getOgNaam(p.opdrachtgever_id)} isManager={isManager}
                        isEditing={editId === p.id} isExpanded={expandedId === p.id} isConfirmingDelete={confirmDeleteId === p.id}
                        renderFormFields={() => formFields}
                        onEdit={() => startEdit(p)} onCancel={() => { setEditId(null); setForm(emptyForm); }}
                        onSave={() => handleSubmit(false, p.id)} onToggle={() => toggleActive(p)}
                        onDelete={() => handleDelete(p)} onCancelDelete={() => setConfirmDeleteId(null)}
                        onToggleExpand={() => setExpandedId(expandedId === p.id ? null : p.id)} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <BottomNav badges={badges} />
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

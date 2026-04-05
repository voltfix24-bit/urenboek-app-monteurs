import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, ToggleLeft, ToggleRight, X, Check, Building2, ChevronDown, ChevronUp, Lock, Phone, Mail, Search, FolderOpen, Trash2, CalendarDays } from "lucide-react";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { BottomNav } from "@/components/BottomNav";
import { ForecastTab } from "@/components/ForecastTab";
import { PlanningStatusTab } from "@/components/PlanningStatusTab";

interface Opdrachtgever { id: string; naam: string; }
interface Project {
  id: string; nummer: string; naam: string; active: boolean; opdrachtgever_id: string | null;
  stationsnaam: string | null; adres: string | null; case_type: string | null;
  contactpersoon_naam: string | null; contactpersoon_tel: string | null; contactpersoon_email: string | null;
}
type FormState = {
  nummer: string; naam: string; opdrachtgever_id: string | null;
  stationsnaam: string; adres: string; case_type: string;
  contactpersoon_naam: string; contactpersoon_tel: string; contactpersoon_email: string;
};
const emptyForm: FormState = { nummer: "", naam: "", opdrachtgever_id: null, stationsnaam: "", adres: "", case_type: "", contactpersoon_naam: "", contactpersoon_tel: "", contactpersoon_email: "" };

const inputStyle = { background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#2D4A1E" };

function CaseTypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const styles: Record<string, { bg: string; color: string }> = {
    "NSA-case": { bg: "#D4E8F5", color: "#2D5A8A" },
    "Compactstation": { bg: "#D4E8C2", color: "#2D4A1E" },
    "Provisorium": { bg: "#FFF3CD", color: "#8B6914" },
  };
  const s = styles[type] || { bg: "#EBF0E4", color: "#5A7A42" };
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: s.bg, color: s.color }}>{type}</span>;
}

export default function Projecten() {
  const { isManager } = useAuth(); const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]); const [opdrachtgevers, setOpdrachtgevers] = useState<Opdrachtgever[]>([]);
  const [loading, setLoading] = useState(true); const [showAdd, setShowAdd] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const [margeMap, setMargeMap] = useState<Map<string, { omzet: number; kosten: number; marge: number }>>(new Map());

  const fetchData = useCallback(async () => {
    const [p, o] = await Promise.all([
      supabase.from("projects").select("id, nummer, naam, active, opdrachtgever_id, stationsnaam, adres, case_type, contactpersoon_naam, contactpersoon_tel, contactpersoon_email").order("nummer"),
      supabase.from("opdrachtgevers").select("id, naam").order("naam"),
    ]);
    if (p.data) setProjects(p.data); if (o.data) setOpdrachtgevers(o.data);

    // Fetch forecast marge data for managers
    if (isManager) {
      const { data: forecasts } = await supabase.from("project_forecast").select("id, project_id");
      if (forecasts && forecasts.length > 0) {
        const fIds = forecasts.map((f: any) => f.id);
        const { data: regels } = await supabase.from("forecast_regels").select("forecast_id, tarief_terrevolt, tarief_inkoop, aantal, geplande_uren, uurtarief_snap, type").in("forecast_id", fIds);
        const fProject = new Map(forecasts.map((f: any) => [f.id, f.project_id]));
        const m = new Map<string, { omzet: number; kosten: number; marge: number }>();
        (regels ?? []).forEach((r: any) => {
          const pid = fProject.get(r.forecast_id);
          if (!pid) return;
          const cur = m.get(pid) || { omzet: 0, kosten: 0, marge: 0 };
          if (r.type === "spec") {
            cur.omzet += (r.tarief_terrevolt || 0) * (r.aantal || 1);
            cur.kosten += (r.tarief_inkoop || 0) * (r.aantal || 1);
          } else if (r.type === "uren") {
            cur.kosten += (r.geplande_uren || 0) * (r.uurtarief_snap || 0);
          }
          m.set(pid, cur);
        });
        m.forEach((v, k) => { v.marge = v.omzet > 0 ? ((v.omzet - v.kosten) / v.omzet) * 100 : 0; });
        setMargeMap(m);
      }
    }
    setLoading(false);
  }, [isManager]);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (!isManager) navigate("/"); }, [isManager, navigate]);

  async function handleAdd() {
    if (!form.nummer.trim() || !form.naam.trim()) { toast.error("Vul casenummer en casenaam in"); return; }
    const insert: any = { nummer: form.nummer.trim(), naam: form.naam.trim() };
    if (form.opdrachtgever_id) insert.opdrachtgever_id = form.opdrachtgever_id;
    if (form.stationsnaam.trim()) insert.stationsnaam = form.stationsnaam.trim();
    if (form.adres.trim()) insert.adres = form.adres.trim();
    if (form.case_type) insert.case_type = form.case_type;
    if (isManager) {
      if (form.contactpersoon_naam.trim()) insert.contactpersoon_naam = form.contactpersoon_naam.trim();
      if (form.contactpersoon_tel.trim()) insert.contactpersoon_tel = form.contactpersoon_tel.trim();
      if (form.contactpersoon_email.trim()) insert.contactpersoon_email = form.contactpersoon_email.trim();
    }
    const { error } = await supabase.from("projects").insert(insert);
    if (error) toast.error(error.message.includes("duplicate") ? "Casenummer bestaat al" : "Fout bij toevoegen");
    else { toast.success("Project toegevoegd"); setForm(emptyForm); setShowAdd(false); fetchData(); }
  }

  async function handleUpdate(id: string) {
    if (!form.nummer.trim() || !form.naam.trim()) { toast.error("Vul casenummer en casenaam in"); return; }
    const update: any = {
      nummer: form.nummer.trim(), naam: form.naam.trim(),
      opdrachtgever_id: form.opdrachtgever_id || null,
      stationsnaam: form.stationsnaam.trim() || null,
      adres: form.adres.trim() || null,
      case_type: form.case_type || null,
    };
    if (isManager) {
      update.contactpersoon_naam = form.contactpersoon_naam.trim() || null;
      update.contactpersoon_tel = form.contactpersoon_tel.trim() || null;
      update.contactpersoon_email = form.contactpersoon_email.trim() || null;
    }
    const { error } = await supabase.from("projects").update(update).eq("id", id);
    if (error) toast.error("Fout bij wijzigen");
    else { toast.success("Project gewijzigd"); setEditId(null); setForm(emptyForm); fetchData(); }
  }

  async function toggleActive(p: Project) {
    const { error } = await supabase.from("projects").update({ active: !p.active }).eq("id", p.id);
    if (error) toast.error("Fout"); else { toast.success(p.active ? "Gedeactiveerd" : "Geactiveerd"); fetchData(); }
  }

  async function handleDelete(p: Project) {
    if (confirmDeleteId !== p.id) { setConfirmDeleteId(p.id); return; }
    setConfirmDeleteId(null);
    const { error } = await supabase.from("projects").delete().eq("id", p.id);
    if (error) toast.error("Fout bij verwijderen"); else { toast.success("Verwijderd"); setSearchQuery(""); setSelectedId(null); setDesktopMode("view"); fetchData(); }
  }

  function startEdit(p: Project) {
    setEditId(p.id); setExpandedId(null); setShowAdd(false);
    setForm({
      nummer: p.nummer, naam: p.naam, opdrachtgever_id: p.opdrachtgever_id,
      stationsnaam: p.stationsnaam || "", adres: p.adres || "", case_type: p.case_type || "",
      contactpersoon_naam: p.contactpersoon_naam || "", contactpersoon_tel: p.contactpersoon_tel || "",
      contactpersoon_email: p.contactpersoon_email || "",
    });
  }

  function getOgNaam(id: string | null) { return id ? opdrachtgevers.find(o => o.id === id)?.naam || null : null; }

  const activeProjects = projects.filter(p => p.active);
  const inactiveProjects = projects.filter(p => !p.active);

  // Desktop state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [desktopMode, setDesktopMode] = useState<"view" | "add" | "edit">("view");

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(p => p.naam.toLowerCase().includes(q) || p.nummer.toLowerCase().includes(q));
  }, [projects, searchQuery]);

  const filteredActive = filteredProjects.filter(p => p.active);
  const filteredInactive = filteredProjects.filter(p => !p.active);
  const selectedProject = selectedId ? projects.find(p => p.id === selectedId) || null : null;

  function selectProject(p: Project) {
    setSelectedId(p.id);
    setDesktopMode("view");
    setEditId(null);
    setForm(emptyForm);
  }

  function startDesktopEdit(p: Project) {
    setDesktopMode("edit");
    setSelectedId(p.id);
    setForm({
      nummer: p.nummer, naam: p.naam, opdrachtgever_id: p.opdrachtgever_id,
      stationsnaam: p.stationsnaam || "", adres: p.adres || "", case_type: p.case_type || "",
      contactpersoon_naam: p.contactpersoon_naam || "", contactpersoon_tel: p.contactpersoon_tel || "",
      contactpersoon_email: p.contactpersoon_email || "",
    });
  }

  function startDesktopAdd() {
    setDesktopMode("add");
    setSelectedId(null);
    setForm(emptyForm);
  }

  async function handleDesktopAdd() {
    if (!form.nummer.trim() || !form.naam.trim()) { toast.error("Vul casenummer en casenaam in"); return; }
    const insert: any = { nummer: form.nummer.trim(), naam: form.naam.trim() };
    if (form.opdrachtgever_id) insert.opdrachtgever_id = form.opdrachtgever_id;
    if (form.stationsnaam.trim()) insert.stationsnaam = form.stationsnaam.trim();
    if (form.adres.trim()) insert.adres = form.adres.trim();
    if (form.case_type) insert.case_type = form.case_type;
    if (isManager) {
      if (form.contactpersoon_naam.trim()) insert.contactpersoon_naam = form.contactpersoon_naam.trim();
      if (form.contactpersoon_tel.trim()) insert.contactpersoon_tel = form.contactpersoon_tel.trim();
      if (form.contactpersoon_email.trim()) insert.contactpersoon_email = form.contactpersoon_email.trim();
    }
    const { error } = await supabase.from("projects").insert(insert);
    if (error) toast.error(error.message.includes("duplicate") ? "Casenummer bestaat al" : "Fout bij toevoegen");
    else { toast.success("Project toegevoegd"); setForm(emptyForm); setDesktopMode("view"); fetchData(); }
  }

  async function handleDesktopUpdate() {
    if (!selectedId || !form.nummer.trim() || !form.naam.trim()) { toast.error("Vul casenummer en casenaam in"); return; }
    const update: any = {
      nummer: form.nummer.trim(), naam: form.naam.trim(),
      opdrachtgever_id: form.opdrachtgever_id || null,
      stationsnaam: form.stationsnaam.trim() || null,
      adres: form.adres.trim() || null,
      case_type: form.case_type || null,
    };
    if (isManager) {
      update.contactpersoon_naam = form.contactpersoon_naam.trim() || null;
      update.contactpersoon_tel = form.contactpersoon_tel.trim() || null;
      update.contactpersoon_email = form.contactpersoon_email.trim() || null;
    }
    const { error } = await supabase.from("projects").update(update).eq("id", selectedId);
    if (error) toast.error("Fout bij wijzigen");
    else { toast.success("Project gewijzigd"); setDesktopMode("view"); fetchData(); }
  }

  function renderFormFields() {
    return (
      <>
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#8AAD6E" }}>Projectgegevens</p>
        <div className="grid grid-cols-2 gap-2">
          <input value={form.nummer} onChange={e => setForm(f => ({ ...f, nummer: e.target.value }))} placeholder="Casenummer bijv. 0311927" className="px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
          <input value={form.naam} onChange={e => setForm(f => ({ ...f, naam: e.target.value }))} placeholder="Casenaam" className="px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
        </div>
        <input value={form.stationsnaam} onChange={e => setForm(f => ({ ...f, stationsnaam: e.target.value }))} placeholder="Stationsnaam bijv. KOPPOELLN" className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
        <input value={form.adres} onChange={e => setForm(f => ({ ...f, adres: e.target.value }))} placeholder="Adres: Straat, Stad" className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
        <div className="grid grid-cols-2 gap-2">
          <select value={form.opdrachtgever_id || ""} onChange={e => setForm(f => ({ ...f, opdrachtgever_id: e.target.value || null }))} className="px-3 py-2.5 rounded-xl text-sm" style={inputStyle}>
            <option value="">Geen opdrachtgever</option>
            {opdrachtgevers.map(og => <option key={og.id} value={og.id}>{og.naam}</option>)}
          </select>
          <select value={form.case_type} onChange={e => setForm(f => ({ ...f, case_type: e.target.value }))} className="px-3 py-2.5 rounded-xl text-sm" style={inputStyle}>
            <option value="">Case type</option>
            <option value="NSA-case">NSA-case</option>
            <option value="Compactstation">Compactstation</option>
            <option value="Provisorium">Provisorium</option>
          </select>
        </div>
        {isManager && (
          <div className="rounded-xl p-3 space-y-2 mt-1" style={{ background: "#FFF8DC", border: "1px solid #E8D070" }}>
            <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: "#8B6914" }}>
              <Lock className="h-3 w-3" /> Contactpersoon (alleen zichtbaar voor managers)
            </p>
            <input value={form.contactpersoon_naam} onChange={e => setForm(f => ({ ...f, contactpersoon_naam: e.target.value }))} placeholder="Naam contactpersoon" className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            <div className="grid grid-cols-2 gap-2">
              <input type="tel" value={form.contactpersoon_tel} onChange={e => setForm(f => ({ ...f, contactpersoon_tel: e.target.value }))} placeholder="Telefoonnummer" className="px-3 py-2 rounded-xl text-sm" style={inputStyle} />
              <input type="email" value={form.contactpersoon_email} onChange={e => setForm(f => ({ ...f, contactpersoon_email: e.target.value }))} placeholder="E-mailadres" className="px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <DesktopSidebar />

      {/* ===== DESKTOP LAYOUT ===== */}
      <div className="hidden lg:block" style={{ marginLeft: 240, minHeight: "100vh", background: "#F5F7F0" }}>
        {/* Desktop header */}
        <header className="flex items-center justify-between px-10 pt-8 pb-4">
          <div>
            <h1 className="text-[22px] font-medium" style={{ color: "#2D4A1E" }}>Projecten</h1>
            <p className="text-sm mt-0.5" style={{ color: "#8AAD6E" }}>{activeProjects.length} projecten actief</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/opdrachtgevers")} className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#5A7A42" }}>
              <Building2 className="h-3.5 w-3.5" /> Opdrachtgevers →
            </button>
            <button onClick={startDesktopAdd} className="px-3 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1.5" style={{ background: "linear-gradient(135deg, #4A7C2F, #3D6826)" }}>
              <Plus className="h-3.5 w-3.5" /> Nieuw project
            </button>
          </div>
        </header>

        {/* Desktop 2-column layout */}
        <div className="flex px-10 pb-10" style={{ height: "calc(100vh - 100px)" }}>
          {/* Left: project list */}
          <div className="flex-shrink-0 overflow-y-auto pr-4" style={{ width: "40%", borderRight: "1px solid #C5D4B2" }}>
            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#8AAD6E" }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Zoek op naam of casenummer..."
                className="w-full pl-9 pr-9 py-2 rounded-[10px] text-sm"
                style={{ background: "#EBF0E4", border: "1px solid #C5D4B2", color: "#2D4A1E" }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "#8AAD6E", background: "none", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {loading ? (
              <div className="text-center py-8"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "#4A7C2F", borderTopColor: "transparent" }} /></div>
            ) : (
              <>
                {filteredActive.length > 0 && (
                  <div className="space-y-1.5 mb-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider px-1" style={{ color: "#8AAD6E" }}>Actief ({filteredActive.length})</p>
                    {filteredActive.map(p => (
                      <DesktopListCard key={p.id} project={p} ogNaam={getOgNaam(p.opdrachtgever_id)} selected={selectedId === p.id} onClick={() => selectProject(p)} marge={margeMap.get(p.id)} />
                    ))}
                  </div>
                )}
                {filteredInactive.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider px-1" style={{ color: "#8AAD6E" }}>Inactief ({filteredInactive.length})</p>
                    {filteredInactive.map(p => (
                      <DesktopListCard key={p.id} project={p} ogNaam={getOgNaam(p.opdrachtgever_id)} selected={selectedId === p.id} onClick={() => selectProject(p)} marge={margeMap.get(p.id)} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right: detail panel */}
          <div className="flex-1 overflow-y-auto pl-8">
            {desktopMode === "add" ? (
              <DesktopFormPanel
                title="Nieuw project aanmaken"
                renderFormFields={renderFormFields}
                onCancel={() => setDesktopMode("view")}
                onSubmit={handleDesktopAdd}
                submitLabel="Project aanmaken"
              />
            ) : desktopMode === "edit" && selectedProject ? (
              <DesktopFormPanel
                title="Project bewerken"
                renderFormFields={renderFormFields}
                onCancel={() => setDesktopMode("view")}
                onSubmit={handleDesktopUpdate}
                submitLabel="Opslaan"
              />
            ) : selectedProject ? (
              <DesktopDetailPanel
                project={selectedProject}
                ogNaam={getOgNaam(selectedProject.opdrachtgever_id)}
                isManager={isManager}
                confirmDeleteId={confirmDeleteId}
                onEdit={() => startDesktopEdit(selectedProject)}
                onToggle={() => toggleActive(selectedProject)}
                onDelete={() => handleDelete(selectedProject)}
                onCancelDelete={() => setConfirmDeleteId(null)}
                navigate={navigate}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full" style={{ color: "#8AAD6E" }}>
                <FolderOpen className="h-8 w-8 mb-3" />
                <p className="text-sm font-medium">Selecteer een project</p>
                <p className="text-xs mt-1">Klik op een project links om de details te bekijken</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== MOBILE LAYOUT ===== */}
      <div className="lg:hidden">
        <div className="min-h-screen" style={{ background: "#F5F7F0", maxWidth: 430, margin: "0 auto" }}>
          <header className="sticky top-0 z-30 px-4 py-3" style={{ background: "rgba(235,240,228,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid #C5D4B2" }}>
            <div className="flex items-center gap-3">
              <button onClick={() => navigate("/")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#DFE8D6", color: "#5A7A42" }}><ArrowLeft className="h-4 w-4" /></button>
              <h1 className="text-base font-bold" style={{ color: "#2D4A1E" }}>Projecten</h1>
              <div className="flex-1" />
              <button onClick={() => navigate("/opdrachtgevers")} className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1" style={{ background: "#DFE8D6", color: "#5A7A42" }}><Building2 className="h-3.5 w-3.5" /> Opdrachtgevers</button>
              <button onClick={() => { setShowAdd(true); setEditId(null); setExpandedId(null); setForm(emptyForm); }} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#D4EDD8", border: "1px solid #8DC99A" }}><Plus className="h-4 w-4" style={{ color: "#2D7A3A" }} /></button>
            </div>
          </header>
          <div className="px-4 py-4 space-y-4 pb-24">
            {showAdd && (
              <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "#EBF0E4", border: "1px solid #9DC87A" }}>
                <h3 className="text-sm font-semibold" style={{ color: "#2D4A1E" }}>Nieuw project</h3>
                {renderFormFields()}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#5A7A42" }}>Annuleren</button>
                  <button onClick={handleAdd} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, #4A7C2F, #3D6826)" }}>Toevoegen</button>
                </div>
              </div>
            )}
            {loading ? <div className="text-center py-8"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "#4A7C2F", borderTopColor: "transparent" }} /></div> : (
              <>
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider px-1" style={{ color: "#8AAD6E" }}>Actief ({activeProjects.length})</p>
                  {activeProjects.map(p => (
                    <ProjectRow key={p.id} project={p} ogNaam={getOgNaam(p.opdrachtgever_id)} isManager={isManager}
                      isEditing={editId === p.id} isExpanded={expandedId === p.id} isConfirmingDelete={confirmDeleteId === p.id}
                      form={form} setForm={setForm} renderFormFields={renderFormFields}
                      onEdit={() => startEdit(p)} onCancel={() => { setEditId(null); setForm(emptyForm); }}
                      onSave={() => handleUpdate(p.id)} onToggle={() => toggleActive(p)}
                      onDelete={() => handleDelete(p)} onCancelDelete={() => setConfirmDeleteId(null)}
                      onToggleExpand={() => setExpandedId(expandedId === p.id ? null : p.id)} />
                  ))}
                </div>
                {inactiveProjects.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider px-1" style={{ color: "#8AAD6E" }}>Inactief ({inactiveProjects.length})</p>
                    {inactiveProjects.map(p => (
                      <ProjectRow key={p.id} project={p} ogNaam={getOgNaam(p.opdrachtgever_id)} isManager={isManager}
                        isEditing={editId === p.id} isExpanded={expandedId === p.id} isConfirmingDelete={confirmDeleteId === p.id}
                        form={form} setForm={setForm} renderFormFields={renderFormFields}
                        onEdit={() => startEdit(p)} onCancel={() => { setEditId(null); setForm(emptyForm); }}
                        onSave={() => handleUpdate(p.id)} onToggle={() => toggleActive(p)}
                        onDelete={() => handleDelete(p)} onCancelDelete={() => setConfirmDeleteId(null)}
                        onToggleExpand={() => setExpandedId(expandedId === p.id ? null : p.id)} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <BottomNav />
      </div>
    </>
  );
}

function ProjectRow({ project, ogNaam, isManager, isEditing, isExpanded, isConfirmingDelete, form, setForm, renderFormFields, onEdit, onCancel, onSave, onToggle, onDelete, onCancelDelete, onToggleExpand }: any) {
  if (isEditing) {
    return (
      <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "#EBF0E4", border: "1px solid #7AAADE" }}>
        <h3 className="text-sm font-semibold" style={{ color: "#2D4A1E" }}>Project bewerken</h3>
        {renderFormFields()}
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1" style={{ background: "#F5F7F0", color: "#5A7A42" }}><X className="h-3.5 w-3.5" /> Annuleren</button>
          <button onClick={onSave} className="flex-1 py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1" style={{ background: "linear-gradient(135deg, #4A7C2F, #3D6826)" }}><Check className="h-3.5 w-3.5" /> Opslaan</button>
        </div>
      </div>
    );
  }
  if (isConfirmingDelete) {
    return (
      <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "#FDECEA", border: "1px solid #E8A09A" }}>
        <p className="text-sm font-semibold" style={{ color: "#2D4A1E" }}>"{project.naam}" verwijderen?</p>
        <div className="flex gap-2">
          <button onClick={onCancelDelete} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#5A7A42" }}>Annuleren</button>
          <button onClick={onDelete} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "#C0392B" }}>Verwijderen</button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl overflow-hidden transition-transform active:scale-[0.985]" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2", opacity: project.active ? 1 : 0.5 }}>
      <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={onToggleExpand}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold truncate" style={{ color: "#2D4A1E" }}>{project.naam}</p>
            <CaseTypeBadge type={project.case_type} />
          </div>
          <p className="text-xs mt-0.5 font-mono" style={{ color: "#4A7C2F" }}>{project.nummer}</p>
          {project.stationsnaam && <p className="text-[11px] mt-0.5" style={{ color: "#8AAD6E" }}>{project.stationsnaam}</p>}
          {ogNaam && <p className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: "#8AAD6E" }}><Building2 className="h-3 w-3 shrink-0" /> {ogNaam}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={onEdit} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#DFE8D6" }}><Pencil className="h-3.5 w-3.5" style={{ color: "#5A7A42" }} /></button>
          <button onClick={onToggle} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: project.active ? "#D4EDD8" : "#DFE8D6" }}>
            {project.active ? <ToggleRight className="h-4 w-4" style={{ color: "#2D7A3A" }} /> : <ToggleLeft className="h-4 w-4" style={{ color: "#8AAD6E" }} />}
          </button>
          <button onClick={onDelete} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#FDECEA" }}><X className="h-3.5 w-3.5" style={{ color: "#C0392B" }} /></button>
        </div>
        {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0" style={{ color: "#8AAD6E" }} /> : <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "#8AAD6E" }} />}
      </div>
      {isExpanded && (
        <div className="px-4 pb-4 space-y-2 animate-fade-in" style={{ borderTop: "1px solid #C5D4B2" }}>
          <div className="pt-3 space-y-1.5">
            {project.adres && <DetailLine label="Adres" value={project.adres} />}
            {project.case_type && <DetailLine label="Case type" value={project.case_type} />}
            {project.stationsnaam && <DetailLine label="Station" value={project.stationsnaam} />}
            {ogNaam && <DetailLine label="Opdrachtgever" value={ogNaam} />}
          </div>
          {isManager && (project.contactpersoon_naam || project.contactpersoon_tel || project.contactpersoon_email) && (
            <div className="rounded-xl p-3 space-y-1.5 mt-2" style={{ background: "#FFF8DC", border: "1px solid #E8D070" }}>
              <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: "#8B6914" }}>
                <Lock className="h-3 w-3" /> Contactpersoon opdrachtgever
              </p>
              {project.contactpersoon_naam && <p className="text-sm font-medium" style={{ color: "#2D4A1E" }}>{project.contactpersoon_naam}</p>}
              {project.contactpersoon_tel && (
                <a href={`tel:${project.contactpersoon_tel}`} className="text-xs flex items-center gap-1.5" style={{ color: "#4A7C2F" }}>
                  <Phone className="h-3 w-3" /> {project.contactpersoon_tel}
                </a>
              )}
              {project.contactpersoon_email && (
                <a href={`mailto:${project.contactpersoon_email}`} className="text-xs flex items-center gap-1.5" style={{ color: "#4A7C2F" }}>
                  <Mail className="h-3 w-3" /> {project.contactpersoon_email}
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[11px] font-medium w-24 shrink-0" style={{ color: "#8AAD6E" }}>{label}</span>
      <span className="text-xs" style={{ color: "#2D4A1E" }}>{value}</span>
    </div>
  );
}

/* ===== Desktop-only components ===== */

function DesktopListCard({ project, ogNaam, selected, onClick, marge }: { project: any; ogNaam: string | null; selected: boolean; onClick: () => void; marge?: { omzet: number; kosten: number; marge: number } }) {
  const margeColor = (m: number) => m >= 30 ? "#2D7A3A" : m >= 15 ? "#D4A017" : "#C0392B";
  const margeBg = (m: number) => m >= 30 ? "#D4EDD8" : m >= 15 ? "#FFF3CD" : "#FDECEA";
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-2.5 rounded-xl mb-1.5 transition-colors cursor-pointer"
      style={{
        background: selected ? "#D4E8C2" : "#EBF0E4",
        border: selected ? "1.5px solid #4A7C2F" : "1px solid #C5D4B2",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold truncate" style={{ color: "#2D4A1E" }}>{project.naam}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          {marge && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: margeBg(marge.marge), color: margeColor(marge.marge), fontFamily: "DM Mono, monospace" }}>
              {marge.marge.toFixed(1)}%
            </span>
          )}
          <CaseTypeBadge type={project.case_type} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <span className="text-[11px] font-mono" style={{ color: "#4A7C2F" }}>{project.nummer}</span>
        {ogNaam && <span className="text-[11px] truncate" style={{ color: "#8AAD6E" }}>{ogNaam}</span>}
      </div>
      {project.stationsnaam && <p className="text-[11px] mt-0.5" style={{ color: "#8AAD6E" }}>{project.stationsnaam}</p>}
    </button>
  );
}

function DesktopDetailPanel({ project, ogNaam, isManager, confirmDeleteId, onEdit, onToggle, onDelete, onCancelDelete, navigate }: any) {
  const [activeTab, setActiveTab] = useState<"info" | "forecast" | "planning">("info");
  const tabs = [
    { key: "info" as const, label: "Projectinfo" },
    ...(isManager ? [{ key: "forecast" as const, label: "Forecast" }] : []),
    { key: "planning" as const, label: "Planning" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-medium" style={{ color: "#2D4A1E" }}>{project.naam}</h2>
          <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold" style={{ background: "#D4E8C2", color: "#4A7C2F" }}>{project.nummer}</span>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="w-2 h-2 rounded-full" style={{ background: project.active ? "#4A7C2F" : "#8AAD6E" }} />
            <span className="text-xs font-medium" style={{ color: project.active ? "#4A7C2F" : "#8AAD6E" }}>{project.active ? "Actief" : "Inactief"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onEdit} className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1" style={{ border: "1px solid #C5D4B2", color: "#5A7A42" }}>
            <Pencil className="h-3.5 w-3.5" /> Bewerken
          </button>
          <button onClick={onToggle} className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1" style={{ border: "1px solid #C5D4B2", color: "#5A7A42" }}>
            {project.active ? <ToggleRight className="h-3.5 w-3.5" style={{ color: "#2D7A3A" }} /> : <ToggleLeft className="h-3.5 w-3.5" />}
            {project.active ? "Deactiveren" : "Activeren"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0" style={{ borderBottom: "1px solid #C5D4B2" }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} className="px-4 py-2 text-sm transition-colors" style={{
            color: activeTab === t.key ? "#4A7C2F" : "#8AAD6E",
            fontWeight: activeTab === t.key ? 500 : 400,
            borderBottom: activeTab === t.key ? "2px solid #4A7C2F" : "2px solid transparent",
            marginBottom: -1,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "info" && (
        <>
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            <InfoField label="Casenummer" value={project.nummer} mono />
            <InfoField label="Case type" value={project.case_type} badge />
            <InfoField label="Casenaam" value={project.naam} />
            <InfoField label="Opdrachtgever" value={ogNaam} />
            <InfoField label="Stationsnaam" value={project.stationsnaam} />
            <InfoField label="Adres" value={project.adres} />
          </div>

          {/* Contact section (manager only) */}
          {isManager && (project.contactpersoon_naam || project.contactpersoon_tel || project.contactpersoon_email) && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: "#FFF8DC", border: "1px solid #E8D070" }}>
              <p className="text-xs font-semibold flex items-center gap-1" style={{ color: "#8B6914" }}>
                <Lock className="h-3 w-3" /> Contactpersoon opdrachtgever
              </p>
              <div className="grid grid-cols-3 gap-4">
                {project.contactpersoon_naam && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "#8B6914" }}>Naam</p>
                    <p className="text-sm" style={{ color: "#2D4A1E" }}>{project.contactpersoon_naam}</p>
                  </div>
                )}
                {project.contactpersoon_tel && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "#8B6914" }}>Telefoon</p>
                    <a href={`tel:${project.contactpersoon_tel}`} className="text-sm flex items-center gap-1" style={{ color: "#4A7C2F" }}>
                      <Phone className="h-3 w-3" /> {project.contactpersoon_tel}
                    </a>
                  </div>
                )}
                {project.contactpersoon_email && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "#8B6914" }}>Email</p>
                    <a href={`mailto:${project.contactpersoon_email}`} className="text-sm flex items-center gap-1" style={{ color: "#4A7C2F" }}>
                      <Mail className="h-3 w-3" /> {project.contactpersoon_email}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <button onClick={onEdit} className="w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5" style={{ border: "1px solid #C5D4B2", color: "#5A7A42" }}>
              <Pencil className="h-3.5 w-3.5" /> Project bewerken
            </button>
            <button onClick={onToggle} className="w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5" style={{ border: "1px solid #C5D4B2", color: "#5A7A42" }}>
              {project.active ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
              {project.active ? "Deactiveren" : "Activeren"}
            </button>
            {confirmDeleteId === project.id ? (
              <div className="flex gap-2">
                <button onClick={onCancelDelete} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#5A7A42" }}>Annuleren</button>
                <button onClick={onDelete} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "#C0392B" }}>Definitief verwijderen</button>
              </div>
            ) : (
              <button onClick={onDelete} className="w-full py-2.5 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5" style={{ border: "1px solid #E8A09A", color: "#C0392B" }}>
                <Trash2 className="h-3.5 w-3.5" /> Verwijderen
              </button>
            )}
          </div>
        </>
      )}

      {activeTab === "forecast" && isManager && (
        <ForecastTab projectId={project.id} />
      )}

      {activeTab === "planning" && (
        <PlanningStatusTab projectId={project.id} profileId={undefined} />
      )}
    </div>
  );
}

function InfoField({ label, value, mono, badge }: { label: string; value: string | null; mono?: boolean; badge?: boolean }) {
  if (!value) return (
    <div style={{ borderBottom: "1px solid #EBF0E4", paddingBottom: 8 }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: "#8AAD6E" }}>{label}</p>
      <p className="text-[13px] mt-0.5" style={{ color: "#C5D4B2" }}>—</p>
    </div>
  );
  return (
    <div style={{ borderBottom: "1px solid #EBF0E4", paddingBottom: 8 }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: "#8AAD6E" }}>{label}</p>
      {badge ? <CaseTypeBadge type={value} /> : (
        <p className={`text-[13px] mt-0.5 ${mono ? "font-mono" : ""}`} style={{ color: "#2D4A1E" }}>{value}</p>
      )}
    </div>
  );
}

function DesktopFormPanel({ title, renderFormFields, onCancel, onSubmit, submitLabel }: {
  title: string; renderFormFields: () => React.ReactNode; onCancel: () => void; onSubmit: () => void; submitLabel: string;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium" style={{ color: "#2D4A1E" }}>{title}</h2>
        <button onClick={onCancel} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#DFE8D6" }}>
          <X className="h-4 w-4" style={{ color: "#5A7A42" }} />
        </button>
      </div>
      <div className="space-y-3">
        {renderFormFields()}
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ border: "1px solid #C5D4B2", color: "#5A7A42" }}>Annuleren</button>
        <button onClick={onSubmit} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg, #4A7C2F, #3D6826)" }}>{submitLabel}</button>
      </div>
    </div>
  );
}

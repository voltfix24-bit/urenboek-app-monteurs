import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, ToggleLeft, ToggleRight, X, Check, Building2 } from "lucide-react";

interface Opdrachtgever { id: string; naam: string; }
interface Project { id: string; nummer: string; naam: string; active: boolean; opdrachtgever_id: string | null; }
type FormState = { nummer: string; naam: string; opdrachtgever_id: string | null };
const emptyForm: FormState = { nummer: "", naam: "", opdrachtgever_id: null };

export default function Projecten() {
  const { isManager } = useAuth(); const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]); const [opdrachtgevers, setOpdrachtgevers] = useState<Opdrachtgever[]>([]);
  const [loading, setLoading] = useState(true); const [showAdd, setShowAdd] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null); const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const fetchData = useCallback(async () => { const [p, o] = await Promise.all([supabase.from("projects").select("id, nummer, naam, active, opdrachtgever_id").order("nummer"), supabase.from("opdrachtgevers").select("id, naam").order("naam")]); if (p.data) setProjects(p.data); if (o.data) setOpdrachtgevers(o.data); setLoading(false); }, []);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (!isManager) navigate("/"); }, [isManager, navigate]);

  async function handleAdd() { if (!form.nummer.trim() || !form.naam.trim()) { toast.error("Vul projectnummer en naam in"); return; } const insert: any = { nummer: form.nummer.trim(), naam: form.naam.trim() }; if (form.opdrachtgever_id) insert.opdrachtgever_id = form.opdrachtgever_id; const { error } = await supabase.from("projects").insert(insert); if (error) toast.error(error.message.includes("duplicate") ? "Projectnummer bestaat al" : "Fout bij toevoegen"); else { toast.success("Project toegevoegd"); setForm(emptyForm); setShowAdd(false); fetchData(); } }
  async function handleUpdate(id: string) { if (!form.nummer.trim() || !form.naam.trim()) { toast.error("Vul projectnummer en naam in"); return; } const { error } = await supabase.from("projects").update({ nummer: form.nummer.trim(), naam: form.naam.trim(), opdrachtgever_id: form.opdrachtgever_id || null }).eq("id", id); if (error) toast.error("Fout bij wijzigen"); else { toast.success("Project gewijzigd"); setEditId(null); setForm(emptyForm); fetchData(); } }
  async function toggleActive(p: Project) { const { error } = await supabase.from("projects").update({ active: !p.active }).eq("id", p.id); if (error) toast.error("Fout"); else { toast.success(p.active ? "Gedeactiveerd" : "Geactiveerd"); fetchData(); } }
  async function handleDelete(p: Project) { if (confirmDeleteId !== p.id) { setConfirmDeleteId(p.id); return; } setConfirmDeleteId(null); const { error } = await supabase.from("projects").delete().eq("id", p.id); if (error) toast.error("Fout bij verwijderen"); else { toast.success("Verwijderd"); fetchData(); } }
  function startEdit(p: Project) { setEditId(p.id); setForm({ nummer: p.nummer, naam: p.naam, opdrachtgever_id: p.opdrachtgever_id }); setShowAdd(false); }
  function getOgNaam(id: string | null) { return id ? opdrachtgevers.find(o => o.id === id)?.naam || null : null; }

  const activeProjects = projects.filter(p => p.active); const inactiveProjects = projects.filter(p => !p.active);

  function renderOgSelect() {
    return (<select value={form.opdrachtgever_id || ""} onChange={e => setForm(f => ({ ...f, opdrachtgever_id: e.target.value || null }))} className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#2D4A1E" }}><option value="">Geen opdrachtgever</option>{opdrachtgevers.map(og => <option key={og.id} value={og.id}>{og.naam}</option>)}</select>);
  }

  return (
    <div className="min-h-screen" style={{ background: "#F5F7F0", maxWidth: 430, margin: "0 auto" }}>
      <header className="sticky top-0 z-30 px-4 py-3" style={{ background: "rgba(235,240,228,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid #C5D4B2" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#DFE8D6", color: "#5A7A42" }}><ArrowLeft className="h-4 w-4" /></button>
          <h1 className="text-base font-bold" style={{ color: "#2D4A1E" }}>Projecten</h1>
          <div className="flex-1" />
          <button onClick={() => navigate("/opdrachtgevers")} className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1" style={{ background: "#DFE8D6", color: "#5A7A42" }}><Building2 className="h-3.5 w-3.5" /> Opdrachtgevers</button>
          <button onClick={() => { setShowAdd(true); setEditId(null); setForm(emptyForm); }} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#D4EDD8", border: "1px solid #8DC99A" }}><Plus className="h-4 w-4" style={{ color: "#2D7A3A" }} /></button>
        </div>
      </header>
      <div className="px-4 py-4 space-y-4">
        {showAdd && (
          <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "#EBF0E4", border: "1px solid #9DC87A" }}>
            <h3 className="text-sm font-semibold" style={{ color: "#2D4A1E" }}>Nieuw project</h3>
            <input value={form.nummer} onChange={e => setForm(f => ({ ...f, nummer: e.target.value }))} placeholder="Projectnummer" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#2D4A1E" }} />
            <input value={form.naam} onChange={e => setForm(f => ({ ...f, naam: e.target.value }))} placeholder="Projectnaam" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#2D4A1E" }} />
            {renderOgSelect()}
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#5A7A42" }}>Annuleren</button>
              <button onClick={handleAdd} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, #4A7C2F, #3D6826)" }}>Toevoegen</button>
            </div>
          </div>
        )}
        {loading ? <p className="text-sm text-center py-8" style={{ color: "#8AAD6E" }}>Laden...</p> : (
          <>
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider px-1" style={{ color: "#8AAD6E" }}>Actief ({activeProjects.length})</p>
              {activeProjects.map(p => <ProjectRow key={p.id} project={p} ogNaam={getOgNaam(p.opdrachtgever_id)} isEditing={editId === p.id} isConfirmingDelete={confirmDeleteId === p.id} form={form} setForm={setForm} renderOgSelect={renderOgSelect} onEdit={() => startEdit(p)} onCancel={() => { setEditId(null); setForm(emptyForm); }} onSave={() => handleUpdate(p.id)} onToggle={() => toggleActive(p)} onDelete={() => handleDelete(p)} onCancelDelete={() => setConfirmDeleteId(null)} />)}
            </div>
            {inactiveProjects.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider px-1" style={{ color: "#8AAD6E" }}>Inactief ({inactiveProjects.length})</p>
                {inactiveProjects.map(p => <ProjectRow key={p.id} project={p} ogNaam={getOgNaam(p.opdrachtgever_id)} isEditing={editId === p.id} isConfirmingDelete={confirmDeleteId === p.id} form={form} setForm={setForm} renderOgSelect={renderOgSelect} onEdit={() => startEdit(p)} onCancel={() => { setEditId(null); setForm(emptyForm); }} onSave={() => handleUpdate(p.id)} onToggle={() => toggleActive(p)} onDelete={() => handleDelete(p)} onCancelDelete={() => setConfirmDeleteId(null)} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProjectRow({ project, ogNaam, isEditing, isConfirmingDelete, form, setForm, renderOgSelect, onEdit, onCancel, onSave, onToggle, onDelete, onCancelDelete }: any) {
  if (isEditing) {
    return (
      <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "#EBF0E4", border: "1px solid #7AAADE" }}>
        <input value={form.nummer} onChange={e => setForm((f: any) => ({ ...f, nummer: e.target.value }))} className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#2D4A1E" }} />
        <input value={form.naam} onChange={e => setForm((f: any) => ({ ...f, naam: e.target.value }))} className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#2D4A1E" }} />
        {renderOgSelect()}
        <div className="flex gap-2">
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
    <div className="rounded-2xl p-4 flex items-center gap-3 transition-transform active:scale-[0.985]" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2", opacity: project.active ? 1 : 0.5 }}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: "#2D4A1E" }}>{project.naam}</p>
        <p className="text-xs mt-0.5" style={{ color: "#8AAD6E" }}>{project.nummer}</p>
        {ogNaam && <p className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: "#8AAD6E" }}><Building2 className="h-3 w-3 shrink-0" /> {ogNaam}</p>}
      </div>
      <button onClick={onEdit} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#DFE8D6" }}><Pencil className="h-3.5 w-3.5" style={{ color: "#5A7A42" }} /></button>
      <button onClick={onToggle} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: project.active ? "#D4EDD8" : "#DFE8D6" }}>
        {project.active ? <ToggleRight className="h-4 w-4" style={{ color: "#2D7A3A" }} /> : <ToggleLeft className="h-4 w-4" style={{ color: "#8AAD6E" }} />}
      </button>
      <button onClick={onDelete} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#FDECEA" }}><X className="h-3.5 w-3.5" style={{ color: "#C0392B" }} /></button>
    </div>
  );
}

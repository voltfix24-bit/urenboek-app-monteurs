import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, ToggleLeft, ToggleRight, X, Check, Building2 } from "lucide-react";

interface Opdrachtgever {
  id: string;
  naam: string;
}

interface Project {
  id: string;
  nummer: string;
  naam: string;
  active: boolean;
  opdrachtgever_id: string | null;
}

type FormState = { nummer: string; naam: string; opdrachtgever_id: string | null };
const emptyForm: FormState = { nummer: "", naam: "", opdrachtgever_id: null };

export default function Projecten() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [opdrachtgevers, setOpdrachtgevers] = useState<Opdrachtgever[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const fetchData = useCallback(async () => {
    const [projRes, ogRes] = await Promise.all([
      supabase.from("projects").select("id, nummer, naam, active, opdrachtgever_id").order("nummer"),
      supabase.from("opdrachtgevers").select("id, naam").order("naam"),
    ]);
    if (projRes.data) setProjects(projRes.data);
    if (ogRes.data) setOpdrachtgevers(ogRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (!isManager) navigate("/"); }, [isManager, navigate]);

  async function handleAdd() {
    if (!form.nummer.trim() || !form.naam.trim()) { toast.error("Vul projectnummer en naam in"); return; }
    const insert: any = { nummer: form.nummer.trim(), naam: form.naam.trim() };
    if (form.opdrachtgever_id) insert.opdrachtgever_id = form.opdrachtgever_id;
    const { error } = await supabase.from("projects").insert(insert);
    if (error) { toast.error(error.message.includes("duplicate") ? "Projectnummer bestaat al" : "Fout bij toevoegen"); }
    else { toast.success("Project toegevoegd"); setForm(emptyForm); setShowAdd(false); fetchData(); }
  }

  async function handleUpdate(id: string) {
    if (!form.nummer.trim() || !form.naam.trim()) { toast.error("Vul projectnummer en naam in"); return; }
    const { error } = await supabase.from("projects").update({
      nummer: form.nummer.trim(),
      naam: form.naam.trim(),
      opdrachtgever_id: form.opdrachtgever_id || null,
    }).eq("id", id);
    if (error) { toast.error("Fout bij wijzigen"); }
    else { toast.success("Project gewijzigd"); setEditId(null); setForm(emptyForm); fetchData(); }
  }

  async function toggleActive(project: Project) {
    const { error } = await supabase.from("projects").update({ active: !project.active }).eq("id", project.id);
    if (error) { toast.error("Fout bij wijzigen status"); }
    else { toast.success(project.active ? "Project gedeactiveerd" : "Project geactiveerd"); fetchData(); }
  }

  async function handleDelete(project: Project) {
    if (!confirm(`Weet je zeker dat je "${project.naam}" wilt verwijderen?`)) return;
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    if (error) { toast.error("Fout bij verwijderen"); }
    else { toast.success("Project verwijderd"); fetchData(); }
  }

  function startEdit(project: Project) {
    setEditId(project.id);
    setForm({ nummer: project.nummer, naam: project.naam, opdrachtgever_id: project.opdrachtgever_id });
    setShowAdd(false);
  }

  function cancelEdit() { setEditId(null); setForm(emptyForm); }

  function getOgNaam(id: string | null) {
    if (!id) return null;
    return opdrachtgevers.find((o) => o.id === id)?.naam || null;
  }

  const activeProjects = projects.filter((p) => p.active);
  const inactiveProjects = projects.filter((p) => !p.active);

  function renderOgSelect() {
    return (
      <select
        value={form.opdrachtgever_id || ""}
        onChange={(e) => setForm((f) => ({ ...f, opdrachtgever_id: e.target.value || null }))}
        className="w-full px-3 py-2.5 rounded-xl text-sm text-foreground"
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <option value="">Geen opdrachtgever</option>
        {opdrachtgevers.map((og) => (
          <option key={og.id} value={og.id}>{og.naam}</option>
        ))}
      </select>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0f", maxWidth: 430, margin: "0 auto" }}>
      <header className="sticky top-0 z-30 px-4 py-3" style={{ background: "rgba(10,10,15,0.95)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h1 className="text-base font-bold text-foreground">Projecten</h1>
          <div className="flex-1" />
          <button onClick={() => navigate("/opdrachtgevers")} className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground flex items-center gap-1" style={{ background: "rgba(255,255,255,0.06)" }}>
            <Building2 className="h-3.5 w-3.5" /> Opdrachtgevers
          </button>
          <button
            onClick={() => { setShowAdd(true); setEditId(null); setForm(emptyForm); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}
          >
            <Plus className="h-4 w-4" style={{ color: "#22c55e" }} />
          </button>
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">
        {showAdd && (
          <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <h3 className="text-sm font-semibold text-foreground">Nieuw project</h3>
            <input value={form.nummer} onChange={(e) => setForm((f) => ({ ...f, nummer: e.target.value }))} placeholder="Projectnummer (bijv. CS-2024-006)" className="w-full px-3 py-2.5 rounded-xl text-sm text-foreground placeholder:text-muted-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
            <input value={form.naam} onChange={(e) => setForm((f) => ({ ...f, naam: e.target.value }))} placeholder="Projectnaam" className="w-full px-3 py-2.5 rounded-xl text-sm text-foreground placeholder:text-muted-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
            {renderOgSelect()}
            <div className="flex gap-2">
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-muted-foreground" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>Annuleren</button>
              <button onClick={handleAdd} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>Toevoegen</button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Laden...</p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Actief ({activeProjects.length})</p>
              {activeProjects.map((p) => (
                <ProjectRow key={p.id} project={p} ogNaam={getOgNaam(p.opdrachtgever_id)} isEditing={editId === p.id} form={form} setForm={setForm} opdrachtgevers={opdrachtgevers} renderOgSelect={renderOgSelect} onEdit={() => startEdit(p)} onCancel={cancelEdit} onSave={() => handleUpdate(p.id)} onToggle={() => toggleActive(p)} onDelete={() => handleDelete(p)} />
              ))}
            </div>
            {inactiveProjects.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Inactief ({inactiveProjects.length})</p>
                {inactiveProjects.map((p) => (
                  <ProjectRow key={p.id} project={p} ogNaam={getOgNaam(p.opdrachtgever_id)} isEditing={editId === p.id} form={form} setForm={setForm} opdrachtgevers={opdrachtgevers} renderOgSelect={renderOgSelect} onEdit={() => startEdit(p)} onCancel={cancelEdit} onSave={() => handleUpdate(p.id)} onToggle={() => toggleActive(p)} onDelete={() => handleDelete(p)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ProjectRow({ project, ogNaam, isEditing, form, setForm, opdrachtgevers, renderOgSelect, onEdit, onCancel, onSave, onToggle, onDelete }: {
  project: Project;
  ogNaam: string | null;
  isEditing: boolean;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  opdrachtgevers: Opdrachtgever[];
  renderOgSelect: () => JSX.Element;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  if (isEditing) {
    return (
      <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(59,130,246,0.3)" }}>
        <input value={form.nummer} onChange={(e) => setForm((f) => ({ ...f, nummer: e.target.value }))} className="w-full px-3 py-2 rounded-xl text-sm text-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
        <input value={form.naam} onChange={(e) => setForm((f) => ({ ...f, naam: e.target.value }))} className="w-full px-3 py-2 rounded-xl text-sm text-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
        {renderOgSelect()}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl text-xs font-semibold text-muted-foreground flex items-center justify-center gap-1" style={{ background: "rgba(255,255,255,0.04)" }}>
            <X className="h-3.5 w-3.5" /> Annuleren
          </button>
          <button onClick={onSave} className="flex-1 py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1" style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>
            <Check className="h-3.5 w-3.5" /> Opslaan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-4 flex items-center gap-3 transition-transform active:scale-[0.985]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", opacity: project.active ? 1 : 0.5 }}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{project.naam}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{project.nummer}</p>
        {ogNaam && (
          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <Building2 className="h-3 w-3 shrink-0" /> {ogNaam}
          </p>
        )}
      </div>
      <button onClick={onEdit} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.06)" }}>
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <button onClick={onToggle} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: project.active ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.06)" }}>
        {project.active ? <ToggleRight className="h-4 w-4" style={{ color: "#22c55e" }} /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
      </button>
      <button onClick={onDelete} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(239,68,68,0.1)" }}>
        <X className="h-3.5 w-3.5" style={{ color: "#ef4444" }} />
      </button>
    </div>
  );
}

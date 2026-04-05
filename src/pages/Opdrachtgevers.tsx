import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { ArrowLeft, Plus, Pencil, X, Phone, Mail, User, Building2 } from "lucide-react";
import { PageShell } from "@/components/PageShell";

interface Opdrachtgever { id: string; naam: string; contactpersoon: string; telefoon: string; email: string; }
const emptyForm = { naam: "", contactpersoon: "", telefoon: "", email: "" };

export default function Opdrachtgevers() {
  const { isManager } = useAuth(); const navigate = useNavigate();
  const [items, setItems] = useState<Opdrachtgever[]>([]); const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false); const [editId, setEditId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null); const [form, setForm] = useState(emptyForm);

  const fetchItems = useCallback(async () => { const { data } = await supabase.from("opdrachtgevers").select("id, naam, contactpersoon, telefoon, email").order("naam"); if (data) setItems(data); setLoading(false); }, []);
  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { if (!isManager) navigate("/"); }, [isManager, navigate]);

  async function handleAdd() { if (!form.naam.trim()) { toast.error("Vul een bedrijfsnaam in"); return; } if (!await mutate(supabase.from("opdrachtgevers").insert({ naam: form.naam.trim(), contactpersoon: form.contactpersoon.trim(), telefoon: form.telefoon.trim(), email: form.email.trim() }))) return; toast.success("Toegevoegd"); setForm(emptyForm); setShowAdd(false); fetchItems(); }
  async function handleUpdate(id: string) { if (!form.naam.trim()) { toast.error("Vul een bedrijfsnaam in"); return; } if (!await mutate(supabase.from("opdrachtgevers").update({ naam: form.naam.trim(), contactpersoon: form.contactpersoon.trim(), telefoon: form.telefoon.trim(), email: form.email.trim() }).eq("id", id))) return; toast.success("Gewijzigd"); setEditId(null); setForm(emptyForm); fetchItems(); }
  async function handleDelete(item: Opdrachtgever) { if (confirmDeleteId !== item.id) { setConfirmDeleteId(item.id); return; } setConfirmDeleteId(null); if (!await mutate(supabase.from("opdrachtgevers").delete().eq("id", item.id))) return; toast.success("Verwijderd"); fetchItems(); }

  return (
    <PageShell>
      <header className="sticky top-0 z-30 px-4 py-3" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}><ArrowLeft className="h-4 w-4" /></button>
          <h1 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Opdrachtgevers</h1>
          <div className="flex-1" />
          <button onClick={() => { setShowAdd(true); setEditId(null); setForm(emptyForm); }} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--success-light)", border: "1px solid #8DC99A" }}><Plus className="h-4 w-4" style={{ color: "var(--success)" }} /></button>
        </div>
      </header>
      <div className="px-4 py-4 space-y-3">
        {(showAdd || editId) && (
          <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "var(--bg-surface)", border: `1px solid ${editId ? "var(--info-border)" : "var(--accent-border)"}` }}>
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{editId ? "Bewerken" : "Nieuwe opdrachtgever"}</h3>
            {["naam", "contactpersoon", "telefoon", "email"].map(k => (
              <input key={k} value={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} placeholder={k === "naam" ? "Bedrijfsnaam *" : k === "contactpersoon" ? "Naam contactpersoon" : k === "telefoon" ? "Telefoonnummer" : "E-mailadres"} type={k === "email" ? "email" : k === "telefoon" ? "tel" : "text"} className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
            ))}
            <div className="flex gap-2">
              <button onClick={() => { setShowAdd(false); setEditId(null); setForm(emptyForm); }} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Annuleren</button>
              <button onClick={() => editId ? handleUpdate(editId) : handleAdd()} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>{editId ? "Opslaan" : "Toevoegen"}</button>
            </div>
          </div>
        )}
        {loading ? <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>Laden...</p> : items.length === 0 ? (
          <div className="text-center py-12"><Building2 className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} /><p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Geen opdrachtgevers</p><p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Druk op + om er een toe te voegen</p></div>
        ) : (
          <div className="space-y-2">
            {items.map(item => confirmDeleteId === item.id ? (
              <div key={item.id} className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "var(--danger-light)", border: "1px solid #E8A09A" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>"{item.naam}" verwijderen?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>Annuleren</button>
                  <button onClick={() => handleDelete(item)} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "var(--danger)" }}>Verwijderen</button>
                </div>
              </div>
            ) : (
              <div key={item.id} className="rounded-2xl p-4 transition-transform active:scale-[0.985]" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{item.naam}</p>
                    {item.contactpersoon && <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}><User className="h-3 w-3 shrink-0" /> {item.contactpersoon}</p>}
                    {item.telefoon && <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}><Phone className="h-3 w-3 shrink-0" /> {item.telefoon}</p>}
                    {item.email && <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}><Mail className="h-3 w-3 shrink-0" /> {item.email}</p>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => { setEditId(item.id); setForm({ naam: item.naam, contactpersoon: item.contactpersoon, telefoon: item.telefoon, email: item.email }); setShowAdd(false); }} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface-2)" }}><Pencil className="h-3.5 w-3.5" style={{ color: "var(--text-secondary)" }} /></button>
                    <button onClick={() => handleDelete(item)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--danger-light)" }}><X className="h-3.5 w-3.5" style={{ color: "var(--danger)" }} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

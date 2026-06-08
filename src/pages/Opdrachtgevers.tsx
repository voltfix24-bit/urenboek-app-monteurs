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
      <header className="sticky top-0 z-30 px-4 py-3" style={{ background: "color-mix(in srgb, rgba(10,26,48,0.7) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(106,118,140,0.15)" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#102038", color: "#a0abc3" }}><ArrowLeft className="h-4 w-4" /></button>
          <h1 className="text-base font-bold" style={{ color: "#dae6ff" }}>Opdrachtgevers</h1>
          <div className="flex-1" />
          <button onClick={() => { setShowAdd(true); setEditId(null); setForm(emptyForm); }} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)" }}><Plus className="h-4 w-4" style={{ color: "#3fff8b" }} /></button>
        </div>
      </header>
      <div className="px-4 py-4 space-y-3">
        {(showAdd || editId) && (
          <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "rgba(10,26,48,0.7)", border: `1px solid ${editId ? "rgba(110,155,255,0.3)" : "rgba(63,255,139,0.3)"}` }}>
            <h3 className="text-sm font-semibold" style={{ color: "#dae6ff" }}>{editId ? "Bewerken" : "Nieuwe opdrachtgever"}</h3>
            {["naam", "contactpersoon", "telefoon", "email"].map(k => (
              <input key={k} value={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} placeholder={k === "naam" ? "Bedrijfsnaam *" : k === "contactpersoon" ? "Naam contactpersoon" : k === "telefoon" ? "Telefoonnummer" : "E-mailadres"} type={k === "email" ? "email" : k === "telefoon" ? "tel" : "text"} className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
            ))}
            <div className="flex gap-2">
              <button onClick={() => { setShowAdd(false); setEditId(null); setForm(emptyForm); }} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>Annuleren</button>
              <button onClick={() => editId ? handleUpdate(editId) : handleAdd()} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)" }}>{editId ? "Opslaan" : "Toevoegen"}</button>
            </div>
          </div>
        )}
        {loading ? <p className="text-sm text-center py-8" style={{ color: "#a0abc3" }}>Laden...</p> : items.length === 0 ? (
          <div className="text-center py-12"><Building2 className="h-8 w-8 mx-auto mb-2" style={{ color: "#a0abc3" }} /><p className="text-sm font-medium" style={{ color: "#dae6ff" }}>Geen opdrachtgevers</p><p className="text-xs mt-1" style={{ color: "#a0abc3" }}>Druk op + om er een toe te voegen</p></div>
        ) : (
          <div className="space-y-2">
            {items.map(item => confirmDeleteId === item.id ? (
              <div key={item.id} className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "rgba(255,113,108,0.1)", border: "1px solid rgba(255,113,108,0.3)" }}>
                <p className="text-sm font-semibold" style={{ color: "#dae6ff" }}>"{item.naam}" verwijderen?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>Annuleren</button>
                  <button onClick={() => handleDelete(item)} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "#ff716c" }}>Verwijderen</button>
                </div>
              </div>
            ) : (
              <div key={item.id} className="rounded-2xl p-4 transition-transform active:scale-[0.985]" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "#dae6ff" }}>{item.naam}</p>
                    {item.contactpersoon && <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: "#a0abc3" }}><User className="h-3 w-3 shrink-0" /> {item.contactpersoon}</p>}
                    {item.telefoon && <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: "#a0abc3" }}><Phone className="h-3 w-3 shrink-0" /> {item.telefoon}</p>}
                    {item.email && <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: "#a0abc3" }}><Mail className="h-3 w-3 shrink-0" /> {item.email}</p>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => { setEditId(item.id); setForm({ naam: item.naam, contactpersoon: item.contactpersoon, telefoon: item.telefoon, email: item.email }); setShowAdd(false); }} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#102038" }}><Pencil className="h-3.5 w-3.5" style={{ color: "#a0abc3" }} /></button>
                    <button onClick={() => handleDelete(item)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,113,108,0.1)" }}><X className="h-3.5 w-3.5" style={{ color: "#ff716c" }} /></button>
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

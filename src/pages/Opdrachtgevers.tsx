import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, X, Phone, Mail, User } from "lucide-react";

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

  async function handleAdd() { if (!form.naam.trim()) { toast.error("Vul een bedrijfsnaam in"); return; } const { error } = await supabase.from("opdrachtgevers").insert({ naam: form.naam.trim(), contactpersoon: form.contactpersoon.trim(), telefoon: form.telefoon.trim(), email: form.email.trim() }); if (error) toast.error("Fout"); else { toast.success("Toegevoegd"); setForm(emptyForm); setShowAdd(false); fetchItems(); } }
  async function handleUpdate(id: string) { if (!form.naam.trim()) { toast.error("Vul een bedrijfsnaam in"); return; } const { error } = await supabase.from("opdrachtgevers").update({ naam: form.naam.trim(), contactpersoon: form.contactpersoon.trim(), telefoon: form.telefoon.trim(), email: form.email.trim() }).eq("id", id); if (error) toast.error("Fout"); else { toast.success("Gewijzigd"); setEditId(null); setForm(emptyForm); fetchItems(); } }
  async function handleDelete(item: Opdrachtgever) { if (confirmDeleteId !== item.id) { setConfirmDeleteId(item.id); return; } setConfirmDeleteId(null); const { error } = await supabase.from("opdrachtgevers").delete().eq("id", item.id); if (error) toast.error("Fout — mogelijk zijn er nog projecten aan gekoppeld"); else { toast.success("Verwijderd"); fetchItems(); } }

  return (
    <div className="min-h-screen" style={{ background: "#F5F7F0", maxWidth: 430, margin: "0 auto" }}>
      <header className="sticky top-0 z-30 px-4 py-3" style={{ background: "rgba(235,240,228,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid #C5D4B2" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#DFE8D6", color: "#5A7A42" }}><ArrowLeft className="h-4 w-4" /></button>
          <h1 className="text-base font-bold" style={{ color: "#2D4A1E" }}>Opdrachtgevers</h1>
          <div className="flex-1" />
          <button onClick={() => { setShowAdd(true); setEditId(null); setForm(emptyForm); }} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#D4EDD8", border: "1px solid #8DC99A" }}><Plus className="h-4 w-4" style={{ color: "#2D7A3A" }} /></button>
        </div>
      </header>
      <div className="px-4 py-4 space-y-3">
        {(showAdd || editId) && (
          <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "#EBF0E4", border: `1px solid ${editId ? "#7AAADE" : "#9DC87A"}` }}>
            <h3 className="text-sm font-semibold" style={{ color: "#2D4A1E" }}>{editId ? "Bewerken" : "Nieuwe opdrachtgever"}</h3>
            {["naam", "contactpersoon", "telefoon", "email"].map(k => (
              <input key={k} value={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} placeholder={k === "naam" ? "Bedrijfsnaam *" : k === "contactpersoon" ? "Naam contactpersoon" : k === "telefoon" ? "Telefoonnummer" : "E-mailadres"} type={k === "email" ? "email" : k === "telefoon" ? "tel" : "text"} className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#2D4A1E" }} />
            ))}
            <div className="flex gap-2">
              <button onClick={() => { setShowAdd(false); setEditId(null); setForm(emptyForm); }} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#5A7A42" }}>Annuleren</button>
              <button onClick={() => editId ? handleUpdate(editId) : handleAdd()} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, #4A7C2F, #3D6826)" }}>{editId ? "Opslaan" : "Toevoegen"}</button>
            </div>
          </div>
        )}
        {loading ? <p className="text-sm text-center py-8" style={{ color: "#8AAD6E" }}>Laden...</p> : items.length === 0 ? (
          <div className="text-center py-12"><p className="text-3xl mb-2">🏢</p><p className="text-sm font-medium" style={{ color: "#2D4A1E" }}>Geen opdrachtgevers</p><p className="text-xs mt-1" style={{ color: "#8AAD6E" }}>Druk op + om er een toe te voegen</p></div>
        ) : (
          <div className="space-y-2">
            {items.map(item => confirmDeleteId === item.id ? (
              <div key={item.id} className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "#FDECEA", border: "1px solid #E8A09A" }}>
                <p className="text-sm font-semibold" style={{ color: "#2D4A1E" }}>"{item.naam}" verwijderen?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#5A7A42" }}>Annuleren</button>
                  <button onClick={() => handleDelete(item)} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "#C0392B" }}>Verwijderen</button>
                </div>
              </div>
            ) : (
              <div key={item.id} className="rounded-2xl p-4 transition-transform active:scale-[0.985]" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "#2D4A1E" }}>{item.naam}</p>
                    {item.contactpersoon && <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: "#8AAD6E" }}><User className="h-3 w-3 shrink-0" /> {item.contactpersoon}</p>}
                    {item.telefoon && <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: "#8AAD6E" }}><Phone className="h-3 w-3 shrink-0" /> {item.telefoon}</p>}
                    {item.email && <p className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: "#8AAD6E" }}><Mail className="h-3 w-3 shrink-0" /> {item.email}</p>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => { setEditId(item.id); setForm({ naam: item.naam, contactpersoon: item.contactpersoon, telefoon: item.telefoon, email: item.email }); setShowAdd(false); }} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#DFE8D6" }}><Pencil className="h-3.5 w-3.5" style={{ color: "#5A7A42" }} /></button>
                    <button onClick={() => handleDelete(item)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#FDECEA" }}><X className="h-3.5 w-3.5" style={{ color: "#C0392B" }} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

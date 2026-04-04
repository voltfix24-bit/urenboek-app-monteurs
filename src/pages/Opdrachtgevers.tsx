import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, X, Check, Phone, Mail, User } from "lucide-react";

interface Opdrachtgever {
  id: string;
  naam: string;
  contactpersoon: string;
  telefoon: string;
  email: string;
}

const emptyForm = { naam: "", contactpersoon: "", telefoon: "", email: "" };

export default function Opdrachtgevers() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Opdrachtgever[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchItems = useCallback(async () => {
    const { data } = await supabase
      .from("opdrachtgevers")
      .select("id, naam, contactpersoon, telefoon, email")
      .order("naam");
    if (data) setItems(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { if (!isManager) navigate("/"); }, [isManager, navigate]);

  async function handleAdd() {
    if (!form.naam.trim()) { toast.error("Vul een bedrijfsnaam in"); return; }
    const { error } = await supabase.from("opdrachtgevers").insert({
      naam: form.naam.trim(),
      contactpersoon: form.contactpersoon.trim(),
      telefoon: form.telefoon.trim(),
      email: form.email.trim(),
    });
    if (error) { toast.error("Fout bij toevoegen"); }
    else { toast.success("Opdrachtgever toegevoegd"); setForm(emptyForm); setShowAdd(false); fetchItems(); }
  }

  async function handleUpdate(id: string) {
    if (!form.naam.trim()) { toast.error("Vul een bedrijfsnaam in"); return; }
    const { error } = await supabase.from("opdrachtgevers").update({
      naam: form.naam.trim(),
      contactpersoon: form.contactpersoon.trim(),
      telefoon: form.telefoon.trim(),
      email: form.email.trim(),
    }).eq("id", id);
    if (error) { toast.error("Fout bij wijzigen"); }
    else { toast.success("Opdrachtgever gewijzigd"); setEditId(null); setForm(emptyForm); fetchItems(); }
  }

  async function handleDelete(item: Opdrachtgever) {
    if (!confirm(`Weet je zeker dat je "${item.naam}" wilt verwijderen?`)) return;
    const { error } = await supabase.from("opdrachtgevers").delete().eq("id", item.id);
    if (error) { toast.error("Fout bij verwijderen — mogelijk zijn er nog projecten aan gekoppeld"); }
    else { toast.success("Opdrachtgever verwijderd"); fetchItems(); }
  }

  function startEdit(item: Opdrachtgever) {
    setEditId(item.id);
    setForm({ naam: item.naam, contactpersoon: item.contactpersoon, telefoon: item.telefoon, email: item.email });
    setShowAdd(false);
  }

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0f", maxWidth: 430, margin: "0 auto" }}>
      <header className="sticky top-0 z-30 px-4 py-3" style={{ background: "rgba(10,10,15,0.95)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <h1 className="text-base font-bold text-foreground">Opdrachtgevers</h1>
          <div className="flex-1" />
          <button
            onClick={() => { setShowAdd(true); setEditId(null); setForm(emptyForm); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}
          >
            <Plus className="h-4 w-4" style={{ color: "#22c55e" }} />
          </button>
        </div>
      </header>

      <div className="px-4 py-4 space-y-3">
        {/* Add/Edit form */}
        {(showAdd || editId) && (
          <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${editId ? "rgba(59,130,246,0.3)" : "rgba(34,197,94,0.2)"}` }}>
            <h3 className="text-sm font-semibold text-foreground">{editId ? "Opdrachtgever bewerken" : "Nieuwe opdrachtgever"}</h3>
            <input value={form.naam} onChange={(e) => setForm((f) => ({ ...f, naam: e.target.value }))} placeholder="Bedrijfsnaam *" className="w-full px-3 py-2.5 rounded-xl text-sm text-foreground placeholder:text-muted-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
            <input value={form.contactpersoon} onChange={(e) => setForm((f) => ({ ...f, contactpersoon: e.target.value }))} placeholder="Naam contactpersoon" className="w-full px-3 py-2.5 rounded-xl text-sm text-foreground placeholder:text-muted-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
            <input value={form.telefoon} onChange={(e) => setForm((f) => ({ ...f, telefoon: e.target.value }))} placeholder="Telefoonnummer" type="tel" className="w-full px-3 py-2.5 rounded-xl text-sm text-foreground placeholder:text-muted-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
            <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="E-mailadres" type="email" className="w-full px-3 py-2.5 rounded-xl text-sm text-foreground placeholder:text-muted-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
            <div className="flex gap-2">
              <button onClick={() => { setShowAdd(false); setEditId(null); setForm(emptyForm); }} className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-muted-foreground" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                Annuleren
              </button>
              <button onClick={() => editId ? handleUpdate(editId) : handleAdd()} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>
                {editId ? "Opslaan" : "Toevoegen"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Laden...</p>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">🏢</p>
            <p className="text-sm font-medium text-foreground">Geen opdrachtgevers</p>
            <p className="text-xs text-muted-foreground mt-1">Druk op + om er een toe te voegen</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl p-4 transition-transform active:scale-[0.985]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{item.naam}</p>
                    {item.contactpersoon && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                        <User className="h-3 w-3 shrink-0" /> {item.contactpersoon}
                      </p>
                    )}
                    {item.telefoon && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        <Phone className="h-3 w-3 shrink-0" /> {item.telefoon}
                      </p>
                    )}
                    {item.email && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        <Mail className="h-3 w-3 shrink-0" /> {item.email}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => startEdit(item)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => handleDelete(item)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(239,68,68,0.1)" }}>
                      <X className="h-3.5 w-3.5" style={{ color: "#ef4444" }} />
                    </button>
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

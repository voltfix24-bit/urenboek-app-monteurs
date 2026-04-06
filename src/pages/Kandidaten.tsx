import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { PageShell } from "@/components/PageShell";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { formatDatumKort, euro } from "@/lib/formatting";
import { KANDIDAAT_STATUS_CONFIG, CONTRACT_STATUS_CONFIG } from "@/lib/contractStatus";
import { toast } from "sonner";
import { UserPlus, MoreHorizontal, ChevronRight } from "lucide-react";
import type { Kandidaat } from "@/types/app";

const STATUSSEN = ["alle", "gesprek", "tarief_afgesproken", "uitgenodigd", "gecontracteerd", "afgewezen"] as const;
const STATUS_LABELS: Record<string, string> = {
  alle: "Alle",
  gesprek: "Gesprek",
  tarief_afgesproken: "Tarief",
  uitgenodigd: "Uitgenodigd",
  gecontracteerd: "Gecontracteerd",
  afgewezen: "Afgewezen",
};

export default function Kandidaten() {
  const { permissies } = useAuth();
  const { profileId } = useProfile();
  const navigate = useNavigate();
  const [kandidaten, setKandidaten] = useState<Kandidaat[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("alle");
  const [showNieuw, setShowNieuw] = useState(false);
  const [showTarief, setShowTarief] = useState<string | null>(null);
  const [nieuwForm, setNieuwForm] = useState({ voornaam: "", achternaam: "", email: "", telefoon: "", notities: "" });
  const [tariefForm, setTariefForm] = useState({ tarief: "", notitie: "" });
  const [saving, setSaving] = useState(false);

  const fetchKandidaten = useCallback(async () => {
    const { data } = await supabase.from("kandidaten").select("*").order("aangemaakt_op", { ascending: false });
    setKandidaten((data as unknown as Kandidaat[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchKandidaten(); }, [fetchKandidaten]);

  const gefilterd = filter === "alle" ? kandidaten : kandidaten.filter(k => k.status === filter);

  async function opslaan() {
    if (!nieuwForm.voornaam.trim() || !nieuwForm.achternaam.trim() || !nieuwForm.email.trim()) {
      toast.error("Vul verplichte velden in");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("kandidaten").insert({
      voornaam: nieuwForm.voornaam.trim(),
      achternaam: nieuwForm.achternaam.trim(),
      email: nieuwForm.email.trim(),
      telefoon: nieuwForm.telefoon.trim() || null,
      notities: nieuwForm.notities.trim() || null,
      aangemaakt_door: profileId!,
    });
    setSaving(false);
    if (error) { toast.error("Fout bij opslaan"); return; }
    toast.success("Kandidaat toegevoegd ✓");
    setShowNieuw(false);
    setNieuwForm({ voornaam: "", achternaam: "", email: "", telefoon: "", notities: "" });
    fetchKandidaten();
  }

  async function tariefOpslaan(id: string) {
    const tarief = parseFloat(tariefForm.tarief);
    if (isNaN(tarief) || tarief <= 0) { toast.error("Vul een geldig tarief in"); return; }
    setSaving(true);
    const updates: Record<string, unknown> = { status: "tarief_afgesproken", afgesproken_tarief: tarief };
    if (tariefForm.notitie.trim()) {
      const k = kandidaten.find(x => x.id === id);
      updates.notities = (k?.notities ? k.notities + "\n" : "") + tariefForm.notitie.trim();
    }
    await supabase.from("kandidaten").update(updates).eq("id", id);
    setSaving(false);
    toast.success("Tarief opgeslagen ✓");
    setShowTarief(null);
    setTariefForm({ tarief: "", notitie: "" });
    fetchKandidaten();
  }

  async function afwijzen(id: string) {
    await supabase.from("kandidaten").update({ status: "afgewezen" }).eq("id", id);
    toast.success("Kandidaat afgewezen");
    fetchKandidaten();
  }

  return (
    <PageShell titel="Kandidaten" subtitel="Werving en contractbeheer">
      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {STATUSSEN.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
            style={{
              background: filter === s ? "var(--accent-light)" : "var(--bg-surface-2)",
              color: filter === s ? "var(--accent)" : "var(--text-muted)",
              border: `1px solid ${filter === s ? "var(--accent-border)" : "var(--border)"}`,
            }}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : gefilterd.length === 0 ? (
        <EmptyState icoon="👥" titel="Geen kandidaten" subtitel={filter === "alle" ? "Voeg een kandidaat toe om te beginnen." : `Geen kandidaten met status "${STATUS_LABELS[filter]}".`} />
      ) : (
        <div className="space-y-3">
          {gefilterd.map(k => {
            const sc = KANDIDAAT_STATUS_CONFIG[k.status] || KANDIDAAT_STATUS_CONFIG.gesprek;
            return (
              <div key={k.id} className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                      {k.voornaam} {k.achternaam}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{k.email}</p>
                    {k.telefoon && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{k.telefoon}</p>}
                    {k.notities && (
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                        {k.notities.length > 80 ? k.notities.slice(0, 80) + "..." : k.notities}
                      </p>
                    )}
                    {k.afgesproken_tarief && (
                      <p className="text-xs mt-1 font-mono" style={{ color: "var(--info)" }}>
                        {euro(k.afgesproken_tarief, 2)}/uur
                      </p>
                    )}
                    <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                      {formatDatumKort(k.aangemaakt_op)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                      style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                      {sc.label}
                    </span>
                    {k.status === "gesprek" && (
                      <button onClick={() => { setShowTarief(k.id); setTariefForm({ tarief: "", notitie: "" }); }}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{ background: "var(--info-light)", color: "var(--info)", border: `1px solid var(--info-border)` }}>
                        Tarief instellen
                      </button>
                    )}
                    {k.status === "tarief_afgesproken" && (
                      <button onClick={() => navigate(`/kandidaten/${k.id}/contract`)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1"
                        style={{ background: "var(--accent)", color: "#fff" }}>
                        Contract <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                    {(k.status === "uitgenodigd" || k.status === "gecontracteerd") && (
                      <span className="text-[10px] font-medium" style={{ color: "var(--success)" }}>
                        {k.status === "gecontracteerd" ? "✓ Gecontracteerd" : "📧 Uitgenodigd"}
                      </span>
                    )}
                    {k.status !== "afgewezen" && k.status !== "gecontracteerd" && (
                      <button onClick={() => afwijzen(k.id)} className="text-[10px]" style={{ color: "var(--danger)" }}>
                        Afwijzen
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline tarief modal */}
                {showTarief === k.id && (
                  <div className="mt-3 pt-3 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
                    <Input type="number" placeholder="Uurtarief (€/uur)" value={tariefForm.tarief}
                      onChange={e => setTariefForm(p => ({ ...p, tarief: e.target.value }))} />
                    <Input placeholder="Notitie (optioneel)" value={tariefForm.notitie}
                      onChange={e => setTariefForm(p => ({ ...p, notitie: e.target.value }))} />
                    <div className="flex gap-2">
                      <button onClick={() => setShowTarief(null)} className="flex-1 py-2 rounded-lg text-xs"
                        style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>Annuleren</button>
                      <button onClick={() => tariefOpslaan(k.id)} disabled={saving}
                        className="flex-1 py-2 rounded-lg text-xs font-medium"
                        style={{ background: "var(--accent)", color: "#fff" }}>
                        {saving ? "Opslaan..." : "Opslaan"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Nieuw modal */}
      {showNieuw && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="w-full max-w-lg rounded-t-2xl p-5 space-y-3 animate-in slide-in-from-bottom" style={{ background: "var(--bg-surface)", maxHeight: "85vh", overflowY: "auto" }}>
            <div className="w-10 h-1 rounded-full mx-auto mb-2" style={{ background: "var(--border)" }} />
            <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Nieuwe kandidaat</h3>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Voornaam *" value={nieuwForm.voornaam} onChange={e => setNieuwForm(p => ({ ...p, voornaam: e.target.value }))} />
              <Input placeholder="Achternaam *" value={nieuwForm.achternaam} onChange={e => setNieuwForm(p => ({ ...p, achternaam: e.target.value }))} />
            </div>
            <Input placeholder="E-mailadres *" type="email" value={nieuwForm.email} onChange={e => setNieuwForm(p => ({ ...p, email: e.target.value }))} />
            <Input placeholder="Telefoonnummer" value={nieuwForm.telefoon} onChange={e => setNieuwForm(p => ({ ...p, telefoon: e.target.value }))} />
            <textarea placeholder="Aantekeningen van het gesprek..." value={nieuwForm.notities}
              onChange={e => setNieuwForm(p => ({ ...p, notities: e.target.value }))}
              className="w-full rounded-lg p-3 text-sm resize-none"
              style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)", minHeight: 80 }} />
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowNieuw(false)} className="flex-1 py-2.5 rounded-xl text-sm"
                style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>Annuleren</button>
              <button onClick={opslaan} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: "var(--accent)", color: "#fff" }}>
                {saving ? "Opslaan..." : "Toevoegen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAB */}
      <button onClick={() => setShowNieuw(true)}
        className="fixed z-30 flex items-center justify-center rounded-full shadow-lg"
        style={{ bottom: 88, right: 20, width: 56, height: 56, background: "var(--accent)" }}>
        <UserPlus className="w-6 h-6 text-white" />
      </button>
    </PageShell>
  );
}

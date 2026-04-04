import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { LogOut, Plus, AlertTriangle, Shield, Edit2, Save } from "lucide-react";

interface ProfileData {
  id: string;
  full_name: string;
  telefoon: string;
  adres: string;
  rijbewijs: boolean;
  vaste_vrije_dagen: number[];
}

interface Certificaat {
  id: string;
  type: string;
  naam: string;
  vervaldatum: string;
}

interface BeschikbaarheidItem {
  id: string;
  type: string;
  datum_van: string;
  datum_tot: string;
  reden: string | null;
  status: string;
}

const CERT_COLORS: Record<string, string> = {
  VCA: "#22c55e",
  NEN3140: "#3b82f6",
  rijbewijs_BE: "#f59e0b",
  overig: "#6366f1",
};

const DAGEN_LABEL = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"];

export default function Profiel() {
  const { user, roles, signOut } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [certs, setCerts] = useState<Certificaat[]>([]);
  const [beschikbaarheid, setBeschikbaarheid] = useState<BeschikbaarheidItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: "", telefoon: "", adres: "" });
  const [showAddCert, setShowAddCert] = useState(false);
  const [showVerlof, setShowVerlof] = useState(false);
  const [certForm, setCertForm] = useState({ type: "VCA", naam: "", vervaldatum: "" });
  const [verlofForm, setVerlofForm] = useState({ type: "vakantie", datum_van: "", datum_tot: "", reden: "" });
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, telefoon, adres, rijbewijs, vaste_vrije_dagen")
      .eq("user_id", user.id)
      .single();
    if (data) {
      setProfile(data as any);
      setEditForm({ full_name: data.full_name, telefoon: (data as any).telefoon || "", adres: (data as any).adres || "" });
    }
    setLoading(false);
  }, [user]);

  const fetchCerts = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("certificaten")
      .select("id, type, naam, vervaldatum")
      .eq("medewerker_id", profile.id)
      .order("vervaldatum");
    if (data) setCerts(data as any);
  }, [profile]);

  const fetchBeschikbaarheid = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("beschikbaarheid")
      .select("id, type, datum_van, datum_tot, reden, status")
      .eq("medewerker_id", profile.id)
      .order("datum_van", { ascending: false })
      .limit(20);
    if (data) setBeschikbaarheid(data as any);
  }, [profile]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);
  useEffect(() => { if (profile) { fetchCerts(); fetchBeschikbaarheid(); } }, [profile, fetchCerts, fetchBeschikbaarheid]);

  const saveProfile = async () => {
    if (!profile) return;
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: editForm.full_name, telefoon: editForm.telefoon, adres: editForm.adres } as any)
      .eq("id", profile.id);
    if (error) toast.error("Fout bij opslaan");
    else { toast.success("Profiel opgeslagen"); setEditing(false); fetchProfile(); }
  };

  const toggleVrijeDag = async (dag: number) => {
    if (!profile) return;
    const current = profile.vaste_vrije_dagen || [];
    const next = current.includes(dag) ? current.filter(d => d !== dag) : [...current, dag];
    await supabase.from("profiles").update({ vaste_vrije_dagen: next } as any).eq("id", profile.id);
    setProfile({ ...profile, vaste_vrije_dagen: next });
  };

  const addCertificaat = async () => {
    if (!profile || !certForm.naam || !certForm.vervaldatum) return;
    const { error } = await supabase.from("certificaten").insert({
      medewerker_id: profile.id,
      type: certForm.type,
      naam: certForm.naam,
      vervaldatum: certForm.vervaldatum,
    } as any);
    if (error) toast.error("Fout");
    else { toast.success("Certificaat toegevoegd"); setShowAddCert(false); setCertForm({ type: "VCA", naam: "", vervaldatum: "" }); fetchCerts(); }
  };

  const requestVerlof = async () => {
    if (!profile || !verlofForm.datum_van || !verlofForm.datum_tot) return;
    const { error } = await supabase.from("beschikbaarheid").insert({
      medewerker_id: profile.id,
      type: verlofForm.type,
      datum_van: verlofForm.datum_van,
      datum_tot: verlofForm.datum_tot,
      reden: verlofForm.reden || null,
      status: "aangevraagd",
    } as any);
    if (error) toast.error("Fout");
    else { toast.success("Verlof aangevraagd"); setShowVerlof(false); setVerlofForm({ type: "vakantie", datum_van: "", datum_tot: "", reden: "" }); fetchBeschikbaarheid(); }
  };

  const meldZiek = async () => {
    if (!profile) return;
    const today = new Date().toISOString().split("T")[0];
    const { error } = await supabase.from("beschikbaarheid").insert({
      medewerker_id: profile.id,
      type: "ziek",
      datum_van: today,
      datum_tot: today,
      status: "goedgekeurd",
    } as any);
    if (error) toast.error("Fout");
    else toast.success("Ziekmelding ingediend");
    fetchBeschikbaarheid();
  };

  const certStatus = (verval: string) => {
    const diff = (new Date(verval).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return { label: "Verlopen", color: "#ef4444" };
    if (diff < 30) return { label: `${Math.ceil(diff)}d`, color: "#f59e0b" };
    return { label: "Geldig", color: "#22c55e" };
  };

  const statusColors: Record<string, { bg: string; text: string }> = {
    aangevraagd: { bg: "rgba(251,191,36,0.1)", text: "#fbbf24" },
    goedgekeurd: { bg: "rgba(34,197,94,0.1)", text: "#22c55e" },
    afgekeurd: { bg: "rgba(239,68,68,0.1)", text: "#ef4444" },
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-background overflow-x-hidden" style={{ maxWidth: 430, margin: "0 auto", paddingBottom: 80 }}>
      <header className="sticky top-0 z-30" style={{ background: "rgba(10,10,15,0.95)", backdropFilter: "blur(12px)" }}>
        <div className="px-4 py-3 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>⚡</div>
          <span className="text-base font-bold text-foreground tracking-tight">Profiel</span>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {/* Avatar + name */}
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold" style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)", color: "#fff" }}>
            {profile?.full_name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{profile?.full_name}</p>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full mt-1 inline-block capitalize" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>
              {roles[0] || "medewerker"}
            </span>
          </div>
        </div>

        {/* Personal info */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mijn gegevens</p>
            <button onClick={() => editing ? saveProfile() : setEditing(true)} className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#22c55e" }}>
              {editing ? <><Save className="h-3 w-3" /> Opslaan</> : <><Edit2 className="h-3 w-3" /> Bewerken</>}
            </button>
          </div>
          {editing ? (
            <div className="space-y-2">
              {[
                { label: "Naam", key: "full_name" as const },
                { label: "Telefoon", key: "telefoon" as const },
                { label: "Adres", key: "adres" as const },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[10px] text-muted-foreground font-medium">{f.label}</label>
                  <input value={editForm[f.key]} onChange={e => setEditForm({ ...editForm, [f.key]: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm text-foreground mt-1" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span className="text-foreground">{user?.email}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Telefoon</span><span className="text-foreground">{profile?.telefoon || "–"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Adres</span><span className="text-foreground">{profile?.adres || "–"}</span></div>
            </div>
          )}
        </div>

        {/* Beschikbaarheid */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vaste vrije dagen</p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map(dag => {
              const active = profile?.vaste_vrije_dagen?.includes(dag);
              return (
                <button key={dag} onClick={() => toggleVrijeDag(dag)} className="flex-1 py-2 rounded-xl text-[11px] font-semibold" style={{
                  background: active ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)",
                  border: active ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.06)",
                  color: active ? "#22c55e" : "#64748b",
                }}>{DAGEN_LABEL[dag]}</button>
              );
            })}
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={() => setShowVerlof(true)} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", color: "#fbbf24" }}>
              Verlof aanvragen
            </button>
            <button onClick={meldZiek} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}>
              🤒 Ziek melden
            </button>
          </div>

          {/* Beschikbaarheid history */}
          {beschikbaarheid.length > 0 && (
            <div className="space-y-1.5 pt-2">
              {beschikbaarheid.slice(0, 5).map(b => {
                const sc = statusColors[b.status] || statusColors.aangevraagd;
                return (
                  <div key={b.id} className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <div>
                      <span className="text-xs font-medium text-foreground capitalize">{b.type}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">{b.datum_van} → {b.datum_tot}</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.text }}>{b.status}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Certificaten */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Certificaten</p>
            <button onClick={() => setShowAddCert(true)} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(34,197,94,0.1)" }}>
              <Plus className="h-3.5 w-3.5" style={{ color: "#22c55e" }} />
            </button>
          </div>
          {certs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Geen certificaten</p>
          ) : certs.map(c => {
            const s = certStatus(c.vervaldatum);
            return (
              <div key={c.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4" style={{ color: CERT_COLORS[c.type] || "#6366f1" }} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.naam}</p>
                    <p className="text-[10px] text-muted-foreground">{c.type} · Verloopt {c.vervaldatum}</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold" style={{ color: s.color }}>{s.label}</span>
              </div>
            );
          })}
        </div>

        {/* Logout */}
        <button onClick={signOut} className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}>
          <LogOut className="h-4 w-4" /> Uitloggen
        </button>
      </main>

      {/* Verlof modal */}
      {showVerlof && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowVerlof(false)}>
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.6)" }} />
          <div className="relative w-full animate-sheet-up rounded-t-3xl p-5 space-y-4" style={{ maxWidth: 430, maxHeight: "85vh", overflowY: "auto", background: "#111118", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", paddingBottom: 40 }} onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto" style={{ background: "rgba(255,255,255,0.15)" }} />
            <h2 className="text-base font-bold text-foreground">Verlof aanvragen</h2>
            <div className="space-y-3">
              <div className="flex gap-2">
                {(["vakantie", "verlof", "anders"] as const).map(t => (
                  <button key={t} onClick={() => setVerlofForm({ ...verlofForm, type: t })} className="flex-1 py-2 rounded-xl text-xs font-semibold capitalize" style={{
                    background: verlofForm.type === t ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.04)",
                    border: verlofForm.type === t ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.06)",
                    color: verlofForm.type === t ? "#22c55e" : "#64748b",
                  }}>{t}</button>
                ))}
              </div>
              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] text-muted-foreground">Van</label>
                  <input type="date" value={verlofForm.datum_van} onChange={e => setVerlofForm({ ...verlofForm, datum_van: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm text-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", colorScheme: "dark" }} />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] text-muted-foreground">Tot</label>
                  <input type="date" value={verlofForm.datum_tot} onChange={e => setVerlofForm({ ...verlofForm, datum_tot: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm text-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", colorScheme: "dark" }} />
                </div>
              </div>
              <input value={verlofForm.reden} onChange={e => setVerlofForm({ ...verlofForm, reden: e.target.value })} placeholder="Reden (optioneel)" className="w-full px-3 py-2.5 rounded-xl text-sm text-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
              <button onClick={requestVerlof} disabled={!verlofForm.datum_van || !verlofForm.datum_tot} className="w-full py-3 rounded-2xl text-sm font-bold disabled:opacity-40" style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff" }}>
                Aanvragen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add cert modal */}
      {showAddCert && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowAddCert(false)}>
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.6)" }} />
          <div className="relative w-full animate-sheet-up rounded-t-3xl p-5 space-y-4" style={{ maxWidth: 430, background: "#111118", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none" }} onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto" style={{ background: "rgba(255,255,255,0.15)" }} />
            <h2 className="text-base font-bold text-foreground">Certificaat toevoegen</h2>
            <div className="space-y-3">
              <div className="flex gap-1.5 flex-wrap">
                {(["VCA", "NEN3140", "rijbewijs_BE", "overig"] as const).map(t => (
                  <button key={t} onClick={() => setCertForm({ ...certForm, type: t })} className="px-3 py-1.5 rounded-xl text-[11px] font-semibold" style={{
                    background: certForm.type === t ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.04)",
                    border: certForm.type === t ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.06)",
                    color: certForm.type === t ? "#22c55e" : "#64748b",
                  }}>{t}</button>
                ))}
              </div>
              <input value={certForm.naam} onChange={e => setCertForm({ ...certForm, naam: e.target.value })} placeholder="Naam certificaat" className="w-full px-3 py-2.5 rounded-xl text-sm text-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground">Vervaldatum</label>
                <input type="date" value={certForm.vervaldatum} onChange={e => setCertForm({ ...certForm, vervaldatum: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm text-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", colorScheme: "dark" }} />
              </div>
              <button onClick={addCertificaat} disabled={!certForm.naam || !certForm.vervaldatum} className="w-full py-3 rounded-2xl text-sm font-bold disabled:opacity-40" style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff" }}>
                Toevoegen
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

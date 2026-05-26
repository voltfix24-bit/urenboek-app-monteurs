import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { PageShell } from "@/components/PageShell";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, X, Building2, Users, Copy, Eye, EyeOff,
  Phone, Mail, ChevronRight, Pencil, Trash2, Check,
} from "lucide-react";

interface Onderaannemer {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  telefoon: string | null;
  bedrijfsnaam: string | null;
  kvk_nummer: string | null;
  iban: string | null;
  uurtarief: number | null;
  account_status: string;
}

interface Monteur {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  telefoon: string | null;
  onderaannemer_id: string | null;
  account_status: string;
  role?: string;
}

const ROLES = [
  { value: "monteur", label: "Monteur" },
  { value: "schakelmonteur", label: "Schakelmonteur" },
  { value: "uitvoerder", label: "Uitvoerder" },
  { value: "wv", label: "WV" },
];

export default function Onderaannemers() {
  const { isManager } = useAuth();
  const { profile } = useProfile();
  const [loading, setLoading] = useState(true);
  const [onderaannemers, setOnderaannemers] = useState<Onderaannemer[]>([]);
  const [monteurs, setMonteurs] = useState<Monteur[]>([]);
  const [selected, setSelected] = useState<Onderaannemer | null>(null);
  const [showAddOA, setShowAddOA] = useState(false);
  const [showAddMonteur, setShowAddMonteur] = useState(false);

  // Onderaannemer form
  const [oaVoornaam, setOaVoornaam] = useState("");
  const [oaAchternaam, setOaAchternaam] = useState("");
  const [oaEmail, setOaEmail] = useState("");
  const [oaTel, setOaTel] = useState("");
  const [oaBedrijf, setOaBedrijf] = useState("");
  const [oaKvk, setOaKvk] = useState("");
  const [oaIban, setOaIban] = useState("");
  const [oaUurtarief, setOaUurtarief] = useState("");
  const [oaPw, setOaPw] = useState("");
  const [oaShowPw, setOaShowPw] = useState(false);
  const [oaSaving, setOaSaving] = useState(false);
  const [lastCreatedOA, setLastCreatedOA] = useState<{ email: string; pw: string } | null>(null);

  // Monteur form
  const [mVoornaam, setMVoornaam] = useState("");
  const [mAchternaam, setMAchternaam] = useState("");
  const [mEmail, setMEmail] = useState("");
  const [mTel, setMTel] = useState("");
  const [mRole, setMRole] = useState("monteur");
  const [mPw, setMPw] = useState("");
  const [mShowPw, setMShowPw] = useState(false);
  const [mSaving, setMSaving] = useState(false);
  const [lastCreatedMonteur, setLastCreatedMonteur] = useState<{ email: string; pw: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: profielen } = await supabase
      .from("profiles")
      .select("id,user_id,full_name,email,telefoon,bedrijfsnaam,kvk_nummer,iban,uurtarief,account_status,is_onderaannemer,onderaannemer_id")
      .order("full_name");
    const { data: rollen } = await supabase.from("user_roles").select("user_id,role");
    const rolMap = new Map((rollen || []).map((r) => [r.user_id, r.role]));

    const oa: Onderaannemer[] = [];
    const mt: Monteur[] = [];
    (profielen || []).forEach((p: any) => {
      if (p.is_onderaannemer) {
        oa.push(p);
      } else if (p.onderaannemer_id) {
        mt.push({ ...p, role: rolMap.get(p.user_id) });
      }
    });
    setOnderaannemers(oa);
    setMonteurs(mt);
    // sync selected
    setSelected((prev) => prev ? oa.find((o) => o.id === prev.id) ?? null : null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const monteursVoor = (oaId: string) => monteurs.filter((m) => m.onderaannemer_id === oaId);

  const genPw = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let r = ""; for (let i = 0; i < 10; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
    return r;
  };

  const resetOaForm = () => {
    setOaVoornaam(""); setOaAchternaam(""); setOaEmail(""); setOaTel("");
    setOaBedrijf(""); setOaKvk(""); setOaIban(""); setOaUurtarief(""); setOaPw("");
  };

  const resetMonteurForm = () => {
    setMVoornaam(""); setMAchternaam(""); setMEmail(""); setMTel(""); setMRole("monteur"); setMPw("");
  };

  const handleAddOA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oaVoornaam.trim() || !oaAchternaam.trim() || !oaEmail.trim() || !oaPw) {
      toast.error("Vul voornaam, achternaam, e-mail en wachtwoord in");
      return;
    }
    if (oaPw.length < 8) { toast.error("Wachtwoord min. 8 tekens"); return; }
    setOaSaving(true);
    const fullName = `${oaVoornaam.trim()} ${oaAchternaam.trim()}`.trim();
    const { data, error } = await supabase.functions.invoke("create-user", {
      body: {
        email: oaEmail.trim(),
        password: oaPw,
        fullName,
        role: "monteur", // base role, onderaannemer is een vlag op profiel
        telefoon: oaTel || null,
        is_onderaannemer: true,
      },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Aanmaken mislukt");
      setOaSaving(false);
      return;
    }
    // Update bedrijfsgegevens op profiel
    if (data?.profile_id) {
      await supabase.from("profiles").update({
        email: oaEmail.trim(),
        bedrijfsnaam: oaBedrijf || null,
        kvk_nummer: oaKvk || null,
        iban: oaIban || null,
        uurtarief: oaUurtarief ? Number(oaUurtarief.replace(",", ".")) : null,
      }).eq("id", data.profile_id);
    }
    toast.success(`Onderaannemer ${fullName} aangemaakt`);
    setLastCreatedOA({ email: oaEmail.trim(), pw: oaPw });
    resetOaForm();
    setShowAddOA(false);
    load();
    setOaSaving(false);
  };

  const handleAddMonteur = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (!mVoornaam.trim() || !mAchternaam.trim()) {
      toast.error("Vul voornaam en achternaam in");
      return;
    }
    setMSaving(true);
    const fullName = `${mVoornaam.trim()} ${mAchternaam.trim()}`.trim();
    const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const domain = slug(selected.bedrijfsnaam || selected.full_name) || "onderaannemer";
    const autoEmail = `${slug(mVoornaam)}.${slug(mAchternaam)}.${Math.random().toString(36).slice(2, 6)}@${domain}.local`;
    const autoPw = genPw() + "A1!";
    const { data, error } = await supabase.functions.invoke("create-user", {
      body: {
        email: autoEmail,
        password: autoPw,
        fullName,
        role: mRole,
        onderaannemer_id: selected.id,
      },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Aanmaken mislukt");
      setMSaving(false);
      return;
    }
    toast.success(`Monteur ${fullName} toegevoegd onder ${selected.full_name}`);
    resetMonteurForm();
    setShowAddMonteur(false);
    load();
    setMSaving(false);
  };

  const copyCreds = (email: string, pw: string) => {
    navigator.clipboard.writeText(
      `Inloggegevens TerreVolt:\nGebruikersnaam: ${email}\nE-mail: ${email}\nWachtwoord: ${pw}\n\nLog in op: ${window.location.origin}`
    );
    toast.success("Inloggegevens gekopieerd");
  };

  if (!isManager) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-navy)" }}>
        <p style={{ color: "#a0abc3" }}>Alleen managers hebben toegang.</p>
      </div>
    );
  }

  // ============== DETAIL ==============
  if (selected) {
    const mList = monteursVoor(selected.id);
    return (
      <PageShell>
        <div style={{ background: "var(--app-navy)", minHeight: "100dvh", paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 100px)" }}>
          <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(3,14,32,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => { setSelected(null); setShowAddMonteur(false); setLastCreatedMonteur(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#3fff8b", display: "flex" }}>
              <ArrowLeft size={24} />
            </button>
            <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 18, color: "#3fff8b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {selected.full_name}
            </span>
          </header>

          <main style={{ padding: "24px 20px" }}>
            {/* Hero */}
            <div style={{ background: "linear-gradient(135deg, rgba(10,26,48,0.7), rgba(6,19,39,0.8))", borderRadius: 24, padding: "28px 20px", marginBottom: 20, border: "1px solid rgba(106,118,140,0.15)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: "#3fff8b", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Building2 size={28} color="#005d2c" />
              </div>
              <h2 style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 22, color: "#dae6ff" }}>{selected.bedrijfsnaam || selected.full_name}</h2>
              {selected.bedrijfsnaam && <p style={{ fontSize: 13, color: "#a0abc3" }}>{selected.full_name}</p>}
              <div style={{ padding: "4px 14px", borderRadius: 9999, background: "rgba(63,255,139,0.15)", border: "1px solid rgba(63,255,139,0.3)" }}>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "Inter", color: "#3fff8b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Onderaannemer</span>
              </div>
            </div>

            {/* Contact info */}
            <div style={{ background: "#0a1a30", borderRadius: 16, padding: 18, marginBottom: 20, border: "1px solid rgba(106,118,140,0.15)" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#6a768c", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12 }}>Bedrijfsgegevens</p>
              <Row label="E-mail" value={selected.email || "—"} icon={<Mail size={14} />} />
              <Row label="Telefoon" value={selected.telefoon || "—"} icon={<Phone size={14} />} />
              <Row label="KvK" value={selected.kvk_nummer || "—"} />
              <Row label="IBAN" value={selected.iban || "—"} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid rgba(106,118,140,0.1)" }}>
                <span style={{ fontSize: 12, color: "#6a768c" }}>Uurtarief</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, color: "#a0abc3" }}>€</span>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={selected.uurtarief ?? ""}
                    onBlur={async (e) => {
                      const v = e.target.value;
                      const num = v ? Number(v.replace(",", ".")) : null;
                      if ((selected.uurtarief ?? null) === num) return;
                      const { error } = await supabase
                        .from("profiles")
                        .update({ uurtarief: num })
                        .eq("id", selected.id);
                      if (error) { toast.error("Opslaan mislukt"); return; }
                      toast.success("Uurtarief opgeslagen");
                      load();
                    }}
                    placeholder="—"
                    style={{ width: 90, textAlign: "right", background: "#061327", border: "1px solid rgba(106,118,140,0.25)", borderRadius: 8, padding: "6px 8px", color: "#dae6ff", fontFamily: "DM Mono, monospace", fontSize: 13 }}
                  />
                  <span style={{ fontSize: 11, color: "#6a768c" }}>/uur</span>
                </div>
              </div>
            </div>

            {/* Monteurs eronder */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#3fff8b", letterSpacing: "0.2em", textTransform: "uppercase" }}>
                Monteurs onder deze onderaannemer ({mList.length})
              </p>
              <button onClick={() => { setShowAddMonteur(!showAddMonteur); if (showAddMonteur) resetMonteurForm(); }} style={{ width: 32, height: 32, borderRadius: "50%", background: showAddMonteur ? "rgba(255,113,108,0.15)" : "rgba(63,255,139,0.15)", border: showAddMonteur ? "1px solid rgba(255,113,108,0.3)" : "1px solid rgba(63,255,139,0.3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: showAddMonteur ? "#ff716c" : "#3fff8b" }}>
                {showAddMonteur ? <X size={16} /> : <Plus size={16} />}
              </button>
            </div>

            {showAddMonteur && (
              <form onSubmit={handleAddMonteur} style={{ background: "#0a1a30", borderRadius: 16, padding: 16, marginBottom: 16, border: "1px solid rgba(63,255,139,0.2)", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Input placeholder="Voornaam" value={mVoornaam} onChange={setMVoornaam} />
                  <Input placeholder="Achternaam" value={mAchternaam} onChange={setMAchternaam} />
                </div>
                <select value={mRole} onChange={(e) => setMRole(e.target.value)} style={selectStyle}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <button type="submit" disabled={mSaving} style={primaryBtn}>{mSaving ? "Bezig…" : "Toevoegen"}</button>
              </form>
            )}


            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {mList.length === 0 && !showAddMonteur && (
                <div style={{ padding: 24, textAlign: "center", color: "#6a768c", background: "#0a1a30", borderRadius: 16, border: "1px dashed rgba(106,118,140,0.3)" }}>
                  Nog geen monteurs onder deze onderaannemer
                </div>
              )}
              {mList.map((m) => (
                <div key={m.id} style={{ background: "#0a1a30", borderRadius: 14, padding: 14, border: "1px solid rgba(106,118,140,0.15)", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(63,255,139,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope", fontWeight: 700, color: "#3fff8b", fontSize: 13 }}>
                    {m.full_name.split(" ").map(n => n[0]).slice(0, 2).join("")}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, color: "#dae6ff", fontSize: 14 }}>{m.full_name}</p>
                    <p style={{ fontSize: 12, color: "#6a768c" }}>{m.email || m.telefoon || "—"}</p>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#3fff8b", textTransform: "uppercase", letterSpacing: "0.1em" }}>{m.role || "monteur"}</span>
                </div>
              ))}
            </div>
          </main>
        </div>
      </PageShell>
    );
  }

  // ============== LIST ==============
  return (
    <PageShell>
      <div style={{ background: "var(--app-navy)", minHeight: "100dvh", paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 120px)" }}>
        <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(3,14,32,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Building2 size={20} color="#3fff8b" />
            <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 18, color: "#3fff8b", letterSpacing: "0.1em", textTransform: "uppercase" }}>ONDERAANNEMERS</span>
          </div>
          <button onClick={() => { setShowAddOA(!showAddOA); if (showAddOA) resetOaForm(); }} style={{ width: 36, height: 36, borderRadius: "50%", background: showAddOA ? "rgba(255,113,108,0.15)" : "rgba(63,255,139,0.15)", border: showAddOA ? "1px solid rgba(255,113,108,0.3)" : "1px solid rgba(63,255,139,0.3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: showAddOA ? "#ff716c" : "#3fff8b" }}>
            {showAddOA ? <X size={18} /> : <Plus size={18} />}
          </button>
        </header>

        <main style={{ padding: "24px 20px" }}>
          <section style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#3fff8b", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 4 }}>Partnerbedrijven</p>
            <h2 style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 26, color: "#dae6ff" }}>{onderaannemers.length} onderaannemers</h2>
          </section>

          {showAddOA && (
            <form onSubmit={handleAddOA} style={{ background: "#0a1a30", borderRadius: 16, padding: 16, marginBottom: 20, border: "1px solid rgba(63,255,139,0.2)", display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#3fff8b", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 4 }}>Nieuwe onderaannemer</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Input placeholder="Voornaam contact" value={oaVoornaam} onChange={setOaVoornaam} />
                <Input placeholder="Achternaam contact" value={oaAchternaam} onChange={setOaAchternaam} />
              </div>
              <Input placeholder="Bedrijfsnaam" value={oaBedrijf} onChange={setOaBedrijf} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Input placeholder="KvK" value={oaKvk} onChange={setOaKvk} />
                <Input placeholder="IBAN" value={oaIban} onChange={setOaIban} />
              </div>
              <Input placeholder="Uurtarief (€ per uur)" type="number" value={oaUurtarief} onChange={setOaUurtarief} />
              <Input placeholder="E-mail (= gebruikersnaam)" type="email" value={oaEmail} onChange={setOaEmail} />
              <Input placeholder="Telefoon" value={oaTel} onChange={setOaTel} />
              <div style={{ position: "relative" }}>
                <Input placeholder="Wachtwoord" type={oaShowPw ? "text" : "password"} value={oaPw} onChange={setOaPw} />
                <button type="button" onClick={() => setOaShowPw(!oaShowPw)} style={iconBtn}>{oaShowPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setOaPw(genPw())} style={secondaryBtn}>Genereer</button>
                <button type="submit" disabled={oaSaving} style={primaryBtn}>{oaSaving ? "Bezig…" : "Aanmaken"}</button>
              </div>
            </form>
          )}

          {lastCreatedOA && (
            <CredsCard email={lastCreatedOA.email} pw={lastCreatedOA.pw} onCopy={() => copyCreds(lastCreatedOA.email, lastCreatedOA.pw)} onClose={() => setLastCreatedOA(null)} />
          )}

          {loading ? (
            <p style={{ color: "#6a768c", textAlign: "center", padding: 40 }}>Laden…</p>
          ) : onderaannemers.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#6a768c", background: "#0a1a30", borderRadius: 16, border: "1px dashed rgba(106,118,140,0.3)" }}>
              <Building2 size={32} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
              <p>Nog geen onderaannemers. Klik op + om er één toe te voegen.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {onderaannemers.map((oa) => {
                const count = monteursVoor(oa.id).length;
                return (
                  <button key={oa.id} onClick={() => setSelected(oa)} style={{ width: "100%", textAlign: "left", background: "#0a1a30", borderRadius: 16, padding: 16, border: "1px solid rgba(106,118,140,0.15)", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(63,255,139,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "#3fff8b" }}>
                      <Building2 size={22} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 800, color: "#dae6ff", fontFamily: "Manrope", fontSize: 15 }}>
                        {oa.bedrijfsnaam || oa.full_name}
                      </p>
                      <p style={{ fontSize: 12, color: "#a0abc3", marginTop: 2 }}>
                        {oa.bedrijfsnaam ? oa.full_name : (oa.email || "—")}
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                        <Users size={12} color="#3fff8b" />
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#3fff8b", letterSpacing: "0.05em" }}>
                          {count} {count === 1 ? "monteur" : "monteurs"}
                        </span>
                      </div>
                    </div>
                    <ChevronRight size={20} color="#6a768c" />
                  </button>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </PageShell>
  );
}

// ---------------- helpers ----------------
const inputStyle: React.CSSProperties = {
  width: "100%", background: "#102038", border: "1px solid rgba(106,118,140,0.3)",
  borderRadius: 10, padding: "10px 12px", color: "#dae6ff", fontSize: 14, fontFamily: "Inter", outline: "none",
};
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };
const primaryBtn: React.CSSProperties = {
  flex: 1, height: 42, borderRadius: 10, background: "#3fff8b", color: "#003a18",
  border: "none", fontWeight: 800, fontFamily: "Inter", fontSize: 13, textTransform: "uppercase",
  letterSpacing: "0.08em", cursor: "pointer",
};
const secondaryBtn: React.CSSProperties = {
  height: 42, padding: "0 14px", borderRadius: 10, background: "transparent",
  border: "1px solid rgba(63,255,139,0.4)", color: "#3fff8b", fontWeight: 700, fontFamily: "Inter",
  fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer",
};
const iconBtn: React.CSSProperties = {
  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
  background: "none", border: "none", color: "#a0abc3", cursor: "pointer", display: "flex",
};

function Input({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder: string; type?: string }) {
  return <input type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(106,118,140,0.1)" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6a768c", fontFamily: "Inter" }}>{icon}{label}</span>
      <span style={{ fontSize: 13, color: "#dae6ff", fontFamily: "Inter", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function CredsCard({ email, pw, onCopy, onClose }: { email: string; pw: string; onCopy: () => void; onClose: () => void }) {
  return (
    <div style={{ background: "#102038", borderRadius: 14, padding: 14, marginBottom: 16, border: "1px solid rgba(63,255,139,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#3fff8b", textTransform: "uppercase", letterSpacing: "0.15em" }}>Inloggegevens aangemaakt</p>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#6a768c", cursor: "pointer" }}><X size={16} /></button>
      </div>
      <p style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: "#dae6ff", background: "#0a1a30", padding: 8, borderRadius: 8, marginBottom: 6 }}>Gebruikersnaam: {email}</p>
      <p style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: "#dae6ff", background: "#0a1a30", padding: 8, borderRadius: 8, marginBottom: 8 }}>Wachtwoord: {pw}</p>
      <button onClick={onCopy} style={{ ...secondaryBtn, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Copy size={14} /> Kopieer
      </button>
    </div>
  );
}

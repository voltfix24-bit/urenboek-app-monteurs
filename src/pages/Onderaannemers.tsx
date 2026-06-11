import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { PageShell } from "@/components/PageShell";
import { toast } from "sonner";
import { generateEmailSuffix, generateTemporaryPassword } from "@/lib/passwords";
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
  contactpersoon: string | null;
  factuuradres: string | null;
  kvk_nummer: string | null;
  btw_nummer: string | null;
  iban: string | null;
  betalingstermijn: number | null;
  uurtarief: number | null;
  onderaannemer_startlocatie: string | null;
  onderaannemer_vrije_km_per_dag: number;
  onderaannemer_km_tarief: number;
  onderaannemer_reiskosten_per_ploeg: boolean;
  account_status: string;
  planning_partner_ids: string[];
  bedrijfsgegevens_updated_at: string | null;
  bedrijfsgegevens_updated_by: string | null;
}

const BEDRIJF_FIELDS = [
  "bedrijfsnaam", "contactpersoon", "email", "telefoon",
  "factuuradres", "kvk_nummer", "btw_nummer", "iban", "betalingstermijn",
] as const;
type BedrijfForm = {
  bedrijfsnaam: string; contactpersoon: string; email: string; telefoon: string;
  factuuradres: string; kvk_nummer: string; btw_nummer: string; iban: string; betalingstermijn: string;
};
const emptyBedrijfForm = (): BedrijfForm => ({
  bedrijfsnaam: "", contactpersoon: "", email: "", telefoon: "",
  factuuradres: "", kvk_nummer: "", btw_nummer: "", iban: "", betalingstermijn: "30",
});
const oaToBedrijfForm = (o: Onderaannemer): BedrijfForm => ({
  bedrijfsnaam: o.bedrijfsnaam || "",
  contactpersoon: o.contactpersoon || "",
  email: o.email || "",
  telefoon: o.telefoon || "",
  factuuradres: o.factuuradres || "",
  kvk_nummer: o.kvk_nummer || "",
  btw_nummer: o.btw_nummer || "",
  iban: o.iban || "",
  betalingstermijn: String(o.betalingstermijn ?? 30),
});

interface Monteur {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  telefoon: string | null;
  onderaannemer_id: string | null;
  account_status: string;
  role?: string;
  planning_partner_ids: string[];
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

  // Bewerken bestaande monteur
  const [editId, setEditId] = useState<string | null>(null);
  const [editVoornaam, setEditVoornaam] = useState("");
  const [editAchternaam, setEditAchternaam] = useState("");
  const [editTel, setEditTel] = useState("");
  const [editRole, setEditRole] = useState("monteur");
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Vaste planning-collega's
  const [partnerEditId, setPartnerEditId] = useState<string | null>(null);
  const [partnerSel, setPartnerSel] = useState<Set<string>>(new Set());
  const [partnerSaving, setPartnerSaving] = useState(false);


  // Wachtwoord reset voor onderaannemer (account delen)
  const [pwResetting, setPwResetting] = useState(false);
  const [newOaPw, setNewOaPw] = useState<{ email: string; pw: string } | null>(null);
  const [oaAccountEmail, setOaAccountEmail] = useState("");
  const [oaAccountPw, setOaAccountPw] = useState("");
  const [oaAccountShowPw, setOaAccountShowPw] = useState(false);
  const [oaAccountSaving, setOaAccountSaving] = useState(false);

  useEffect(() => {
    setOaAccountEmail(selected?.email || "");
    setOaAccountPw("");
    setOaAccountShowPw(false);
    setNewOaPw(null);
  }, [selected?.id]);

  const createOnderaannemerAccount = async () => {
    if (!selected) return;
    if (!oaAccountEmail.trim() || !oaAccountPw.trim()) {
      toast.error("Vul e-mail en wachtwoord in");
      return;
    }
    if (oaAccountPw.length < 8) {
      toast.error("Wachtwoord min. 8 tekens");
      return;
    }

    setOaAccountSaving(true);
    const { data, error } = await supabase.functions.invoke("reset-password", {
      body: {
        user_id: selected.user_id,
        email: oaAccountEmail.trim(),
        password: oaAccountPw,
      },
    });

    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Account aanmaken mislukt");
      setOaAccountSaving(false);
      return;
    }

    toast.success("Account voor onderaannemer aangemaakt");
    if (data?.profileWarning) {
      toast.warning(data.profileWarning);
    }
    setNewOaPw({ email: oaAccountEmail.trim(), pw: oaAccountPw });
    setOaAccountPw("");
    setOaAccountSaving(false);
    load();
  };

  const resetOnderaannemerPassword = async () => {
    if (!selected) return;
    if (!confirm(`Nieuw wachtwoord genereren voor ${selected.full_name}? Het oude wachtwoord werkt daarna niet meer.`)) return;
    setPwResetting(true);
    const pw = generateTemporaryPassword();
    const { data, error } = await supabase.functions.invoke("reset-password", {
      body: { user_id: selected.user_id, password: pw },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Reset mislukt");
      setPwResetting(false);
      return;
    }
    toast.success("Nieuw wachtwoord aangemaakt");
    setNewOaPw({ email: selected.email || "", pw });
    setPwResetting(false);
  };

  const startEdit = (m: Monteur) => {
    const parts = (m.full_name || "").trim().split(/\s+/);
    setEditId(m.id);
    setEditVoornaam(parts[0] || "");
    setEditAchternaam(parts.slice(1).join(" "));
    setEditTel(m.telefoon || "");
    setEditRole(m.role || "monteur");
  };
  const cancelEdit = () => { setEditId(null); };

  const saveEdit = async (m: Monteur) => {
    if (!editVoornaam.trim() || !editAchternaam.trim()) {
      toast.error("Vul voornaam en achternaam in"); return;
    }
    setEditSaving(true);
    const fullName = `${editVoornaam.trim()} ${editAchternaam.trim()}`.trim();
    const { error: pErr } = await supabase.from("profiles").update({
      full_name: fullName,
      telefoon: editTel || "",
    }).eq("id", m.id);
    if (pErr) { toast.error("Opslaan mislukt"); setEditSaving(false); return; }
    if (editRole !== (m.role || "monteur")) {
      await supabase.from("user_roles").delete().eq("user_id", m.user_id);
      await supabase.from("user_roles").insert({ user_id: m.user_id, role: editRole as any });
    }
    toast.success("Monteur bijgewerkt");
    setEditId(null);
    setEditSaving(false);
    load();
  };

  const deleteMonteur = async (m: Monteur) => {
    if (!confirm(`Weet je zeker dat je ${m.full_name} permanent wilt verwijderen?`)) return;
    setDeletingId(m.id);
    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { userId: m.user_id },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Verwijderen mislukt");
      setDeletingId(null);
      return;
    }
    toast.success(`${m.full_name} verwijderd`);
    setDeletingId(null);
    load();
  };

  // ─── Vaste planning-collega's ───
  const startPartnerEdit = (m: { id: string; planning_partner_ids: string[] }) => {
    setPartnerEditId(m.id);
    setPartnerSel(new Set(m.planning_partner_ids || []));
  };
  const togglePartnerSel = (id: string) => {
    setPartnerSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const savePartners = async (m: { id: string; planning_partner_ids: string[] }) => {
    setPartnerSaving(true);
    const oldSet = new Set(m.planning_partner_ids || []);
    const newSet = partnerSel;
    const added: string[] = [...newSet].filter((x) => !oldSet.has(x));
    const removed: string[] = [...oldSet].filter((x) => !newSet.has(x));

    // Update mijzelf
    const { error: e1 } = await supabase
      .from("profiles")
      .update({ planning_partner_ids: [...newSet] } as any)
      .eq("id", m.id);
    if (e1) { toast.error("Opslaan mislukt"); setPartnerSaving(false); return; }

    // Bidirectioneel: voeg toe/verwijder op de partners zelf
    const affected = [...new Set([...added, ...removed])];
    if (affected.length > 0) {
      const { data: rows } = await supabase
        .from("profiles")
        .select("id, planning_partner_ids")
        .in("id", affected);
      for (const r of (rows || []) as any[]) {
        const cur = new Set<string>((r.planning_partner_ids as string[] | null) || []);
        if (added.includes(r.id)) cur.add(m.id);
        if (removed.includes(r.id)) cur.delete(m.id);
        await supabase.from("profiles").update({ planning_partner_ids: [...cur] } as any).eq("id", r.id);
      }
    }

    toast.success("Vaste collega's bijgewerkt");
    setPartnerEditId(null);
    setPartnerSaving(false);
    load();
  };



  const load = async () => {
    setLoading(true);
    const { data: profielen } = await supabase
      .from("profiles")
      .select("id,user_id,full_name,email,telefoon,bedrijfsnaam,contactpersoon,factuuradres,kvk_nummer,btw_nummer,iban,betalingstermijn,uurtarief,onderaannemer_startlocatie,onderaannemer_vrije_km_per_dag,onderaannemer_km_tarief,onderaannemer_reiskosten_per_ploeg,account_status,is_onderaannemer,onderaannemer_id,planning_partner_ids,bedrijfsgegevens_updated_at,bedrijfsgegevens_updated_by")
      .order("full_name");
    const { data: rollen } = await supabase.from("user_roles").select("user_id,role");
    const rolMap = new Map((rollen || []).map((r) => [r.user_id, r.role]));

    const oa: Onderaannemer[] = [];
    const mt: Monteur[] = [];
    (profielen || []).forEach((p: any) => {
      const ppi = (p.planning_partner_ids as string[] | null) || [];
      if (p.is_onderaannemer) {
        oa.push({ ...p, planning_partner_ids: ppi });
      } else if (p.onderaannemer_id) {
        mt.push({ ...p, role: rolMap.get(p.user_id), planning_partner_ids: ppi });
      }
    });
    setOnderaannemers(oa);
    setMonteurs(mt);
    setSelected((prev) => prev ? oa.find((o) => o.id === prev.id) ?? null : null);
    setLoading(false);
  };


  useEffect(() => { load(); }, []);

  const monteursVoor = (oaId: string) => monteurs.filter((m) => m.onderaannemer_id === oaId);

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
        onderaannemer_vrije_km_per_dag: 150,
        onderaannemer_km_tarief: 0.46,
        onderaannemer_reiskosten_per_ploeg: true,
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
    const autoEmail = `${slug(mVoornaam)}.${slug(mAchternaam)}.${generateEmailSuffix(6)}@${domain}.local`;
    const autoPw = generateTemporaryPassword();
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
        <p style={{ color: "var(--text-muted)" }}>Alleen managers hebben toegang.</p>
      </div>
    );
  }

  // ============== DETAIL ==============
  if (selected) {
    const mList = monteursVoor(selected.id);
    return (
      <PageShell>
        <div style={{ background: "var(--app-navy)", minHeight: "100dvh", paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 100px)" }}>
          <header style={{ position: "sticky", top: 0, zIndex: 50, background: "color-mix(in srgb, var(--bg-surface) 94%, transparent)", backdropFilter: "blur(20px)", borderBottom: "1px solid var(--planning-border-soft)", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => { setSelected(null); setShowAddMonteur(false); setLastCreatedMonteur(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", display: "flex" }}>
              <ArrowLeft size={24} />
            </button>
            <span style={{ fontFamily: "Hanken Grotesk", fontWeight: 800, fontSize: 18, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {selected.full_name}
            </span>
          </header>

          <main style={{ padding: "24px 20px" }}>
            {/* Hero */}
            <div style={{ background: "var(--bg-surface)", borderRadius: 24, padding: "28px 20px", marginBottom: 20, border: "1px solid var(--planning-border-soft)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Building2 size={28} color="var(--accent-dark)" />
              </div>
              <h2 style={{ fontFamily: "Hanken Grotesk", fontWeight: 800, fontSize: 22, color: "var(--text-primary)" }}>{selected.bedrijfsnaam || selected.full_name}</h2>
              {selected.bedrijfsnaam && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{selected.full_name}</p>}
              <div style={{ padding: "4px 14px", borderRadius: 9999, background: "var(--accent-light)", border: "1px solid var(--accent-border)" }}>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "Hanken Grotesk", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Onderaannemer</span>
              </div>
            </div>

            {/* Inloggegevens / wachtwoord reset */}
            <div style={{ background: "var(--bg-surface)", borderRadius: 16, padding: 18, marginBottom: 20, border: "1px solid var(--planning-border-soft)" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#6a768c", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 4 }}>Inloggegevens</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.5 }}>
                Deze onderaannemer ziet na inloggen de planning en uren van de monteurs onder hem. {selected.email ? <>Huidige login: <b style={{ color: "var(--text-primary)" }}>{selected.email}</b>.</> : "Deze onderaannemer heeft nog geen login."}
              </p>
              {selected.email ? (
                <button
                  type="button"
                  onClick={resetOnderaannemerPassword}
                  disabled={pwResetting}
                  style={{ ...secondaryBtn, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: pwResetting ? 0.6 : 1 }}
                >
                  {pwResetting ? "Bezig…" : "Nieuw wachtwoord genereren"}
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Input placeholder="E-mail (= gebruikersnaam)" type="email" value={oaAccountEmail} onChange={setOaAccountEmail} />
                  <div style={{ position: "relative" }}>
                    <Input placeholder="Wachtwoord" type={oaAccountShowPw ? "text" : "password"} value={oaAccountPw} onChange={setOaAccountPw} />
                    <button type="button" onClick={() => setOaAccountShowPw(!oaAccountShowPw)} style={iconBtn}>{oaAccountShowPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => setOaAccountPw(generateTemporaryPassword() + "A1!")} style={secondaryBtn}>Genereer</button>
                    <button type="button" onClick={createOnderaannemerAccount} disabled={oaAccountSaving} style={primaryBtn}>{oaAccountSaving ? "Bezig…" : "Account aanmaken"}</button>
                  </div>
                </div>
              )}
              {newOaPw && (
                <div style={{ marginTop: 12 }}>
                  <CredsCard
                    email={newOaPw.email}
                    pw={newOaPw.pw}
                    onCopy={() => copyCreds(newOaPw.email, newOaPw.pw)}
                    onClose={() => setNewOaPw(null)}
                  />
                </div>
              )}
            </div>


            {/* Contact info */}
            <div style={{ background: "var(--bg-surface)", borderRadius: 16, padding: 18, marginBottom: 20, border: "1px solid var(--planning-border-soft)" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#6a768c", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 12 }}>Bedrijfsgegevens</p>
              <Row label="E-mail" value={selected.email || "—"} icon={<Mail size={14} />} />
              <Row label="Telefoon" value={selected.telefoon || "—"} icon={<Phone size={14} />} />
              <Row label="KvK" value={selected.kvk_nummer || "—"} />
              <Row label="IBAN" value={selected.iban || "—"} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid color-mix(in srgb, var(--planning-border-soft) 60%, transparent)" }}>
                <span style={{ fontSize: 12, color: "#6a768c" }}>Uurtarief</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, color: "var(--text-muted)" }}>€</span>
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
                    style={{ width: 90, textAlign: "right", background: "var(--bg-surface)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "6px 8px", color: "var(--text-primary)", fontFamily: "DM Mono, monospace", fontSize: 13 }}
                  />
                  <span style={{ fontSize: 11, color: "#6a768c" }}>/uur</span>
                </div>
              </div>
            </div>

            {/* Reiskosten afspraak */}
            <div style={{ background: "var(--bg-surface)", borderRadius: 16, padding: 18, marginBottom: 20, border: "1px solid var(--planning-border-soft)" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#6a768c", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 4 }}>Reiskosten afspraak</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.5 }}>
                Deze waarden worden gebruikt voor weekorders vanuit de planning. De berekening wordt als snapshot opgeslagen op de inkooporder.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={fieldLabel}>
                  Startlocatie ploeg
                  <input
                    defaultValue={selected.onderaannemer_startlocatie || ""}
                    onBlur={async (e) => {
                      const value = e.target.value.trim() || null;
                      if ((selected.onderaannemer_startlocatie || null) === value) return;
                      const { error } = await supabase.from("profiles").update({ onderaannemer_startlocatie: value } as any).eq("id", selected.id);
                      if (error) { toast.error("Startlocatie opslaan mislukt"); return; }
                      toast.success("Startlocatie opgeslagen");
                      load();
                    }}
                    placeholder="Bijv. bedrijfsadres of opstapplaats"
                    style={inputStyle}
                  />
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label style={fieldLabel}>
                    Vrije km per dag
                    <input
                      type="number"
                      step="1"
                      defaultValue={selected.onderaannemer_vrije_km_per_dag ?? 150}
                      onBlur={async (e) => {
                        const value = Number(e.target.value || 150);
                        if ((selected.onderaannemer_vrije_km_per_dag ?? 150) === value) return;
                        const { error } = await supabase.from("profiles").update({ onderaannemer_vrije_km_per_dag: value } as any).eq("id", selected.id);
                        if (error) { toast.error("Vrije km opslaan mislukt"); return; }
                        toast.success("Vrije km opgeslagen");
                        load();
                      }}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldLabel}>
                    Km-tarief
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={selected.onderaannemer_km_tarief ?? 0.46}
                      onBlur={async (e) => {
                        const value = Number((e.target.value || "0.46").replace(",", "."));
                        if ((selected.onderaannemer_km_tarief ?? 0.46) === value) return;
                        const { error } = await supabase.from("profiles").update({ onderaannemer_km_tarief: value } as any).eq("id", selected.id);
                        if (error) { toast.error("Km-tarief opslaan mislukt"); return; }
                        toast.success("Km-tarief opgeslagen");
                        load();
                      }}
                      style={inputStyle}
                    />
                  </label>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-primary)", fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    defaultChecked={selected.onderaannemer_reiskosten_per_ploeg ?? true}
                    onChange={async (e) => {
                      const { error } = await supabase.from("profiles").update({ onderaannemer_reiskosten_per_ploeg: e.target.checked } as any).eq("id", selected.id);
                      if (error) { toast.error("Reiskostenafspraak opslaan mislukt"); return; }
                      toast.success("Reiskostenafspraak opgeslagen");
                      load();
                    }}
                    style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
                  />
                  Reiskosten een keer per ploeg/auto per dag rekenen
                </label>
              </div>
            </div>

            {/* Monteurs eronder */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.2em", textTransform: "uppercase" }}>
                Monteurs onder deze onderaannemer ({mList.length})
              </p>
              <button onClick={() => { setShowAddMonteur(!showAddMonteur); if (showAddMonteur) resetMonteurForm(); }} style={{ width: 32, height: 32, borderRadius: "50%", background: showAddMonteur ? "rgba(255,113,108,0.15)" : "var(--accent-light)", border: showAddMonteur ? "1px solid var(--danger-border)" : "1px solid var(--accent-border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: showAddMonteur ? "var(--danger)" : "var(--accent)" }}>
                {showAddMonteur ? <X size={16} /> : <Plus size={16} />}
              </button>
            </div>

            {showAddMonteur && (
              <form onSubmit={handleAddMonteur} style={{ background: "var(--bg-surface)", borderRadius: 16, padding: 16, marginBottom: 16, border: "1px solid var(--accent-border)", display: "flex", flexDirection: "column", gap: 10 }}>
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
                <div style={{ padding: 24, textAlign: "center", color: "#6a768c", background: "var(--bg-surface)", borderRadius: 16, border: "1px dashed var(--border-strong)" }}>
                  Nog geen monteurs onder deze onderaannemer
                </div>
              )}
              {mList.map((m) => {
                const isEditing = editId === m.id;
                if (isEditing) {
                  return (
                    <div key={m.id} style={{ background: "var(--bg-surface)", borderRadius: 14, padding: 14, border: "1px solid var(--accent-border)", display: "flex", flexDirection: "column", gap: 10 }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.15em" }}>Monteur bewerken</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <Input placeholder="Voornaam" value={editVoornaam} onChange={setEditVoornaam} />
                        <Input placeholder="Achternaam" value={editAchternaam} onChange={setEditAchternaam} />
                      </div>
                      <Input placeholder="Telefoon" value={editTel} onChange={setEditTel} />
                      <select value={editRole} onChange={(e) => setEditRole(e.target.value)} style={selectStyle}>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" onClick={cancelEdit} style={secondaryBtn}>Annuleren</button>
                        <button type="button" onClick={() => deleteMonteur(m)} disabled={deletingId === m.id} style={{ ...secondaryBtn, color: "var(--danger)", border: "1px solid var(--danger-border)", background: "var(--danger-light)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <Trash2 size={14} /> {deletingId === m.id ? "Bezig…" : "Verwijderen"}
                        </button>
                        <button type="button" onClick={() => saveEdit(m)} disabled={editSaving} style={{ ...primaryBtn, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <Check size={14} /> {editSaving ? "Bezig…" : "Opslaan"}
                        </button>
                      </div>
                    </div>
                  );
                }
                const isPartnerEdit = partnerEditId === m.id;
                const teamForPartner: { id: string; full_name: string }[] = [
                  { id: selected.id, full_name: `${selected.bedrijfsnaam || selected.full_name} (onderaannemer)` },
                  ...mList.filter((x) => x.id !== m.id).map((x) => ({ id: x.id, full_name: x.full_name })),
                ];
                const partnerNamen = (m.planning_partner_ids || [])
                  .map((pid) => teamForPartner.find((t) => t.id === pid)?.full_name)
                  .filter(Boolean) as string[];
                return (
                  <div key={m.id} style={{ background: "var(--bg-surface)", borderRadius: 14, padding: 14, border: "1px solid var(--planning-border-soft)", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Hanken Grotesk", fontWeight: 700, color: "var(--accent)", fontSize: 13 }}>
                        {m.full_name.split(" ").map(n => n[0]).slice(0, 2).join("")}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: 14 }}>{m.full_name}</p>
                        <p style={{ fontSize: 12, color: "#6a768c" }}>{m.email || m.telefoon || "—"}</p>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{m.role || "monteur"}</span>
                      <button type="button" onClick={() => isPartnerEdit ? setPartnerEditId(null) : startPartnerEdit(m)} title="Vaste collega's" style={{ width: 32, height: 32, borderRadius: 10, background: isPartnerEdit ? "var(--accent-border)" : "var(--planning-border-soft)", border: isPartnerEdit ? "1px solid var(--accent-border)" : "1px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: isPartnerEdit ? "var(--accent)" : "var(--text-muted)" }}>
                        <Users size={14} />
                      </button>
                      <button type="button" onClick={() => startEdit(m)} title="Bewerken" style={{ width: 32, height: 32, borderRadius: 10, background: "var(--planning-border-soft)", border: "1px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--text-muted)" }}>
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => deleteMonteur(m)} disabled={deletingId === m.id} title="Verwijderen" style={{ width: 32, height: 32, borderRadius: 10, background: "var(--danger-light)", border: "1px solid rgba(255,113,108,0.25)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--danger)", opacity: deletingId === m.id ? 0.5 : 1 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {!isPartnerEdit && partnerNamen.length > 0 && (
                      <p style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", paddingLeft: 4 }}>
                        Plant automatisch mee met: <span style={{ color: "var(--accent)", fontWeight: 700 }}>{partnerNamen.join(", ")}</span>
                      </p>
                    )}

                    {isPartnerEdit && (
                      <div style={{ background: "var(--bg-surface)", borderRadius: 12, padding: 12, border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)", display: "flex", flexDirection: "column", gap: 8 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.15em" }}>Vaste planning-collega's</p>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
                          Selecteer met wie deze monteur altijd samen wordt ingepland. Bij het maken, wijzigen of verwijderen van een planning gaan alle gekoppelde monteurs mee.
                        </p>
                        {teamForPartner.length === 0 ? (
                          <p style={{ fontSize: 11, color: "#6a768c", fontStyle: "italic" }}>Geen andere teamleden beschikbaar.</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {teamForPartner.map((t) => {
                              const checked = partnerSel.has(t.id);
                              return (
                                <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: checked ? "var(--accent-light)" : "var(--bg-surface)", border: checked ? "1px solid var(--accent-border)" : "1px solid var(--planning-border-soft)", cursor: "pointer" }}>
                                  <input type="checkbox" checked={checked} onChange={() => togglePartnerSel(t.id)} style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />
                                  <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: checked ? 700 : 500 }}>{t.full_name}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                          <button type="button" onClick={() => setPartnerEditId(null)} style={secondaryBtn}>Annuleren</button>
                          <button type="button" onClick={() => savePartners(m)} disabled={partnerSaving} style={primaryBtn}>{partnerSaving ? "Bezig…" : "Opslaan"}</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

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
        <header style={{ position: "sticky", top: 0, zIndex: 50, background: "color-mix(in srgb, var(--bg-surface) 94%, transparent)", backdropFilter: "blur(20px)", borderBottom: "1px solid var(--planning-border-soft)", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Building2 size={20} color="var(--accent)" />
            <span style={{ fontFamily: "Hanken Grotesk", fontWeight: 800, fontSize: 18, color: "var(--accent)", letterSpacing: "0.1em", textTransform: "uppercase" }}>ONDERAANNEMERS</span>
          </div>
          <button onClick={() => { setShowAddOA(!showAddOA); if (showAddOA) resetOaForm(); }} style={{ width: 36, height: 36, borderRadius: "50%", background: showAddOA ? "rgba(255,113,108,0.15)" : "var(--accent-light)", border: showAddOA ? "1px solid var(--danger-border)" : "1px solid var(--accent-border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: showAddOA ? "var(--danger)" : "var(--accent)" }}>
            {showAddOA ? <X size={18} /> : <Plus size={18} />}
          </button>
        </header>

        <main style={{ padding: "24px 20px" }}>
          <section style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 4 }}>Partnerbedrijven</p>
            <h2 style={{ fontFamily: "Hanken Grotesk", fontWeight: 800, fontSize: 26, color: "var(--text-primary)" }}>{onderaannemers.length} onderaannemers</h2>
          </section>

          {showAddOA && (
            <form onSubmit={handleAddOA} style={{ background: "var(--bg-surface)", borderRadius: 16, padding: 16, marginBottom: 20, border: "1px solid var(--accent-border)", display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 4 }}>Nieuwe onderaannemer</p>
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
                <button type="button" onClick={() => setOaPw(generateTemporaryPassword())} style={secondaryBtn}>Genereer</button>
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
            <div style={{ padding: 40, textAlign: "center", color: "#6a768c", background: "var(--bg-surface)", borderRadius: 16, border: "1px dashed var(--border-strong)" }}>
              <Building2 size={32} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
              <p>Nog geen onderaannemers. Klik op + om er één toe te voegen.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {onderaannemers.map((oa) => {
                const count = monteursVoor(oa.id).length;
                return (
                  <button key={oa.id} onClick={() => setSelected(oa)} style={{ width: "100%", textAlign: "left", background: "var(--bg-surface)", borderRadius: 16, padding: 16, border: "1px solid var(--planning-border-soft)", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
                    <div style={{ width: 48, height: 48, borderRadius: 14, background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                      <Building2 size={22} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 800, color: "var(--text-primary)", fontFamily: "Hanken Grotesk", fontSize: 15 }}>
                        {oa.bedrijfsnaam || oa.full_name}
                      </p>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                        {oa.bedrijfsnaam ? oa.full_name : (oa.email || "—")}
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                        <Users size={12} color="var(--accent)" />
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.05em" }}>
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
  width: "100%", background: "var(--bg-surface-2)", border: "1px solid var(--border-strong)",
  borderRadius: 10, padding: "10px 12px", color: "var(--text-primary)", fontSize: 14, fontFamily: "Hanken Grotesk", outline: "none",
};
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };
const fieldLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};
const primaryBtn: React.CSSProperties = {
  flex: 1, height: 42, borderRadius: 10, background: "var(--accent)", color: "#003a18",
  border: "none", fontWeight: 800, fontFamily: "Hanken Grotesk", fontSize: 13, textTransform: "uppercase",
  letterSpacing: "0.08em", cursor: "pointer",
};
const secondaryBtn: React.CSSProperties = {
  height: 42, padding: "0 14px", borderRadius: 10, background: "transparent",
  border: "1px solid var(--accent-border)", color: "var(--accent)", fontWeight: 700, fontFamily: "Hanken Grotesk",
  fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer",
};
const iconBtn: React.CSSProperties = {
  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
  background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex",
};

function Input({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder: string; type?: string }) {
  return <input type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid color-mix(in srgb, var(--planning-border-soft) 60%, transparent)" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6a768c", fontFamily: "Hanken Grotesk" }}>{icon}{label}</span>
      <span style={{ fontSize: 13, color: "var(--text-primary)", fontFamily: "Hanken Grotesk", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function CredsCard({ email, pw, onCopy, onClose }: { email: string; pw: string; onCopy: () => void; onClose: () => void }) {
  return (
    <div style={{ background: "var(--bg-surface-2)", borderRadius: 14, padding: 14, marginBottom: 16, border: "1px solid var(--accent-border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.15em" }}>Inloggegevens aangemaakt</p>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#6a768c", cursor: "pointer" }}><X size={16} /></button>
      </div>
      <p style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: "var(--text-primary)", background: "var(--bg-surface)", padding: 8, borderRadius: 8, marginBottom: 6 }}>Gebruikersnaam: {email}</p>
      <p style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: "var(--text-primary)", background: "var(--bg-surface)", padding: 8, borderRadius: 8, marginBottom: 8 }}>Wachtwoord: {pw}</p>
      <button onClick={onCopy} style={{ ...secondaryBtn, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Copy size={14} /> Kopieer
      </button>
    </div>
  );
}

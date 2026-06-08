import { useState, useEffect } from "react";
import { valideer, nieuweMedewerkerSchema } from "@/lib/validatie";
import { useMedewerkers } from "@/hooks/useMedewerkers";
import { HeaderLogo } from "@/components/HeaderLogo";
import { MobileHeader } from "@/components/MobileHeader";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { generateTemporaryPassword } from "@/lib/passwords";
import { Copy, Eye, EyeOff, Plus, X, Users, ArrowLeft, AlertTriangle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";
import { PageShell } from "@/components/PageShell";
import { MedewerkerKaart, roleLabels, type Employee } from "@/components/medewerkers/MedewerkerKaart";
import { MedewerkerDetail } from "@/components/medewerkers/MedewerkerDetail";
import { NieuweGebruikerForm } from "@/components/medewerkers/NieuweGebruikerForm";
import { ListSkeleton, MedewerkerSkeleton } from "@/components/ui/Skeletons";
import { EmptyState } from "@/components/ui/EmptyState";
interface CreatedUser { email: string; fullName: string; role: string; password?: string; inviteOnly?: boolean; }

export default function Medewerkers() {
  const { isManager, user } = useAuth();
  const { profile, refetch: refetchProfile } = useProfile();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [createdUsers, setCreatedUsers] = useState<CreatedUser[]>([]);
  const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({});
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<"alle" | "verificatie">("alle");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeCerts, setEmployeeCerts] = useState<any[]>([]);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<React.FormEvent | null>(null);

  // Form state
  const [voornaam, setVoornaam] = useState("");
  const [achternaam, setAchternaam] = useState("");
  const [email, setEmail] = useState("");
  const [telefoon, setTelefoon] = useState("");
  const [adres, setAdres] = useState("");
  const [role, setRole] = useState("");
  const [uurtarief, setUurtarief] = useState("");
  const [rijbewijs, setRijbewijs] = useState(false);
  const [contractEinddatum, setContractEinddatum] = useState("");
  const [noodcontactNaam, setNoodcontactNaam] = useState("");
  const [noodcontactTel, setNoodcontactTel] = useState("");
  const [inviteMode, setInviteMode] = useState<"invite" | "password">("invite");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const { medewerkers: medewerkersData, loading: medewerkersLoading, refetch: refetchMedewerkers } = useMedewerkers();

  useEffect(() => {
    if (medewerkersData.length > 0) {
      const mapped = medewerkersData.map((m) => ({
        id: m.id, user_id: m.user_id, full_name: m.full_name, role: m.role,
        uurtarief: m.uurtarief, telefoon: m.telefoon, adres: m.adres,
        rijbewijs: m.rijbewijs, account_status: m.account_status,
        invited_at: m.invited_at, activated_at: m.activated_at,
        noodcontact_naam: m.noodcontact_naam, noodcontact_tel: m.noodcontact_tel,
        contract_einddatum: m.contract_einddatum,
        email: (m as any).email,
        kvk_nummer: (m as any).kvk_nummer, btw_nummer: (m as any).btw_nummer,
        iban: (m as any).iban, bedrijfsnaam: (m as any).bedrijfsnaam,
      }));
      setEmployees(mapped);
      // Sync selectedEmployee with refreshed data so name/field updates propagate
      setSelectedEmployee((prev) => {
        if (!prev) return prev;
        const fresh = mapped.find((e) => e.id === prev.id);
        return fresh ? { ...prev, ...fresh } : prev;
      });
    }
  }, [medewerkersData]);

  const loadEmployeeCerts = async (profileId: string) => {
    const { data } = await supabase.from("certificaten").select("*").eq("medewerker_id", profileId);
    setEmployeeCerts(data || []);
  };

  const selectEmployee = (emp: Employee) => {
    setSelectedEmployee(emp);
    loadEmployeeCerts(emp.id);
  };

  const generatePassword = () => {
    setPassword(generateTemporaryPassword());
  };

  const resetForm = () => {
    setVoornaam(""); setAchternaam(""); setEmail(""); setTelefoon("");
    setAdres(""); setRole(""); setUurtarief(""); setRijbewijs(false);
    setContractEinddatum(""); setNoodcontactNaam(""); setNoodcontactTel("");
    setPassword(""); setInviteMode("invite");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const vResult = valideer(nieuweMedewerkerSchema, {
      voornaam: voornaam.trim(), achternaam: achternaam.trim(),
      email, role: role || undefined, uurtarief: uurtarief || undefined, telefoon: telefoon || undefined,
    });
    if (!vResult.success) {
      setFormErrors(vResult.errors);
      toast.error("Controleer de ingevulde gegevens");
      setLoading(false);
      return;
    }
    setFormErrors({});
    if (inviteMode === "password" && !password) { toast.error("Vul een wachtwoord in"); return; }
    setPendingEvent(e);
    setShowConfirm(true);
  };

  const doCreate = async () => {
    setShowConfirm(false);
    const fullName = `${voornaam.trim()} ${achternaam.trim()}`.trim();
    setLoading(true);
    const body: any = { email, fullName, role, telefoon: telefoon || null, adres: adres || null, rijbewijs, uurtarief: uurtarief ? parseFloat(uurtarief) : null, noodcontact_naam: noodcontactNaam || null, noodcontact_tel: noodcontactTel || null, contract_einddatum: contractEinddatum || null };
    if (inviteMode === "invite") body.invite_only = true; else body.password = password;
    const { data, error } = await supabase.functions.invoke("create-user", { body });
    if (error || data?.error) { toast.error(data?.error || error?.message || "Fout bij aanmaken"); }
    else {
      if (inviteMode === "invite") {
        toast.success(`${fullName} is uitgenodigd. Een activatiemail is verstuurd.`);
        setCreatedUsers(prev => [{ email, fullName, role, inviteOnly: true }, ...prev]);
      } else {
        toast.success(`Account aangemaakt voor ${fullName}`);
        setCreatedUsers(prev => [{ email, fullName, role, password }, ...prev]);
      }
      resetForm(); setShowAdd(false); refetchMedewerkers();
    }
    setLoading(false);
  };

  const handleDelete = async (userId: string, name: string) => {
    const { data, error } = await supabase.functions.invoke("delete-user", { body: { userId } });
    if (error || data?.error) toast.error(data?.error || error?.message || "Fout bij verwijderen");
    else { toast.success(`${name} is verwijderd`); refetchMedewerkers(); if (selectedEmployee?.user_id === userId) setSelectedEmployee(null); }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!await mutate(supabase.from("user_roles").update({ role: newRole as any }).eq("user_id", userId))) return;
    toast.success("Rol gewijzigd"); refetchMedewerkers();
  };

  const handleStatusChange = async (emp: Employee, newStatus: string) => {
    if (!await mutate(supabase.from("profiles").update({ account_status: newStatus } as any).eq("user_id", emp.user_id))) return;
    toast.success(newStatus === "inactive" ? `${emp.full_name} is gedeactiveerd` : `${emp.full_name} is geactiveerd`);
    refetchMedewerkers();
    if (selectedEmployee?.user_id === emp.user_id) setSelectedEmployee({ ...emp, account_status: newStatus });
  };

  const copyCredentials = (u: CreatedUser) => {
    navigator.clipboard.writeText(`Inloggegevens TerreVolt Urenregistratie:\nE-mail: ${u.email}\nWachtwoord: ${u.password}\n\nLog in op: ${window.location.origin}`);
    toast.success("Inloggegevens gekopieerd!");
  };

  if (!isManager) return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-navy)" }}><p style={{ color: "#6b7280" }}>Alleen managers hebben toegang.</p></div>;

  const monteurs = employees.filter(e => e.role !== "manager" && e.role !== "–");
  const managers = employees.filter(e => e.role === "manager");
  const verificatieCount = employees.filter(e => e.account_status === "onboarding").length;

  const filteredMonteurs = filter === "verificatie"
    ? monteurs.filter(e => e.account_status === "onboarding")
    : monteurs;

  const weekNum = (() => {
    const d = new Date();
    const oneJan = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);
  })();

  // Detail view
  if (selectedEmployee) {
    return (
      <>
      <PageShell>
        <div style={{ background: "var(--app-navy)", minHeight: "100dvh", paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 100px)" }}>
          <header style={{ position: "sticky", top: 0, zIndex: 50, background: "#f9fafb", backdropFilter: "blur(20px)", borderBottom: "1px solid #e5e7eb", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setSelectedEmployee(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#10b981", display: "flex" }}>
              <ArrowLeft size={24} />
            </button>
            <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 18, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {selectedEmployee.full_name}
            </span>
            <div style={{ marginLeft: 'auto', width: 36, height: 36, borderRadius: "50%", background: "#ecfdf5", border: "1px solid #a7f3d0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope", fontWeight: 700, fontSize: 13, color: "#10b981" }}>
              {profile?.full_name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?'}
            </div>
          </header>
          <main style={{ padding: "24px 20px" }}>
            {/* HERO CARD */}
            <div style={{ background: "#ffffff", borderRadius: 24, padding: "32px 24px", marginBottom: 20, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", overflow: "hidden", border: "1px solid #e5e7eb" }}>
              <div style={{ position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)", width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, #ecfdf5, transparent)", pointerEvents: "none" }} />
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope", fontWeight: 800, fontSize: 24, color: "#047857", marginBottom: 16, boxShadow: "0 0 30px #d1fae5", position: "relative", zIndex: 1 }}>
                {selectedEmployee.full_name?.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
              </div>
              <h2 style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 22, color: "#1f2937", marginBottom: 8, position: "relative", zIndex: 1 }}>{selectedEmployee.full_name}</h2>
              <div style={{ padding: "4px 14px", borderRadius: 9999, background: "#ecfdf5", border: "1px solid #a7f3d0", marginBottom: 6, position: "relative", zIndex: 1 }}>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "Inter", color: "#10b981", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {roleLabels[selectedEmployee.role] || selectedEmployee.role}
                </span>
              </div>
              <span style={{ fontSize: 12, color: "#6b7280", fontFamily: "Inter", position: "relative", zIndex: 1 }}>TerreVolt BV</span>
            </div>

            {/* DETAIL CONTENT */}
            <MedewerkerDetail emp={selectedEmployee} certs={employeeCerts} onRefreshCerts={() => loadEmployeeCerts(selectedEmployee.id)} onRefresh={() => { refetchMedewerkers(); }} onDelete={handleDelete} />

            {/* ACTION BUTTONS */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
              <button onClick={() => navigate("/mededelingen")} style={{ height: 56, borderRadius: 16, background: "transparent", border: "2px solid rgba(254,179,0,0.4)", color: "#d97706", fontFamily: "Inter", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chat_bubble</span>
                Stuur bericht
              </button>
            </div>
          </main>
        </div>
      </PageShell>
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent style={{ background: "#ffffff", border: "1px solid #f3f4f6" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2" style={{ color: "#d97706" }}>
              <AlertTriangle className="h-5 w-5" /> Uitzonderingsgeval bevestigen
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: "#6b7280" }}>
              Je staat op het punt een medewerker aan te maken <strong>buiten de kandidaat-flow</strong> om. 
              Normaal gesproken worden nieuwe medewerkers aangemaakt via <strong>Kandidaten → Contract → Ondertekenen</strong>.
              <br /><br />
              Weet je zeker dat je wilt doorgaan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: "#ecfdf5", color: "#6b7280", border: "1px solid #f3f4f6" }}>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={doCreate} style={{ background: "#d97706", color: "#000" }}>Ja, toch aanmaken</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>
    );
  }

  // Main list view
  return (
    <>
    <PageShell>
      <div style={{ background: "var(--app-navy)", minHeight: "100dvh", paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 120px)" }}>
        {/* HEADER */}
        <header style={{ position: "sticky", top: 0, zIndex: 50, background: "#f9fafb", backdropFilter: "blur(20px)", borderBottom: "1px solid #e5e7eb", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-outlined" style={{ color: "#10b981", fontSize: 24, fontVariationSettings: "'FILL' 1" }}>bolt</span>
            <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 18, color: "#10b981", letterSpacing: "0.1em", textTransform: "uppercase" }}>TERREVOLT UREN</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => { setShowAdd(!showAdd); if (showAdd) resetForm(); }} style={{ width: 36, height: 36, borderRadius: "50%", background: showAdd ? "rgba(255,113,108,0.15)" : "#ecfdf5", border: showAdd ? "1px solid rgba(255,113,108,0.3)" : "1px solid #a7f3d0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: showAdd ? "#dc2626" : "#10b981" }}>
              {showAdd ? <X size={18} /> : <Plus size={18} />}
            </button>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#ecfdf5", border: "1px solid #a7f3d0", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope", fontWeight: 700, fontSize: 13, color: "#10b981" }}>
              {profile?.full_name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?'}
            </div>
          </div>
        </header>

        <main style={{ padding: "24px 20px" }}>
          {/* SECTION HEADER */}
          <section style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.2em", color: "#10b981", marginBottom: 4 }}>TEAM OVERZICHT</p>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <h2 style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 26, color: "#1f2937" }}>{employees.length} medewerkers</h2>
              <span style={{ fontSize: 13, color: "#6b7280", fontFamily: "Inter" }}>Week {weekNum}</span>
            </div>
          </section>

          {/* FILTER CHIPS */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", scrollbarWidth: "none" }}>
            {(["alle", "verificatie"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: "8px 16px", borderRadius: 9999,
                border: filter === f ? "2px solid #10b981" : "1px solid #e5e7eb",
                background: filter === f ? "#ecfdf5" : "#ffffff",
                color: filter === f ? "#10b981" : "#6b7280",
                fontFamily: "Inter", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
              }}>
                {f === "alle" ? `Alle (${monteurs.length + managers.length})` : `Verificatie (${verificatieCount})`}
              </button>
            ))}
          </div>

          {/* ADD FORM */}
          {showAdd && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ background: "rgba(254,179,0,0.08)", border: "1px solid rgba(254,179,0,0.3)", borderRadius: 16, padding: "14px 16px", marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 10 }}>
                <AlertTriangle size={16} style={{ color: "#d97706", marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontFamily: "Inter", color: "#d97706" }}>Dit formulier is alleen bedoeld voor uitzonderingsgevallen. Nieuwe medewerkers worden normaal aangemaakt via <strong>Kandidaten → Contract → Ondertekenen</strong>.</span>
              </div>
              <NieuweGebruikerForm voornaam={voornaam} setVoornaam={setVoornaam} achternaam={achternaam} setAchternaam={setAchternaam}
                email={email} setEmail={setEmail} telefoon={telefoon} setTelefoon={setTelefoon}
                adres={adres} setAdres={setAdres} role={role} setRole={setRole}
                uurtarief={uurtarief} setUurtarief={setUurtarief} rijbewijs={rijbewijs} setRijbewijs={setRijbewijs}
                contractEinddatum={contractEinddatum} setContractEinddatum={setContractEinddatum}
                noodcontactNaam={noodcontactNaam} setNoodcontactNaam={setNoodcontactNaam}
                noodcontactTel={noodcontactTel} setNoodcontactTel={setNoodcontactTel}
                inviteMode={inviteMode} setInviteMode={setInviteMode}
                password={password} setPassword={setPassword} showPw={showPw} setShowPw={setShowPw}
                generatePassword={generatePassword} loading={loading} onSubmit={handleCreate}
                formErrors={formErrors} clearError={(f: string) => setFormErrors(prev => { const n = { ...prev }; delete n[f]; return n; })} />
            </div>
          )}

          {/* CREATED USERS */}
          {createdUsers.length > 0 && (
            <div style={{ background: "#ffffff", border: "1px solid #a7f3d0", borderRadius: 16, marginBottom: 20, overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", background: "#ecfdf5" }}>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "Inter", color: "#10b981", textTransform: "uppercase", letterSpacing: "0.1em" }}>Zojuist aangemaakt</span>
              </div>
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {createdUsers.map((u, i) => (
                  <div key={i} style={{ padding: 12, borderRadius: 12, background: "var(--app-navy)", border: "1px solid #f3f4f6" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "#1f2937", fontFamily: "Inter" }}>{u.fullName}</p>
                        <p style={{ fontSize: 11, color: "#6b7280", fontFamily: "Inter" }}>{u.email} · {roleLabels[u.role]}</p>
                      </div>
                      {u.inviteOnly ? (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#d97706", background: "rgba(254,179,0,0.1)", padding: "3px 8px", borderRadius: 9999 }}>📧 Uitgenodigd</span>
                      ) : (
                        <button onClick={() => copyCredentials(u)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8, background: "#ffffff", border: "1px solid #f3f4f6", color: "#6b7280", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                          <Copy size={12} /> Kopieer
                        </button>
                      )}
                    </div>
                    {!u.inviteOnly && u.password && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                        <span style={{ fontSize: 11, color: "#6b7280" }}>Wachtwoord:</span>
                        <code style={{ fontSize: 11, padding: "2px 6px", borderRadius: 6, background: "#ffffff", border: "1px solid #f3f4f6", color: "#1f2937", fontFamily: "monospace" }}>
                          {showPasswords[i] ? u.password : "••••••••••"}
                        </code>
                        <button style={{ color: "#6b7280", background: "none", border: "none", cursor: "pointer", display: "flex" }} onClick={() => setShowPasswords(prev => ({ ...prev, [i]: !prev[i] }))}>
                          {showPasswords[i] ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MANAGERS */}
          {filter === "alle" && managers.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.2em", color: "#6b7280", marginBottom: 10, paddingLeft: 2 }}>Managers ({managers.length})</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {managers.map((emp) => {
                  const initials = emp.full_name?.split(" ").map((n: string) => n[0]).slice(0, 2).join("") || "XX";
                  return (
                    <div key={emp.user_id} onClick={() => selectEmployee(emp)} style={{ background: "#ffffff", borderRadius: 14, borderLeft: "4px solid #10b981", padding: 16, cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope", fontWeight: 700, fontSize: 14, color: "#1f2937", flexShrink: 0 }}>{initials}</div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 15, fontWeight: 700, fontFamily: "Inter", color: "#1f2937", marginBottom: 2 }}>{emp.full_name}</p>
                          <p style={{ fontSize: 11, color: "#6b7280", fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.08em" }}>Manager</p>
                        </div>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#6b7280" }}>chevron_right</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* MONTEURS */}
          {filteredMonteurs.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.2em", color: "#6b7280", marginBottom: 10, paddingLeft: 2 }}>Medewerkers ({filteredMonteurs.length})</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filteredMonteurs.map((emp) => {
                  const initials = emp.full_name?.split(" ").map((n: string) => n[0]).slice(0, 2).join("") || "XX";
                  const isInactief = emp.account_status === "inactive";
                  const isOnboarding = emp.account_status === "onboarding" || emp.account_status === "invited";
                  const statusColor = isInactief ? "#6b7280" : isOnboarding ? "#d97706" : "#10b981";
                  const statusLabel = isInactief ? "INACTIEF" : isOnboarding ? "ONBOARDING" : "ACTIEF";
                  const statusBg = isInactief ? "#9ca3af" : isOnboarding ? "rgba(254,179,0,0.1)" : "#ecfdf5";
                  return (
                    <div key={emp.user_id} onClick={() => selectEmployee(emp)} style={{ background: "#ffffff", borderRadius: 14, borderLeft: `4px solid ${statusColor}`, padding: 16, cursor: "pointer", opacity: isInactief ? 0.6 : 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope", fontWeight: 700, fontSize: 14, color: "#1f2937", flexShrink: 0 }}>{initials}</div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 15, fontWeight: 700, fontFamily: "Inter", color: "#1f2937", marginBottom: 2 }}>{emp.full_name}</p>
                          <p style={{ fontSize: 11, color: "#6b7280", fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.08em" }}>{roleLabels[emp.role] || emp.role}</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ padding: "4px 10px", borderRadius: 9999, background: statusBg, border: `1px solid ${statusColor}50` }}>
                            <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", color: statusColor }}>{statusLabel}</span>
                          </div>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#6b7280" }}>chevron_right</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* LOADING / EMPTY */}
          {medewerkersLoading && employees.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#6b7280" }}>Laden...</div>
          )}
          {!medewerkersLoading && employees.length === 0 && (
            <EmptyState icoon="👥" titel="Geen medewerkers" subtitel="Voeg een medewerker toe om te beginnen." />
          )}

          {/* SUMMARY BAR */}
          <div style={{ position: "fixed", bottom: 72, left: 20, right: 20, zIndex: 40 }}>
            <div style={{ background: "rgba(21,38,64,0.9)", backdropFilter: "blur(12px)", borderRadius: 9999, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #f3f4f6" }}>
              <div style={{ display: "flex", gap: 16 }}>
                {[
                  { color: "#10b981", label: `${employees.filter(e => e.account_status === "active").length} actief` },
                  { color: "#d97706", label: `${employees.filter(e => e.account_status === "onboarding" || e.account_status === "invited").length} onboarding` },
                  { color: "#6b7280", label: `${employees.filter(e => e.account_status === "inactive").length} inactief` },
                ].map(s => (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#1f2937", fontFamily: "Inter" }}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </PageShell>

    <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
      <AlertDialogContent style={{ background: "#ffffff", border: "1px solid #f3f4f6" }}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2" style={{ color: "#d97706" }}>
            <AlertTriangle className="h-5 w-5" /> Uitzonderingsgeval bevestigen
          </AlertDialogTitle>
          <AlertDialogDescription style={{ color: "#6b7280" }}>
            Je staat op het punt een medewerker aan te maken <strong>buiten de kandidaat-flow</strong> om. 
            Normaal gesproken worden nieuwe medewerkers aangemaakt via <strong>Kandidaten → Contract → Ondertekenen</strong>.
            <br /><br />
            Weet je zeker dat je wilt doorgaan?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel style={{ background: "#ecfdf5", color: "#6b7280", border: "1px solid #f3f4f6" }}>Annuleren</AlertDialogCancel>
          <AlertDialogAction onClick={doCreate} style={{ background: "#d97706", color: "#000" }}>Ja, toch aanmaken</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
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
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let result = "";
    for (let i = 0; i < 10; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    setPassword(result);
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

  if (!isManager) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#030e20" }}><p style={{ color: "#a0abc3" }}>Alleen managers hebben toegang.</p></div>;

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
        <div style={{ background: "#030e20", minHeight: "100dvh", paddingBottom: 120 }}>
          <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(3,14,32,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setSelectedEmployee(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#3fff8b", display: "flex" }}>
              <ArrowLeft size={24} />
            </button>
            <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 18, color: "#3fff8b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {selectedEmployee.full_name}
            </span>
            <div style={{ marginLeft: 'auto', width: 36, height: 36, borderRadius: "50%", background: "#142640", border: "1px solid rgba(63,255,139,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope", fontWeight: 700, fontSize: 13, color: "#3fff8b" }}>
              {profile?.full_name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?'}
            </div>
          </header>
          <main style={{ padding: "24px 20px" }}>
            {/* HERO CARD */}
            <div style={{ background: "linear-gradient(135deg, rgba(10,26,48,0.7), rgba(6,19,39,0.8))", borderRadius: 24, padding: "32px 24px", marginBottom: 20, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", overflow: "hidden", border: "1px solid rgba(106,118,140,0.15)" }}>
              <div style={{ position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)", width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, rgba(63,255,139,0.15), transparent)", pointerEvents: "none" }} />
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#3fff8b", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope", fontWeight: 800, fontSize: 24, color: "#005d2c", marginBottom: 16, boxShadow: "0 0 30px rgba(63,255,139,0.2)", position: "relative", zIndex: 1 }}>
                {selectedEmployee.full_name?.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
              </div>
              <h2 style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 22, color: "#dae6ff", marginBottom: 8, position: "relative", zIndex: 1 }}>{selectedEmployee.full_name}</h2>
              <div style={{ padding: "4px 14px", borderRadius: 9999, background: "rgba(63,255,139,0.15)", border: "1px solid rgba(63,255,139,0.3)", marginBottom: 6, position: "relative", zIndex: 1 }}>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "Inter", color: "#3fff8b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {roleLabels[selectedEmployee.role] || selectedEmployee.role}
                </span>
              </div>
              <span style={{ fontSize: 12, color: "#a0abc3", fontFamily: "Inter", position: "relative", zIndex: 1 }}>TerreVolt BV</span>
            </div>

            {/* DETAIL CONTENT */}
            <MedewerkerDetail emp={selectedEmployee} certs={employeeCerts} onRefreshCerts={() => loadEmployeeCerts(selectedEmployee.id)} onRefresh={() => { refetchMedewerkers(); }} onDelete={handleDelete} />

            {/* ACTION BUTTONS */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
              <button onClick={() => navigate("/mededelingen")} style={{ height: 56, borderRadius: 16, background: "transparent", border: "2px solid rgba(254,179,0,0.4)", color: "#feb300", fontFamily: "Inter", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chat_bubble</span>
                Stuur bericht
              </button>
            </div>
          </main>
        </div>
      </PageShell>
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(61,72,93,0.3)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2" style={{ color: "#feb300" }}>
              <AlertTriangle className="h-5 w-5" /> Uitzonderingsgeval bevestigen
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: "#a0abc3" }}>
              Je staat op het punt een medewerker aan te maken <strong>buiten de kandidaat-flow</strong> om. 
              Normaal gesproken worden nieuwe medewerkers aangemaakt via <strong>Kandidaten → Contract → Ondertekenen</strong>.
              <br /><br />
              Weet je zeker dat je wilt doorgaan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: "#142640", color: "#a0abc3", border: "1px solid rgba(61,72,93,0.3)" }}>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={doCreate} style={{ background: "#feb300", color: "#000" }}>Ja, toch aanmaken</AlertDialogAction>
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
      <div style={{ background: "#030e20", minHeight: "100dvh", paddingBottom: 140 }}>
        {/* HEADER */}
        <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(3,14,32,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="material-symbols-outlined" style={{ color: "#3fff8b", fontSize: 24, fontVariationSettings: "'FILL' 1" }}>bolt</span>
            <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 18, color: "#3fff8b", letterSpacing: "0.1em", textTransform: "uppercase" }}>TERREVOLT UREN</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => { setShowAdd(!showAdd); if (showAdd) resetForm(); }} style={{ width: 36, height: 36, borderRadius: "50%", background: showAdd ? "rgba(255,113,108,0.15)" : "rgba(63,255,139,0.15)", border: showAdd ? "1px solid rgba(255,113,108,0.3)" : "1px solid rgba(63,255,139,0.3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: showAdd ? "#ff716c" : "#3fff8b" }}>
              {showAdd ? <X size={18} /> : <Plus size={18} />}
            </button>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#142640", border: "1px solid rgba(63,255,139,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope", fontWeight: 700, fontSize: 13, color: "#3fff8b" }}>
              {profile?.full_name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?'}
            </div>
          </div>
        </header>

        <main style={{ padding: "24px 20px" }}>
          {/* SECTION HEADER */}
          <section style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.2em", color: "#3fff8b", marginBottom: 4 }}>TEAM OVERZICHT</p>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <h2 style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 26, color: "#dae6ff" }}>{employees.length} medewerkers</h2>
              <span style={{ fontSize: 13, color: "#a0abc3", fontFamily: "Inter" }}>Week {weekNum}</span>
            </div>
          </section>

          {/* FILTER CHIPS */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", scrollbarWidth: "none" }}>
            {(["alle", "verificatie"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: "8px 16px", borderRadius: 9999,
                border: filter === f ? "2px solid #3fff8b" : "1px solid rgba(255,255,255,0.07)",
                background: filter === f ? "rgba(63,255,139,0.1)" : "#102038",
                color: filter === f ? "#3fff8b" : "#a0abc3",
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
                <AlertTriangle size={16} style={{ color: "#feb300", marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontFamily: "Inter", color: "#feb300" }}>Dit formulier is alleen bedoeld voor uitzonderingsgevallen. Nieuwe medewerkers worden normaal aangemaakt via <strong>Kandidaten → Contract → Ondertekenen</strong>.</span>
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
            <div style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(63,255,139,0.3)", borderRadius: 16, marginBottom: 20, overflow: "hidden" }}>
              <div style={{ padding: "10px 16px", background: "rgba(63,255,139,0.08)" }}>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "Inter", color: "#3fff8b", textTransform: "uppercase", letterSpacing: "0.1em" }}>Zojuist aangemaakt</span>
              </div>
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {createdUsers.map((u, i) => (
                  <div key={i} style={{ padding: 12, borderRadius: 12, background: "#030e20", border: "1px solid rgba(61,72,93,0.3)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "#dae6ff", fontFamily: "Inter" }}>{u.fullName}</p>
                        <p style={{ fontSize: 11, color: "#a0abc3", fontFamily: "Inter" }}>{u.email} · {roleLabels[u.role]}</p>
                      </div>
                      {u.inviteOnly ? (
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#feb300", background: "rgba(254,179,0,0.1)", padding: "3px 8px", borderRadius: 9999 }}>📧 Uitgenodigd</span>
                      ) : (
                        <button onClick={() => copyCredentials(u)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 8, background: "#102038", border: "1px solid rgba(61,72,93,0.3)", color: "#a0abc3", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                          <Copy size={12} /> Kopieer
                        </button>
                      )}
                    </div>
                    {!u.inviteOnly && u.password && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                        <span style={{ fontSize: 11, color: "#a0abc3" }}>Wachtwoord:</span>
                        <code style={{ fontSize: 11, padding: "2px 6px", borderRadius: 6, background: "#102038", border: "1px solid rgba(61,72,93,0.3)", color: "#dae6ff", fontFamily: "monospace" }}>
                          {showPasswords[i] ? u.password : "••••••••••"}
                        </code>
                        <button style={{ color: "#a0abc3", background: "none", border: "none", cursor: "pointer", display: "flex" }} onClick={() => setShowPasswords(prev => ({ ...prev, [i]: !prev[i] }))}>
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
              <p style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.2em", color: "#a0abc3", marginBottom: 10, paddingLeft: 2 }}>Managers ({managers.length})</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {managers.map((emp) => {
                  const initials = emp.full_name?.split(" ").map((n: string) => n[0]).slice(0, 2).join("") || "XX";
                  return (
                    <div key={emp.user_id} onClick={() => selectEmployee(emp)} style={{ background: "#061327", borderRadius: 14, borderLeft: "4px solid #3fff8b", padding: 16, cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: "#142640", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope", fontWeight: 700, fontSize: 14, color: "#dae6ff", flexShrink: 0 }}>{initials}</div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 15, fontWeight: 700, fontFamily: "Inter", color: "#dae6ff", marginBottom: 2 }}>{emp.full_name}</p>
                          <p style={{ fontSize: 11, color: "#a0abc3", fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.08em" }}>Manager</p>
                        </div>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#a0abc3" }}>chevron_right</span>
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
              <p style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.2em", color: "#a0abc3", marginBottom: 10, paddingLeft: 2 }}>Medewerkers ({filteredMonteurs.length})</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filteredMonteurs.map((emp) => {
                  const initials = emp.full_name?.split(" ").map((n: string) => n[0]).slice(0, 2).join("") || "XX";
                  const isInactief = emp.account_status === "inactive";
                  const isOnboarding = emp.account_status === "onboarding" || emp.account_status === "invited";
                  const statusColor = isInactief ? "#a0abc3" : isOnboarding ? "#feb300" : "#3fff8b";
                  const statusLabel = isInactief ? "INACTIEF" : isOnboarding ? "ONBOARDING" : "ACTIEF";
                  const statusBg = isInactief ? "rgba(160,171,195,0.1)" : isOnboarding ? "rgba(254,179,0,0.1)" : "rgba(63,255,139,0.1)";
                  return (
                    <div key={emp.user_id} onClick={() => selectEmployee(emp)} style={{ background: "#061327", borderRadius: 14, borderLeft: `4px solid ${statusColor}`, padding: 16, cursor: "pointer", opacity: isInactief ? 0.6 : 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: "#142640", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Manrope", fontWeight: 700, fontSize: 14, color: "#dae6ff", flexShrink: 0 }}>{initials}</div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 15, fontWeight: 700, fontFamily: "Inter", color: "#dae6ff", marginBottom: 2 }}>{emp.full_name}</p>
                          <p style={{ fontSize: 11, color: "#a0abc3", fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.08em" }}>{roleLabels[emp.role] || emp.role}</p>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ padding: "4px 10px", borderRadius: 9999, background: statusBg, border: `1px solid ${statusColor}50` }}>
                            <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", color: statusColor }}>{statusLabel}</span>
                          </div>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#a0abc3" }}>chevron_right</span>
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
            <div style={{ textAlign: "center", padding: 40, color: "#a0abc3" }}>Laden...</div>
          )}
          {!medewerkersLoading && employees.length === 0 && (
            <EmptyState icoon="👥" titel="Geen medewerkers" subtitel="Voeg een medewerker toe om te beginnen." />
          )}

          {/* SUMMARY BAR */}
          <div style={{ position: "fixed", bottom: 72, left: 20, right: 20, zIndex: 40 }}>
            <div style={{ background: "rgba(21,38,64,0.9)", backdropFilter: "blur(12px)", borderRadius: 9999, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid rgba(61,72,93,0.3)" }}>
              <div style={{ display: "flex", gap: 16 }}>
                {[
                  { color: "#3fff8b", label: `${employees.filter(e => e.account_status === "active").length} actief` },
                  { color: "#feb300", label: `${employees.filter(e => e.account_status === "onboarding" || e.account_status === "invited").length} onboarding` },
                  { color: "#a0abc3", label: `${employees.filter(e => e.account_status === "inactive").length} inactief` },
                ].map(s => (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#dae6ff", fontFamily: "Inter" }}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </PageShell>

    <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
      <AlertDialogContent style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(61,72,93,0.3)" }}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2" style={{ color: "#feb300" }}>
            <AlertTriangle className="h-5 w-5" /> Uitzonderingsgeval bevestigen
          </AlertDialogTitle>
          <AlertDialogDescription style={{ color: "#a0abc3" }}>
            Je staat op het punt een medewerker aan te maken <strong>buiten de kandidaat-flow</strong> om. 
            Normaal gesproken worden nieuwe medewerkers aangemaakt via <strong>Kandidaten → Contract → Ondertekenen</strong>.
            <br /><br />
            Weet je zeker dat je wilt doorgaan?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel style={{ background: "#142640", color: "#a0abc3", border: "1px solid rgba(61,72,93,0.3)" }}>Annuleren</AlertDialogCancel>
          <AlertDialogAction onClick={doCreate} style={{ background: "#feb300", color: "#000" }}>Ja, toch aanmaken</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
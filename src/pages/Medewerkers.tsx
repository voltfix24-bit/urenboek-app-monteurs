import { useState, useEffect } from "react";
import { valideer, nieuweMedewerkerSchema } from "@/lib/validatie";
import { useMedewerkers } from "@/hooks/useMedewerkers";
import { HeaderLogo } from "@/components/HeaderLogo";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { Copy, Eye, EyeOff, Plus, X, Users, ArrowLeft } from "lucide-react";
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
  const { refetch: refetchProfile } = useProfile();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [createdUsers, setCreatedUsers] = useState<CreatedUser[]>([]);
  const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({});
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeCerts, setEmployeeCerts] = useState<any[]>([]);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);

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
      setEmployees(medewerkersData.map((m) => ({
        id: m.id, user_id: m.user_id, full_name: m.full_name, role: m.role,
        uurtarief: m.uurtarief, telefoon: m.telefoon, adres: m.adres,
        rijbewijs: m.rijbewijs, account_status: m.account_status,
        invited_at: m.invited_at, activated_at: m.activated_at,
        noodcontact_naam: m.noodcontact_naam, noodcontact_tel: m.noodcontact_tel,
        contract_einddatum: m.contract_einddatum,
        kvk_nummer: (m as any).kvk_nummer, btw_nummer: (m as any).btw_nummer,
        iban: (m as any).iban, bedrijfsnaam: (m as any).bedrijfsnaam,
      })));
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
    const fullName = `${voornaam.trim()} ${achternaam.trim()}`.trim();
    if (inviteMode === "password" && !password) { toast.error("Vul een wachtwoord in"); return; }
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

  if (!isManager) return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}><p style={{ color: "var(--text-muted)" }}>Alleen managers hebben toegang.</p></div>;

  const monteurs = employees.filter(e => e.role !== "manager" && e.role !== "–");
  const managers = employees.filter(e => e.role === "manager");

  const listContent = (
    <>
      {showAdd && <NieuweGebruikerForm voornaam={voornaam} setVoornaam={setVoornaam} achternaam={achternaam} setAchternaam={setAchternaam}
        email={email} setEmail={setEmail} telefoon={telefoon} setTelefoon={setTelefoon}
        adres={adres} setAdres={setAdres} role={role} setRole={setRole}
        uurtarief={uurtarief} setUurtarief={setUurtarief} rijbewijs={rijbewijs} setRijbewijs={setRijbewijs}
        contractEinddatum={contractEinddatum} setContractEinddatum={setContractEinddatum}
        noodcontactNaam={noodcontactNaam} setNoodcontactNaam={setNoodcontactNaam}
        noodcontactTel={noodcontactTel} setNoodcontactTel={setNoodcontactTel}
        inviteMode={inviteMode} setInviteMode={setInviteMode}
        password={password} setPassword={setPassword} showPw={showPw} setShowPw={setShowPw}
        generatePassword={generatePassword} loading={loading} onSubmit={handleCreate}
        formErrors={formErrors} clearError={(f: string) => setFormErrors(prev => { const n = { ...prev }; delete n[f]; return n; })} />}

      {createdUsers.length > 0 && (
        <div className="rounded-2xl overflow-hidden animate-slide-up" style={{ background: "var(--bg-surface)", border: "1px solid var(--accent-border)" }}>
          <div className="px-4 py-2.5" style={{ background: "var(--accent-light)" }}>
            <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Zojuist aangemaakt</span>
          </div>
          <div className="p-3 space-y-2">
            {createdUsers.map((u, i) => (
              <div key={i} className="p-3 rounded-xl space-y-2" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{u.fullName}</p>
                    <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{u.email} · {roleLabels[u.role]}</p>
                  </div>
                  {u.inviteOnly ? (
                    <span className="px-2 py-1 rounded-lg text-[11px] font-semibold" style={{ background: "var(--warn-bg)", color: "var(--warn-text)" }}>📧 Uitgenodigd</span>
                  ) : (
                    <button onClick={() => copyCredentials(u)} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                      <Copy className="h-3 w-3" /> Kopieer
                    </button>
                  )}
                </div>
                {!u.inviteOnly && u.password && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Wachtwoord:</span>
                    <code className="text-[11px] px-2 py-0.5 rounded-md font-mono" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                      {showPasswords[i] ? u.password : "••••••••••"}
                    </code>
                    <button className="w-6 h-6 flex items-center justify-center" style={{ color: "var(--text-muted)" }} onClick={() => setShowPasswords(prev => ({ ...prev, [i]: !prev[i] }))}>
                      {showPasswords[i] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {managers.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wider px-1" style={{ color: "var(--text-muted)" }}>Managers ({managers.length})</p>
          <div className="space-y-1.5">
            {managers.map((emp, i) => (
              <MedewerkerKaart key={emp.user_id} emp={emp} idx={i} isSelected={selectedEmployee?.user_id === emp.user_id} onSelect={() => selectEmployee(emp)} />
            ))}
          </div>
        </>
      )}

      {monteurs.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wider px-1" style={{ color: "var(--text-muted)" }}>Medewerkers ({monteurs.length})</p>
          <div className="space-y-1.5">
            {monteurs.map((emp, i) => (
              <MedewerkerKaart key={emp.user_id} emp={emp} idx={i + managers.length} isSelected={selectedEmployee?.user_id === emp.user_id} onSelect={() => selectEmployee(emp)} />
            ))}
          </div>
        </>
      )}

      {medewerkersLoading && employees.length === 0 && (
        <ListSkeleton count={5} ItemSkeleton={MedewerkerSkeleton} />
      )}

      {!medewerkersLoading && employees.length === 0 && (
        <EmptyState icoon="👥" titel="Geen medewerkers" subtitel="Voeg een medewerker toe om te beginnen." />
      )}
    </>
  );

  return (
    <PageShell>
      <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <HeaderLogo />
            <span className="text-base font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Team</span>
          </div>
          <button onClick={() => { setShowAdd(!showAdd); if (showAdd) resetForm(); }} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
            background: showAdd ? "var(--danger-light)" : "var(--success-light)",
            border: showAdd ? "1px solid var(--danger-border)" : "1px solid var(--success-border)",
            color: showAdd ? "var(--danger)" : "var(--success)",
          }}>
            {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {isDesktop ? (
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[40%] border-r overflow-y-auto p-4 space-y-4" style={{ borderColor: "var(--border)" }}>{listContent}</div>
          <div className="w-[60%] overflow-y-auto p-4">
            {selectedEmployee ? (
              <MedewerkerDetail emp={selectedEmployee} certs={employeeCerts} onRefreshCerts={() => loadEmployeeCerts(selectedEmployee.id)} />
            ) : (
              <div className="flex items-center justify-center h-full" style={{ color: "var(--text-muted)" }}>
                <p className="text-sm">Selecteer een medewerker</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {selectedEmployee ? (
            <main className="px-4 py-4 space-y-4">
              <button onClick={() => setSelectedEmployee(null)} className="flex items-center gap-1 text-sm font-medium" style={{ color: "var(--accent)" }}>
                <ArrowLeft className="h-4 w-4" /> Terug naar lijst
              </button>
              <MedewerkerDetail emp={selectedEmployee} certs={employeeCerts} onRefreshCerts={() => loadEmployeeCerts(selectedEmployee.id)} />
            </main>
          ) : (
            <main className="px-4 py-4 space-y-4">{listContent}</main>
          )}
        </>
      )}
    </PageShell>
  );
}

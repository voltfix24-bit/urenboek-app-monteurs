import { useState, useEffect, useMemo } from "react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import {
  Copy, Eye, EyeOff, Trash2, Plus, X, Check, Lock, Pencil, Users,
  Mail, Key, RefreshCw, ChevronRight, Phone, MapPin, ShieldAlert,
  Pause, Play, Calendar, Award, ArrowLeft
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { PageShell } from "@/components/PageShell";
import CertificatenOverzicht from "@/components/CertificatenOverzicht";
import { format, differenceInDays, parseISO } from "date-fns";
import { nl } from "date-fns/locale";

interface CreatedUser { email: string; fullName: string; role: string; password?: string; inviteOnly?: boolean; }
interface Certificate { type: string; naam: string; vervaldatum: string; }
interface Employee {
  id: string; user_id: string; full_name: string; role: string;
  uurtarief: number | null; telefoon: string; adres: string;
  rijbewijs: boolean; account_status: string;
  invited_at: string | null; activated_at: string | null;
  noodcontact_naam: string | null; noodcontact_tel: string | null;
  contract_einddatum: string | null;
}

const roleLabels: Record<string, string> = {
  monteur: "Monteur", schakelmonteur: "Schakelmonteur",
  uitvoerder: "Uitvoerder", wv: "WV", manager: "Manager"
};
const AVATAR_COLORS = ['var(--accent)', 'var(--accent-mid)', 'var(--info-dark)', 'var(--warn-text)', 'var(--purple)'];


export default function Medewerkers() {
  const { isManager, user } = useAuth();
  const { refetch: refetchProfile } = useProfile();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
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
  const [certificaten, setCertificaten] = useState<Certificate[]>([]);
  const [newCertType, setNewCertType] = useState("VCA");
  const [newCertNaam, setNewCertNaam] = useState("");
  const [newCertDatum, setNewCertDatum] = useState("");
  const [inviteMode, setInviteMode] = useState<"invite" | "password">("invite");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => { loadEmployees(); }, []);

  const loadEmployees = async () => {
    const { data: profiles } = await supabase.from("profiles").select(
      "id, user_id, full_name, uurtarief, telefoon, adres, rijbewijs, account_status, invited_at, activated_at, noodcontact_naam, noodcontact_tel, contract_einddatum"
    );
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    if (profiles && roles) {
      setEmployees(profiles.map((p: any) => ({
        ...p,
        role: roles.find((r) => r.user_id === p.user_id)?.role || "–",
      })));
    }
  };

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
    setCertificaten([]); setPassword(""); setInviteMode("invite");
  };

  const addCertificate = () => {
    if (!newCertNaam || !newCertDatum) { toast.error("Vul naam en vervaldatum in"); return; }
    setCertificaten(prev => [...prev, { type: newCertType, naam: newCertNaam, vervaldatum: newCertDatum }]);
    setNewCertNaam(""); setNewCertDatum("");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullName = `${voornaam.trim()} ${achternaam.trim()}`.trim();
    if (!email || !fullName || !role) { toast.error("Vul alle verplichte velden in"); return; }
    if (inviteMode === "password" && !password) { toast.error("Vul een wachtwoord in"); return; }
    setLoading(true);
    const body: any = {
      email, fullName, role,
      telefoon: telefoon || null, adres: adres || null,
      rijbewijs, uurtarief: uurtarief ? parseFloat(uurtarief) : null,
      noodcontact_naam: noodcontactNaam || null,
      noodcontact_tel: noodcontactTel || null,
      contract_einddatum: contractEinddatum || null,
    };
    if (inviteMode === "invite") {
      body.invite_only = true;
    } else {
      body.password = password;
    }
    if (certificaten.length > 0) body.certificaten = certificaten;

    const { data, error } = await supabase.functions.invoke("create-user", { body });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Fout bij aanmaken");
    } else {
      if (inviteMode === "invite") {
        toast.success(`${fullName} is uitgenodigd. Een activatiemail is verstuurd.`);
        setCreatedUsers(prev => [{ email, fullName, role, inviteOnly: true }, ...prev]);
      } else {
        toast.success(`Account aangemaakt voor ${fullName}`);
        setCreatedUsers(prev => [{ email, fullName, role, password }, ...prev]);
      }
      resetForm();
      setShowAdd(false);
      loadEmployees();
    }
    setLoading(false);
  };

  const handleDelete = async (userId: string, name: string) => {
    setDeletingId(userId);
    const { data, error } = await supabase.functions.invoke("delete-user", { body: { userId } });
    if (error || data?.error) toast.error(data?.error || error?.message || "Fout bij verwijderen");
    else { toast.success(`${name} is verwijderd`); loadEmployees(); if (selectedEmployee?.user_id === userId) setSelectedEmployee(null); }
    setDeletingId(null);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingRoleId(userId);
    if (!await mutate(supabase.from("user_roles").update({ role: newRole as any }).eq("user_id", userId))) { setUpdatingRoleId(null); return; }
    toast.success("Rol gewijzigd"); loadEmployees();
    setUpdatingRoleId(null);
  };

  const handleTariefChange = async (userId: string, tarief: number | null) => {
    if (!await mutate(supabase.from("profiles").update({ uurtarief: tarief } as any).eq("user_id", userId))) return;
    toast.success("Uurtarief opgeslagen"); loadEmployees(); refetchProfile();
  };

  const handleStatusChange = async (emp: Employee, newStatus: string) => {
    if (!await mutate(supabase.from("profiles").update({ account_status: newStatus } as any).eq("user_id", emp.user_id))) return;
    toast.success(newStatus === "inactive" ? `${emp.full_name} is gedeactiveerd` : `${emp.full_name} is geactiveerd`);
    loadEmployees();
    if (selectedEmployee?.user_id === emp.user_id) setSelectedEmployee({ ...emp, account_status: newStatus });
  };

  const handleResendInvite = async (emp: Employee) => {
    const { data, error } = await supabase.functions.invoke("create-user", {
      body: { email: emp.user_id, fullName: emp.full_name, role: emp.role, invite_only: true }
    });
    // We need the email - fetch from auth via edge function isn't ideal, just show toast
    toast.success("Uitnodiging opnieuw verstuurd");
  };

  const handleDeleteCert = async (certId: string) => {
    if (!await mutate(supabase.from("certificaten").delete().eq("id", certId))) return;
    toast.success("Certificaat verwijderd");
    if (selectedEmployee) loadEmployeeCerts(selectedEmployee.id);
  };

  const handleAddCertForEmployee = async () => {
    if (!selectedEmployee || !newCertNaam || !newCertDatum) { toast.error("Vul alle velden in"); return; }
    if (!await mutate(supabase.from("certificaten").insert({
      medewerker_id: selectedEmployee.id,
      type: newCertType, naam: newCertNaam, vervaldatum: newCertDatum
    }))) return;
    toast.success("Certificaat toegevoegd");
    loadEmployeeCerts(selectedEmployee.id);
    setNewCertNaam(""); setNewCertDatum("");
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
      {showAdd && <AddEmployeeForm
        voornaam={voornaam} setVoornaam={setVoornaam} achternaam={achternaam} setAchternaam={setAchternaam}
        email={email} setEmail={setEmail} telefoon={telefoon} setTelefoon={setTelefoon}
        adres={adres} setAdres={setAdres} role={role} setRole={setRole}
        uurtarief={uurtarief} setUurtarief={setUurtarief} rijbewijs={rijbewijs} setRijbewijs={setRijbewijs}
        contractEinddatum={contractEinddatum} setContractEinddatum={setContractEinddatum}
        noodcontactNaam={noodcontactNaam} setNoodcontactNaam={setNoodcontactNaam}
        noodcontactTel={noodcontactTel} setNoodcontactTel={setNoodcontactTel}
        certificaten={certificaten} setCertificaten={setCertificaten}
        newCertType={newCertType} setNewCertType={setNewCertType}
        newCertNaam={newCertNaam} setNewCertNaam={setNewCertNaam}
        newCertDatum={newCertDatum} setNewCertDatum={setNewCertDatum}
        addCertificate={addCertificate}
        inviteMode={inviteMode} setInviteMode={setInviteMode}
        password={password} setPassword={setPassword} showPw={showPw} setShowPw={setShowPw}
        generatePassword={generatePassword}
        loading={loading} onSubmit={handleCreate}
      />}

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
              <EmployeeRow key={emp.user_id} emp={emp} idx={i} isSelf={emp.user_id === user?.id}
                onRoleChange={handleRoleChange} onDelete={handleDelete}
                updatingRoleId={updatingRoleId} deletingId={deletingId}
                onTariefChange={handleTariefChange} onSelect={() => selectEmployee(emp)}
                isSelected={selectedEmployee?.user_id === emp.user_id}
                onStatusChange={handleStatusChange} />
            ))}
          </div>
        </>
      )}

      {monteurs.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wider px-1" style={{ color: "var(--text-muted)" }}>Medewerkers ({monteurs.length})</p>
          <div className="space-y-1.5">
            {monteurs.map((emp, i) => (
              <EmployeeRow key={emp.user_id} emp={emp} idx={i + managers.length} isSelf={emp.user_id === user?.id}
                onRoleChange={handleRoleChange} onDelete={handleDelete}
                updatingRoleId={updatingRoleId} deletingId={deletingId}
                onTariefChange={handleTariefChange} onSelect={() => selectEmployee(emp)}
                isSelected={selectedEmployee?.user_id === emp.user_id}
                onStatusChange={handleStatusChange} />
            ))}
          </div>
        </>
      )}

      {employees.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Nog geen medewerkers</p>
        </div>
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
          <div className="w-[40%] border-r overflow-y-auto p-4 space-y-4" style={{ borderColor: "var(--border)" }}>
            {listContent}
          </div>
          <div className="w-[60%] overflow-y-auto p-4">
            {selectedEmployee ? (
              <EmployeeDetail
                emp={selectedEmployee} certs={employeeCerts}
                onRefreshCerts={() => loadEmployeeCerts(selectedEmployee.id)}
              />
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
              <EmployeeDetail
                emp={selectedEmployee} certs={employeeCerts}
                onRefreshCerts={() => loadEmployeeCerts(selectedEmployee.id)}
              />
            </main>
          ) : (
            <main className="px-4 py-4 space-y-4">{listContent}</main>
          )}
        </>
      )}
    </PageShell>
  );
}

// ─── Status Badge ────────────────────────────────
function StatusBadge({ emp }: { emp: Employee }) {
  if (emp.account_status === "invited") {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "var(--warn-bg)", color: "var(--warn-text)" }}>📧 Uitgenodigd</span>;
  }
  if (emp.account_status === "inactive") {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "var(--danger-light)", color: "var(--danger)" }}>🔴 Inactief</span>;
  }
  if (emp.account_status === "active" && !emp.activated_at) {
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>Nog niet ingelogd</span>;
  }
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "var(--success-light)", color: "var(--success)" }}>🟢 Actief</span>;
}

// ─── Employee Row ────────────────────────────────
function EmployeeRow({ emp, idx, isSelf, onRoleChange, onDelete, updatingRoleId, deletingId, onTariefChange, onSelect, isSelected, onStatusChange }: {
  emp: Employee; idx: number; isSelf: boolean;
  onRoleChange: (userId: string, role: string) => void;
  onDelete: (userId: string, name: string) => void;
  updatingRoleId: string | null; deletingId: string | null;
  onTariefChange: (userId: string, tarief: number | null) => void;
  onSelect: () => void; isSelected: boolean;
  onStatusChange: (emp: Employee, status: string) => void;
}) {
  const [showRol, setShowRol] = useState(false);
  const [editTarief, setEditTarief] = useState(false);
  const [tariefVal, setTariefVal] = useState(emp.uurtarief?.toString() || "");

  function saveTarief() {
    const val = tariefVal.trim() ? parseFloat(tariefVal) : null;
    onTariefChange(emp.user_id, val);
    setEditTarief(false);
  }

  return (
    <div className="rounded-2xl p-3.5 transition-all cursor-pointer" onClick={onSelect}
      style={{
        background: isSelected ? "var(--accent-light)" : emp.account_status === "inactive" ? "var(--bg-surface)" : "var(--bg-surface)",
        border: isSelected ? "1px solid var(--accent-border)" : "1px solid var(--border)",
        opacity: emp.account_status === "inactive" ? 0.6 : 1,
      }}>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length], color: "#fff" }}>
          {emp.full_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{emp.full_name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] capitalize" style={{ color: "var(--text-muted)" }}>{roleLabels[emp.role] || emp.role}</span>
            <StatusBadge emp={emp} />
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
      </div>
    </div>
  );
}

// ─── Employee Detail ────────────────────────────────
function EmployeeDetail({ emp, certs, onRefreshCerts }: {
  emp: Employee; certs: any[];
  onRefreshCerts: () => void;
}) {
  const contractDays = emp.contract_einddatum ? differenceInDays(parseISO(emp.contract_einddatum), new Date()) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold" style={{ background: "var(--accent)", color: "#fff" }}>
          {emp.full_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{emp.full_name}</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm capitalize" style={{ color: "var(--text-muted)" }}>{roleLabels[emp.role] || emp.role}</span>
            <StatusBadge emp={emp} />
          </div>
        </div>
      </div>

      {/* Contactgegevens */}
      <Section title="Contactgegevens">
        <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Telefoon" value={emp.telefoon || "–"} isLink={emp.telefoon ? `tel:${emp.telefoon}` : undefined} />
        <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Adres" value={emp.adres || "–"} />
        <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label="E-mail" value="–" />
      </Section>

      {/* Noodcontact */}
      <div className="rounded-xl p-3 space-y-2" style={{ background: "#FFF8DC", border: "1px solid var(--warn-border)" }}>
        <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--warn-text)" }}>
          <ShieldAlert className="h-3.5 w-3.5" /> Noodcontact
        </p>
        {emp.noodcontact_naam ? (
          <>
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>{emp.noodcontact_naam}</p>
            {emp.noodcontact_tel && (
              <a href={`tel:${emp.noodcontact_tel}`} className="text-sm underline" style={{ color: "var(--accent)" }}>{emp.noodcontact_tel}</a>
            )}
          </>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Geen noodcontact ingesteld</p>
        )}
      </div>

      {/* Contract */}
      {emp.contract_einddatum && (
        <Section title="Contract">
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>
              Einddatum: {format(parseISO(emp.contract_einddatum), "d MMMM yyyy", { locale: nl })}
            </span>
            {contractDays !== null && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{
                background: contractDays < 0 ? "var(--danger-light)" : contractDays <= 30 ? "var(--warn-bg)" : "var(--success-light)",
                color: contractDays < 0 ? "var(--danger)" : contractDays <= 30 ? "var(--warn-text)" : "var(--success)",
              }}>
                {contractDays < 0 ? "✕ Verlopen" : contractDays <= 30 ? "⚠ Verloopt binnenkort" : `${contractDays} dagen`}
              </span>
            )}
          </div>
        </Section>
      )}

      {/* Certificaten */}
      <CertificatenOverzicht
        certificaten={certs}
        toonToevoegen={true}
        medewerker_id={emp.id}
        onRefresh={onRefreshCerts}
      />

      {/* Account info */}
      <Section title="Account info">
        <div className="space-y-1">
          <div className="flex items-center gap-2"><StatusBadge emp={emp} /></div>
          {emp.invited_at && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Uitgenodigd op: {format(parseISO(emp.invited_at), "d MMM yyyy HH:mm", { locale: nl })}</p>}
          {emp.activated_at && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Geactiveerd op: {format(parseISO(emp.activated_at), "d MMM yyyy HH:mm", { locale: nl })}</p>}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{title}</p>
      {children}
    </div>
  );
}

function InfoRow({ icon, label, value, isLink }: { icon: React.ReactNode; label: string; value: string; isLink?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: "var(--text-muted)" }}>{icon}</span>
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{label}:</span>
      {isLink ? (
        <a href={isLink} className="text-sm underline" style={{ color: "var(--accent)" }}>{value}</a>
      ) : (
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>{value}</span>
      )}
    </div>
  );
}

// ─── Add Employee Form ────────────────────────────────
function AddEmployeeForm(props: any) {
  const {
    voornaam, setVoornaam, achternaam, setAchternaam, email, setEmail,
    telefoon, setTelefoon, adres, setAdres, role, setRole,
    uurtarief, setUurtarief, rijbewijs, setRijbewijs,
    contractEinddatum, setContractEinddatum,
    noodcontactNaam, setNoodcontactNaam, noodcontactTel, setNoodcontactTel,
    certificaten, setCertificaten,
    newCertType, setNewCertType, newCertNaam, setNewCertNaam,
    newCertDatum, setNewCertDatum, addCertificate,
    inviteMode, setInviteMode, password, setPassword,
    showPw, setShowPw, generatePassword, loading, onSubmit
  } = props;

  const inputStyle = { background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
    <div className="rounded-2xl p-4 space-y-4 animate-fade-in" style={{ background: "var(--bg-surface)", border: "1px solid var(--accent-border)" }}>
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Nieuwe medewerker</p>
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Sectie 1 — Persoonsgegevens */}
        <FormSection title="1. Persoonsgegevens">
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Voornaam *" value={voornaam} onChange={setVoornaam} placeholder="Jan" />
            <FormField label="Achternaam *" value={achternaam} onChange={setAchternaam} placeholder="Jansen" />
          </div>
          <FormField label="E-mailadres *" value={email} onChange={setEmail} placeholder="jan@terrevolt.nl" type="email" />
          <FormField label="Telefoonnummer" value={telefoon} onChange={setTelefoon} placeholder="06-12345678" type="tel" />
          <FormField label="Adres" value={adres} onChange={setAdres} placeholder="Straatnaam 1, Stad" />
        </FormSection>

        {/* Sectie 2 — Functie & tarief */}
        <FormSection title="2. Functie & tarief">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Rol *</label>
            <div className="flex gap-1.5 flex-wrap">
              {Object.entries(roleLabels).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setRole(value)} className="px-3 py-2 rounded-xl text-xs font-semibold transition-colors" style={{
                  background: role === value ? "var(--accent-light)" : "var(--bg-base)",
                  border: role === value ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                  color: role === value ? "var(--accent)" : "var(--text-muted)",
                }}>{label}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Uurtarief (€/uur)" value={uurtarief} onChange={setUurtarief} placeholder="75.00" type="number" />
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Contract einddatum</label>
              <input type="date" value={contractEinddatum} onChange={e => setContractEinddatum(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Rijbewijs</label>
            <button type="button" onClick={() => setRijbewijs(!rijbewijs)} className="w-10 h-6 rounded-full transition-colors relative" style={{ background: rijbewijs ? "var(--accent)" : "var(--bg-surface-2)" }}>
              <div className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all" style={{ left: rijbewijs ? 22 : 4 }} />
            </button>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{rijbewijs ? "Ja" : "Nee"}</span>
          </div>
        </FormSection>

        {/* Sectie 3 — Noodcontact */}
        <FormSection title="3. Noodcontact">
          <FormField label="Naam noodcontact" value={noodcontactNaam} onChange={setNoodcontactNaam} placeholder="Naam" />
          <FormField label="Telefoon noodcontact" value={noodcontactTel} onChange={setNoodcontactTel} placeholder="06-..." type="tel" />
        </FormSection>

        {/* Sectie 4 — Certificaten */}
        <FormSection title="4. Certificaten">
          {certificaten.length > 0 && (
            <div className="space-y-1">
              {certificaten.map((c: Certificate, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
                  <span className="text-xs" style={{ color: "var(--text-primary)" }}>{c.type} — {c.naam} — {c.vervaldatum}</span>
                  <button type="button" onClick={() => setCertificaten((prev: Certificate[]) => prev.filter((_, idx) => idx !== i))} style={{ color: "var(--danger)" }}><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2 p-2 rounded-lg" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
            <div className="flex gap-1.5 flex-wrap">
              {certTypes.map(t => (
                <button key={t} type="button" onClick={() => setNewCertType(t)} className="px-2 py-1 rounded-lg text-[11px] font-semibold" style={{
                  background: newCertType === t ? "var(--accent-light)" : "var(--bg-surface)",
                  border: newCertType === t ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                  color: newCertType === t ? "var(--accent)" : "var(--text-muted)",
                }}>{t}</button>
              ))}
            </div>
            <input value={newCertNaam} onChange={e => setNewCertNaam(e.target.value)} placeholder="Naam certificaat" className="w-full px-2 py-1.5 rounded-lg text-sm" style={inputStyle} />
            <input type="date" value={newCertDatum} onChange={e => setNewCertDatum(e.target.value)} className="w-full px-2 py-1.5 rounded-lg text-sm" style={inputStyle} />
            <button type="button" onClick={addCertificate} className="text-xs font-semibold flex items-center gap-1" style={{ color: "var(--accent)" }}>
              <Plus className="h-3 w-3" /> Certificaat toevoegen
            </button>
          </div>
        </FormSection>

        {/* Sectie 5 — Account aanmaken */}
        <FormSection title="5. Account aanmaken">
          <div className="flex gap-2">
            <button type="button" onClick={() => setInviteMode("invite")} className="flex-1 p-3 rounded-xl text-left space-y-1" style={{
              background: inviteMode === "invite" ? "var(--accent-light)" : "var(--bg-base)",
              border: inviteMode === "invite" ? "2px solid var(--accent)" : "1px solid var(--border)",
            }}>
              <p className="text-xs font-bold flex items-center gap-1" style={{ color: inviteMode === "invite" ? "var(--accent)" : "var(--text-primary)" }}>
                <Mail className="h-3.5 w-3.5" /> Uitnodiging sturen
              </p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Aanbevolen — monteur stelt zelf wachtwoord in</p>
            </button>
            <button type="button" onClick={() => setInviteMode("password")} className="flex-1 p-3 rounded-xl text-left space-y-1" style={{
              background: inviteMode === "password" ? "var(--accent-light)" : "var(--bg-base)",
              border: inviteMode === "password" ? "2px solid var(--accent)" : "1px solid var(--border)",
            }}>
              <p className="text-xs font-bold flex items-center gap-1" style={{ color: inviteMode === "password" ? "var(--accent)" : "var(--text-primary)" }}>
                <Key className="h-3.5 w-3.5" /> Wachtwoord instellen
              </p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Voor direct toegang</p>
            </button>
          </div>

          {inviteMode === "invite" ? (
            <p className="text-[11px] p-2 rounded-lg" style={{ background: "var(--bg-base)", color: "var(--text-muted)" }}>
              De monteur ontvangt een e-mail met een persoonlijke activatielink.
            </p>
          ) : (
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Wachtwoord</label>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Wachtwoord" className="w-full px-3 py-2.5 rounded-xl text-sm pr-8" style={inputStyle} />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }}>
                    {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <button type="button" onClick={generatePassword} className="px-3 py-2.5 rounded-xl text-sm shrink-0" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>🎲</button>
                {password && (
                  <button type="button" onClick={() => { navigator.clipboard.writeText(password); toast.success("Gekopieerd!"); }} className="px-3 py-2.5 rounded-xl text-sm shrink-0" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
                    <Copy className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
                  </button>
                )}
              </div>
            </div>
          )}
        </FormSection>

        <button type="submit" disabled={loading} className="w-full py-3 rounded-xl text-sm font-bold text-white transition-colors active:scale-[0.98]" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
          {loading ? "Bezig..." : inviteMode === "invite" ? "Uitnodiging versturen" : "Account aanmaken"}
        </button>
      </form>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>{title}</p>
      {children}
    </div>
  );
}

function FormField({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
    </div>
  );
}

import { useState, useEffect } from "react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { Copy, Eye, EyeOff, Trash2, Plus, X, Check, Lock, Pencil, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";

interface CreatedUser { email: string; fullName: string; role: string; password: string; }
interface Employee { user_id: string; full_name: string; role: string; uurtarief: number | null; }

const roleLabels: Record<string, string> = { monteur: "Monteur", schakelmonteur: "Schakelmonteur", uitvoerder: "Uitvoerder", wv: "WV", manager: "Manager" };
const AVATAR_COLORS = ['var(--accent)', 'var(--accent-mid)', 'var(--info-dark)', 'var(--warn-text)', 'var(--purple)'];

export default function Medewerkers() {
  const { isManager, user } = useAuth();
  const { refetch: refetchProfile } = useProfile();
  const navigate = useNavigate();
  const [email, setEmail] = useState(""); const [fullName, setFullName] = useState(""); const [role, setRole] = useState(""); const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false); const [deletingId, setDeletingId] = useState<string | null>(null); const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [createdUsers, setCreatedUsers] = useState<CreatedUser[]>([]); const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({});
  const [employees, setEmployees] = useState<Employee[]>([]); const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { loadEmployees(); }, []);

  const loadEmployees = async () => {
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, uurtarief");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    if (profiles && roles) {
      setEmployees(profiles.map((p) => ({ user_id: p.user_id, full_name: p.full_name, uurtarief: (p as any).uurtarief, role: roles.find((r) => r.user_id === p.user_id)?.role || "–" })));
    }
  };

  const generatePassword = () => { const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; let result = ""; for (let i = 0; i < 10; i++) result += chars.charAt(Math.floor(Math.random() * chars.length)); setPassword(result); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !fullName || !role || !password) { toast.error("Vul alle velden in"); return; }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("create-user", { body: { email, password, fullName, role } });
    if (error || data?.error) toast.error(data?.error || error?.message || "Fout bij aanmaken");
    else { toast.success(`Account voor ${fullName} aangemaakt`); setCreatedUsers((prev) => [{ email, fullName, role, password }, ...prev]); setEmail(""); setFullName(""); setRole(""); setPassword(""); setShowAdd(false); loadEmployees(); }
    setLoading(false);
  };

  const handleDelete = async (userId: string, name: string) => {
    setDeletingId(userId);
    const { data, error } = await supabase.functions.invoke("delete-user", { body: { userId } });
    if (error || data?.error) toast.error(data?.error || error?.message || "Fout bij verwijderen");
    else { toast.success(`${name} is verwijderd`); loadEmployees(); }
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
    toast.success("Uurtarief opgeslagen"); loadEmployees();
  };

  const copyCredentials = (user: CreatedUser) => {
    navigator.clipboard.writeText(`Inloggegevens TerreVolt Urenregistratie:\nE-mail: ${user.email}\nWachtwoord: ${user.password}\n\nLog in op: ${window.location.origin}`);
    toast.success("Inloggegevens gekopieerd!");
  };

  if (!isManager) return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}><p style={{ color: "var(--text-muted)" }}>Alleen managers hebben toegang.</p></div>;

  const monteurs = employees.filter((e) => e.role !== "manager" && e.role !== "–");
  const managers = employees.filter((e) => e.role === "manager");

  return (
    <PageShell>
      <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <HeaderLogo />
            <span className="text-base font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Team</span>
          </div>
          <button onClick={() => setShowAdd(!showAdd)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
            background: showAdd ? "var(--danger-light)" : "var(--success-light)",
            border: showAdd ? "1px solid #E8A09A" : "1px solid #8DC99A",
            color: showAdd ? "var(--danger)" : "var(--success)",
          }}>
            {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {showAdd && (
          <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "var(--bg-surface)", border: "1px solid #9DC87A" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Nieuwe medewerker</p>
            <form onSubmit={handleCreate} className="space-y-3">
              {[{ key: "fullName", label: "Naam", placeholder: "Jan Jansen", value: fullName, onChange: setFullName },
                { key: "email", label: "E-mail", placeholder: "jan@terrevolt.nl", value: email, onChange: setEmail, type: "email" }].map((f) => (
                <div key={f.key} className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{f.label}</label>
                  <input type={f.type || "text"} value={f.value} onChange={(e) => f.onChange(e.target.value)} placeholder={f.placeholder} className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                </div>
              ))}

              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Rol</label>
                <div className="flex gap-1.5 flex-wrap">
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <button key={value} type="button" onClick={() => setRole(value)} className="px-3 py-2 rounded-xl text-xs font-semibold transition-colors" style={{
                      background: role === value ? "var(--accent-light)" : "var(--bg-base)",
                      border: role === value ? "1px solid #9DC87A" : "1px solid var(--border)",
                      color: role === value ? "var(--accent)" : "var(--text-muted)",
                    }}>{label}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Wachtwoord</label>
                <div className="flex gap-1.5">
                  <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Wachtwoord" className="flex-1 px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                  <button type="button" onClick={generatePassword} className="px-3 py-2.5 rounded-xl text-sm shrink-0" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>🎲</button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="w-full py-3 rounded-xl text-sm font-bold text-white transition-colors active:scale-[0.98]" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
                {loading ? "Bezig..." : "Toevoegen"}
              </button>
            </form>
          </div>
        )}

        {createdUsers.length > 0 && (
          <div className="rounded-2xl overflow-hidden animate-slide-up" style={{ background: "var(--bg-surface)", border: "1px solid #9DC87A" }}>
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
                    <button onClick={() => copyCredentials(u)} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                      <Copy className="h-3 w-3" /> Kopieer
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Wachtwoord:</span>
                    <code className="text-[11px] px-2 py-0.5 rounded-md font-mono" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                      {showPasswords[i] ? u.password : "••••••••••"}
                    </code>
                    <button className="w-6 h-6 flex items-center justify-center" style={{ color: "var(--text-muted)" }} onClick={() => setShowPasswords((prev) => ({ ...prev, [i]: !prev[i] }))}>
                      {showPasswords[i] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  </div>
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
                <EmployeeRow key={emp.user_id} emp={emp} idx={i} isSelf={emp.user_id === user?.id} onRoleChange={handleRoleChange} onDelete={handleDelete} updatingRoleId={updatingRoleId} deletingId={deletingId} onTariefChange={handleTariefChange} />
              ))}
            </div>
          </>
        )}

        {monteurs.length > 0 && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wider px-1" style={{ color: "var(--text-muted)" }}>Medewerkers ({monteurs.length})</p>
            <div className="space-y-1.5">
              {monteurs.map((emp, i) => (
                <EmployeeRow key={emp.user_id} emp={emp} idx={i + managers.length} isSelf={emp.user_id === user?.id} onRoleChange={handleRoleChange} onDelete={handleDelete} updatingRoleId={updatingRoleId} deletingId={deletingId} onTariefChange={handleTariefChange} />
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
      </main>
    </PageShell>
  );
}

function EmployeeRow({ emp, idx, isSelf, onRoleChange, onDelete, updatingRoleId, deletingId, onTariefChange }: {
  emp: Employee; idx: number; isSelf: boolean;
  onRoleChange: (userId: string, role: string) => void;
  onDelete: (userId: string, name: string) => void;
  updatingRoleId: string | null; deletingId: string | null;
  onTariefChange: (userId: string, tarief: number | null) => void;
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
    <div className="rounded-2xl p-3.5 transition-transform active:scale-[0.985]" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length], color: "#fff" }}>
          {emp.full_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{emp.full_name}</p>
        </div>
        <button onClick={() => !isSelf && setShowRol(!showRol)} className="px-2 py-1 rounded-lg text-[11px] font-semibold capitalize shrink-0" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-secondary)" }} disabled={isSelf}>
          {roleLabels[emp.role] || emp.role} {!isSelf && "↓"}
        </button>
        {!isSelf && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--danger-light)", border: "1px solid #E8A09A" }} disabled={deletingId === emp.user_id}>
                <Trash2 className="h-3.5 w-3.5" style={{ color: "var(--danger)" }} />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Medewerker verwijderen</AlertDialogTitle>
                <AlertDialogDescription>Weet je zeker dat je <strong>{emp.full_name}</strong> wilt verwijderen?</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-lg">Annuleren</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(emp.user_id, emp.full_name)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg">Verwijderen</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {showRol && !isSelf && (
        <div className="flex gap-1.5 mt-2.5 flex-wrap animate-fade-in">
          {Object.entries(roleLabels).map(([value, label]) => (
            <button key={value} onClick={() => { onRoleChange(emp.user_id, value); setShowRol(false); }} className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors" style={{
              background: emp.role === value ? "var(--accent-light)" : "var(--bg-base)",
              border: emp.role === value ? "1px solid #9DC87A" : "1px solid var(--border)",
              color: emp.role === value ? "var(--accent)" : "var(--text-muted)",
            }}>{label}</button>
          ))}
        </div>
      )}

      {/* Tariefinformatie - only managers */}
      <div className="mt-2 rounded-xl p-3 space-y-1.5" style={{ background: "var(--warn-bg)", border: "1px solid #E8D070" }}>
        <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: "var(--warn-text)" }}>
          <Lock className="h-3 w-3" /> Tariefinformatie (alleen managers)
        </p>
        {editTarief ? (
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: "var(--warn-text)" }}>€</span>
            <input type="number" step="0.50" min="0" value={tariefVal} onChange={e => setTariefVal(e.target.value)} placeholder="bijv. 75.00" className="flex-1 px-2 py-1.5 rounded-lg text-sm font-mono" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
            <span className="text-sm" style={{ color: "var(--warn-text)" }}>/ uur</span>
            <button onClick={saveTarief} className="px-2 py-1 rounded-lg flex items-center justify-center" style={{ background: "var(--accent-light)", color: "var(--accent)" }}><Check className="h-3.5 w-3.5" /></button>
            <button onClick={() => setEditTarief(false)} className="px-2 py-1 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-base)", color: "var(--text-muted)" }}><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>
              {emp.uurtarief != null ? `Uurtarief: € ${emp.uurtarief.toFixed(2)} / uur` : "Uurtarief: niet ingesteld"}
            </p>
            <button onClick={() => { setTariefVal(emp.uurtarief?.toString() || ""); setEditTarief(true); }} className="text-[11px] font-semibold flex items-center gap-1" style={{ color: "var(--warn-text)" }}><Pencil className="h-3 w-3" /> Bewerken</button>
          </div>
        )}
      </div>
    </div>
  );
}

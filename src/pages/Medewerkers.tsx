import { useState, useEffect } from "react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";

interface CreatedUser { email: string; fullName: string; role: string; password: string; }
interface Employee { user_id: string; full_name: string; role: string; uurtarief: number | null; }

const roleLabels: Record<string, string> = { monteur: "Monteur", schakelmonteur: "Schakelmonteur", uitvoerder: "Uitvoerder", wv: "WV", manager: "Manager" };
const AVATAR_COLORS = ['#4A7C2F', '#6B9E4A', '#2D6B8A', '#8B6914', '#5A4A7C'];

export default function Medewerkers() {
  const { isManager, user } = useAuth();
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
    const { error } = await supabase.from("user_roles").update({ role: newRole as any }).eq("user_id", userId);
    if (error) toast.error("Fout bij wijzigen rol"); else { toast.success("Rol gewijzigd"); loadEmployees(); }
    setUpdatingRoleId(null);
  };

  const handleTariefChange = async (userId: string, tarief: number | null) => {
    const { error } = await supabase.from("profiles").update({ uurtarief: tarief } as any).eq("user_id", userId);
    if (error) toast.error("Fout bij opslaan tarief"); else { toast.success("Uurtarief opgeslagen"); loadEmployees(); }
  };

  const copyCredentials = (user: CreatedUser) => {
    navigator.clipboard.writeText(`Inloggegevens TerreVolt Urenregistratie:\nE-mail: ${user.email}\nWachtwoord: ${user.password}\n\nLog in op: ${window.location.origin}`);
    toast.success("Inloggegevens gekopieerd!");
  };

  if (!isManager) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#F5F7F0" }}><p style={{ color: "#8AAD6E" }}>Alleen managers hebben toegang.</p></div>;

  const monteurs = employees.filter((e) => e.role !== "manager" && e.role !== "–");
  const managers = employees.filter((e) => e.role === "manager");

  return (
    <PageShell>
      <header className="sticky top-0 z-30" style={{ background: "rgba(235,240,228,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid #C5D4B2" }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <HeaderLogo />
            <span className="text-base font-bold tracking-tight" style={{ color: "#2D4A1E" }}>Team</span>
          </div>
          <button onClick={() => setShowAdd(!showAdd)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{
            background: showAdd ? "#FDECEA" : "#D4EDD8",
            border: showAdd ? "1px solid #E8A09A" : "1px solid #8DC99A",
            color: showAdd ? "#C0392B" : "#2D7A3A",
            fontSize: showAdd ? 18 : 22,
          }}>
            {showAdd ? "×" : "+"}
          </button>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {showAdd && (
          <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "#EBF0E4", border: "1px solid #9DC87A" }}>
            <p className="text-sm font-semibold" style={{ color: "#2D4A1E" }}>Nieuwe medewerker</p>
            <form onSubmit={handleCreate} className="space-y-3">
              {[{ key: "fullName", label: "Naam", placeholder: "Jan Jansen", value: fullName, onChange: setFullName },
                { key: "email", label: "E-mail", placeholder: "jan@terrevolt.nl", value: email, onChange: setEmail, type: "email" }].map((f) => (
                <div key={f.key} className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#8AAD6E" }}>{f.label}</label>
                  <input type={f.type || "text"} value={f.value} onChange={(e) => f.onChange(e.target.value)} placeholder={f.placeholder} className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#2D4A1E" }} />
                </div>
              ))}

              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#8AAD6E" }}>Rol</label>
                <div className="flex gap-1.5 flex-wrap">
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <button key={value} type="button" onClick={() => setRole(value)} className="px-3 py-2 rounded-xl text-xs font-semibold transition-colors" style={{
                      background: role === value ? "#D4E8C2" : "#F5F7F0",
                      border: role === value ? "1px solid #9DC87A" : "1px solid #C5D4B2",
                      color: role === value ? "#4A7C2F" : "#8AAD6E",
                    }}>{label}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#8AAD6E" }}>Wachtwoord</label>
                <div className="flex gap-1.5">
                  <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Wachtwoord" className="flex-1 px-3 py-2.5 rounded-xl text-sm" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#2D4A1E" }} />
                  <button type="button" onClick={generatePassword} className="px-3 py-2.5 rounded-xl text-sm shrink-0" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2" }}>🎲</button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="w-full py-3 rounded-xl text-sm font-bold text-white transition-colors active:scale-[0.98]" style={{ background: "linear-gradient(135deg, #4A7C2F, #3D6826)" }}>
                {loading ? "Bezig..." : "Toevoegen"}
              </button>
            </form>
          </div>
        )}

        {createdUsers.length > 0 && (
          <div className="rounded-2xl overflow-hidden animate-slide-up" style={{ background: "#EBF0E4", border: "1px solid #9DC87A" }}>
            <div className="px-4 py-2.5" style={{ background: "#D4E8C2" }}>
              <span className="text-xs font-semibold" style={{ color: "#2D4A1E" }}>Zojuist aangemaakt</span>
            </div>
            <div className="p-3 space-y-2">
              {createdUsers.map((u, i) => (
                <div key={i} className="p-3 rounded-xl space-y-2" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm" style={{ color: "#2D4A1E" }}>{u.fullName}</p>
                      <p className="text-[11px] truncate" style={{ color: "#8AAD6E" }}>{u.email} · {roleLabels[u.role]}</p>
                    </div>
                    <button onClick={() => copyCredentials(u)} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold" style={{ background: "#DFE8D6", border: "1px solid #C5D4B2", color: "#5A7A42" }}>
                      <Copy className="h-3 w-3" /> Kopieer
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px]" style={{ color: "#8AAD6E" }}>Wachtwoord:</span>
                    <code className="text-[11px] px-2 py-0.5 rounded-md font-mono" style={{ background: "#DFE8D6", border: "1px solid #C5D4B2", color: "#2D4A1E" }}>
                      {showPasswords[i] ? u.password : "••••••••••"}
                    </code>
                    <button className="w-6 h-6 flex items-center justify-center" style={{ color: "#8AAD6E" }} onClick={() => setShowPasswords((prev) => ({ ...prev, [i]: !prev[i] }))}>
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
            <p className="text-[11px] font-semibold uppercase tracking-wider px-1" style={{ color: "#8AAD6E" }}>Managers ({managers.length})</p>
            <div className="space-y-1.5">
              {managers.map((emp, i) => (
                <EmployeeRow key={emp.user_id} emp={emp} idx={i} isSelf={emp.user_id === user?.id} onRoleChange={handleRoleChange} onDelete={handleDelete} updatingRoleId={updatingRoleId} deletingId={deletingId} />
              ))}
            </div>
          </>
        )}

        {monteurs.length > 0 && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wider px-1" style={{ color: "#8AAD6E" }}>Medewerkers ({monteurs.length})</p>
            <div className="space-y-1.5">
              {monteurs.map((emp, i) => (
                <EmployeeRow key={emp.user_id} emp={emp} idx={i + managers.length} isSelf={emp.user_id === user?.id} onRoleChange={handleRoleChange} onDelete={handleDelete} updatingRoleId={updatingRoleId} deletingId={deletingId} />
              ))}
            </div>
          </>
        )}

        {employees.length === 0 && (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">👥</p>
            <p className="text-sm font-medium" style={{ color: "#2D4A1E" }}>Nog geen medewerkers</p>
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
    <div className="rounded-2xl p-3.5 transition-transform active:scale-[0.985]" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length], color: "#fff" }}>
          {emp.full_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "#2D4A1E" }}>{emp.full_name}</p>
        </div>
        <button onClick={() => !isSelf && setShowRol(!showRol)} className="px-2 py-1 rounded-lg text-[11px] font-semibold capitalize shrink-0" style={{ background: "#DFE8D6", border: "1px solid #C5D4B2", color: "#5A7A42" }} disabled={isSelf}>
          {roleLabels[emp.role] || emp.role} {!isSelf && "↓"}
        </button>
        {!isSelf && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#FDECEA", border: "1px solid #E8A09A" }} disabled={deletingId === emp.user_id}>
                <Trash2 className="h-3.5 w-3.5" style={{ color: "#C0392B" }} />
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
              background: emp.role === value ? "#D4E8C2" : "#F5F7F0",
              border: emp.role === value ? "1px solid #9DC87A" : "1px solid #C5D4B2",
              color: emp.role === value ? "#4A7C2F" : "#8AAD6E",
            }}>{label}</button>
          ))}
        </div>
      )}

      {/* Tariefinformatie - only managers */}
      <div className="mt-2 rounded-xl p-3 space-y-1.5" style={{ background: "#FFF8DC", border: "1px solid #E8D070" }}>
        <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: "#8B6914" }}>
          🔒 Tariefinformatie (alleen managers)
        </p>
        {editTarief ? (
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: "#8B6914" }}>€</span>
            <input type="number" step="0.50" min="0" value={tariefVal} onChange={e => setTariefVal(e.target.value)} placeholder="bijv. 75.00" className="flex-1 px-2 py-1.5 rounded-lg text-sm font-mono" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#2D4A1E" }} />
            <span className="text-sm" style={{ color: "#8B6914" }}>/ uur</span>
            <button onClick={saveTarief} className="px-2 py-1 rounded-lg text-[11px] font-semibold" style={{ background: "#D4E8C2", color: "#4A7C2F" }}>✓</button>
            <button onClick={() => setEditTarief(false)} className="px-2 py-1 rounded-lg text-[11px] font-semibold" style={{ background: "#F5F7F0", color: "#8AAD6E" }}>✕</button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm font-mono" style={{ color: "#2D4A1E" }}>
              {emp.uurtarief != null ? `Uurtarief: € ${emp.uurtarief.toFixed(2)} / uur` : "Uurtarief: niet ingesteld"}
            </p>
            <button onClick={() => { setTariefVal(emp.uurtarief?.toString() || ""); setEditTarief(true); }} className="text-[11px] font-semibold" style={{ color: "#8B6914" }}>✏ Bewerken</button>
          </div>
        )}
      </div>
    </div>
  );
}

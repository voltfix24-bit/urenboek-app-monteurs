import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, UserPlus, Eye, EyeOff, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { BottomNav } from "@/components/BottomNav";

interface CreatedUser {
  email: string;
  fullName: string;
  role: string;
  password: string;
}

interface Employee {
  user_id: string;
  full_name: string;
  role: string;
}

const roleLabels: Record<string, string> = {
  monteur: "Monteur",
  schakelmonteur: "Schakelmonteur",
  uitvoerder: "Uitvoerder",
  wv: "WV",
  manager: "Manager",
};

export default function Medewerkers() {
  const { isManager, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [createdUsers, setCreatedUsers] = useState<CreatedUser[]>([]);
  const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({});
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    if (profiles && roles) {
      const employeeList: Employee[] = profiles.map((p) => {
        const userRole = roles.find((r) => r.user_id === p.user_id);
        return {
          user_id: p.user_id,
          full_name: p.full_name,
          role: userRole?.role || "–",
        };
      });
      setEmployees(employeeList);
    }
  };

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let result = "";
    for (let i = 0; i < 10; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(result);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !fullName || !role || !password) {
      toast.error("Vul alle velden in");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("create-user", {
      body: { email, password, fullName, role },
    });

    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Fout bij aanmaken");
    } else {
      toast.success(`Account voor ${fullName} aangemaakt`);
      setCreatedUsers((prev) => [{ email, fullName, role, password }, ...prev]);
      setEmail("");
      setFullName("");
      setRole("");
      setPassword("");
      setShowAdd(false);
      loadEmployees();
    }
    setLoading(false);
  };

  const handleDelete = async (userId: string, name: string) => {
    setDeletingId(userId);
    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { userId },
    });

    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Fout bij verwijderen");
    } else {
      toast.success(`${name} is verwijderd`);
      loadEmployees();
    }
    setDeletingId(null);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingRoleId(userId);
    const { error } = await supabase
      .from("user_roles")
      .update({ role: newRole as any })
      .eq("user_id", userId);

    if (error) {
      toast.error("Fout bij wijzigen rol");
    } else {
      toast.success("Rol gewijzigd");
      loadEmployees();
    }
    setUpdatingRoleId(null);
  };

  const copyCredentials = (user: CreatedUser) => {
    const text = `Inloggegevens TerreVolt Urenregistratie:\nE-mail: ${user.email}\nWachtwoord: ${user.password}\n\nLog in op: ${window.location.origin}`;
    navigator.clipboard.writeText(text);
    toast.success("Inloggegevens gekopieerd!");
  };

  if (!isManager) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Alleen managers hebben toegang.</p>
      </div>
    );
  }

  const monteurs = employees.filter((e) => e.role !== "manager" && e.role !== "–");
  const managers = employees.filter((e) => e.role === "manager");

  return (
    <div className="min-h-screen bg-background overflow-x-hidden" style={{ maxWidth: 430, margin: "0 auto", paddingBottom: 80 }}>
      {/* Header */}
      <header className="sticky top-0 z-30" style={{ background: "rgba(10,10,15,0.95)", backdropFilter: "blur(12px)" }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>
              ⚡
            </div>
            <span className="text-base font-bold text-foreground tracking-tight">Team</span>
          </div>
          <button
            onClick={() => { setShowAdd(!showAdd); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: showAdd ? "rgba(248,113,113,0.15)" : "rgba(34,197,94,0.15)",
              border: showAdd ? "1px solid rgba(248,113,113,0.25)" : "1px solid rgba(34,197,94,0.25)",
              color: showAdd ? "#f87171" : "#22c55e",
              fontSize: showAdd ? 18 : 22,
            }}
          >
            {showAdd ? "×" : "+"}
          </button>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {/* Add form */}
        {showAdd && (
          <div className="rounded-2xl p-4 space-y-3 animate-fade-in" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <p className="text-sm font-semibold text-foreground">Nieuwe medewerker</p>
            <form onSubmit={handleCreate} className="space-y-3">
              {[
                { key: "fullName", label: "Naam", placeholder: "Jan Jansen", value: fullName, onChange: setFullName },
                { key: "email", label: "E-mail", placeholder: "jan@terrevolt.nl", value: email, onChange: setEmail, type: "email" },
              ].map((f) => (
                <div key={f.key} className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{f.label}</label>
                  <input
                    type={f.type || "text"}
                    value={f.value}
                    onChange={(e) => f.onChange(e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2.5 rounded-xl text-sm text-foreground placeholder:text-muted-foreground"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                </div>
              ))}

              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Rol</label>
                <div className="flex gap-1.5 flex-wrap">
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRole(value)}
                      className="px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
                      style={{
                        background: role === value ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.04)",
                        border: role === value ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.06)",
                        color: role === value ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Wachtwoord</label>
                <div className="flex gap-1.5">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Wachtwoord"
                    className="flex-1 px-3 py-2.5 rounded-xl text-sm text-foreground placeholder:text-muted-foreground"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
                  />
                  <button type="button" onClick={generatePassword} className="px-3 py-2.5 rounded-xl text-sm shrink-0" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    🎲
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-bold text-white transition-colors active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}
              >
                {loading ? "Bezig..." : "Toevoegen"}
              </button>
            </form>
          </div>
        )}

        {/* Recently created */}
        {createdUsers.length > 0 && (
          <div className="rounded-2xl overflow-hidden animate-slide-up" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(34,197,94,0.15)" }}>
            <div className="px-4 py-2.5" style={{ background: "rgba(34,197,94,0.05)" }}>
              <span className="text-xs font-semibold text-foreground">Zojuist aangemaakt</span>
            </div>
            <div className="p-3 space-y-2">
              {createdUsers.map((u, i) => (
                <div key={i} className="p-3 rounded-xl space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground">{u.fullName}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{u.email} · {roleLabels[u.role]}</p>
                    </div>
                    <button onClick={() => copyCredentials(u)} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-muted-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <Copy className="h-3 w-3" /> Kopieer
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">Wachtwoord:</span>
                    <code className="text-[11px] px-2 py-0.5 rounded-md font-mono text-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      {showPasswords[i] ? u.password : "••••••••••"}
                    </code>
                    <button
                      className="w-6 h-6 flex items-center justify-center text-muted-foreground"
                      onClick={() => setShowPasswords((prev) => ({ ...prev, [i]: !prev[i] }))}
                    >
                      {showPasswords[i] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Managers */}
        {managers.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Managers ({managers.length})</p>
            <div className="space-y-1.5">
              {managers.map((emp) => (
                <EmployeeRow key={emp.user_id} emp={emp} isSelf={emp.user_id === user?.id} onRoleChange={handleRoleChange} onDelete={handleDelete} updatingRoleId={updatingRoleId} deletingId={deletingId} />
              ))}
            </div>
          </>
        )}

        {/* Monteurs */}
        {monteurs.length > 0 && (
          <>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Medewerkers ({monteurs.length})</p>
            <div className="space-y-1.5">
              {monteurs.map((emp) => (
                <EmployeeRow key={emp.user_id} emp={emp} isSelf={emp.user_id === user?.id} onRoleChange={handleRoleChange} onDelete={handleDelete} updatingRoleId={updatingRoleId} deletingId={deletingId} />
              ))}
            </div>
          </>
        )}

        {employees.length === 0 && (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">👥</p>
            <p className="text-sm font-medium text-foreground">Nog geen medewerkers</p>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function EmployeeRow({ emp, isSelf, onRoleChange, onDelete, updatingRoleId, deletingId }: {
  emp: Employee;
  isSelf: boolean;
  onRoleChange: (userId: string, role: string) => void;
  onDelete: (userId: string, name: string) => void;
  updatingRoleId: string | null;
  deletingId: string | null;
}) {
  const [showRol, setShowRol] = useState(false);

  return (
    <div className="rounded-2xl p-3.5 transition-transform active:scale-[0.985]" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)", color: "#fff" }}>
          {emp.full_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{emp.full_name}</p>
        </div>
        <button
          onClick={() => !isSelf && setShowRol(!showRol)}
          className="px-2 py-1 rounded-lg text-[11px] font-semibold capitalize shrink-0"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.09)",
            color: "hsl(var(--muted-foreground))",
          }}
          disabled={isSelf}
        >
          {roleLabels[emp.role] || emp.role} {!isSelf && "↓"}
        </button>
        {!isSelf && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.15)" }}
                disabled={deletingId === emp.user_id}
              >
                <Trash2 className="h-3.5 w-3.5" style={{ color: "#f87171" }} />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Medewerker verwijderen</AlertDialogTitle>
                <AlertDialogDescription>
                  Weet je zeker dat je <strong>{emp.full_name}</strong> wilt verwijderen?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-lg">Annuleren</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(emp.user_id, emp.full_name)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg"
                >
                  Verwijderen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {showRol && !isSelf && (
        <div className="flex gap-1.5 mt-2.5 flex-wrap animate-fade-in">
          {Object.entries(roleLabels).map(([value, label]) => (
            <button
              key={value}
              onClick={() => { onRoleChange(emp.user_id, value); setShowRol(false); }}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors"
              style={{
                background: emp.role === value ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.04)",
                border: emp.role === value ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.06)",
                color: emp.role === value ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

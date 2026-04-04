import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, UserPlus, ArrowLeft, Eye, EyeOff, Trash2 } from "lucide-react";
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
import terrevoltLogo from "@/assets/terrevolt-logo.png";

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
  const [createdUsers, setCreatedUsers] = useState<CreatedUser[]>([]);
  const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({});
  const [employees, setEmployees] = useState<Employee[]>([]);

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

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <header className="border-b bg-card">
        <div className="px-4 py-3 flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-2">
            <img src={terrevoltLogo} alt="TerreVolt BV" className="h-7" />
            <span className="text-xs text-muted-foreground border-l pl-2">Medewerkers</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Terug
          </Button>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 max-w-5xl mx-auto">
        {/* Add employee form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Nieuwe medewerker toevoegen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Naam</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jan Jansen" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">E-mailadres</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jan@terrevolt.nl" className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Rol</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Kies rol" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(roleLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Wachtwoord</Label>
                  <div className="flex gap-1">
                    <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Wachtwoord" className="h-9" />
                    <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={generatePassword} title="Genereer wachtwoord">
                      🎲
                    </Button>
                  </div>
                </div>
              </div>
              <Button type="submit" disabled={loading} className="w-full sm:w-auto gap-1.5">
                <UserPlus className="h-4 w-4" />
                {loading ? "Bezig..." : "Toevoegen"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Recently created */}
        {createdUsers.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Zojuist aangemaakt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {createdUsers.map((user, i) => (
                  <div key={i} className="p-3 rounded-lg border bg-secondary/30 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-medium text-sm">{user.fullName}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email} · {roleLabels[user.role]}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => copyCredentials(user)} className="gap-1 shrink-0">
                        <Copy className="h-3.5 w-3.5" />
                        Kopieer
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Wachtwoord:</span>
                      <code className="text-xs bg-background px-2 py-0.5 rounded border">
                        {showPasswords[i] ? user.password : "••••••••••"}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setShowPasswords((prev) => ({ ...prev, [i]: !prev[i] }))}
                      >
                        {showPasswords[i] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Employee list */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Alle medewerkers</CardTitle>
          </CardHeader>
          <CardContent>
            {employees.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen medewerkers</p>
            ) : (
              <div className="divide-y">
                {employees.map((emp) => {
                  const isSelf = emp.user_id === user?.id;
                  return (
                    <div key={emp.user_id} className="flex items-center justify-between py-2.5 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">{emp.full_name}</span>
                        <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded shrink-0">
                          {roleLabels[emp.role] || emp.role}
                        </span>
                      </div>
                      {!isSelf && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                              disabled={deletingId === emp.user_id}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Medewerker verwijderen</AlertDialogTitle>
                              <AlertDialogDescription>
                                Weet je zeker dat je <strong>{emp.full_name}</strong> wilt verwijderen? 
                                Dit verwijdert ook alle urenregistraties van deze medewerker. Dit kan niet ongedaan worden gemaakt.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuleren</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(emp.user_id, emp.full_name)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Verwijderen
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

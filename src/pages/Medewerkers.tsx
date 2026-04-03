import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, UserPlus, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import terrevoltLogo from "@/assets/terrevolt-logo.png";

interface CreatedUser {
  email: string;
  fullName: string;
  role: string;
  password: string;
}

const roleLabels: Record<string, string> = {
  monteur: "Monteur",
  schakelmonteur: "Schakelmonteur",
  uitvoerder: "Uitvoerder",
  wv: "WV",
  manager: "Manager",
};

export default function Medewerkers() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdUsers, setCreatedUsers] = useState<CreatedUser[]>([]);
  const [showPasswords, setShowPasswords] = useState<Record<number, boolean>>({});

  // Load existing employees
  const [employees, setEmployees] = useState<{ full_name: string; email: string; role: string }[]>([]);

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name");
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    if (profiles && roles) {
      const employeeList = profiles.map((p) => {
        const userRole = roles.find((r) => r.user_id === p.user_id);
        return {
          full_name: p.full_name,
          email: "",
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
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={terrevoltLogo} alt="TerreVolt BV" className="h-8" />
            <span className="text-xs text-muted-foreground border-l pl-3">Medewerkers</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Terug
          </Button>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Add employee form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Nieuwe medewerker toevoegen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs">Naam</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jan Jansen" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">E-mailadres</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jan@terrevolt.nl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Rol</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue placeholder="Kies rol" /></SelectTrigger>
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
                  <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Wachtwoord" />
                  <Button type="button" variant="outline" size="icon" onClick={generatePassword} title="Genereer wachtwoord">
                    🎲
                  </Button>
                </div>
              </div>
              <Button type="submit" disabled={loading} className="gap-1.5">
                <UserPlus className="h-4 w-4" />
                {loading ? "Bezig..." : "Toevoegen"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Recently created - with passwords visible */}
        {createdUsers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Zojuist aangemaakt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {createdUsers.map((user, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-secondary/30">
                    <div className="space-y-0.5">
                      <p className="font-medium text-sm">{user.fullName}</p>
                      <p className="text-xs text-muted-foreground">{user.email} · {roleLabels[user.role]}</p>
                      <div className="flex items-center gap-2 mt-1">
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
                    <Button variant="outline" size="sm" onClick={() => copyCredentials(user)} className="gap-1">
                      <Copy className="h-3.5 w-3.5" />
                      Kopieer
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Employee list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Alle medewerkers</CardTitle>
          </CardHeader>
          <CardContent>
            {employees.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen medewerkers</p>
            ) : (
              <div className="divide-y">
                {employees.map((emp, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5">
                    <span className="text-sm font-medium">{emp.full_name}</span>
                    <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">
                      {roleLabels[emp.role] || emp.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

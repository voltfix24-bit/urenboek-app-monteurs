import { useNavigate } from "react-router-dom";
import { DEV_MODE, DEV_USERS, DevUser, setDevUser } from "@/hooks/useAuth";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LogIn, Mail, Lock, User, Shield, Wrench, Zap, HardHat, ClipboardList } from "lucide-react";
import terrevoltLogo from "@/assets/terrevolt-logo.svg";

const ROLE_ICONS: Record<string, React.ReactNode> = {
  manager: <Shield className="h-6 w-6" />,
  uitvoerder: <ClipboardList className="h-6 w-6" />,
  monteur: <Wrench className="h-6 w-6" />,
  schakelmonteur: <Zap className="h-6 w-6" />,
  wv: <HardHat className="h-6 w-6" />,
};

const ROLE_COLORS: Record<string, string> = {
  manager: "var(--accent)",
  uitvoerder: "var(--info-dark, #3b82f6)",
  monteur: "var(--warn-dot, #f59e0b)",
  schakelmonteur: "var(--purple, #8b5cf6)",
  wv: "var(--danger, #ef4444)",
};

function DevLoginPicker() {
  const selectUser = (devUser: DevUser) => {
    setDevUser(devUser);
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: "var(--bg-base)" }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-[0.07] blur-3xl" style={{ background: "var(--accent)" }} />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full opacity-[0.07] blur-3xl" style={{ background: "var(--accent)" }} />
      </div>

      <div className="w-full max-w-sm relative">
        <div className="text-center mb-8">
          <img src={terrevoltLogo} alt="TerreVolt BV" className="h-12 mx-auto mb-3" />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Ontwikkelmodus</p>
        </div>

        <div className="rounded-2xl p-6 space-y-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <div className="text-center">
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Kies een rol</h1>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Selecteer een gebruiker om de app te bekijken</p>
          </div>

          <div className="space-y-2">
            {DEV_USERS.map((devUser) => (
              <button
                key={devUser.id}
                onClick={() => selectUser(devUser)}
                className="w-full flex items-center gap-4 p-4 rounded-xl transition-all active:scale-[0.97]"
                style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = ROLE_COLORS[devUser.role] || "var(--accent)";
                  e.currentTarget.style.background = "var(--bg-surface-2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.background = "var(--bg-base)";
                }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `color-mix(in srgb, ${ROLE_COLORS[devUser.role] || "var(--accent)"} 15%, transparent)`, color: ROLE_COLORS[devUser.role] || "var(--accent)" }}
                >
                  {ROLE_ICONS[devUser.role] || <User className="h-6 w-6" />}
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{devUser.label}</p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{devUser.fullName}</p>
                </div>
                <div className="ml-auto">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ border: "2px solid var(--border)" }}>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>→</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="text-center pt-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium" style={{ background: "var(--warn-bg)", color: "var(--warn-text)", border: "1px solid var(--warn-border)" }}>
              ⚠️ Dev-modus — geen echte authenticatie
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] mt-6" style={{ color: "var(--text-muted)" }}>
          © {new Date().getFullYear()} TerreVolt BV · Alle rechten voorbehouden
        </p>
      </div>
    </div>
  );
}

function RealLoginForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error(error.message);
      else navigate("/");
    } else {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
      });
      if (error) toast.error(error.message);
      else toast.success("Controleer je e-mail om je account te bevestigen");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full gradient-primary opacity-[0.07] blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full gradient-accent opacity-[0.07] blur-3xl" />
      </div>
      <div className="w-full max-w-sm relative animate-scale-in">
        <div className="text-center mb-8">
          <img src={terrevoltLogo} alt="TerreVolt BV" className="h-12 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Urenregistratie</p>
        </div>
        <div className="rounded-2xl border bg-card shadow-elevated p-6 space-y-6">
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">{isLogin ? "Welkom terug" : "Account aanmaken"}</h1>
            <p className="text-sm text-muted-foreground mt-1">{isLogin ? "Log in om door te gaan" : "Vul je gegevens in"}</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-medium">Volledige naam</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jan Jansen" required={!isLogin} className="pl-10 h-11" />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-medium">E-mailadres</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jan@terrevolt.nl" required className="pl-10 h-11" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-medium">Wachtwoord</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="pl-10 h-11" />
              </div>
            </div>
            <Button type="submit" className="w-full h-11 font-semibold gap-2 gradient-primary text-primary-foreground hover:opacity-90 transition-opacity" disabled={loading}>
              <LogIn className="h-4 w-4" />
              {loading ? "Laden..." : isLogin ? "Inloggen" : "Registreren"}
            </Button>
          </form>
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">of</span></div>
          </div>
          <div className="text-center">
            <button type="button" className="text-sm text-primary hover:text-primary/80 font-medium transition-colors" onClick={() => setIsLogin(!isLogin)}>
              {isLogin ? "Nog geen account? Registreer" : "Al een account? Log in"}
            </button>
          </div>
        </div>
        <p className="text-center text-[11px] text-muted-foreground mt-6">© {new Date().getFullYear()} TerreVolt BV · Alle rechten voorbehouden</p>
      </div>
    </div>
  );
}

export default function Auth() {
  if (DEV_MODE) return <DevLoginPicker />;
  return <RealLoginForm />;
}

import { useNavigate } from "react-router-dom";
import { DEV_MODE, DEV_USERS, DevUser, setDevUser } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [noManagers, setNoManagers] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkManagers = async () => {
      // Check app_setup (readable by anon)
      const { data: setup } = await supabase.from("app_setup" as any).select("setup_done").limit(1).maybeSingle() as any;
      if (setup?.setup_done) return; // Setup already done, don't show banner
      // Also check user_roles (only works if authenticated)
      const { data } = await supabase.from("user_roles").select("id").eq("role", "manager" as any).limit(1);
      if (!data || data.length === 0) setNoManagers(true);
    };
    checkManagers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error(error.message);
    else navigate("/");
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail) return;
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: window.location.origin + "/reset-password",
    });
    if (!error) {
      toast.success("Reset link verstuurd! Check je e-mail.");
      setShowForgot(false);
      setForgotEmail("");
    } else {
      toast.error("E-mailadres niet gevonden.");
    }
    setForgotLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden" style={{ background: "var(--bg-base)" }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-[0.07] blur-3xl" style={{ background: "var(--accent)" }} />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full opacity-[0.07] blur-3xl" style={{ background: "var(--accent)" }} />
      </div>
      <div className="w-full max-w-sm relative">
        {noManagers && (
          <div className="rounded-xl p-3 mb-4 flex items-center gap-2" style={{ background: "var(--info-light)", border: "1px solid var(--info-border)" }}>
            <span className="text-xs" style={{ color: "var(--info-dark)" }}>
              Eerste keer? Maak je manager account aan via de setup pagina.
            </span>
            <button onClick={() => navigate("/setup")} className="text-xs font-bold shrink-0" style={{ color: "var(--info-dark)" }}>
              Setup starten →
            </button>
          </div>
        )}

        <div className="text-center mb-8">
          <img src={terrevoltLogo} alt="TerreVolt BV" className="h-12 mx-auto mb-3" />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Urenregistratie</p>
        </div>
        <div className="rounded-2xl p-6 space-y-6" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <div className="text-center">
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Welkom terug</h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Log in om door te gaan</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-medium">E-mailadres</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jan@terrevolt.nl" required className="pl-10 h-11" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-medium">Wachtwoord</Label>
                <button type="button" onClick={() => setShowForgot(!showForgot)} className="text-[11px] font-medium" style={{ color: "var(--accent)" }}>
                  Wachtwoord vergeten?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="pl-10 h-11" />
              </div>
            </div>
            <Button type="submit" className="w-full h-11 font-semibold gap-2" disabled={loading} style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", color: "#fff" }}>
              <LogIn className="h-4 w-4" />
              {loading ? "Laden..." : "Inloggen"}
            </Button>
          </form>

          {showForgot && (
            <div className="rounded-xl p-3 space-y-2 animate-fade-in" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
              <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Voer je e-mailadres in voor een reset link</p>
              <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="jan@terrevolt.nl" className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              <button onClick={handleForgotPassword} disabled={forgotLoading || !forgotEmail} className="w-full py-2 rounded-lg text-xs font-semibold disabled:opacity-40" style={{ background: "var(--accent-light)", border: "1px solid var(--accent-border)", color: "var(--accent)" }}>
                {forgotLoading ? "Verzenden..." : "Reset link sturen"}
              </button>
            </div>
          )}
        </div>
        <p className="text-center text-[11px] mt-6" style={{ color: "var(--text-muted)" }}>© {new Date().getFullYear()} TerreVolt BV · Alle rechten voorbehouden</p>
      </div>
    </div>
  );
}

export default function Auth() {
  if (DEV_MODE) return <DevLoginPicker />;
  return <RealLoginForm />;
}

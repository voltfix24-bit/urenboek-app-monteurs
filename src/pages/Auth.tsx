import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LogIn, Mail, Lock, User } from "lucide-react";
import terrevoltLogo from "@/assets/terrevolt-logo.svg";

export default function Auth() {
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
      if (error) {
        toast.error(error.message);
      } else {
        navigate("/");
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Controleer je e-mail om je account te bevestigen");
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full gradient-primary opacity-[0.07] blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full gradient-accent opacity-[0.07] blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative animate-scale-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={terrevoltLogo} alt="TerreVolt BV" className="h-12 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Urenregistratie</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-card shadow-elevated p-6 space-y-6">
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">
              {isLogin ? "Welkom terug" : "Account aanmaken"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isLogin ? "Log in om door te gaan" : "Vul je gegevens in"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-medium">Volledige naam</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jan Jansen"
                    required={!isLogin}
                    className="pl-10 h-11"
                  />
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-medium">E-mailadres</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jan@terrevolt.nl"
                  required
                  className="pl-10 h-11"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-medium">Wachtwoord</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="pl-10 h-11"
                />
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
            <button
              type="button"
              className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? "Nog geen account? Registreer" : "Al een account? Log in"}
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-6">
          © {new Date().getFullYear()} TerreVolt BV · Alle rechten voorbehouden
        </p>
      </div>
    </div>
  );
}

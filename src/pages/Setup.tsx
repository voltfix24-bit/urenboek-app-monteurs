import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import terrevoltLogo from "@/assets/terrevolt-logo.svg";
import { Spinner } from "@/components/ui/Spinner";

export default function Setup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [setupDone, setSetupDone] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", passwordConfirm: "" });
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    checkSetup();
  }, []);

  const checkSetup = async () => {
    // app_setup is readable by anon - check setup_done
    const { data: setup } = await supabase.from("app_setup" as any).select("setup_done").limit(1).maybeSingle() as any;
    if (setup?.setup_done) {
      setSetupDone(true);
    }
    // Also try to check user_roles (only works if authenticated)
    const { data: roles } = await supabase.from("user_roles").select("id").eq("role", "manager" as any).limit(1);
    if (roles && roles.length > 0) {
      setSetupDone(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!loading && setupDone) {
      toast.info("Setup al voltooid. Log in om door te gaan.");
      navigate("/login");
    }
  }, [loading, setupDone, navigate]);

  const fullName = `${form.firstName} ${form.lastName}`.trim();

  const passwordStrength = () => {
    const p = form.password;
    if (p.length < 8) return { label: "Te kort", color: "var(--danger)" };
    const hasNumbers = /\d/.test(p);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p);
    if (hasSpecial && hasNumbers) return { label: "Sterk", color: "var(--success)" };
    if (hasNumbers) return { label: "Goed", color: "var(--success)" };
    return { label: "Matig", color: "var(--warn-dot)" };
  };

  const isStep1Valid = form.firstName && form.lastName && form.email && form.password.length >= 8 && form.password === form.passwordConfirm;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await supabase.functions.invoke("setup-first-manager", {
        body: { email: form.email, password: form.password, fullName },
      });
      const data = res.data;
      const error = res.error;
      // When edge function returns non-2xx, data may contain the error message
      const errorMsg = data?.error || error?.message || "Fout bij setup";
      if (error || data?.error) {
        toast.error(errorMsg);
        setSubmitting(false);
        return;
      }

      // Auto-login
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: form.email, password: form.password,
      });
      if (loginError) {
        toast.error("Account aangemaakt, maar inloggen mislukt. Log handmatig in.");
        navigate("/login");
      } else {
        toast.success("Welkom! Je account is aangemaakt.");
        navigate("/dashboard");
      }
    } catch {
      toast.error("Er is een fout opgetreden");
    }
    setSubmitting(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
      <Spinner center={false} />
    </div>
  );

  const strength = passwordStrength();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "var(--bg-base)" }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-[0.07] blur-3xl" style={{ background: "var(--accent)" }} />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full opacity-[0.07] blur-3xl" style={{ background: "var(--accent)" }} />
      </div>

      <div className="w-full relative" style={{ maxWidth: 440 }}>
        <div className="text-center mb-8">
          <img src={terrevoltLogo} alt="TerreVolt BV" className="h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Welkom bij TerreVolt</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Maak je manager account aan om te beginnen.</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 mb-6">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{
                background: step > s ? "var(--success)" : step === s ? "var(--accent)" : "var(--bg-surface-2)",
                color: step >= s ? "#fff" : "var(--text-muted)",
              }}>
                {step > s ? "✓" : s}
              </div>
              <span className="text-xs font-medium" style={{ color: step === s ? "var(--text-primary)" : "var(--text-muted)" }}>
                {s === 1 ? "Jouw gegevens" : "Bevestigen"}
              </span>
              {s < 2 && <div className="w-8 h-px" style={{ background: "var(--border)" }} />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-6 space-y-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          {step === 1 && (
            <>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Voornaam</label>
                    <input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} placeholder="Jan" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Achternaam</label>
                    <input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} placeholder="Jansen" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>E-mailadres</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jan@terrevolt.nl" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Wachtwoord</label>
                  <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min. 8 tekens" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                  {form.password && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-2)" }}>
                        <div className="h-full rounded-full transition-all duration-300" style={{
                          width: strength.label === "Te kort" ? "25%" : strength.label === "Matig" ? "50%" : strength.label === "Goed" ? "75%" : "100%",
                          background: strength.color,
                        }} />
                      </div>
                      <span className="text-[10px] font-semibold" style={{ color: strength.color }}>{strength.label}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Wachtwoord herhalen</label>
                  <input type="password" value={form.passwordConfirm} onChange={e => setForm({ ...form, passwordConfirm: e.target.value })} placeholder="Herhaal wachtwoord" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                  {form.passwordConfirm && form.password !== form.passwordConfirm && (
                    <p className="text-[10px] font-medium" style={{ color: "var(--danger)" }}>Wachtwoorden komen niet overeen</p>
                  )}
                </div>
              </div>
              <button onClick={() => setStep(2)} disabled={!isStep1Valid} className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-40" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", color: "#fff" }}>
                Volgende →
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-3">
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Samenvatting</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Naam</span><span style={{ color: "var(--text-primary)" }}>{fullName}</span></div>
                  <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>E-mail</span><span style={{ color: "var(--text-primary)" }}>{form.email}</span></div>
                  <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Rol</span><span className="font-semibold" style={{ color: "var(--accent)" }}>Manager</span></div>
                </div>
                <label className="flex items-start gap-2 pt-2 cursor-pointer">
                  <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Ik ben de eerste beheerder van TerreVolt Urenregistratie</span>
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl text-sm font-semibold" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                  ← Terug
                </button>
                <button onClick={handleSubmit} disabled={!confirmed || submitting} className="flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-40" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", color: "#fff" }}>
                  {submitting ? "Bezig..." : "Account aanmaken"}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs mt-6">
          <button onClick={() => navigate("/login")} className="font-medium" style={{ color: "var(--accent)" }}>Al een account? → Inloggen</button>
        </p>
        <p className="text-center text-[11px] mt-4" style={{ color: "var(--text-muted)" }}>© {new Date().getFullYear()} TerreVolt BV · Alle rechten voorbehouden</p>
      </div>
    </div>
  );
}

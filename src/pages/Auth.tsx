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
  manager: "#3fff8b",
  uitvoerder: "#6e9bff",
  monteur: "#feb300",
  schakelmonteur: "#a78bfa",
  wv: "#ff716c",
};

function DevLoginPicker() {
  const selectUser = (devUser: DevUser) => {
    setDevUser(devUser);
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: "#030e20" }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-[0.07] blur-3xl" style={{ background: "#3fff8b" }} />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full opacity-[0.07] blur-3xl" style={{ background: "#3fff8b" }} />
      </div>

      <div className="w-full max-w-sm relative">
        <div className="text-center mb-8">
          <img src={terrevoltLogo} alt="TerreVolt BV" className="h-12 mx-auto mb-3" />
          <p className="text-sm" style={{ color: "#a0abc3" }}>Ontwikkelmodus</p>
        </div>

        <div className="rounded-2xl p-6 space-y-5" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
          <div className="text-center">
            <h1 className="text-xl font-bold" style={{ color: "#dae6ff" }}>Kies een rol</h1>
            <p className="text-xs mt-1" style={{ color: "#a0abc3" }}>Selecteer een gebruiker om de app te bekijken</p>
          </div>

          <div className="space-y-2">
            {DEV_USERS.map((devUser) => (
              <button
                key={devUser.id}
                onClick={() => selectUser(devUser)}
                className="w-full flex items-center gap-4 p-4 rounded-xl transition-all active:scale-[0.97]"
                style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = ROLE_COLORS[devUser.role] || "#3fff8b";
                  e.currentTarget.style.background = "#102038";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(106,118,140,0.15)";
                  e.currentTarget.style.background = "#030e20";
                }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `color-mix(in srgb, ${ROLE_COLORS[devUser.role] || "#3fff8b"} 15%, transparent)`, color: ROLE_COLORS[devUser.role] || "#3fff8b" }}
                >
                  {ROLE_ICONS[devUser.role] || <User className="h-6 w-6" />}
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold" style={{ color: "#dae6ff" }}>{devUser.label}</p>
                  <p className="text-[11px]" style={{ color: "#a0abc3" }}>{devUser.fullName}</p>
                </div>
                <div className="ml-auto">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ border: "2px solid rgba(106,118,140,0.15)" }}>
                    <span className="text-xs" style={{ color: "#a0abc3" }}>→</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="text-center pt-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium" style={{ background: "rgba(254,179,0,0.08)", color: "#feb300", border: "1px solid rgba(254,179,0,0.3)" }}>
              ⚠️ Dev-modus — geen echte authenticatie
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] mt-6" style={{ color: "#a0abc3" }}>
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
  const [resetSent, setResetSent] = useState(false);
  const navigate = useNavigate();


  useEffect(() => {
    const checkManagers = async () => {
      const { data: setup } = await supabase.from("app_setup" as any).select("setup_done").limit(1).maybeSingle() as any;
      if (setup?.setup_done) return;
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
      setResetSent(true);
    } else {
      toast.error("E-mailadres niet gevonden.");
    }
    setForgotLoading(false);
  };

  // ── VIEW 3: E-MAIL VERSTUURD ──
  if (resetSent) {
    return (
      <div style={{ background: "#030e20", minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
        {/* HEADER */}
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => { setResetSent(false); setShowForgot(false); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#3fff8b", display: "flex", alignItems: "center" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>arrow_back</span>
          </button>
          <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 16, color: "#dae6ff", textTransform: "uppercase", letterSpacing: "0.1em" }}>TERREVOLT</span>
          <div style={{ flex: 1 }} />
        </div>

        {/* SYSTEM STATUS */}
        <div style={{ position: "absolute", top: 16, right: 20, textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", marginBottom: 2 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3fff8b", boxShadow: "0 0 8px #3fff8b" }} />
            <span style={{ fontSize: 9, fontFamily: "Inter", color: "rgba(160,171,195,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>System: Auth_Link_Sent</span>
          </div>
          <span style={{ fontSize: 9, fontFamily: "Inter", color: "rgba(160,171,195,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Status: Success_200</span>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 32px" }}>
          <div style={{ width: "100%", maxWidth: 340, textAlign: "center" }}>
            {/* CHECK ICON WITH HUD */}
            <div style={{ position: "relative", width: 100, height: 100, margin: "0 auto 32px" }}>
              {/* Glow */}
              <div style={{ position: "absolute", inset: -20, borderRadius: "50%", background: "radial-gradient(circle, rgba(63,255,139,0.15) 0%, transparent 70%)" }} />
              {/* Circle */}
              <div style={{ width: 100, height: 100, borderRadius: "50%", background: "rgba(63,255,139,0.1)", border: "2px solid rgba(63,255,139,0.3)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48, color: "#3fff8b", fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              </div>
              {/* HUD brackets */}
              <div style={{ position: "absolute", top: -4, left: -4, width: 16, height: 16, borderTop: "2px solid rgba(63,255,139,0.4)", borderLeft: "2px solid rgba(63,255,139,0.4)" }} />
              <div style={{ position: "absolute", bottom: -4, right: -4, width: 16, height: 16, borderBottom: "2px solid rgba(63,255,139,0.4)", borderRight: "2px solid rgba(63,255,139,0.4)" }} />
            </div>

            {/* HEADLINE */}
            <h2 style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 26, color: "#dae6ff", marginBottom: 12 }}>E-mail verstuurd!</h2>

            {/* DESCRIPTION */}
            <p style={{ fontSize: 14, color: "#a0abc3", fontFamily: "Inter", lineHeight: 1.7, marginBottom: 28 }}>
              We hebben een link naar je e-mailadres gestuurd om je wachtwoord te herstellen. Check ook je spam-folder als je niets ziet.
            </p>

            {/* EMAIL CARD */}
            <div style={{ background: "rgba(63,255,139,0.05)", border: "1px solid rgba(63,255,139,0.15)", borderRadius: 14, padding: "14px 16px", marginBottom: 32, textAlign: "left" }}>
              <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.1em", color: "#a0abc3", display: "block", marginBottom: 6 }}>Bestemmingsadres</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#3fff8b" }}>alternate_email</span>
                <span style={{ fontSize: 15, fontFamily: "Inter", fontWeight: 600, color: "#dae6ff" }}>{forgotEmail}</span>
              </div>
            </div>

            {/* TERUG BUTTON */}
            <button onClick={() => { setResetSent(false); setShowForgot(false); }} style={{ width: "100%", height: 56, background: "#3fff8b", border: "none", borderRadius: 9999, color: "#005d2c", fontFamily: "Inter", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 20, boxShadow: "0 4px 20px rgba(63,255,139,0.25)" }}>
              Terug naar inloggen
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>login</span>
            </button>

            {/* RESEND LINK */}
            <button onClick={() => { handleForgotPassword(); }} disabled={forgotLoading} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontFamily: "Inter", color: "#a0abc3", display: "inline-flex", alignItems: "center", gap: 4 }}>
              Geen mail ontvangen?{" "}
              <span style={{ color: "#3fff8b", fontWeight: 700 }}>{forgotLoading ? "Verzenden..." : "Stuur opnieuw"}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showForgot) {
    return (
      <div style={{ background: "#030e20", minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
        {/* HEADER */}
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setShowForgot(false)} style={{ width: 40, height: 40, borderRadius: "50%", background: "none", border: "none", cursor: "pointer", color: "#3fff8b", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>arrow_back</span>
          </button>
          <span style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 16, color: "#dae6ff", textTransform: "uppercase", letterSpacing: "0.1em" }}>WACHTWOORD HERSTEL</span>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px" }}>
          {/* ICON */}
          <div style={{ position: "relative", marginBottom: 32 }}>
            <div style={{ width: 80, height: 80, borderRadius: 20, background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#3fff8b", fontVariationSettings: "'FILL' 1" }}>lock_reset</span>
            </div>
            <div style={{ position: "absolute", top: -8, right: -8, width: 32, height: 32, borderRadius: "50%", background: "#3fff8b", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#005d2c", fontVariationSettings: "'FILL' 1" }}>mail</span>
            </div>
          </div>

          {/* TEXT */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <h2 style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 24, color: "#dae6ff", marginBottom: 8 }}>Wachtwoord vergeten?</h2>
            <p style={{ fontSize: 14, color: "#a0abc3", fontFamily: "Inter", lineHeight: 1.6 }}>Geen zorgen. Vul je e-mailadres in en we sturen je instructies om je wachtwoord te herstellen.</p>
          </div>

          {/* EMAIL FIELD */}
          <div style={{ width: "100%", marginBottom: 20 }}>
            <label style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.1em", color: "#a0abc3", display: "block", marginBottom: 8 }}>E-mailadres</label>
            <div style={{ position: "relative" }}>
              <span className="material-symbols-outlined" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 20, color: "#a0abc3" }}>alternate_email</span>
              <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="naam@terrevolt.nl" style={{ width: "100%", height: 56, paddingLeft: 48, paddingRight: 16, background: "#000000", border: "none", borderRadius: 14, color: "#dae6ff", fontFamily: "Inter", fontSize: 15, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* SEND BUTTON */}
          <button onClick={handleForgotPassword} disabled={forgotLoading || !forgotEmail} style={{ width: "100%", height: 60, borderRadius: 16, background: "#3fff8b", border: "none", color: "#005d2c", fontFamily: "Manrope", fontWeight: 800, fontSize: 15, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: "0 8px 32px rgba(63,255,139,0.2)", marginBottom: 24, opacity: (!forgotEmail || forgotLoading) ? 0.5 : 1 }}>
            {forgotLoading ? "Verzenden..." : "HERSTEL INSTRUCTIES VERSTUREN"}
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>send</span>
          </button>

          {/* BACK LINK */}
          <div style={{ textAlign: "center" }}>
            <button onClick={() => setShowForgot(false)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: "#a0abc3", fontFamily: "Inter", fontWeight: 600, fontSize: 13 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
              Terug naar inloggen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#030e20", minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
      {/* Industrial grid background */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(63,255,139,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(63,255,139,0.03) 1px, transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" }} />

      {/* Corner brackets */}
      <div style={{ position: "absolute", top: 20, left: 20, width: 24, height: 24, borderTop: "2px solid rgba(63,255,139,0.3)", borderLeft: "2px solid rgba(63,255,139,0.3)" }} />
      <div style={{ position: "absolute", bottom: 20, right: 20, width: 24, height: 24, borderBottom: "2px solid rgba(63,255,139,0.3)", borderRight: "2px solid rgba(63,255,139,0.3)" }} />

      <div style={{ width: "100%", maxWidth: 400, padding: "0 28px" }}>
        {/* NO MANAGERS BANNER */}
        {noManagers && (
          <div style={{ background: "rgba(63,255,139,0.08)", border: "1px solid rgba(63,255,139,0.3)", borderRadius: 14, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "#3fff8b", fontFamily: "Inter" }}>Eerste keer? Maak je manager account aan via de setup pagina.</span>
            <button onClick={() => navigate("/setup")} style={{ background: "none", border: "none", cursor: "pointer", color: "#3fff8b", fontFamily: "Inter", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>Setup →</button>
          </div>
        )}

        {/* BRANDING */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#3fff8b", fontVariationSettings: "'FILL' 1" }}>bolt</span>
          </div>
          <h1 style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: 28, color: "#dae6ff", marginBottom: 4 }}>
            TerreVolt{" "}<span style={{ color: "#3fff8b" }}>BV</span>
          </h1>
          <p style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.3em", color: "#a0abc3" }}>URENREGISTRATIE PORTAAL</p>
        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Email */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.1em", color: "#a0abc3", display: "block", marginBottom: 8 }}>E-mail of Gebruikersnaam</label>
            <div style={{ position: "relative" }}>
              <span className="material-symbols-outlined" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 20, color: "#a0abc3" }}>person</span>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="naam@terrevolt.nl" required style={{ width: "100%", height: 56, paddingLeft: 48, paddingRight: 16, background: "#000000", border: "none", borderRadius: 14, color: "#dae6ff", fontFamily: "Inter", fontSize: 15, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.1em", color: "#a0abc3", display: "block", marginBottom: 8 }}>Wachtwoord</label>
            <div style={{ position: "relative" }}>
              <span className="material-symbols-outlined" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 20, color: "#a0abc3" }}>lock</span>
              <input type={password ? "password" : "text"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••••••" required minLength={6} style={{ width: "100%", height: 56, paddingLeft: 48, paddingRight: 48, background: "#000000", border: "none", borderRadius: 14, color: "#dae6ff", fontFamily: "Inter", fontSize: 15, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Remember + Forgot */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" style={{ width: 18, height: 18, accentColor: "#3fff8b" }} />
              <span style={{ fontSize: 13, color: "#a0abc3", fontFamily: "Inter" }}>Inloggegevens onthouden</span>
            </label>
            <button type="button" onClick={() => setShowForgot(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontFamily: "Inter", fontWeight: 700, color: "#a0abc3" }}>Wachtwoord vergeten?</button>
          </div>

          {/* LOGIN BUTTON */}
          <button type="submit" disabled={loading} style={{ width: "100%", height: 60, borderRadius: 16, background: "#3fff8b", border: "none", color: "#005d2c", fontFamily: "Manrope", fontWeight: 800, fontSize: 16, textTransform: "uppercase", letterSpacing: "0.15em", cursor: "pointer", boxShadow: "0 8px 32px rgba(63,255,139,0.25)", opacity: loading ? 0.6 : 1 }}>
            {loading ? "Bezig..." : "INLOGGEN"}
          </button>
        </form>

        {/* DIVIDER */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "28px 0" }}>
          <div style={{ flex: 1, height: 1, background: "rgba(61,72,93,0.4)" }} />
          <span style={{ fontSize: 11, color: "#a0abc3", fontFamily: "Inter", whiteSpace: "nowrap" }}>of snelle toegang</span>
          <div style={{ flex: 1, height: 1, background: "rgba(61,72,93,0.4)" }} />
        </div>

        {/* FACEID */}
        <div style={{ textAlign: "center" }}>
          <button type="button" style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(63,255,139,0.08)", border: "1px solid rgba(63,255,139,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#3fff8b" }}>face</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#a0abc3", fontFamily: "Inter" }}>Inloggen met FaceID</span>
          </button>
        </div>

        {/* FOOTER */}
        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 40 }}>
          {[
            { dot: true, text: "System Online" },
            { text: "v2.4.0-Tactical" },
            { text: "Support: 0800-VOLT" },
          ].map((item, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "rgba(160,171,195,0.5)", fontFamily: "Inter", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {item.dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#3fff8b", boxShadow: "0 0 6px #3fff8b" }} />}
              {item.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Auth() {
  if (DEV_MODE) return <DevLoginPicker />;
  return <RealLoginForm />;
}

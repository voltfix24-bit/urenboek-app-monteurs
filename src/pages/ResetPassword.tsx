import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import terrevoltLogo from "@/assets/terrevolt-logo.svg";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Supabase handles the token from URL hash via onAuthStateChange
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        // User arrived via reset link - show form
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async () => {
    if (password.length < 8) { setError("Wachtwoord moet minimaal 8 tekens zijn"); return; }
    if (password !== passwordConfirm) { setError("Wachtwoorden komen niet overeen"); return; }

    setLoading(true);
    setError("");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2000);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "#030e20" }}>
      <div className="w-full relative" style={{ maxWidth: 440 }}>
        <div className="text-center mb-8">
          <img src={terrevoltLogo} alt="TerreVolt BV" className="h-12 mx-auto mb-3" />
          <h1 className="text-xl font-bold" style={{ color: "#dae6ff" }}>Wachtwoord instellen</h1>
          <p className="text-sm mt-1" style={{ color: "#a0abc3" }}>Kies een nieuw wachtwoord</p>
        </div>

        <div className="rounded-2xl p-6 space-y-4" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
          {success ? (
            <div className="text-center py-4">
              <p className="text-sm font-semibold" style={{ color: "#3fff8b" }}>✓ Wachtwoord gewijzigd!</p>
              <p className="text-xs mt-1" style={{ color: "#a0abc3" }}>Je wordt doorgestuurd naar inloggen...</p>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Nieuw wachtwoord</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 tekens" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Wachtwoord herhalen</label>
                <input type="password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} placeholder="Herhaal wachtwoord" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
              </div>
              {error && <p className="text-xs font-medium" style={{ color: "#ff716c" }}>{error}</p>}
              <button onClick={handleReset} disabled={loading || !password || !passwordConfirm} className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-40" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)", color: "#fff" }}>
                {loading ? "Bezig..." : "Wachtwoord instellen"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

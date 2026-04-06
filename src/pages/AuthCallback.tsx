import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Spinner } from "@/components/ui/Spinner";
import terrevoltLogo from "@/assets/terrevolt-logo.svg";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const [error, setError] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!session) setError(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [session]);

  useEffect(() => {
    if (authLoading || !session) return;

    const checkAndActivate = async () => {
      // Get profile to check account_status
      const { data: profile } = await supabase
        .from("profiles")
        .select("account_status")
        .eq("user_id", session.user.id)
        .single();

      if (profile?.account_status === "invited") {
        // Activate account
        await supabase.functions.invoke("activate-account");
        navigate("/onboarding");
      } else {
        navigate("/");
      }
    };

    checkAndActivate();
  }, [session, authLoading, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "var(--bg-base)" }}>
        <div className="w-full text-center" style={{ maxWidth: 440 }}>
          <img src={terrevoltLogo} alt="TerreVolt BV" className="h-12 mx-auto mb-4" />
          <div className="rounded-2xl p-6 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--danger)" }}>Link verlopen of ongeldig</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Vraag je manager om een nieuwe uitnodiging.</p>
            <button onClick={() => navigate("/login")} className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
              Terug naar inloggen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "var(--bg-base)" }}>
      <Spinner />
      <p className="text-sm mt-4" style={{ color: "var(--text-muted)" }}>Account activeren...</p>
    </div>
  );
}

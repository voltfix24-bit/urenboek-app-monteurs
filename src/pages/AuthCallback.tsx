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
    }, 8000);
    return () => clearTimeout(timer);
  }, [session]);

  useEffect(() => {
    if (authLoading || !session) return;

    const checkAndActivate = async () => {
      // Check of er al een profiel is
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, account_status, full_name")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!profile) {
        // Eerste Microsoft login — profiel bestaat mogelijk nog niet
        // handle_new_user trigger maakt het profiel aan, maar check user_roles
        // Wacht kort zodat de trigger klaar is
        await new Promise((r) => setTimeout(r, 1000));

        const { data: profileRetry } = await supabase
          .from("profiles")
          .select("id, account_status")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (!profileRetry) {
          // Geen profiel en geen trigger — geen toegang
          await supabase.auth.signOut();
          navigate("/login?error=geen_toegang");
          return;
        }

        // Check of deze user een manager rol heeft
        const { data: rol } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (rol?.role === "manager") {
          // Update profiel status naar active
          await supabase
            .from("profiles")
            .update({
              account_status: "active",
              activated_at: new Date().toISOString(),
            })
            .eq("user_id", session.user.id);

          navigate("/dashboard");
        } else {
          // Geen manager rol — geen toegang via Microsoft
          await supabase.auth.signOut();
          navigate("/login?error=geen_toegang");
        }
        return;
      }

      // Bestaand profiel — normale flow
      if (profile.account_status === "invited") {
        await supabase.functions.invoke("activate-account");
        navigate("/onboarding");
      } else if (profile.account_status === "onboarding") {
        navigate("/onboarding-welkom");
      } else {
        navigate("/");
      }
    };

    checkAndActivate();
  }, [session, authLoading, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "#030e20" }}>
        <div className="w-full text-center" style={{ maxWidth: 440 }}>
          <img src={terrevoltLogo} alt="TerreVolt BV" className="h-12 mx-auto mb-4" />
          <div className="rounded-2xl p-6 space-y-3" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
            <p className="text-sm font-semibold" style={{ color: "#ff716c" }}>Link verlopen of ongeldig</p>
            <p className="text-xs" style={{ color: "#a0abc3" }}>Vraag je manager om een nieuwe uitnodiging.</p>
            <button onClick={() => navigate("/login")} className="text-xs font-semibold" style={{ color: "#3fff8b" }}>
              Terug naar inloggen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "#030e20" }}>
      <Spinner />
      <p className="text-sm mt-4" style={{ color: "#a0abc3" }}>Account activeren...</p>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";
import { ChevronLeft, Check } from "lucide-react";
import terrevoltLogo from "@/assets/terrevolt-logo.svg";
import CertificatenForm from "@/components/CertificatenForm";

const DAGEN = [
  { key: 1, label: "Ma" }, { key: 2, label: "Di" }, { key: 3, label: "Wo" },
  { key: 4, label: "Do" }, { key: 5, label: "Vr" }, { key: 6, label: "Za" }, { key: 0, label: "Zo" },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { session, user, roles } = useAuth();
  const { refetch: refetchProfile } = useProfile();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);
  
  const [form, setForm] = useState({ telefoon: "", adres: "", rijbewijs: false, noodcontact_naam: "", noodcontact_tel: "" });
  const [vrijeDagen, setVrijeDagen] = useState<number[]>([]);

  useEffect(() => {
    if (!user) return;
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
    if (profile) {
      setProfileData(profile);
      setForm({
        telefoon: (profile as any).telefoon || "",
        adres: (profile as any).adres || "",
        rijbewijs: (profile as any).rijbewijs || false,
        noodcontact_naam: (profile as any).noodcontact_naam || "",
        noodcontact_tel: (profile as any).noodcontact_tel || "",
      });
      setVrijeDagen((profile as any).vaste_vrije_dagen || []);

    setLoading(false);
  };

  const saveStep2 = async () => {
    if (!profileData) return;
    await supabase.from("profiles").update({
      telefoon: form.telefoon,
      adres: form.adres,
      rijbewijs: form.rijbewijs,
      noodcontact_naam: form.noodcontact_naam || null,
      noodcontact_tel: form.noodcontact_tel || null,
    } as any).eq("id", profileData.id);
    setStep(3);
  };

  const finish = async () => {
    if (!profileData) return;
    await supabase.from("profiles").update({
      vaste_vrije_dagen: vrijeDagen,
    } as any).eq("id", profileData.id);

    // Activate account
    await supabase.functions.invoke("activate-account");

    localStorage.setItem("onboarding_done", "true");
    refetchProfile();
    toast.success("Je profiel is compleet! Welkom bij TerreVolt 🎉");
    navigate("/");
  };


  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
    </div>
  );

  const progress = (step / 4) * 100;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-base)" }}>
      {/* Progress bar */}
      <div className="w-full h-1" style={{ background: "var(--bg-surface-2)" }}>
        <div className="h-full rounded-r-full transition-all duration-300 ease-out" style={{ width: `${progress}%`, background: "var(--accent)" }} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        {step > 1 ? (
          <button onClick={() => setStep(step - 1)} className="flex items-center gap-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            <ChevronLeft className="h-4 w-4" /> Terug
          </button>
        ) : <div />}
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Stap {step} van 4</span>
      </div>

      <div className="flex-1 flex flex-col items-center px-6 pb-8" style={{ maxWidth: 440, margin: "0 auto", width: "100%" }}>
        <img src={terrevoltLogo} alt="TerreVolt" className="h-10 mb-4" />
        <h1 className="text-xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
          Welkom, {profileData?.full_name?.split(" ")[0]}!
        </h1>

        {step === 1 && (
          <div className="w-full space-y-4 mt-6">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Je account is aangemaakt door je manager. Laten we je profiel even completeren. Dit duurt minder dan 2 minuten.
            </p>
            <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2"><Check className="h-4 w-4" style={{ color: "var(--success)" }} /><span className="text-sm" style={{ color: "var(--text-primary)" }}>Naam: {profileData?.full_name}</span></div>
              <div className="flex items-center gap-2"><Check className="h-4 w-4" style={{ color: "var(--success)" }} /><span className="text-sm" style={{ color: "var(--text-primary)" }}>E-mail: {user?.email}</span></div>
              <div className="flex items-center gap-2"><Check className="h-4 w-4" style={{ color: "var(--success)" }} /><span className="text-sm" style={{ color: "var(--text-primary)" }}>Rol: {roles[0] || "medewerker"}</span></div>
              {profileData?.telefoon && <div className="flex items-center gap-2"><Check className="h-4 w-4" style={{ color: "var(--success)" }} /><span className="text-sm" style={{ color: "var(--text-primary)" }}>Telefoon: {profileData.telefoon}</span></div>}
            </div>
            <button onClick={() => setStep(2)} className="w-full py-3 rounded-xl text-sm font-bold" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", color: "#fff" }}>
              Starten →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="w-full space-y-4 mt-6">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Jouw gegevens controleren</p>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Telefoonnummer</label>
                <input value={form.telefoon} onChange={e => setForm({ ...form, telefoon: e.target.value })} placeholder="06-12345678" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Adres</label>
                <input value={form.adres} onChange={e => setForm({ ...form, adres: e.target.value })} placeholder="Straat 1, Stad" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>Rijbewijs</span>
                <button onClick={() => setForm({ ...form, rijbewijs: !form.rijbewijs })} className="w-12 h-7 rounded-full transition-colors" style={{ background: form.rijbewijs ? "var(--accent)" : "var(--bg-surface-2)" }}>
                  <div className="w-5 h-5 rounded-full bg-white shadow transition-transform" style={{ transform: form.rijbewijs ? "translateX(22px)" : "translateX(3px)" }} />
                </button>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Noodcontact naam</label>
                <input value={form.noodcontact_naam} onChange={e => setForm({ ...form, noodcontact_naam: e.target.value })} placeholder="Naam" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Noodcontact telefoon</label>
                <input value={form.noodcontact_tel} onChange={e => setForm({ ...form, noodcontact_tel: e.target.value })} placeholder="06-12345678" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>
            </div>
            <button onClick={saveStep2} className="w-full py-3 rounded-xl text-sm font-bold" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", color: "#fff" }}>
              Opslaan & volgende →
            </button>
          </div>
        )}

        {step === 3 && profileData && (
          <div className="w-full space-y-4 mt-6">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Jouw certificaten</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Vink aan welke certificaten je hebt en voeg de geldigheidsdata toe.
            </p>
            <CertificatenForm
              medewerker_id={profileData.id}
              onSaved={() => setStep(4)}
              onCancel={() => setStep(4)}
            />
          </div>
        )}

        {step === 4 && (
          <div className="w-full space-y-4 mt-6">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Vaste vrije dagen</p>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Welke dagen ben je standaard niet beschikbaar?</p>
            <div className="flex gap-2">
              {DAGEN.map(d => {
                const active = vrijeDagen.includes(d.key);
                return (
                  <button key={d.key} onClick={() => setVrijeDagen(active ? vrijeDagen.filter(v => v !== d.key) : [...vrijeDagen, d.key])} className="flex-1 py-3 rounded-xl text-sm font-semibold" style={{
                    background: active ? "var(--accent-light)" : "var(--bg-surface)",
                    border: active ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                    color: active ? "var(--accent)" : "var(--text-muted)",
                  }}>{d.label}</button>
                );
              })}
            </div>
            <button onClick={finish} className="w-full py-3 rounded-xl text-sm font-bold" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", color: "#fff" }}>
              Voltooien ✓
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

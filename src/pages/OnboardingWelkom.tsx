import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { Spinner } from "@/components/ui/Spinner";
import terrevoltLogo from "@/assets/terrevolt-logo.svg";
import { Check, ChevronRight, Download, AlertTriangle } from "lucide-react";
import { formatDatum } from "@/lib/formatting";
import { CONTRACT_STATUS_CONFIG } from "@/lib/contractStatus";

interface OnboardingProfile {
  id: string;
  full_name: string;
  telefoon: string;
  adres: string;
  geboortedatum: string | null;
  rijbewijs: boolean;
  vaste_vrije_dagen: number[];
  onboarding_voltooid: boolean;
  onboarding_voltooid_op: string | null;
  account_status: string;
}

export default function OnboardingWelkom() {
  const { user } = useAuth();
  const { profileId, refetch: refetchProfileCtx } = useProfile();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [certCount, setCertCount] = useState(0);
  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [afronden, setAfronden] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user || !profileId) return;
    const [{ data: p }, { count: cc }, { data: c }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, telefoon, adres, geboortedatum, rijbewijs, vaste_vrije_dagen, onboarding_voltooid, onboarding_voltooid_op, account_status").eq("user_id", user.id).single(),
      supabase.from("certificaten").select("id", { count: "exact", head: true }).eq("medewerker_id", profileId),
      supabase.from("contracten").select("id, contract_nummer, status, pdf_path, startdatum, einddatum").eq("profiel_id", profileId).in("status", ["ondertekend_beiden", "ondertekend_ot"]).order("aangemaakt_op", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (p) setProfile(p as any);
    setCertCount(cc || 0);
    setContract(c);
    setLoading(false);
  }, [user, profileId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-navy)" }}><Spinner center={false} /></div>;
  if (!profile) return null;

  const voornaam = profile.full_name.split(" ")[0];

  // Step completion
  const stap1 = !!(profile.geboortedatum && profile.telefoon && profile.adres);
  const stap2 = certCount >= 1;
  const stap3 = true; // vaste_vrije_dagen always has a default
  const stap4 = profile.onboarding_voltooid;

  const stappen = [stap1, stap2, stap3, stap4];
  const voltooid = stappen.filter(Boolean).length;
  const percentage = Math.round((voltooid / 4) * 100);
  const allesKlaar = stap1 && stap2 && stap3;

  const handleAfronden = async () => {
    if (!profile) return;
    setAfronden(true);
    if (!await mutate(supabase.from("profiles").update({
      onboarding_voltooid: true,
      onboarding_voltooid_op: new Date().toISOString(),
    } as any).eq("id", profile.id))) { setAfronden(false); return; }

    // Notify managers
    const { data: managers } = await supabase.from("user_roles").select("user_id").eq("role", "manager");
    if (managers) {
      for (const m of managers) {
        const { data: mp } = await supabase.from("profiles").select("id").eq("user_id", m.user_id).single();
        if (mp) {
          await supabase.from("mededelingen").insert({
            titel: `${profile.full_name} heeft profiel afgerond`,
            inhoud: `${profile.full_name} heeft zijn/haar onboarding voltooid. Controleer de gegevens en certificaten om hem/haar te activeren.`,
            verzonden_door: profile.id,
            ontvanger_type: "persoon",
            ontvanger_id: mp.id,
            urgentie: "urgent",
          });
        }
      }
    }
    toast.success("Profiel afgerond! Je manager wordt op de hoogte gesteld.");
    setAfronden(false);
    fetchData();
    refetchProfileCtx();
  };

  async function downloadPdf() {
    if (!contract?.pdf_path) return;
    const newWin = window.open("", "_blank");
    const { data, error } = await supabase.storage.from("contracten").createSignedUrl(contract.pdf_path, 3600);
    if (error || !data?.signedUrl) {
      if (newWin) newWin.close();
      return;
    }
    if (newWin) newWin.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  }

  const stappenData = [
    { label: "Persoonlijke gegevens", sub: "Naam, adres, geboortedatum", compleet: stap1, link: "/profiel" },
    { label: "Certificaten", sub: "VCA, BEI, rijbewijs etc.", compleet: stap2, link: "/profiel" },
    { label: "Voorkeursinstellingen", sub: "Vaste vrije dagen, rijbewijs", compleet: stap3, link: "/profiel" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--app-navy)" }}>
      <div className="mx-auto px-5 py-8 space-y-6" style={{ maxWidth: 480 }}>
        {/* Header */}
        <div className="text-center space-y-3">
          <img src={terrevoltLogo} alt="TerreVolt" className="h-10 mx-auto" />
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Welkom, {voornaam}! 👋</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Vul je gegevens aan om aan de slag te kunnen.</p>
        </div>

        {/* Progress */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{voltooid} van 4 stappen voltooid</span>
            <span className="text-sm font-bold" style={{ color: "var(--accent)", fontFamily: "DM Mono, monospace" }}>{percentage}%</span>
          </div>
          <div className="w-full rounded-full overflow-hidden" style={{ height: 8, background: "var(--bg-surface-2)" }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percentage}%`, background: "var(--accent)" }} />
          </div>
        </div>

        {/* Step cards */}
        <div className="space-y-3">
          {stappenData.map((s, i) => (
            <button key={i} onClick={() => navigate(s.link)} className="w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all active:scale-[0.98]" style={{
              background: s.compleet ? "var(--accent-light)" : "var(--bg-surface)",
              border: s.compleet ? "1px solid var(--accent-border)" : "1px solid var(--planning-border-soft)",
            }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{
                background: s.compleet ? "var(--accent)" : "var(--bg-surface-2)",
                color: s.compleet ? "#fff" : "var(--text-muted)",
              }}>
                {s.compleet ? <Check className="h-4 w-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{s.label}</p>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{s.sub}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--text-muted)" }} />
            </button>
          ))}

          {/* Step 4: Afronden */}
          <div className="p-4 rounded-2xl space-y-3" style={{
            background: stap4 ? "var(--accent-light)" : "var(--bg-surface)",
            border: stap4 ? "1px solid var(--accent-border)" : "1px solid var(--planning-border-soft)",
            opacity: allesKlaar || stap4 ? 1 : 0.5,
          }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{
                background: stap4 ? "var(--accent)" : "var(--bg-surface-2)",
                color: stap4 ? "#fff" : "var(--text-muted)",
              }}>
                {stap4 ? <Check className="h-4 w-4" /> : <span className="text-xs font-bold">4</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Profiel afronden</p>
                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {stap4 ? "Afgerond — wacht op verificatie" : allesKlaar ? "Klaar om in te dienen" : "Voltooi eerst stap 1-3"}
                </p>
              </div>
            </div>
            {!stap4 && allesKlaar && (
              <button onClick={handleAfronden} disabled={afronden} className="w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
                {afronden ? "Bezig..." : "Afronden →"}
              </button>
            )}
          </div>
        </div>

        {/* Status banner */}
        {!profile.onboarding_voltooid ? (
          <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
            <span className="text-lg">⏳</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--warn-text)" }}>Je account is nog niet actief</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Vul alle stappen in zodat je manager je kan verifiëren.</p>
            </div>
          </div>
        ) : profile.account_status === "onboarding" ? (
          <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: "rgba(110,155,255,0.1)", border: "1px solid rgba(110,155,255,0.3)" }}>
            <span className="text-lg">✓</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--info)" }}>Profiel ingediend</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Je manager verifieert je gegevens. Je ontvangt een bericht zodra je account actief is.</p>
            </div>
          </div>
        ) : null}

        {/* Contract section */}
        {contract && (
          <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Contract</p>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{contract.contract_nummer}</span>
              {(() => {
                const cfg = CONTRACT_STATUS_CONFIG[contract.status];
                return cfg ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>{cfg.icoon} {cfg.label}</span> : null;
              })()}
            </div>
            {contract.pdf_path && (
              <button onClick={downloadPdf} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--accent)" }}>
                <Download className="h-3.5 w-3.5" /> Download contract PDF
              </button>
            )}
          </div>
        )}

        {/* Navigate to app */}
        <div className="text-center pt-2">
          <button onClick={() => {
            if (!profile.onboarding_voltooid && profile.account_status === "onboarding") {
              toast("Je account is nog niet actief. Je kunt nog geen uren boeken of worden ingepland.", { icon: "⚠️" });
            }
            navigate("/");
          }} className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
            Ga naar de app →
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";
import { ChevronLeft, Check } from "lucide-react";
import terrevoltLogo from "@/assets/terrevolt-logo.svg";
import CertificatenForm from "@/components/CertificatenForm";
import { Spinner } from "@/components/ui/Spinner";

const DAGEN = [
  { key: 1, label: "Ma" }, { key: 2, label: "Di" }, { key: 3, label: "Wo" },
  { key: 4, label: "Do" }, { key: 5, label: "Vr" }, { key: 6, label: "Za" }, { key: 0, label: "Zo" },
];

const STAPPEN = ["Welkom", "Jouw gegevens", "Factuurgegevens", "Certificaten", "Vrije dagen"];
const TOTAL_STEPS = STAPPEN.length;

export default function Onboarding() {
  const navigate = useNavigate();
  const { session, user, roles } = useAuth();
  const { refetch: refetchProfile } = useProfile();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);
  
  const [form, setForm] = useState({ telefoon: "", adres: "", rijbewijs: false, noodcontact_naam: "", noodcontact_tel: "" });
  const [zzpForm, setZzpForm] = useState({ bedrijfsnaam: "", kvk_nummer: "", btw_nummer: "", iban: "", factuuradres: "", betalingstermijn: 30 });
  const [zzpErrors, setZzpErrors] = useState<Record<string, string>>({});
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
      setZzpForm({
        bedrijfsnaam: (profile as any).bedrijfsnaam || "",
        kvk_nummer: (profile as any).kvk_nummer || "",
        btw_nummer: (profile as any).btw_nummer || "",
        iban: (profile as any).iban || "",
        factuuradres: (profile as any).factuuradres || "",
        betalingstermijn: (profile as any).betalingstermijn || 30,
      });
      setVrijeDagen((profile as any).vaste_vrije_dagen || []);
    }
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

  const validateZzp = (): boolean => {
    const e: Record<string, string> = {};
    if (zzpForm.kvk_nummer && !/^\d{8}$/.test(zzpForm.kvk_nummer.trim())) e.kvk_nummer = "8 cijfers vereist";
    if (zzpForm.btw_nummer && !/^NL\d{9}B\d{2}$/.test(zzpForm.btw_nummer.trim())) e.btw_nummer = "Format: NL123456789B01";
    if (zzpForm.iban) {
      const clean = zzpForm.iban.replace(/\s/g, "");
      if (!/^NL[A-Z0-9]+$/.test(clean)) e.iban = "Moet beginnen met NL";
    }
    // Required: kvk + iban
    if (!zzpForm.kvk_nummer.trim()) e.kvk_nummer = "KVK-nummer is verplicht";
    if (!zzpForm.iban.trim()) e.iban = "IBAN is verplicht";
    setZzpErrors(e);
    return Object.keys(e).length === 0;
  };

  const saveZzp = async () => {
    if (!profileData || !validateZzp()) return;
    await supabase.from("profiles").update({
      bedrijfsnaam: zzpForm.bedrijfsnaam.trim() || null,
      kvk_nummer: zzpForm.kvk_nummer.trim() || null,
      btw_nummer: zzpForm.btw_nummer.trim() || null,
      iban: zzpForm.iban.replace(/\s/g, "").trim() || null,
      factuuradres: zzpForm.factuuradres.trim() || null,
      betalingstermijn: zzpForm.betalingstermijn,
    } as any).eq("id", profileData.id);
    toast.success("Factuurgegevens opgeslagen ✓");
    setStep(4);
  };

  const skipZzp = () => {
    toast.info("Je kunt dit later invullen via je Profiel → ZZP gegevens");
    setStep(4);
  };

  const finish = async () => {
    if (!profileData) return;
    await supabase.from("profiles").update({
      vaste_vrije_dagen: vrijeDagen,
    } as any).eq("id", profileData.id);
    await supabase.functions.invoke("activate-account");
    localStorage.setItem("onboarding_done", "true");
    refetchProfile();
    toast.success("Je profiel is compleet! Welkom bij TerreVolt 🎉");
    navigate("/");
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#030e20" }}>
      <Spinner center={false} />
    </div>
  );

  const progress = (step / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#030e20" }}>
      {/* Progress bar */}
      <div className="w-full h-1" style={{ background: "#102038" }}>
        <div className="h-full rounded-r-full transition-all duration-300 ease-out" style={{ width: `${progress}%`, background: "#3fff8b" }} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        {step > 1 ? (
          <button onClick={() => setStep(step - 1)} className="flex items-center gap-1 text-sm" style={{ color: "#a0abc3" }}>
            <ChevronLeft className="h-4 w-4" /> Terug
          </button>
        ) : <div />}
        <span className="text-xs font-medium" style={{ color: "#a0abc3" }}>Stap {step} van {TOTAL_STEPS}</span>
      </div>

      <div className="flex-1 flex flex-col items-center px-6 pb-8" style={{ maxWidth: 440, margin: "0 auto", width: "100%" }}>
        <img src={terrevoltLogo} alt="TerreVolt" className="h-10 mb-4" />
        <h1 className="text-xl font-bold mb-1" style={{ color: "#dae6ff" }}>
          Welkom, {profileData?.full_name?.split(" ")[0]}!
        </h1>

        {step === 1 && (
          <div className="w-full space-y-4 mt-6">
            <p className="text-sm" style={{ color: "#a0abc3" }}>
              Je account is aangemaakt door je manager. Laten we je profiel even completeren. Dit duurt minder dan 2 minuten.
            </p>
            <div className="rounded-2xl p-4 space-y-2" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
              <div className="flex items-center gap-2"><Check className="h-4 w-4" style={{ color: "#3fff8b" }} /><span className="text-sm" style={{ color: "#dae6ff" }}>Naam: {profileData?.full_name}</span></div>
              <div className="flex items-center gap-2"><Check className="h-4 w-4" style={{ color: "#3fff8b" }} /><span className="text-sm" style={{ color: "#dae6ff" }}>E-mail: {user?.email}</span></div>
              <div className="flex items-center gap-2"><Check className="h-4 w-4" style={{ color: "#3fff8b" }} /><span className="text-sm" style={{ color: "#dae6ff" }}>Rol: {roles[0] || "medewerker"}</span></div>
              {profileData?.telefoon && <div className="flex items-center gap-2"><Check className="h-4 w-4" style={{ color: "#3fff8b" }} /><span className="text-sm" style={{ color: "#dae6ff" }}>Telefoon: {profileData.telefoon}</span></div>}
            </div>
            <button onClick={() => setStep(2)} className="w-full py-3 rounded-xl text-sm font-bold" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)", color: "#fff" }}>
              Starten →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="w-full space-y-4 mt-6">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Jouw gegevens controleren</p>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium" style={{ color: "#a0abc3" }}>Telefoonnummer</label>
                <input value={form.telefoon} onChange={e => setForm({ ...form, telefoon: e.target.value })} placeholder="06-12345678" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium" style={{ color: "#a0abc3" }}>Adres</label>
                <input value={form.adres} onChange={e => setForm({ ...form, adres: e.target.value })} placeholder="Straat 1, Stad" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm" style={{ color: "#dae6ff" }}>Rijbewijs</span>
                <button onClick={() => setForm({ ...form, rijbewijs: !form.rijbewijs })} className="w-12 h-7 rounded-full transition-colors" style={{ background: form.rijbewijs ? "#3fff8b" : "#102038" }}>
                  <div className="w-5 h-5 rounded-full bg-white shadow transition-transform" style={{ transform: form.rijbewijs ? "translateX(22px)" : "translateX(3px)" }} />
                </button>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium" style={{ color: "#a0abc3" }}>Noodcontact naam</label>
                <input value={form.noodcontact_naam} onChange={e => setForm({ ...form, noodcontact_naam: e.target.value })} placeholder="Naam" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium" style={{ color: "#a0abc3" }}>Noodcontact telefoon</label>
                <input value={form.noodcontact_tel} onChange={e => setForm({ ...form, noodcontact_tel: e.target.value })} placeholder="06-12345678" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
              </div>
            </div>
            <button onClick={saveStep2} className="w-full py-3 rounded-xl text-sm font-bold" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)", color: "#fff" }}>
              Opslaan & volgende →
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="w-full space-y-4 mt-6">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Jouw ZZP gegevens</p>
            <p className="text-sm" style={{ color: "#a0abc3" }}>
              TerreVolt heeft deze gegevens nodig om een inkooporder op jouw naam te kunnen opstellen. Je ontvangt dit document als basis voor je factuur.
            </p>

            {/* Info blokje */}
            <div className="rounded-xl p-3" style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)" }}>
              <p className="text-xs font-semibold mb-1" style={{ color: "#3fff8b" }}>✓ Wat is een inkooporder?</p>
              <p className="text-xs" style={{ color: "#a0abc3" }}>
                Als jouw uren zijn goedgekeurd, maakt TerreVolt een inkooporder voor je aan. Jij stuurt daarna een factuur naar TerreVolt op basis van dat document.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium" style={{ color: "#a0abc3" }}>Bedrijfsnaam</label>
                <input value={zzpForm.bedrijfsnaam} onChange={e => setZzpForm({ ...zzpForm, bedrijfsnaam: e.target.value })} placeholder="Hassan el Garrat Elektrotechniek" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
                <p className="text-[10px]" style={{ color: "#a0abc3" }}>Of je volledige naam als je geen apart bedrijf hebt</p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium" style={{ color: zzpErrors.kvk_nummer ? "#ff716c" : "#a0abc3" }}>KVK-nummer *</label>
                <input value={zzpForm.kvk_nummer} onChange={e => { setZzpForm({ ...zzpForm, kvk_nummer: e.target.value }); if (zzpErrors.kvk_nummer) setZzpErrors(prev => { const n = { ...prev }; delete n.kvk_nummer; return n; }); }} placeholder="12345678" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "rgba(10,26,48,0.7)", border: zzpErrors.kvk_nummer ? "1.5px solid #ff716c" : "1px solid rgba(106,118,140,0.15)", color: "#dae6ff", fontFamily: "DM Mono, monospace" }} />
                <p className="text-[10px]" style={{ color: zzpErrors.kvk_nummer ? "#ff716c" : "#a0abc3" }}>{zzpErrors.kvk_nummer || "8 cijfers, te vinden op kvk.nl"}</p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium" style={{ color: zzpErrors.btw_nummer ? "#ff716c" : "#a0abc3" }}>BTW-nummer</label>
                <input value={zzpForm.btw_nummer} onChange={e => { setZzpForm({ ...zzpForm, btw_nummer: e.target.value }); if (zzpErrors.btw_nummer) setZzpErrors(prev => { const n = { ...prev }; delete n.btw_nummer; return n; }); }} placeholder="NL123456789B01" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "rgba(10,26,48,0.7)", border: zzpErrors.btw_nummer ? "1.5px solid #ff716c" : "1px solid rgba(106,118,140,0.15)", color: "#dae6ff", fontFamily: "DM Mono, monospace" }} />
                <p className="text-[10px]" style={{ color: zzpErrors.btw_nummer ? "#ff716c" : "#a0abc3" }}>{zzpErrors.btw_nummer || "Te vinden op kvk.nl of belastingdienst.nl (optioneel)"}</p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium" style={{ color: zzpErrors.iban ? "#ff716c" : "#a0abc3" }}>IBAN *</label>
                <input value={zzpForm.iban} onChange={e => { setZzpForm({ ...zzpForm, iban: e.target.value }); if (zzpErrors.iban) setZzpErrors(prev => { const n = { ...prev }; delete n.iban; return n; }); }} placeholder="NL49INGB0113028776" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "rgba(10,26,48,0.7)", border: zzpErrors.iban ? "1.5px solid #ff716c" : "1px solid rgba(106,118,140,0.15)", color: "#dae6ff", fontFamily: "DM Mono, monospace" }} />
                <p className="text-[10px]" style={{ color: zzpErrors.iban ? "#ff716c" : "#a0abc3" }}>{zzpErrors.iban || "Bankrekening waarop je betaald wilt worden"}</p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium" style={{ color: "#a0abc3" }}>Factuuradres</label>
                <input value={zzpForm.factuuradres} onChange={e => setZzpForm({ ...zzpForm, factuuradres: e.target.value })} placeholder="Zelfde als woonadres" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
                <p className="text-[10px]" style={{ color: "#a0abc3" }}>Laat leeg als hetzelfde als je woonadres</p>
              </div>

              {/* Betalingstermijn */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium" style={{ color: "#a0abc3" }}>Betalingstermijn</label>
                <div className="flex gap-2">
                  {[14, 21, 30].map(d => (
                    <button key={d} onClick={() => setZzpForm({ ...zzpForm, betalingstermijn: d })}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                      style={{
                        background: zzpForm.betalingstermijn === d ? "rgba(63,255,139,0.1)" : "rgba(10,26,48,0.7)",
                        border: zzpForm.betalingstermijn === d ? "1.5px solid rgba(63,255,139,0.3)" : "1px solid rgba(106,118,140,0.15)",
                        color: zzpForm.betalingstermijn === d ? "#3fff8b" : "#a0abc3",
                        fontWeight: zzpForm.betalingstermijn === d ? 700 : 400,
                      }}>
                      {d} dagen
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button onClick={saveZzp} className="w-full py-3 rounded-xl text-sm font-bold" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)", color: "#fff" }}>
              Opslaan & doorgaan →
            </button>
            <button onClick={skipZzp} className="block mx-auto text-xs underline mt-2" style={{ color: "#a0abc3", background: "none", border: "none", cursor: "pointer" }}>
              Overslaan
            </button>
          </div>
        )}

        {step === 4 && profileData && (
          <div className="w-full space-y-4 mt-6">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Jouw certificaten</p>
            <p className="text-sm" style={{ color: "#a0abc3" }}>
              Vink aan welke certificaten je hebt en voeg de geldigheidsdata toe.
            </p>
            <CertificatenForm
              medewerker_id={profileData.id}
              onSaved={() => setStep(5)}
              onCancel={() => setStep(5)}
            />
          </div>
        )}

        {step === 5 && (
          <div className="w-full space-y-4 mt-6">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Vaste vrije dagen</p>
            <p className="text-sm" style={{ color: "#a0abc3" }}>Welke dagen ben je standaard niet beschikbaar?</p>
            <div className="flex gap-2">
              {DAGEN.map(d => {
                const active = vrijeDagen.includes(d.key);
                return (
                  <button key={d.key} onClick={() => setVrijeDagen(active ? vrijeDagen.filter(v => v !== d.key) : [...vrijeDagen, d.key])} className="flex-1 py-3 rounded-xl text-sm font-semibold" style={{
                    background: active ? "rgba(63,255,139,0.1)" : "rgba(10,26,48,0.7)",
                    border: active ? "1px solid rgba(63,255,139,0.3)" : "1px solid rgba(106,118,140,0.15)",
                    color: active ? "#3fff8b" : "#a0abc3",
                  }}>{d.label}</button>
                );
              })}
            </div>
            <button onClick={finish} className="w-full py-3 rounded-xl text-sm font-bold" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)", color: "#fff" }}>
              Voltooien ✓
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

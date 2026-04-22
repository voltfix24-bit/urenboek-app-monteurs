import { useState, useEffect, useCallback } from "react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import CertificatenOverzicht from "@/components/CertificatenOverzicht";
import { toast } from "sonner";
import { query, mutate } from "@/lib/supabaseHelpers";
import { valideer, profielSchema } from "@/lib/validatie";
import { LogOut, Plus, Shield, Edit2, Save, ThermometerSun, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Spinner } from "@/components/ui/Spinner";
import { HandtekeningCanvas } from "@/components/HandtekeningCanvas";
import { formatDatum } from "@/lib/formatting";
import { CONTRACT_STATUS_CONFIG } from "@/lib/contractStatus";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, isWithinInterval, parseISO, differenceInDays } from "date-fns";
import { nl } from "date-fns/locale";
import { BottomNav } from "@/components/BottomNav";
import { useNavBadges } from "@/hooks/useNavBadges";
import { triggerInstallPrompt, canShowInstallPrompt } from "@/components/InstallPrompt";

interface ProfileData { id: string; full_name: string; telefoon: string; adres: string; rijbewijs: boolean; vaste_vrije_dagen: number[]; kvk_nummer?: string | null; btw_nummer?: string | null; iban?: string | null; bedrijfsnaam?: string | null; uurtarief?: number | null; betalingstermijn?: number; factuuradres?: string | null; geboortedatum?: string | null; account_status?: string; }
interface Certificaat { id: string; type: string; naam: string; vervaldatum: string | null; subtype?: string | null; ggi_gebieden?: string[] | null; }
interface BeschikbaarheidItem { id: string; type: string; datum_van: string; datum_tot: string; reden: string | null; status: string; }

const CERT_COLORS: Record<string, string> = { VCA: "#3fff8b", NEN3140: "#6e9bff", rijbewijs_BE: "#feb300", overig: "#a78bfa" };
const DAGEN_LABEL = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"];
const AVATAR_COLORS = ['#3fff8b', '#22c55e', '#6e9bff', '#feb300', '#a78bfa'];

const TYPE_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  vakantie: { bg: "rgba(254,179,0,0.1)", border: "rgba(254,179,0,0.3)", dot: "#feb300" },
  verlof: { bg: "rgba(110,155,255,0.1)", border: "rgba(110,155,255,0.3)", dot: "#6e9bff" },
  ziek: { bg: "rgba(255,113,108,0.1)", border: "rgba(255,113,108,0.3)", dot: "#ff716c" },
  anders: { bg: "rgba(10,26,48,0.7)", border: "rgba(106,118,140,0.15)", dot: "#a0abc3" },
};

function PasswordChange() {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChange = async () => {
    if (newPw.length < 8) { toast.error("Min. 8 tekens"); return; }
    if (newPw !== confirmPw) { toast.error("Wachtwoorden komen niet overeen"); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) toast.error(error.message);
    else { toast.success("Wachtwoord gewijzigd ✓"); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }
    setSaving(false);
  };

  return (
    <div className="pt-2 space-y-2">
      <p className="text-[10px] font-medium" style={{ color: "#a0abc3" }}>Wachtwoord wijzigen</p>
      <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Nieuw wachtwoord" className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
      <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Herhaal nieuw wachtwoord" className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
      <button onClick={handleChange} disabled={saving || !newPw || !confirmPw} className="w-full py-2.5 rounded-xl text-xs font-semibold disabled:opacity-40" style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)", color: "#3fff8b" }}>
        {saving ? "Bezig..." : "Wachtwoord wijzigen"}
      </button>
    </div>
  );
}

function ManagerHandtekeningSection({ profileId }: { profileId: string | null }) {
  const [htData, setHtData] = useState<{ handtekening: string; updated_op: string | null } | null>(null);
  const [showCanvas, setShowCanvas] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileId) return;
    supabase.from("manager_handtekeningen").select("handtekening, aangemaakt_op, updated_op").eq("profiel_id", profileId).maybeSingle()
      .then(({ data }) => { setHtData(data as any); setLoading(false); });
  }, [profileId]);

  if (loading) return null;

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Jouw handtekening</p>
      <p className="text-[10px]" style={{ color: "#a0abc3" }}>Voor digitale ondertekening van contracten</p>

      {htData?.handtekening && !showCanvas ? (
        <>
          <div style={{ maxWidth: 300 }}>
            <img src={htData.handtekening} alt="Handtekening" style={{ width: "100%", height: 80, objectFit: "contain", background: "#fff", borderRadius: 8, border: "1px solid rgba(106,118,140,0.15)" }} />
          </div>
          <p className="text-[10px]" style={{ color: "#a0abc3" }}>Opgeslagen op {htData.updated_op ? formatDatum(htData.updated_op) : "–"}</p>
          <button onClick={() => setShowCanvas(true)} className="text-xs underline" style={{ color: "#3fff8b" }}>Nieuwe handtekening tekenen</button>
        </>
      ) : (
        <>
          {!htData?.handtekening && (
            <div className="rounded-xl p-2.5" style={{ background: "rgba(254,179,0,0.1)", border: "1px solid rgba(254,179,0,0.3)" }}>
              <p className="text-xs" style={{ color: "#feb300" }}>⚠ Sla je handtekening op om contracten digitaal te kunnen ondertekenen</p>
            </div>
          )}
          <HandtekeningCanvas hoogte={120} bestaande={htData?.handtekening} onSave={async (b64) => {
            await supabase.from("manager_handtekeningen").upsert({ profiel_id: profileId!, handtekening: b64, updated_op: new Date().toISOString() }, { onConflict: "profiel_id" });
            toast.success("Handtekening opgeslagen ✓");
            setHtData({ handtekening: b64, updated_op: new Date().toISOString() });
            setShowCanvas(false);
          }} />
        </>
      )}
    </div>
  );
}

function MonteurContractSection({ profileId }: { profileId: string | null }) {
  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!profileId) return;
    supabase.from("contracten").select("*").eq("profiel_id", profileId)
      .in("status", ["ondertekend_beiden", "ondertekend_ot", "verstuurd"])
      .order("aangemaakt_op", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { setContract(data); setLoading(false); });
  }, [profileId]);

  if (loading) return null;

  async function downloadPdf() {
    if (!contract?.pdf_path) return;
    const { data } = await supabase.storage.from("contracten").createSignedUrl(contract.pdf_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  const contractDays = contract?.einddatum ? differenceInDays(parseISO(contract.einddatum), new Date()) : null;
  const cd = contract?.contract_data as Record<string, any> | null;

  const detailRows: { label: string; value: string }[] = [];
  if (cd) {
    if (cd.ot_handelsnaam) detailRows.push({ label: "Handelsnaam", value: cd.ot_handelsnaam });
    if (cd.uurtarief) detailRows.push({ label: "Uurtarief", value: `€${cd.uurtarief}` });
    if (cd.og_naam) detailRows.push({ label: "Opdrachtgever", value: cd.og_naam });
    if (cd.og_vertegenwoordiger) detailRows.push({ label: "Vertegenwoordiger", value: cd.og_vertegenwoordiger });
    if (cd.onderteken_plaats) detailRows.push({ label: "Plaats", value: cd.onderteken_plaats });
    if (cd.onderteken_datum) detailRows.push({ label: "Ondertekend op", value: cd.onderteken_datum });
    if (cd.ot_kvk) detailRows.push({ label: "KVK", value: cd.ot_kvk });
    if (cd.ot_btw) detailRows.push({ label: "BTW", value: cd.ot_btw });
    if (cd.ot_adres) detailRows.push({ label: "Adres", value: `${cd.ot_adres}${cd.ot_postcode ? `, ${cd.ot_postcode}` : ""}${cd.ot_stad ? ` ${cd.ot_stad}` : ""}` });
  }

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Mijn contract</p>

      {contract?.status === "ondertekend_beiden" && (
        <div className="rounded-xl p-3.5 space-y-2" style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)" }}>
          <p className="text-sm font-semibold" style={{ color: "#3fff8b" }}>✅ Actief contract</p>
          <p className="text-xs font-mono" style={{ color: "#a0abc3" }}>{contract.contract_nummer}</p>
          {contract.startdatum && contract.einddatum && (
            <p className="text-xs" style={{ color: "#a0abc3" }}>Geldig: {formatDatum(contract.startdatum)} — {formatDatum(contract.einddatum)}</p>
          )}
          {contractDays !== null && contractDays <= 30 && contractDays >= 0 && (
            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "rgba(254,179,0,0.08)", color: "#feb300" }}>⚠ Verloopt binnenkort</span>
          )}
          <div className="flex items-center gap-3 mt-1">
            {contract.pdf_path && (
              <button onClick={downloadPdf} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "#3fff8b" }}>
                <Download className="h-3.5 w-3.5" /> Download PDF
              </button>
            )}
            <button onClick={() => setShowDetails(!showDetails)} className="text-xs font-medium" style={{ color: "#a0abc3" }}>
              {showDetails ? "Verberg details ▲" : "Bekijk details ▼"}
            </button>
          </div>
        </div>
      )}

      {contract?.status === "ondertekend_ot" && (
        <div className="rounded-xl p-3.5 space-y-2" style={{ background: "rgba(110,155,255,0.1)", border: "1px solid rgba(110,155,255,0.3)" }}>
          <p className="text-sm font-semibold" style={{ color: "#6e9bff" }}>⏳ Wacht op TerreVolt</p>
          <p className="text-xs" style={{ color: "#a0abc3" }}>Je hebt ondertekend. TerreVolt rondt dit zo snel mogelijk af.</p>
          <button onClick={() => setShowDetails(!showDetails)} className="text-xs font-medium mt-1" style={{ color: "#a0abc3" }}>
            {showDetails ? "Verberg details ▲" : "Bekijk details ▼"}
          </button>
        </div>
      )}

      {contract?.status === "verstuurd" && (
        <div className="rounded-xl p-3.5 space-y-1" style={{ background: "rgba(254,179,0,0.1)", border: "1px solid rgba(254,179,0,0.3)" }}>
          <p className="text-sm font-semibold" style={{ color: "#feb300" }}>📧 Wacht op jouw handtekening</p>
          <p className="text-xs" style={{ color: "#a0abc3" }}>Bekijk je e-mail voor de ondertekeningslink.</p>
          <p className="text-[10px] mt-1" style={{ color: "#a0abc3" }}>Geen e-mail ontvangen? Neem contact op via info@terrevolt.nl</p>
        </div>
      )}

      {/* Contract details panel */}
      {showDetails && contract && detailRows.length > 0 && (
        <div className="rounded-xl p-3 space-y-1.5" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#a0abc3" }}>Contractgegevens</p>
          {detailRows.map((row, i) => (
            <div key={i} className="flex justify-between items-center py-1" style={{ borderBottom: i < detailRows.length - 1 ? "1px solid rgba(106,118,140,0.15)" : "none" }}>
              <span className="text-[11px]" style={{ color: "#a0abc3" }}>{row.label}</span>
              <span className="text-xs font-medium text-right max-w-[60%]" style={{ color: "#dae6ff" }}>{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {!contract && (
        <p className="text-xs" style={{ color: "#a0abc3" }}>Geen actief contract</p>
      )}
    </div>
  );
}

export default function Profiel() {
  const { user, roles, rolLabel, permissies, signOut } = useAuth();
  const { badges } = useNavBadges();
  const { refetch: refetchProfileContext } = useProfile();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [certs, setCerts] = useState<Certificaat[]>([]);
  const [beschikbaarheid, setBeschikbaarheid] = useState<BeschikbaarheidItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [editingZzp, setEditingZzp] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: "", telefoon: "", adres: "", geboortedatum: "" });
  const [zzpEditForm, setZzpEditForm] = useState({ bedrijfsnaam: "", kvk_nummer: "", btw_nummer: "", iban: "", factuuradres: "", betalingstermijn: 30 });
  const [showVerlof, setShowVerlof] = useState(false);
  const [showZiek, setShowZiek] = useState(false);
  const [verlofForm, setVerlofForm] = useState({ type: "vakantie", datum_van: "", datum_tot: "", reden: "" });
  const [loading, setLoading] = useState(true);
  const [calMonth, setCalMonth] = useState(new Date());
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("id, full_name, telefoon, adres, rijbewijs, vaste_vrije_dagen, kvk_nummer, btw_nummer, iban, bedrijfsnaam, uurtarief, betalingstermijn, factuuradres, geboortedatum, account_status").eq("user_id", user.id).single();
    if (data) {
      setProfile(data as any);
      setEditForm({ full_name: data.full_name, telefoon: (data as any).telefoon || "", adres: (data as any).adres || "", geboortedatum: (data as any).geboortedatum || "" });
      setZzpEditForm({ bedrijfsnaam: (data as any).bedrijfsnaam || "", kvk_nummer: (data as any).kvk_nummer || "", btw_nummer: (data as any).btw_nummer || "", iban: (data as any).iban || "", factuuradres: (data as any).factuuradres || "", betalingstermijn: (data as any).betalingstermijn || 30 });
    }
    setLoading(false);
  }, [user]);

  const fetchCerts = useCallback(async () => { if (!profile) return; const { data } = await supabase.from("certificaten").select("id, type, naam, vervaldatum, subtype, ggi_gebieden").eq("medewerker_id", profile.id).order("type"); if (data) setCerts(data as any); }, [profile]);
  const fetchBeschikbaarheid = useCallback(async () => { if (!profile) return; const { data } = await supabase.from("beschikbaarheid").select("id, type, datum_van, datum_tot, reden, status").eq("medewerker_id", profile.id).order("datum_van", { ascending: false }).limit(50); if (data) setBeschikbaarheid(data as any); }, [profile]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);
  useEffect(() => { if (profile) { fetchCerts(); fetchBeschikbaarheid(); } }, [profile, fetchCerts, fetchBeschikbaarheid]);

  const saveProfile = async () => {
    if (!profile) return;
    const vResult = valideer(profielSchema, editForm);
    if (!vResult.success) {
      setProfileErrors(vResult.errors);
      toast.error("Controleer de ingevulde gegevens");
      return;
    }
    setProfileErrors({});
    if (!await mutate(supabase.from("profiles").update({ full_name: editForm.full_name, telefoon: editForm.telefoon, adres: editForm.adres, geboortedatum: editForm.geboortedatum || null } as any).eq("id", profile.id))) return;
    toast.success("Profiel opgeslagen"); setEditing(false); fetchProfile(); refetchProfileContext();
  };

  const saveZzp = async () => {
    if (!profile) return;
    if (!await mutate(supabase.from("profiles").update({
      bedrijfsnaam: zzpEditForm.bedrijfsnaam || null,
      kvk_nummer: zzpEditForm.kvk_nummer || null,
      btw_nummer: zzpEditForm.btw_nummer || null,
      iban: zzpEditForm.iban || null,
      factuuradres: zzpEditForm.factuuradres || null,
      betalingstermijn: zzpEditForm.betalingstermijn,
    } as any).eq("id", profile.id))) return;
    toast.success("ZZP gegevens opgeslagen");
    setEditingZzp(false);
    fetchProfile();
    refetchProfileContext();
  };

  const toggleVrijeDag = async (dag: number) => {
    if (!profile) return;
    const current = profile.vaste_vrije_dagen || [];
    const next = current.includes(dag) ? current.filter(d => d !== dag) : [...current, dag];
    await mutate(supabase.from("profiles").update({ vaste_vrije_dagen: next } as any).eq("id", profile.id));
    setProfile({ ...profile, vaste_vrije_dagen: next });
    refetchProfileContext();
  };


  const requestVerlof = async () => {
    if (!profile || !verlofForm.datum_van || !verlofForm.datum_tot) return;
    if (!await mutate(supabase.from("beschikbaarheid").insert({ medewerker_id: profile.id, type: verlofForm.type, datum_van: verlofForm.datum_van, datum_tot: verlofForm.datum_tot, reden: verlofForm.reden || null, status: "aangevraagd" } as any))) return;
    toast.success("Verlof aangevraagd"); setShowVerlof(false); setVerlofForm({ type: "vakantie", datum_van: "", datum_tot: "", reden: "" }); fetchBeschikbaarheid();
  };

  const meldZiek = async () => {
    if (!profile) return;
    const today = new Date().toISOString().split("T")[0];
    if (!await mutate(supabase.from("beschikbaarheid").insert({ medewerker_id: profile.id, type: "ziek", datum_van: today, datum_tot: today, status: "goedgekeurd" } as any))) return;
    toast.success("Ziekmelding ingediend");
    fetchBeschikbaarheid();
  };

  const certStatus = (verval: string) => {
    const diff = (new Date(verval).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return { label: "Verlopen", color: "#ff716c" };
    if (diff < 30) return { label: `${Math.ceil(diff)}d`, color: "#feb300" };
    return { label: "Geldig", color: "#3fff8b" };
  };

  const statusColors: Record<string, { bg: string; text: string }> = {
    aangevraagd: { bg: "rgba(254,179,0,0.1)", text: "#feb300" },
    goedgekeurd: { bg: "rgba(63,255,139,0.1)", text: "#3fff8b" },
    afgekeurd: { bg: "rgba(255,113,108,0.1)", text: "#ff716c" },
  };

  // Calendar helpers
  const monthStart = startOfMonth(calMonth);
  const monthEnd = endOfMonth(calMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart); // 0=Sun

  const getDayStatus = (day: Date): { type: string; status: string } | null => {
    // Check vaste vrije dagen
    const dayOfWeek = getDay(day);
    if (profile?.vaste_vrije_dagen?.includes(dayOfWeek)) {
      return { type: "vrij", status: "vast" };
    }
    // Check beschikbaarheid
    for (const b of beschikbaarheid) {
      try {
        const van = parseISO(b.datum_van);
        const tot = parseISO(b.datum_tot);
        if (isWithinInterval(day, { start: van, end: tot }) || isSameDay(day, van) || isSameDay(day, tot)) {
          return { type: b.type, status: b.status };
        }
      } catch { /* skip */ }
    }
    return null;
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "#030e20" }}><Spinner center={false} /></div>;

  return (
    <PageShell>
      <div style={{ background: '#030e20', minHeight: '100dvh', paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 100px)" }}>
        {/* HEADER */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: 'rgba(3,14,32,0.9)', backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 20, color: '#dae6ff' }}>Mijn Profiel</span>
          <button onClick={signOut} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#ff716c', fontSize: 13, fontFamily: 'Inter', fontWeight: 600 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>logout</span>
          </button>
        </header>

        <main style={{ padding: '24px 20px' }}>
          {/* HERO CARD */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(10,26,48,0.7), rgba(6,19,39,0.8))',
            backdropFilter: 'blur(12px)', border: '1px solid rgba(106,118,140,0.15)',
            borderRadius: 24, padding: '32px 24px', marginBottom: 20,
            display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(63,255,139,0.15), transparent)', pointerEvents: 'none' }} />
            <div style={{
              width: 80, height: 80, borderRadius: '50%', background: '#3fff8b',
              border: '3px solid rgba(63,255,139,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Manrope', fontWeight: 800, fontSize: 28, color: '#005d2c', marginBottom: 16,
              boxShadow: '0 0 30px rgba(63,255,139,0.2)', position: 'relative', zIndex: 1,
            }}>
              {profile?.full_name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <h2 style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 24, color: '#dae6ff', marginBottom: 8, position: 'relative', zIndex: 1 }}>
              {profile?.full_name || 'Naam'}
            </h2>
            <div style={{ padding: '4px 14px', borderRadius: 9999, background: 'rgba(63,255,139,0.15)', border: '1px solid rgba(63,255,139,0.3)', marginBottom: 6, position: 'relative', zIndex: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Inter', color: '#3fff8b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{rolLabel}</span>
            </div>
            <span style={{ fontSize: 12, color: '#a0abc3', fontFamily: 'Inter', position: 'relative', zIndex: 1 }}>TerreVolt BV</span>
          </div>

          {/* Onboarding banner */}
          {profile?.account_status === 'onboarding' && (
            <div style={{ padding: '14px 16px', borderRadius: 16, background: 'rgba(254,179,0,0.08)', border: '1px solid rgba(254,179,0,0.2)', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#feb300', fontFamily: 'Inter' }}>⚠ Account nog niet actief</p>
                <p style={{ fontSize: 12, color: '#a0abc3', fontFamily: 'Inter', marginTop: 2 }}>Vul je gegevens aan en rond je onboarding af.</p>
              </div>
              <button onClick={() => window.location.href = '/onboarding-welkom'} style={{ padding: '6px 12px', borderRadius: 12, background: '#3fff8b', color: '#005d2c', fontFamily: 'Inter', fontWeight: 700, fontSize: 11, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>Naar onboarding →</button>
            </div>
          )}

          {/* MIJN GEGEVENS */}
          <div style={{ background: 'linear-gradient(135deg, rgba(10,26,48,0.7), rgba(6,19,39,0.8))', backdropFilter: 'blur(12px)', border: '1px solid rgba(106,118,140,0.15)', borderRadius: 16, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(61,72,93,0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#a0abc3' }}>person</span>
                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Inter', color: '#dae6ff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mijn gegevens</span>
              </div>
              <button onClick={() => editing ? saveProfile() : setEditing(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: '#3fff8b', fontSize: 12, fontWeight: 700, fontFamily: 'Inter' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{editing ? 'save' : 'edit'}</span>
                {editing ? 'Opslaan' : 'Bewerken'}
              </button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {editing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[{ label: 'Naam', key: 'full_name' as const }, { label: 'Telefoon', key: 'telefoon' as const }, { label: 'Adres', key: 'adres' as const }].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: 10, fontWeight: 600, color: profileErrors[f.key] ? '#ff716c' : '#a0abc3', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</label>
                      <input value={editForm[f.key]} onChange={e => { setEditForm({ ...editForm, [f.key]: e.target.value }); if (profileErrors[f.key]) setProfileErrors(prev => { const n = { ...prev }; delete n[f.key]; return n; }); }} style={{ width: '100%', marginTop: 4, padding: '10px 14px', borderRadius: 12, background: '#061327', border: profileErrors[f.key] ? '1.5px solid #ff716c' : '1px solid rgba(255,255,255,0.07)', color: '#dae6ff', fontFamily: 'Inter', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                      {profileErrors[f.key] && <p style={{ fontSize: 10, color: '#ff716c', marginTop: 2, fontFamily: 'Inter' }}>⚠ {profileErrors[f.key]}</p>}
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 600, color: '#a0abc3', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Geboortedatum</label>
                    <input type="date" value={editForm.geboortedatum} onChange={e => setEditForm({ ...editForm, geboortedatum: e.target.value })} style={{ width: '100%', marginTop: 4, padding: '10px 14px', borderRadius: 12, background: '#061327', border: '1px solid rgba(255,255,255,0.07)', color: '#dae6ff', fontFamily: 'Inter', fontSize: 14, outline: 'none', boxSizing: 'border-box', colorScheme: 'dark' }} />
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {[
                    { icon: 'mail', label: 'Email', value: user?.email },
                    { icon: 'phone', label: 'Telefoon', value: profile?.telefoon },
                    { icon: 'home', label: 'Adres', value: profile?.adres },
                    { icon: 'cake', label: 'Geboortedatum', value: profile?.geboortedatum ? formatDatum(profile.geboortedatum) : null },
                  ].map((row, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: i < 3 ? '1px solid rgba(61,72,93,0.3)' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#a0abc3' }}>{row.icon}</span>
                        <span style={{ fontSize: 11, color: '#a0abc3', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{row.label}</span>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#dae6ff', fontFamily: 'Inter' }}>{row.value || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ZZP GEGEVENS */}
          <div style={{ background: 'linear-gradient(135deg, rgba(10,26,48,0.7), rgba(6,19,39,0.8))', backdropFilter: 'blur(12px)', border: '1px solid rgba(106,118,140,0.15)', borderRadius: 16, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(61,72,93,0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#a0abc3' }}>business_center</span>
                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Inter', color: '#dae6ff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ZZP Gegevens</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!editingZzp && (profile?.kvk_nummer && profile?.iban ? (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 9999, background: 'rgba(63,255,139,0.1)', color: '#3fff8b', fontFamily: 'Inter' }}>✓ COMPLEET</span>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 9999, background: 'rgba(254,179,0,0.1)', color: '#feb300', fontFamily: 'Inter' }}>⚠ INCOMPLEET</span>
                ))}
                <button onClick={() => editingZzp ? saveZzp() : setEditingZzp(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: '#3fff8b', fontSize: 12, fontWeight: 700, fontFamily: 'Inter' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{editingZzp ? 'save' : 'edit'}</span>
                </button>
              </div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {editingZzp ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: 'Bedrijfsnaam', key: 'bedrijfsnaam' as const },
                    { label: 'KvK-nummer', key: 'kvk_nummer' as const },
                    { label: 'BTW-nummer', key: 'btw_nummer' as const },
                    { label: 'IBAN', key: 'iban' as const },
                    { label: 'Factuuradres', key: 'factuuradres' as const },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: 10, fontWeight: 600, color: '#a0abc3', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</label>
                      <input value={zzpEditForm[f.key]} onChange={e => setZzpEditForm({ ...zzpEditForm, [f.key]: e.target.value })} style={{ width: '100%', marginTop: 4, padding: '10px 14px', borderRadius: 12, background: '#061327', border: '1px solid rgba(255,255,255,0.07)', color: '#dae6ff', fontFamily: 'Inter', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 600, color: '#a0abc3', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Betalingstermijn (dagen)</label>
                    <input type="number" value={zzpEditForm.betalingstermijn} onChange={e => setZzpEditForm({ ...zzpEditForm, betalingstermijn: Number(e.target.value) || 30 })} style={{ width: '100%', marginTop: 4, padding: '10px 14px', borderRadius: 12, background: '#061327', border: '1px solid rgba(255,255,255,0.07)', color: '#dae6ff', fontFamily: 'Inter', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <button onClick={() => { setEditingZzp(false); setZzpEditForm({ bedrijfsnaam: profile?.bedrijfsnaam || '', kvk_nummer: profile?.kvk_nummer || '', btw_nummer: profile?.btw_nummer || '', iban: profile?.iban || '', factuuradres: profile?.factuuradres || '', betalingstermijn: profile?.betalingstermijn || 30 }); }} style={{ fontSize: 12, color: '#a0abc3', fontFamily: 'Inter', background: 'none', border: 'none', cursor: 'pointer' }}>Annuleren</button>
                </div>
              ) : (
                <>
                  {(!profile?.kvk_nummer || !profile?.iban) && (
                    <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(254,179,0,0.08)', border: '1px solid rgba(254,179,0,0.2)', marginBottom: 12 }}>
                      <span style={{ fontSize: 12, color: '#feb300' }}>⚠ Vul je ZZP gegevens aan om inkooporders te kunnen ontvangen</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {[
                      { label: 'Bedrijfsnaam', value: profile?.bedrijfsnaam },
                      { label: 'KvK-nummer', value: profile?.kvk_nummer, warn: !profile?.kvk_nummer },
                      { label: 'BTW-nummer', value: profile?.btw_nummer },
                      { label: 'IBAN', value: profile?.iban, warn: !profile?.iban },
                      { label: 'Factuuradres', value: profile?.factuuradres },
                      { label: 'Betalingstermijn', value: `${profile?.betalingstermijn || 30} dagen` },
                    ].map((row, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: i < 5 ? '1px solid rgba(61,72,93,0.3)' : 'none' }}>
                        <span style={{ fontSize: 11, color: '#a0abc3', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{row.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: row.warn ? '#feb300' : '#dae6ff', fontFamily: 'Inter' }}>{row.value || (row.warn ? 'Niet ingevuld' : '—')}</span>
                      </div>
                    ))}
                    {permissies.zietProjectFinancien && profile?.uurtarief != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0' }}>
                        <span style={{ fontSize: 11, color: '#a0abc3', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Uurtarief</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#3fff8b', fontFamily: 'Inter' }}>€ {Number(profile.uurtarief).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Manager handtekening / Monteur contract */}
          {permissies.zietDashboard && <ManagerHandtekeningSection profileId={profile?.id || null} />}
          {!permissies.zietDashboard && <MonteurContractSection profileId={profile?.id || null} />}

          {/* BESCHIKBAARHEID */}
          <div style={{ marginBottom: 12 }}>
            {/* Section title */}
            <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(165,172,180,0.6)', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 12 }}>
              Beschikbaarheid
            </p>

            {/* Vaste vrije dagen */}
            <div style={{ background: '#0c141b', borderRadius: 16, padding: '16px 20px', marginBottom: 10 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#a0abc3', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
                Vaste vrije dagen
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                {[1, 2, 3, 4, 5, 6, 0].map(dag => {
                  const active = profile?.vaste_vrije_dagen?.includes(dag);
                  return (
                    <button key={dag} onClick={() => toggleVrijeDag(dag)} style={{
                      flex: 1, padding: '8px 0', borderRadius: 8,
                      background: active ? 'rgba(63,255,139,0.1)' : '#1d2730',
                      border: active ? '2px solid #3fff8b' : '2px solid transparent',
                      color: active ? '#3fff8b' : 'rgba(165,172,180,0.4)',
                      fontFamily: 'Inter', fontWeight: 700, fontSize: 11, cursor: 'pointer',
                      opacity: active ? 1 : 0.7,
                    }}>{DAGEN_LABEL[dag]}</button>
                  );
                })}
              </div>
            </div>

            {/* Calendar */}
            <div style={{ background: '#0c141b', borderRadius: 16, padding: 20, marginBottom: 10 }}>
              {/* Month navigation */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h4 style={{ fontFamily: 'Manrope', fontWeight: 700, fontSize: 18, color: '#dae6ff', textTransform: 'capitalize' }}>
                  {format(calMonth, 'MMMM yyyy', { locale: nl })}
                </h4>
                <div style={{ display: 'flex', gap: 16 }}>
                  <button onClick={() => setCalMonth(subMonths(calMonth, 1))} style={{ background: 'none', border: 'none', color: '#6f767e', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>chevron_left</span>
                  </button>
                  <button onClick={() => setCalMonth(addMonths(calMonth, 1))} style={{ background: 'none', border: 'none', color: '#6f767e', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>chevron_right</span>
                  </button>
                </div>
              </div>

              {/* Day headers */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 8 }}>
                {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: '#424950', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: 4 }}>
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar days */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 16 }}>
                {Array.from({ length: (startPad + 6) % 7 }).map((_, i) => (<div key={`pad-${i}`} />))}
                {days.map(day => {
                  const status = getDayStatus(day);
                  const isToday = isSameDay(day, new Date());
                  const dotColor = status ? (TYPE_COLORS[status.type]?.dot || '#a0abc3') : null;
                  return (
                    <div key={day.toISOString()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, position: 'relative' }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 10,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isToday ? '#3fff8b' : 'transparent',
                      }}>
                        <span style={{
                          fontSize: 12,
                          fontWeight: isToday ? 700 : 500,
                          color: isToday ? '#080f15' : (dotColor || '#a0abc3'),
                        }}>{format(day, 'd')}</span>
                      </div>
                      {status && (
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: dotColor }} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(66,73,80,0.4)' }}>
                {[
                  { label: 'Vrije dag', color: '#424950' },
                  { label: 'Vakantie', color: '#00dcfd' },
                  { label: 'Ziek', color: '#ff716c' },
                  { label: 'Verlof', color: '#74fbbb' },
                ].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#a0abc3', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {l.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons — 2 large cards */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <button onClick={() => setShowVerlof(true)} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '24px 16px', borderRadius: 20, background: '#172129',
                border: '1px solid rgba(66,73,80,0.3)', cursor: 'pointer', gap: 8,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#74fbbb' }}>event_repeat</span>
                <span style={{ fontFamily: 'Manrope', fontWeight: 700, fontSize: 13, color: '#dae6ff' }}>Verlof aanvragen</span>
              </button>
              <button onClick={() => navigate("/ziek-melden")} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '24px 16px', borderRadius: 20, background: '#172129',
                border: '1px solid rgba(66,73,80,0.3)', cursor: 'pointer', gap: 8,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#ff716c' }}>medical_services</span>
                <span style={{ fontFamily: 'Manrope', fontWeight: 700, fontSize: 13, color: '#dae6ff' }}>Ziek melden</span>
              </button>
            </div>

            {/* Recente aanvragen */}
            {beschikbaarheid.length > 0 && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(165,172,180,0.6)', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 10 }}>
                  Recente aanvragen
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {beschikbaarheid.slice(0, 5).map(b => {
                    const TYPE_ICONS: Record<string, string> = {
                      vakantie: 'beach_access',
                      verlof: 'event_repeat',
                      anders: 'more_time',
                      ziek: 'medical_services',
                    };
                    const TYPE_COLORS_BG: Record<string, string> = {
                      vakantie: 'rgba(0,220,253,0.1)',
                      verlof: 'rgba(116,251,187,0.1)',
                      anders: 'rgba(165,172,180,0.1)',
                      ziek: 'rgba(255,113,108,0.1)',
                    };
                    const TYPE_ICON_COLORS: Record<string, string> = {
                      vakantie: '#00dcfd',
                      verlof: '#74fbbb',
                      anders: '#a0abc3',
                      ziek: '#ff716c',
                    };
                    const STATUS_COLORS: Record<string, string> = {
                      aangevraagd: '#00dcfd',
                      goedgekeurd: '#3fff8b',
                      afgekeurd: '#ff716c',
                    };
                    const STATUS_BG: Record<string, string> = {
                      aangevraagd: 'rgba(0,220,253,0.1)',
                      goedgekeurd: 'rgba(63,255,139,0.1)',
                      afgekeurd: 'rgba(255,113,108,0.1)',
                    };
                    const STATUS_BORDER: Record<string, string> = {
                      aangevraagd: 'rgba(0,220,253,0.3)',
                      goedgekeurd: 'rgba(63,255,139,0.3)',
                      afgekeurd: 'rgba(255,113,108,0.3)',
                    };
                    return (
                      <div key={b.id} style={{
                        background: '#0c141b', borderRadius: 16, padding: '14px 16px',
                        display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'space-between',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{
                            width: 44, height: 44, borderRadius: 12,
                            background: TYPE_COLORS_BG[b.type] || 'rgba(165,172,180,0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <span className="material-symbols-outlined" style={{
                              fontSize: 20,
                              color: TYPE_ICON_COLORS[b.type] || '#a0abc3',
                              fontVariationSettings: "'FILL' 1",
                            }}>{TYPE_ICONS[b.type] || 'event'}</span>
                          </div>
                          <div>
                            <p style={{ fontFamily: 'Manrope', fontWeight: 700, fontSize: 14, color: '#dae6ff', textTransform: 'capitalize', marginBottom: 2 }}>
                              {b.type}
                            </p>
                            <p style={{ fontSize: 11, color: '#a0abc3', fontFamily: 'Inter' }}>
                              {format(parseISO(b.datum_van), 'd MMM', { locale: nl })}
                              {' – '}
                              {format(parseISO(b.datum_tot), 'd MMM', { locale: nl })}
                            </p>
                          </div>
                        </div>
                        <div style={{
                          padding: '4px 10px', borderRadius: 6,
                          background: STATUS_BG[b.status] || STATUS_BG.aangevraagd,
                          border: `1px solid ${STATUS_BORDER[b.status] || STATUS_BORDER.aangevraagd}`,
                        }}>
                          <span style={{
                            fontSize: 9, fontWeight: 800,
                            color: STATUS_COLORS[b.status] || STATUS_COLORS.aangevraagd,
                            fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.1em',
                          }}>{b.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* CERTIFICATEN */}
          <CertificatenOverzicht certificaten={certs} toonToevoegen={true} medewerker_id={profile?.id} onRefresh={fetchCerts} />

          {/* NOODCONTACT */}
          <div style={{ background: 'rgba(254,179,0,0.06)', border: '1px solid rgba(254,179,0,0.2)', borderRadius: 16, padding: '16px 20px', marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#feb300', fontFamily: 'Inter', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>emergency</span> Noodcontact
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#a0abc3', fontFamily: 'Inter' }}>Naam</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#dae6ff', fontFamily: 'Inter' }}>{(profile as any)?.noodcontact_naam || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#a0abc3', fontFamily: 'Inter' }}>Telefoon</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#dae6ff', fontFamily: 'Inter' }}>{(profile as any)?.noodcontact_tel || '—'}</span>
              </div>
            </div>
          </div>

          {/* INSTELLINGEN */}
          <div style={{ background: 'linear-gradient(135deg, rgba(10,26,48,0.7), rgba(6,19,39,0.8))', backdropFilter: 'blur(12px)', border: '1px solid rgba(106,118,140,0.15)', borderRadius: 16, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(61,72,93,0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#a0abc3' }}>settings</span>
                <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Inter', color: '#dae6ff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Instellingen</span>
              </div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <PasswordChange />
            </div>
          </div>

          {/* MIJN ORDERS SHORTCUT */}
          <button onClick={() => navigate('/mijn-orders')} style={{
            width: '100%', padding: '16px 20px', borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(10,26,48,0.7), rgba(6,19,39,0.8))',
            border: '1px solid rgba(106,118,140,0.15)', borderLeft: '3px solid #3fff8b',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(63,255,139,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#3fff8b' }}>receipt_long</span>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#dae6ff', fontFamily: 'Inter', marginBottom: 2 }}>Mijn inkooporders</div>
                <div style={{ fontSize: 11, color: '#a0abc3', fontFamily: 'Inter' }}>Bekijk je orders en PDF's</div>
              </div>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#a0abc3', opacity: 0.6 }}>chevron_right</span>
          </button>

          {/* INSTALLEER APP */}
          {canShowInstallPrompt() && (
            <button onClick={triggerInstallPrompt} style={{
              width: '100%', padding: '16px 20px', borderRadius: 16, background: 'rgba(63,255,139,0.08)',
              border: '1px solid rgba(63,255,139,0.3)', color: '#3fff8b', fontFamily: 'Inter', fontWeight: 700, fontSize: 14,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>install_mobile</span>
              Installeer app op beginscherm
            </button>
          )}

          {/* UITLOGGEN */}
          <button onClick={signOut} style={{
            width: '100%', padding: '16px 20px', borderRadius: 16, background: 'transparent',
            border: '1px solid #ff716c', color: '#ff716c', fontFamily: 'Inter', fontWeight: 700, fontSize: 14,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>logout</span>
            Uitloggen
          </button>
        </main>

        <BottomNav badges={badges} />
      </div>

      {/* Verlof modal */}
      {showVerlof && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }} onClick={() => setShowVerlof(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 480, background: '#030e20',
            borderRadius: '32px 32px 0 0', borderTop: '1px solid rgba(255,255,255,0.08)',
            maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 -20px 50px rgba(0,0,0,0.5)',
          }}>
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: 48, height: 4, borderRadius: 9999, background: 'rgba(66,73,80,0.3)' }} />
            </div>

            {/* Scrollable content */}
            <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', padding: '20px 24px 0' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <h2 style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 24, color: '#dae6ff', marginBottom: 4 }}>
                    Verlof aanvragen
                  </h2>
                  <p style={{ fontSize: 13, color: '#a0abc3', fontFamily: 'Inter' }}>
                    Vul de details in voor je nieuwe aanvraag.
                  </p>
                </div>
                <button onClick={() => setShowVerlof(false)} style={{
                  width: 40, height: 40, borderRadius: '50%', background: '#1d2730',
                  border: 'none', color: '#a0abc3',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                </button>
              </div>

              {/* Type verlof toggle */}
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#424950', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 10 }}>
                  Type verlof
                </p>
                <div style={{ display: 'flex', padding: 4, background: '#1d2730', borderRadius: 14, gap: 4 }}>
                  {(['vakantie', 'verlof', 'anders'] as const).map(t => (
                    <button key={t} onClick={() => setVerlofForm({ ...verlofForm, type: t })} style={{
                      flex: 1, padding: '12px 8px', borderRadius: 10, border: 'none',
                      background: verlofForm.type === t ? 'linear-gradient(135deg, #3fff8b, #13ea79)' : 'transparent',
                      color: verlofForm.type === t ? '#080f15' : '#a0abc3',
                      fontFamily: 'Inter', fontWeight: 700, fontSize: 13, cursor: 'pointer', textTransform: 'capitalize',
                      boxShadow: verlofForm.type === t ? '0 4px 12px rgba(63,255,139,0.2)' : 'none',
                      transition: 'all 0.15s',
                    }}>{t}</button>
                  ))}
                </div>
              </div>

              {/* Datum van/tot */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'VAN', field: 'datum_van' as const },
                  { label: 'TOT', field: 'datum_tot' as const },
                ].map(({ label, field }) => (
                  <div key={field}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#424950', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8 }}>
                      {label}
                    </p>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="date"
                        value={verlofForm[field]}
                        onChange={e => setVerlofForm({ ...verlofForm, [field]: e.target.value })}
                        style={{
                          width: '100%', background: '#172129', border: 'none', borderRadius: 12,
                          padding: '14px 40px 14px 14px',
                          color: verlofForm[field] ? '#3fff8b' : '#a0abc3',
                          fontFamily: 'Inter', fontSize: 13,
                          fontWeight: verlofForm[field] ? 700 : 400,
                          outline: 'none', colorScheme: 'dark', boxSizing: 'border-box',
                          WebkitAppearance: 'none',
                        }} />
                      <span className="material-symbols-outlined" style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        fontSize: 18, color: '#3fff8b', pointerEvents: 'none',
                      }}>calendar_month</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reden */}
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#424950', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8 }}>
                  Reden (optioneel)
                </p>
                <textarea
                  value={verlofForm.reden}
                  onChange={e => setVerlofForm({ ...verlofForm, reden: e.target.value })}
                  placeholder="Bijv. familiebezoek of renovatie..."
                  rows={3}
                  style={{
                    width: '100%', background: '#172129', border: 'none', borderRadius: 12,
                    padding: '14px', color: '#dae6ff', fontFamily: 'Inter', fontSize: 13,
                    resize: 'none', outline: 'none', boxSizing: 'border-box',
                  }} />
              </div>
            </div>

            {/* Sticky submit button */}
            <div style={{
              padding: '12px 24px calc(env(safe-area-inset-bottom, 0px) + 16px)',
              borderTop: '1px solid rgba(66,73,80,0.15)',
              background: 'rgba(12,20,27,0.95)',
              flexShrink: 0,
            }}>
              <button onClick={requestVerlof} disabled={!verlofForm.datum_van || !verlofForm.datum_tot} style={{
                width: '100%', padding: '18px 0', borderRadius: 14,
                background: 'linear-gradient(135deg, #3fff8b, #13ea79)',
                border: 'none', color: '#080f15',
                fontFamily: 'Manrope', fontWeight: 800, fontSize: 16,
                textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer',
                opacity: (!verlofForm.datum_van || !verlofForm.datum_tot) ? 0.4 : 1,
                boxShadow: '0 12px 40px rgba(63,255,139,0.2)',
              }}>AANVRAAG VERSTUREN</button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

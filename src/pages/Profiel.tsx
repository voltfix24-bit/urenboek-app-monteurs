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

interface ProfileData { id: string; full_name: string; telefoon: string; adres: string; rijbewijs: boolean; vaste_vrije_dagen: number[]; kvk_nummer?: string | null; btw_nummer?: string | null; iban?: string | null; bedrijfsnaam?: string | null; contactpersoon?: string | null; email?: string | null; uurtarief?: number | null; betalingstermijn?: number; factuuradres?: string | null; geboortedatum?: string | null; account_status?: string; is_onderaannemer?: boolean; }
interface Certificaat { id: string; type: string; naam: string; vervaldatum: string | null; subtype?: string | null; ggi_gebieden?: string[] | null; bestand_url?: string | null; }
interface BeschikbaarheidItem { id: string; type: string; datum_van: string; datum_tot: string; reden: string | null; status: string; }

const CERT_COLORS: Record<string, string> = { VCA: "var(--accent)", NEN3140: "var(--info)", rijbewijs_BE: "var(--warn-text)", overig: "#a78bfa" };
const DAGEN_LABEL = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"];
const AVATAR_COLORS = ['var(--accent)', 'var(--info)', 'var(--warn-text)', 'var(--purple)', 'var(--accent-dark)'];

const TYPE_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  vakantie: { bg: "var(--warn-light)", border: "var(--warn-border)", dot: "var(--warn-text)" },
  verlof: { bg: "rgba(110,155,255,0.1)", border: "rgba(110,155,255,0.3)", dot: "var(--info)" },
  ziek: { bg: "var(--danger-light)", border: "var(--danger-border)", dot: "var(--danger)" },
  anders: { bg: "var(--bg-surface)", border: "var(--planning-border-soft)", dot: "var(--text-muted)" },
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
      <p className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Wachtwoord wijzigen</p>
      <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Nieuw wachtwoord" className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }} />
      <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Herhaal nieuw wachtwoord" className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" }} />
      <button onClick={handleChange} disabled={saving || !newPw || !confirmPw} className="w-full py-2.5 rounded-xl text-xs font-semibold disabled:opacity-40" style={{ background: "var(--accent-light)", border: "1px solid var(--accent-border)", color: "var(--accent)" }}>
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
    <div style={{ background: 'var(--bg-surface)', backdropFilter: 'blur(12px)', border: '1px solid var(--planning-border-soft)', borderRadius: 16, padding: '16px 20px', marginBottom: 12 }} className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Jouw handtekening</p>
      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Voor digitale ondertekening van contracten</p>

      {htData?.handtekening && !showCanvas ? (
        <>
          <div style={{ maxWidth: 300 }}>
            <img src={htData.handtekening} alt="Handtekening" style={{ width: "100%", height: 80, objectFit: "contain", background: "#fff", borderRadius: 8, border: "1px solid var(--planning-border-soft)" }} />
          </div>
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Opgeslagen op {htData.updated_op ? formatDatum(htData.updated_op) : "–"}</p>
          <button onClick={() => setShowCanvas(true)} className="text-xs underline" style={{ color: "var(--accent)" }}>Nieuwe handtekening tekenen</button>
        </>
      ) : (
        <>
          {!htData?.handtekening && (
            <div className="rounded-xl p-2.5" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
              <p className="text-xs" style={{ color: "var(--warn-text)" }}>⚠ Sla je handtekening op om contracten digitaal te kunnen ondertekenen</p>
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
      .order("aangemaakt_op", { ascending: false })
      .then(({ data }) => {
        // Prioriteer ondertekende contracten boven 'verstuurd' duplicaten
        const prio: Record<string, number> = { ondertekend_beiden: 0, ondertekend_ot: 1, verstuurd: 2 };
        const best = (data ?? []).slice().sort(
          (a, b) => (prio[a.status] ?? 9) - (prio[b.status] ?? 9)
        )[0] ?? null;
        setContract(best);
        setLoading(false);
      });
  }, [profileId]);


  if (loading) return null;

  async function downloadPdf() {
    if (!contract?.pdf_path) return;
    // Open synchroon zodat iOS Safari de popup-blocker niet triggert
    const newWin = window.open("", "_blank");
    const { data, error } = await supabase.storage.from("contracten").createSignedUrl(contract.pdf_path, 3600);
    if (error || !data?.signedUrl) {
      if (newWin) newWin.close();
      toast.error("Kon contract niet openen");
      return;
    }
    if (newWin) {
      newWin.location.href = data.signedUrl;
    } else {
      window.location.href = data.signedUrl;
    }
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
    <div style={{ background: 'var(--bg-surface)', backdropFilter: 'blur(12px)', border: '1px solid var(--planning-border-soft)', borderRadius: 16, padding: '16px 20px', marginBottom: 12 }} className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Mijn contract</p>

      {contract?.status === "ondertekend_beiden" && (
        <div className="rounded-xl p-3.5 space-y-2" style={{ background: "var(--accent-light)", border: "1px solid var(--accent-border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>✅ Actief contract</p>
          <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{contract.contract_nummer}</p>
          {contract.startdatum && contract.einddatum && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Geldig: {formatDatum(contract.startdatum)} — {formatDatum(contract.einddatum)}</p>
          )}
          {contractDays !== null && contractDays <= 30 && contractDays >= 0 && (
            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "var(--warn-light)", color: "var(--warn-text)" }}>⚠ Verloopt binnenkort</span>
          )}
          <div className="flex items-center gap-3 mt-1">
            {contract.pdf_path && (
              <button onClick={downloadPdf} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--accent)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span> Download PDF
              </button>
            )}
            <button onClick={() => setShowDetails(!showDetails)} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              {showDetails ? "Verberg details ▲" : "Bekijk details ▼"}
            </button>
          </div>
        </div>
      )}

      {contract?.status === "ondertekend_ot" && (
        <div className="rounded-xl p-3.5 space-y-2" style={{ background: "rgba(110,155,255,0.1)", border: "1px solid rgba(110,155,255,0.3)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--info)" }}>⏳ Wacht op TerreVolt</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Je hebt ondertekend. TerreVolt rondt dit zo snel mogelijk af.</p>
          <button onClick={() => setShowDetails(!showDetails)} className="text-xs font-medium mt-1" style={{ color: "var(--text-muted)" }}>
            {showDetails ? "Verberg details ▲" : "Bekijk details ▼"}
          </button>
        </div>
      )}

      {contract?.status === "verstuurd" && (
        <div className="rounded-xl p-3.5 space-y-1" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--warn-text)" }}>📧 Wacht op jouw handtekening</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Bekijk je e-mail voor de ondertekeningslink.</p>
          <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Geen e-mail ontvangen? Neem contact op via info@terrevolt.nl</p>
        </div>
      )}

      {/* Contract details panel */}
      {showDetails && contract && detailRows.length > 0 && (
        <div className="rounded-xl p-3 space-y-1.5" style={{ background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Contractgegevens</p>
          {detailRows.map((row, i) => (
            <div key={i} className="flex justify-between items-center py-1" style={{ borderBottom: i < detailRows.length - 1 ? "1px solid var(--planning-border-soft)" : "none" }}>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{row.label}</span>
              <span className="text-xs font-medium text-right max-w-[60%]" style={{ color: "var(--text-primary)" }}>{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {!contract && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>Geen actief contract</p>
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
  const [zzpEditForm, setZzpEditForm] = useState({ bedrijfsnaam: "", contactpersoon: "", kvk_nummer: "", btw_nummer: "", iban: "", factuuradres: "", betalingstermijn: 30 });
  const [zzpErrors, setZzpErrors] = useState<Record<string, string>>({});
  const [showZiek, setShowZiek] = useState(false);
  const [loading, setLoading] = useState(true);
  const [calMonth, setCalMonth] = useState(new Date());
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("id, full_name, telefoon, adres, rijbewijs, vaste_vrije_dagen, kvk_nummer, btw_nummer, iban, bedrijfsnaam, contactpersoon, email, uurtarief, betalingstermijn, factuuradres, geboortedatum, account_status, is_onderaannemer").eq("user_id", user.id).single();
    if (data) {
      setProfile(data as any);
      setEditForm({ full_name: data.full_name, telefoon: (data as any).telefoon || "", adres: (data as any).adres || "", geboortedatum: (data as any).geboortedatum || "" });
      setZzpEditForm({ bedrijfsnaam: (data as any).bedrijfsnaam || "", contactpersoon: (data as any).contactpersoon || "", kvk_nummer: (data as any).kvk_nummer || "", btw_nummer: (data as any).btw_nummer || "", iban: (data as any).iban || "", factuuradres: (data as any).factuuradres || "", betalingstermijn: (data as any).betalingstermijn || 30 });
    }
    setLoading(false);
  }, [user]);

  const fetchCerts = useCallback(async () => { if (!profile) return; const { data } = await supabase.from("certificaten").select("id, type, naam, vervaldatum, subtype, ggi_gebieden, bestand_url").eq("medewerker_id", profile.id).order("type"); if (data) setCerts(data as any); }, [profile]);
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
    const vResult = valideer(zzpSchema, {
      bedrijfsnaam: zzpEditForm.bedrijfsnaam,
      kvk_nummer: zzpEditForm.kvk_nummer,
      btw_nummer: zzpEditForm.btw_nummer,
      iban: zzpEditForm.iban.replace(/\s/g, ""),
      factuuradres: zzpEditForm.factuuradres,
    });
    if (!vResult.success) {
      setZzpErrors(vResult.errors);
      toast.error("Controleer KvK, BTW of IBAN");
      return;
    }
    setZzpErrors({});
    if (!await mutate(supabase.from("profiles").update({
      bedrijfsnaam: zzpEditForm.bedrijfsnaam || null,
      contactpersoon: zzpEditForm.contactpersoon || null,
      kvk_nummer: zzpEditForm.kvk_nummer || null,
      btw_nummer: zzpEditForm.btw_nummer || null,
      iban: zzpEditForm.iban.replace(/\s/g, "") || null,
      factuuradres: zzpEditForm.factuuradres || null,
      betalingstermijn: zzpEditForm.betalingstermijn,
    } as any).eq("id", profile.id))) return;
    toast.success("Bedrijfsgegevens opgeslagen ✓");
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



  const meldZiek = async () => {
    if (!profile) return;
    const today = new Date().toISOString().split("T")[0];
    if (!await mutate(supabase.from("beschikbaarheid").insert({ medewerker_id: profile.id, type: "ziek", datum_van: today, datum_tot: today, status: "goedgekeurd" } as any))) return;
    toast.success("Ziekmelding ingediend");
    fetchBeschikbaarheid();
  };

  const certStatus = (verval: string) => {
    const diff = (new Date(verval).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return { label: "Verlopen", color: "var(--danger)" };
    if (diff < 30) return { label: `${Math.ceil(diff)}d`, color: "var(--warn-text)" };
    return { label: "Geldig", color: "var(--accent)" };
  };

  const statusColors: Record<string, { bg: string; text: string }> = {
    aangevraagd: { bg: "var(--warn-light)", text: "var(--warn-text)" },
    goedgekeurd: { bg: "var(--accent-light)", text: "var(--accent)" },
    afgekeurd: { bg: "var(--danger-light)", text: "var(--danger)" },
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

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-navy)" }}><Spinner center={false} /></div>;

  return (
    <PageShell>
      <div style={{
        background: 'var(--bg-base)',
        minHeight: '100dvh',
        paddingBottom: 'calc(env(safe-area-inset-bottom,34px) + 100px)',
      }}>
        {/* HEADER */}
        <header style={{
          position: 'sticky', top: 0,
          zIndex: 50,
          background: 'color-mix(in srgb, var(--bg-surface) 94%, transparent)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--planning-border-soft)',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{
            fontFamily: 'Hanken Grotesk',
            fontWeight: 800,
            fontSize: 20,
            color: 'var(--accent)',
          }}>
            Mijn Profiel
          </span>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <button
              onClick={signOut}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
              }}>
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 22,
                  fontVariationSettings: "'wght' 300",
                }}>
                logout
              </span>
            </button>
            <div style={{
              width: 32, height: 32,
              borderRadius: '50%',
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Hanken Grotesk',
              fontWeight: 800,
              fontSize: 13,
              color: 'var(--accent-dark)',
              boxShadow: '0 0 12px color-mix(in srgb, var(--accent) 25%, transparent)',
            }}>
              {profile?.full_name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
          </div>
        </header>

        <main style={{ padding: '20px 20px' }}>
          {/* HERO */}
          <section style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            paddingBottom: 24,
            paddingTop: 8,
          }}>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <div style={{
                width: 96, height: 96,
                borderRadius: '50%',
                background: 'var(--bg-surface-2)',
                border: '2px solid var(--accent-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 20px var(--accent-light)',
              }}>
                <span style={{
                  fontFamily: 'Hanken Grotesk',
                  fontWeight: 800,
                  fontSize: 32,
                  color: 'var(--accent)',
                }}>
                  {profile?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
              {/* Green check badge */}
              <div style={{
                position: 'absolute',
                bottom: 0, right: 0,
                width: 24, height: 24,
                borderRadius: '50%',
                background: 'var(--accent)',
                border: '3px solid var(--bg-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 13,
                    color: 'var(--accent-dark)',
                    fontVariationSettings: "'FILL' 1",
                  }}>
                  check
                </span>
              </div>
            </div>
            <h2 style={{
              fontFamily: 'Hanken Grotesk',
              fontWeight: 700,
              fontSize: 22,
              color: 'var(--text-primary)',
              marginBottom: 8,
            }}>
              {profile?.full_name || 'Naam'}
            </h2>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}>
              <span style={{
                background: 'var(--accent-light)',
                color: 'var(--accent)',
                fontSize: 10,
                fontWeight: 700,
                fontFamily: 'Hanken Grotesk',
                padding: '3px 8px',
                borderRadius: 4,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}>
                {rolLabel}
              </span>
              <span style={{
                fontSize: 13,
                color: 'var(--text-muted)',
                fontFamily: 'Hanken Grotesk',
              }}>
                TerreVolt BV
              </span>
            </div>
          </section>

          {/* ONBOARDING BANNER */}
          {profile?.account_status === 'onboarding' && (
            <div style={{
              padding: '14px 16px',
              borderRadius: 16,
              background: 'rgba(254,179,0,0.06)',
              border: '1px solid rgba(254,179,0,0.2)',
              borderLeft: '3px solid var(--warn-text)',
              marginBottom: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}>
              <div>
                <p style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--warn-text)',
                  fontFamily: 'Hanken Grotesk',
                }}>
                  ⚠ Account nog niet actief
                </p>
                <p style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  fontFamily: 'Hanken Grotesk',
                  marginTop: 2,
                }}>
                  Vul je gegevens aan en rond je onboarding af.
                </p>
              </div>
              <button
                onClick={() => window.location.href = '/onboarding-welkom'}
                style={{
                  padding: '6px 12px',
                  borderRadius: 12,
                  background: 'var(--accent)',
                  color: 'var(--accent-dark)',
                  fontFamily: 'Hanken Grotesk',
                  fontWeight: 700,
                  fontSize: 11,
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}>
                Naar onboarding →
              </button>
            </div>
          )}

          {/* MIJN GEGEVENS */}
          <div style={{
            background: '#111a2c',
            border: '1px solid var(--planning-border-soft)',
            borderRadius: 16,
            marginBottom: 12,
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <h3 style={{
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'Hanken Grotesk',
                color: 'rgba(218,230,255,0.5)',
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
              }}>
                Mijn gegevens
              </h3>
              <button
                onClick={() => editing ? saveProfile() : setEditing(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--accent)',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: 'Hanken Grotesk',
                }}>
                {editing ? 'Opslaan' : 'Bewerken'}
              </button>
            </div>
            <div style={{ padding: '0 20px 16px' }}>
              {editing ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}>
                  {[
                    { label: 'Naam', key: 'full_name' as const },
                    { label: 'Telefoon', key: 'telefoon' as const },
                    { label: 'Adres', key: 'adres' as const },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: profileErrors[f.key] ? 'var(--danger)' : 'var(--text-muted)',
                        fontFamily: 'Hanken Grotesk',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        {f.label}
                      </label>
                      <input
                        value={editForm[f.key]}
                        onChange={e => {
                          setEditForm({ ...editForm, [f.key]: e.target.value });
                          if (profileErrors[f.key])
                            setProfileErrors(prev => {
                              const n = { ...prev };
                              delete n[f.key];
                              return n;
                            });
                        }}
                        style={{
                          width: '100%',
                          marginTop: 4,
                          padding: '10px 14px',
                          borderRadius: 12,
                          background: '#060e20',
                          border: profileErrors[f.key]
                            ? '1.5px solid var(--danger)'
                            : '1px solid var(--planning-border-soft)',
                          color: 'var(--text-primary)',
                          fontFamily: 'Hanken Grotesk',
                          fontSize: 14,
                          outline: 'none',
                          boxSizing: 'border-box',
                        }} />
                      {profileErrors[f.key] && (
                        <p style={{
                          fontSize: 10,
                          color: 'var(--danger)',
                          marginTop: 2,
                          fontFamily: 'Hanken Grotesk',
                        }}>
                          ⚠ {profileErrors[f.key]}
                        </p>
                      )}
                    </div>
                  ))}
                  <div>
                    <label style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      fontFamily: 'Hanken Grotesk',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      Geboortedatum
                    </label>
                    <input
                      type="date"
                      value={editForm.geboortedatum}
                      onChange={e => setEditForm({ ...editForm, geboortedatum: e.target.value })}
                      style={{
                        width: '100%',
                        marginTop: 4,
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: '#060e20',
                        border: '1px solid var(--planning-border-soft)',
                        color: 'var(--text-primary)',
                        fontFamily: 'Hanken Grotesk',
                        fontSize: 14,
                        outline: 'none',
                        boxSizing: 'border-box',
                        colorScheme: 'dark',
                      }} />
                  </div>
                </div>
              ) : (
                <div>
                  {[
                    { icon: 'mail', label: 'Email', value: user?.email },
                    { icon: 'call', label: 'Telefoonnummer', value: profile?.telefoon },
                    { icon: 'location_on', label: 'Adres', value: profile?.adres },
                    { icon: 'event', label: 'Geboortedatum', value: profile?.geboortedatum ? formatDatum(profile.geboortedatum) : null },
                  ].map((row, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '14px 0',
                      borderBottom: i < 3
                        ? '1px solid var(--planning-border-soft)'
                        : 'none',
                    }}>
                      <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        background: '#060e20',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <span
                          className="material-symbols-outlined"
                          style={{
                            fontSize: 20,
                            color: 'var(--text-muted)',
                            fontVariationSettings: "'wght' 300",
                          }}>
                          {row.icon}
                        </span>
                      </div>
                      <div>
                        <p style={{
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          fontFamily: 'Hanken Grotesk',
                          marginBottom: 2,
                        }}>
                          {row.label}
                        </p>
                        <p style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: row.value ? 'var(--text-primary)' : '#54617A',
                          fontFamily: 'Hanken Grotesk',
                        }}>
                          {row.value || '—'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* CERTIFICATEN */}
          <CertificatenOverzicht
            certificaten={certs}
            toonToevoegen={true}
            medewerker_id={profile?.id}
            onRefresh={fetchCerts}
          />

          {/* RIJBEWIJS */}
          <div style={{
            background: '#111a2c',
            border: '1px solid var(--planning-border-soft)',
            borderRadius: 16,
            marginBottom: 12,
            padding: '16px 20px',
          }}>
            <h3 style={{
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'Hanken Grotesk',
              color: 'rgba(218,230,255,0.5)',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              marginBottom: 14,
            }}>
              Rijbewijs
            </h3>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}>
                <div style={{
                  width: 40, height: 40,
                  borderRadius: 12,
                  background: '#060e20',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: 20,
                      color: 'var(--text-muted)',
                      fontVariationSettings: "'wght' 300",
                    }}>
                    directions_car
                  </span>
                </div>
                <div>
                  <p style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    fontFamily: 'Hanken Grotesk',
                    marginBottom: 2,
                  }}>
                    Rijbewijs B
                  </p>
                  <p style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    fontFamily: 'Hanken Grotesk',
                  }}>
                    {profile?.rijbewijs ? 'Bewijs aanwezig' : 'Niet opgegeven'}
                  </p>
                </div>
              </div>
              {profile?.rijbewijs && (
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--accent)',
                  fontFamily: 'Hanken Grotesk',
                }}>
                  Bewijs aanwezig
                </span>
              )}
            </div>
          </div>

          {/* NOODCONTACT */}
          <div style={{
            background: '#111a2c',
            border: '1px solid var(--planning-border-soft)',
            borderRadius: 16,
            marginBottom: 12,
            padding: '16px 20px',
          }}>
            <h3 style={{
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'Hanken Grotesk',
              color: 'rgba(218,230,255,0.5)',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              marginBottom: 14,
            }}>
              Noodcontact
            </h3>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              {[
                { icon: 'person_alert', label: 'Naam contactpersoon', value: (profile as any)?.noodcontact_naam },
                { icon: 'call', label: 'Noodnummer', value: (profile as any)?.noodcontact_tel },
              ].map((row, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                }}>
                  <div style={{
                    width: 40, height: 40,
                    borderRadius: 12,
                    background: '#060e20',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: 20,
                        color: 'var(--text-muted)',
                        fontVariationSettings: "'wght' 300",
                      }}>
                      {row.icon}
                    </span>
                  </div>
                  <div>
                    <p style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      fontFamily: 'Hanken Grotesk',
                      marginBottom: 2,
                    }}>
                      {row.label}
                    </p>
                    <p style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: row.value ? 'var(--text-primary)' : '#54617A',
                      fontFamily: 'Hanken Grotesk',
                    }}>
                      {row.value || '—'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ZZP GEGEVENS */}
          <div style={{
            background: '#111a2c',
            border: '1px solid var(--planning-border-soft)',
            borderRadius: 16,
            marginBottom: 12,
            overflow: 'hidden',
          }}>
            {/* Warning banner */}
            {(!profile?.kvk_nummer || !profile?.iban) && (
              <div style={{
                padding: '10px 16px',
                background: 'rgba(255,113,108,0.08)',
                borderBottom: '1px solid rgba(255,113,108,0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 16,
                    color: 'var(--danger)',
                    fontVariationSettings: "'wght' 300",
                    flexShrink: 0,
                  }}>
                  warning
                </span>
                <p style={{
                  fontSize: 12,
                  color: 'var(--danger)',
                  fontFamily: 'Hanken Grotesk',
                  lineHeight: 1.4,
                }}>
                  Vul je ZZP gegevens aan om inkooporders te kunnen ontvangen
                </p>
              </div>
            )}
            <div style={{
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}>
              <h3 style={{
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'Hanken Grotesk',
                color: 'rgba(218,230,255,0.5)',
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
              }}>
                ZZP Gegevens
              </h3>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                {!editingZzp && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    fontFamily: 'Hanken Grotesk',
                    padding: '3px 8px',
                    borderRadius: 4,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    background: profile?.kvk_nummer && profile?.iban
                      ? 'var(--accent-light)'
                      : 'var(--danger-light)',
                    color: profile?.kvk_nummer && profile?.iban
                      ? 'var(--accent)'
                      : 'var(--danger)',
                  }}>
                    {profile?.kvk_nummer && profile?.iban ? 'Compleet' : 'Incompleet'}
                  </span>
                )}
                <button
                  onClick={() => editingZzp ? saveZzp() : setEditingZzp(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--accent)',
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: 'Hanken Grotesk',
                  }}>
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: 18,
                      fontVariationSettings: "'wght' 300",
                    }}>
                    {editingZzp ? 'save' : 'edit'}
                  </span>
                </button>
              </div>
            </div>
            <div style={{ padding: '0 20px 16px' }}>
              {editingZzp ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}>
                  {[
                    { label: 'Bedrijfsnaam', key: 'bedrijfsnaam' as const },
                    { label: 'KvK-nummer', key: 'kvk_nummer' as const },
                    { label: 'BTW-nummer', key: 'btw_nummer' as const },
                    { label: 'IBAN', key: 'iban' as const },
                    { label: 'Factuuradres', key: 'factuuradres' as const },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                        fontFamily: 'Hanken Grotesk',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>
                        {f.label}
                      </label>
                      <input
                        value={zzpEditForm[f.key]}
                        onChange={e => setZzpEditForm({ ...zzpEditForm, [f.key]: e.target.value })}
                        style={{
                          width: '100%',
                          marginTop: 4,
                          padding: '10px 14px',
                          borderRadius: 12,
                          background: '#060e20',
                          border: '1px solid var(--planning-border-soft)',
                          color: 'var(--text-primary)',
                          fontFamily: 'Hanken Grotesk',
                          fontSize: 14,
                          outline: 'none',
                          boxSizing: 'border-box',
                        }} />
                    </div>
                  ))}
                  <div>
                    <label style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      fontFamily: 'Hanken Grotesk',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      Betalingstermijn (dagen)
                    </label>
                    <input
                      type="number"
                      value={zzpEditForm.betalingstermijn}
                      onChange={e => setZzpEditForm({ ...zzpEditForm, betalingstermijn: Number(e.target.value) || 30 })}
                      style={{
                        width: '100%',
                        marginTop: 4,
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: '#060e20',
                        border: '1px solid var(--planning-border-soft)',
                        color: 'var(--text-primary)',
                        fontFamily: 'Hanken Grotesk',
                        fontSize: 14,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }} />
                  </div>
                  <button
                    onClick={() => {
                      setEditingZzp(false);
                      setZzpEditForm({
                        bedrijfsnaam: profile?.bedrijfsnaam || '',
                        kvk_nummer: profile?.kvk_nummer || '',
                        btw_nummer: profile?.btw_nummer || '',
                        iban: profile?.iban || '',
                        factuuradres: profile?.factuuradres || '',
                        betalingstermijn: profile?.betalingstermijn || 30,
                      });
                    }}
                    style={{
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      fontFamily: 'Hanken Grotesk',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}>
                    Annuleren
                  </button>
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px 16px',
                }}>
                  {[
                    { label: 'Bedrijfsnaam', value: profile?.bedrijfsnaam },
                    { label: 'KVK-nummer', value: profile?.kvk_nummer },
                    { label: 'BTW-nummer', value: profile?.btw_nummer },
                    { label: 'IBAN', value: profile?.iban, warn: !profile?.iban },
                  ].map((row, i) => (
                    <div key={i}>
                      <p style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontFamily: 'Hanken Grotesk',
                        marginBottom: 3,
                      }}>
                        {row.label}
                      </p>
                      <p style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: row.warn
                          ? 'var(--danger)'
                          : row.value
                          ? 'var(--text-primary)'
                          : '#54617A',
                        fontFamily: 'Hanken Grotesk',
                      }}>
                        {row.value || (row.warn ? 'Niet ingevuld' : '—')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* CONTRACT */}
          {permissies.zietDashboard
            ? <ManagerHandtekeningSection profileId={profile?.id || null} />
            : <MonteurContractSection profileId={profile?.id || null} />
          }

          {/* BESCHIKBAARHEID */}
          <div style={{
            background: '#111a2c',
            border: '1px solid var(--planning-border-soft)',
            borderRadius: 16,
            marginBottom: 12,
            padding: '16px 20px',
          }}>
            <h3 style={{
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'Hanken Grotesk',
              color: 'rgba(218,230,255,0.5)',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              marginBottom: 14,
            }}>
              Beschikbaarheid
            </h3>
            <p style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              fontFamily: 'Hanken Grotesk',
              marginBottom: 10,
            }}>
              Vaste vrije dagen
            </p>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 4,
            }}>
              {[1,2,3,4,5,6,0].map(dag => {
                const active = profile?.vaste_vrije_dagen?.includes(dag);
                return (
                  <button
                    key={dag}
                    onClick={() => toggleVrijeDag(dag)}
                    style={{
                      flex: 1,
                      aspectRatio: '1',
                      borderRadius: 12,
                      background: active
                        ? 'var(--accent-light)'
                        : '#060e20',
                      border: active
                        ? '1px solid var(--accent-border)'
                        : '1px solid var(--planning-border-soft)',
                      color: active ? 'var(--accent)' : '#54617A',
                      fontFamily: 'Hanken Grotesk',
                      fontWeight: 700,
                      fontSize: 10,
                      cursor: 'pointer',
                      boxShadow: active
                        ? '0 0 12px var(--accent-light)'
                        : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    {DAGEN_LABEL[dag]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ACTIE KNOPPEN */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 12,
          }}>
            <button
              onClick={() => navigate('/verlof-aanvragen')}
              style={{
                background: 'var(--accent-light)',
                border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                borderRadius: 16,
                padding: '20px 16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
              }}>
              <div style={{
                width: 48, height: 48,
                borderRadius: '50%',
                background: 'var(--accent-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 24,
                    color: 'var(--accent)',
                    fontVariationSettings: "'wght' 300",
                  }}>
                  event_busy
                </span>
              </div>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'Hanken Grotesk',
                color: 'var(--accent)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                textAlign: 'center',
              }}>
                Verlof aanvragen
              </span>
            </button>
            <button
              onClick={() => navigate('/ziek-melden')}
              style={{
                background: 'rgba(255,113,108,0.08)',
                border: '1px solid rgba(255,113,108,0.25)',
                borderRadius: 16,
                padding: '20px 16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                cursor: 'pointer',
              }}>
              <div style={{
                width: 48, height: 48,
                borderRadius: '50%',
                background: 'rgba(255,113,108,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 24,
                    color: 'var(--danger)',
                    fontVariationSettings: "'wght' 300",
                  }}>
                  medical_services
                </span>
              </div>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'Hanken Grotesk',
                color: 'var(--danger)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                textAlign: 'center',
              }}>
                Ziek melden
              </span>
            </button>
          </div>

          {/* MIJN ORDERS SHORTCUT */}
          <button
            onClick={() => navigate('/mijn-orders')}
            style={{
              width: '100%',
              padding: '16px 20px',
              borderRadius: 16,
              background: '#111a2c',
              border: '1px solid var(--planning-border-soft)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              marginBottom: 12,
            }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}>
              <div style={{
                width: 44, height: 44,
                borderRadius: '50%',
                background: 'var(--accent-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 22,
                    color: 'var(--accent)',
                    fontVariationSettings: "'wght' 300",
                  }}>
                  receipt_long
                </span>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  fontFamily: 'Hanken Grotesk',
                  marginBottom: 2,
                }}>
                  Mijn inkooporders
                </div>
                <div style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  fontFamily: 'Hanken Grotesk',
                }}>
                  Bekijk je orders en PDF's
                </div>
              </div>
            </div>
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: 20,
                color: '#54617A',
                fontVariationSettings: "'wght' 300",
              }}>
              chevron_right
            </span>
          </button>

          {/* INSTALLEER APP */}
          {canShowInstallPrompt() && (
            <button
              onClick={triggerInstallPrompt}
              style={{
                width: '100%',
                padding: '16px 20px',
                borderRadius: 16,
                background: '#111a2c',
                border: '1px solid var(--accent-border)',
                color: 'var(--accent)',
                fontFamily: 'Hanken Grotesk',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 12,
              }}>
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 20,
                  fontVariationSettings: "'wght' 300",
                }}>
                install_mobile
              </span>
              Installeer app op beginscherm
            </button>
          )}

          {/* THEMA KIEZER */}
          <div style={{
            width: '100%',
            padding: '16px 20px',
            borderRadius: 16,
            background: '#111a2c',
            border: '1px solid var(--planning-border-soft)',
            marginBottom: 12,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginBottom: 12,
            }}>
              <div style={{
                width: 44, height: 44,
                borderRadius: '50%',
                background: 'var(--accent-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 22,
                    color: 'var(--accent)',
                    fontVariationSettings: "'wght' 300",
                  }}>
                  palette
                </span>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  fontFamily: 'DM Sans',
                  marginBottom: 2,
                }}>
                  Thema
                </div>
                <div style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  fontFamily: 'DM Sans',
                }}>
                  Kies tussen donker of licht (Emerald)
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {([
                { value: 'dark', label: 'Donker' },
                { value: 'emerald', label: 'Licht' },
              ] as const).map((opt) => {
                const active = (document.documentElement.dataset.theme || 'dark') === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      localStorage.setItem('terrevolt_theme', opt.value);
                      document.documentElement.dataset.theme = opt.value;
                      // forceer re-render
                      window.dispatchEvent(new Event('themechange'));
                      setTimeout(() => window.location.reload(), 50);
                    }}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      fontFamily: 'DM Sans',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                      border: active ? '1px solid var(--accent)' : '1px solid var(--planning-border-soft)',
                      background: active ? 'var(--accent-light)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-primary)',
                    }}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>



        </main>
        <BottomNav badges={badges} />
      </div>
    </PageShell>
  );
}

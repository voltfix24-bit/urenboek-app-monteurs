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
import { Spinner } from "@/components/ui/Spinner";
import { HandtekeningCanvas } from "@/components/HandtekeningCanvas";
import { formatDatum } from "@/lib/formatting";
import { CONTRACT_STATUS_CONFIG } from "@/lib/contractStatus";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, isWithinInterval, parseISO, differenceInDays } from "date-fns";
import { nl } from "date-fns/locale";

interface ProfileData { id: string; full_name: string; telefoon: string; adres: string; rijbewijs: boolean; vaste_vrije_dagen: number[]; kvk_nummer?: string | null; btw_nummer?: string | null; iban?: string | null; bedrijfsnaam?: string | null; uurtarief?: number | null; betalingstermijn?: number; factuuradres?: string | null; geboortedatum?: string | null; account_status?: string; }
interface Certificaat { id: string; type: string; naam: string; vervaldatum: string | null; subtype?: string | null; ggi_gebieden?: string[] | null; }
interface BeschikbaarheidItem { id: string; type: string; datum_van: string; datum_tot: string; reden: string | null; status: string; }

const CERT_COLORS: Record<string, string> = { VCA: "var(--success)", NEN3140: "var(--info-dark)", rijbewijs_BE: "var(--warn-text)", overig: "var(--purple)" };
const DAGEN_LABEL = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"];
const AVATAR_COLORS = ['var(--accent)', 'var(--accent-mid)', 'var(--info-dark)', 'var(--warn-text)', 'var(--purple)'];

const TYPE_COLORS: Record<string, { bg: string; border: string; dot: string }> = {
  vakantie: { bg: "var(--warn-light)", border: "var(--warn-border)", dot: "var(--warn-dot)" },
  verlof: { bg: "var(--info-light)", border: "var(--info-border)", dot: "var(--info)" },
  ziek: { bg: "var(--danger-light)", border: "var(--danger-border)", dot: "var(--danger)" },
  anders: { bg: "var(--bg-surface)", border: "var(--border)", dot: "var(--text-muted)" },
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
      <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Nieuw wachtwoord" className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
      <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Herhaal nieuw wachtwoord" className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
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
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Jouw handtekening</p>
      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Voor digitale ondertekening van contracten</p>

      {htData?.handtekening && !showCanvas ? (
        <>
          <div style={{ maxWidth: 300 }}>
            <img src={htData.handtekening} alt="Handtekening" style={{ width: "100%", height: 80, objectFit: "contain", background: "#fff", borderRadius: 8, border: "1px solid var(--border)" }} />
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

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Mijn contract</p>

      {contract?.status === "ondertekend_beiden" && (
        <div className="rounded-xl p-3.5 space-y-2" style={{ background: "var(--success-light)", border: "1px solid var(--success-border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--success)" }}>✅ Actief contract</p>
          <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{contract.contract_nummer}</p>
          {contract.startdatum && contract.einddatum && (
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Geldig: {formatDatum(contract.startdatum)} — {formatDatum(contract.einddatum)}</p>
          )}
          {contractDays !== null && contractDays <= 30 && contractDays >= 0 && (
            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "var(--warn-bg)", color: "var(--warn-text)" }}>⚠ Verloopt binnenkort</span>
          )}
          <button onClick={downloadPdf} className="flex items-center gap-1.5 text-xs font-medium mt-1" style={{ color: "var(--accent)" }}>
            <Download className="h-3.5 w-3.5" /> Download contract PDF
          </button>
        </div>
      )}

      {contract?.status === "ondertekend_ot" && (
        <div className="rounded-xl p-3.5 space-y-1" style={{ background: "var(--info-light)", border: "1px solid var(--info-border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--info)" }}>⏳ Wacht op TerreVolt</p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Je hebt ondertekend. TerreVolt rondt dit zo snel mogelijk af.</p>
        </div>
      )}

      {contract?.status === "verstuurd" && (
        <div className="rounded-xl p-3.5 space-y-1" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--warn-text)" }}>📧 Wacht op jouw handtekening</p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Bekijk je e-mail voor de ondertekeningslink.</p>
          <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Geen e-mail ontvangen? Neem contact op via info@terrevolt.nl</p>
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
  const { refetch: refetchProfileContext } = useProfile();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [certs, setCerts] = useState<Certificaat[]>([]);
  const [beschikbaarheid, setBeschikbaarheid] = useState<BeschikbaarheidItem[]>([]);
  const [editing, setEditing] = useState(false);
  const [editingZzp, setEditingZzp] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: "", telefoon: "", adres: "", geboortedatum: "" });
  const [zzpEditForm, setZzpEditForm] = useState({ bedrijfsnaam: "", kvk_nummer: "", btw_nummer: "", iban: "", factuuradres: "", betalingstermijn: 30 });
  const [showVerlof, setShowVerlof] = useState(false);
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
    if (diff < 0) return { label: "Verlopen", color: "var(--danger)" };
    if (diff < 30) return { label: `${Math.ceil(diff)}d`, color: "var(--warn-dot)" };
    return { label: "Geldig", color: "var(--success)" };
  };

  const statusColors: Record<string, { bg: string; text: string }> = {
    aangevraagd: { bg: "var(--warn-light)", text: "var(--warn-text)" },
    goedgekeurd: { bg: "var(--success-light)", text: "var(--success)" },
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

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}><Spinner center={false} /></div>;

  return (
    <PageShell>
      <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
        <div className="px-4 py-3 flex items-center gap-2.5">
          <HeaderLogo />
          <span className="text-base font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Profiel</span>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold" style={{ background: AVATAR_COLORS[0], color: "#fff" }}>
            {profile?.full_name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div className="text-center">
            <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{profile?.full_name}</p>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full mt-1 inline-block" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
              {rolLabel}
            </span>
          </div>
        </div>

        {/* Onboarding banner */}
        {profile?.account_status === 'onboarding' && (
          <div className="rounded-2xl p-4 flex items-center justify-between gap-3" style={{ background: "var(--warn-bg)", border: "1px solid var(--warn-border)" }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--warn-text)" }}>⚠ Je account is nog niet actief</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Vul je gegevens aan en rond je onboarding af.</p>
            </div>
            <button onClick={() => window.location.href = "/onboarding-welkom"} className="px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0" style={{ background: "var(--accent)", color: "#fff" }}>
              Naar onboarding →
            </button>
          </div>
        )}

        {/* Mijn gegevens */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Mijn gegevens</p>
            <button onClick={() => editing ? saveProfile() : setEditing(true)} className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--accent)" }}>
              {editing ? <><Save className="h-3 w-3" /> Opslaan</> : <><Edit2 className="h-3 w-3" /> Bewerken</>}
            </button>
          </div>
          {editing ? (
            <div className="space-y-2">
              {[{ label: "Naam", key: "full_name" as const }, { label: "Telefoon", key: "telefoon" as const }, { label: "Adres", key: "adres" as const }].map(f => (
                <div key={f.key}>
                  <label className="text-[10px] font-medium" style={{ color: profileErrors[f.key] ? "var(--danger)" : "var(--text-muted)" }}>{f.label}</label>
                  <input value={editForm[f.key]} onChange={e => { setEditForm({ ...editForm, [f.key]: e.target.value }); if (profileErrors[f.key]) setProfileErrors(prev => { const n = { ...prev }; delete n[f.key]; return n; }); }} className="w-full px-3 py-2 rounded-xl text-sm mt-1" style={{ background: "var(--bg-base)", border: profileErrors[f.key] ? "1.5px solid var(--danger)" : "1px solid var(--border)", color: "var(--text-primary)" }} />
                  {profileErrors[f.key] && <p className="text-[10px] font-medium mt-0.5" style={{ color: "var(--danger)" }}>⚠ {profileErrors[f.key]}</p>}
                </div>
              ))}
              {/* Geboortedatum */}
              <div>
                <label className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Geboortedatum</label>
                <input type="date" value={editForm.geboortedatum} onChange={e => setEditForm({ ...editForm, geboortedatum: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm mt-1" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Email</span><span style={{ color: "var(--text-primary)" }}>{user?.email}</span></div>
              <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Telefoon</span><span style={{ color: "var(--text-primary)" }}>{profile?.telefoon || "–"}</span></div>
              <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Adres</span><span style={{ color: "var(--text-primary)" }}>{profile?.adres || "–"}</span></div>
              <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Geboortedatum</span><span style={{ color: "var(--text-primary)" }}>{profile?.geboortedatum ? formatDatum(profile.geboortedatum) : "–"}</span></div>
            </div>
          )}
        </div>

        {/* ZZP Gegevens */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>ZZP Gegevens</p>
            <div className="flex items-center gap-2">
              {!editingZzp && (profile?.kvk_nummer && profile?.iban ? (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--success-light)", color: "var(--success)" }}>✓ Compleet</span>
              ) : (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--warn-bg)", color: "var(--warn-text)" }}>⚠ Incompleet</span>
              ))}
              <button onClick={() => editingZzp ? saveZzp() : setEditingZzp(true)} className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--accent)" }}>
                {editingZzp ? <><Save className="h-3 w-3" /> Opslaan</> : <><Edit2 className="h-3 w-3" /> Bewerken</>}
              </button>
            </div>
          </div>
          {editingZzp ? (
            <div className="space-y-2">
              {[
                { label: "Bedrijfsnaam", key: "bedrijfsnaam" as const },
                { label: "KvK-nummer", key: "kvk_nummer" as const },
                { label: "BTW-nummer", key: "btw_nummer" as const },
                { label: "IBAN", key: "iban" as const },
                { label: "Factuuradres", key: "factuuradres" as const },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>{f.label}</label>
                  <input value={zzpEditForm[f.key]} onChange={e => setZzpEditForm({ ...zzpEditForm, [f.key]: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm mt-1" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                </div>
              ))}
              <div>
                <label className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Betalingstermijn (dagen)</label>
                <input type="number" value={zzpEditForm.betalingstermijn} onChange={e => setZzpEditForm({ ...zzpEditForm, betalingstermijn: Number(e.target.value) || 30 })} className="w-full px-3 py-2 rounded-xl text-sm mt-1" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>
              <button onClick={() => { setEditingZzp(false); setZzpEditForm({ bedrijfsnaam: profile?.bedrijfsnaam || "", kvk_nummer: profile?.kvk_nummer || "", btw_nummer: profile?.btw_nummer || "", iban: profile?.iban || "", factuuradres: profile?.factuuradres || "", betalingstermijn: profile?.betalingstermijn || 30 }); }} className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Annuleren</button>
            </div>
          ) : (
            <>
              {(!profile?.kvk_nummer || !profile?.iban) && (
                <div className="rounded-xl p-2.5 flex items-start gap-2" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
                  <span className="text-xs" style={{ color: "var(--warn-text)" }}>⚠ Vul je ZZP gegevens aan om inkooporders te kunnen ontvangen</span>
                </div>
              )}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Bedrijfsnaam</span><span style={{ color: "var(--text-primary)" }}>{profile?.bedrijfsnaam || "–"}</span></div>
                <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>KvK-nummer</span><span className="font-mono" style={{ color: profile?.kvk_nummer ? "var(--text-primary)" : "var(--warn-text)" }}>{profile?.kvk_nummer || "Niet ingevuld"}</span></div>
                <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>BTW-nummer</span><span className="font-mono" style={{ color: "var(--text-primary)" }}>{profile?.btw_nummer || "–"}</span></div>
                <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>IBAN</span><span className="font-mono" style={{ color: profile?.iban ? "var(--text-primary)" : "var(--warn-text)" }}>{profile?.iban || "Niet ingevuld"}</span></div>
                {permissies.zietProjectFinancien && profile?.uurtarief != null && <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Uurtarief</span><span className="font-mono font-semibold" style={{ color: "var(--accent)" }}>€ {Number(profile.uurtarief).toFixed(2)}</span></div>}
                <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Factuuradres</span><span style={{ color: "var(--text-primary)" }}>{profile?.factuuradres || "–"}</span></div>
                <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Betalingstermijn</span><span style={{ color: "var(--text-primary)" }}>{profile?.betalingstermijn || 30} dagen</span></div>
              </div>
            </>
          )}
        </div>

        {/* Manager handtekening section */}
        {permissies.zietDashboard && <ManagerHandtekeningSection profileId={profile?.id || null} />}

        {/* Monteur contract section */}
        {!permissies.zietDashboard && <MonteurContractSection profileId={profile?.id || null} />}

        {/* Beschikbaarheid & Kalender */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Beschikbaarheid</p>

          {/* Vaste vrije dagen */}
          <div>
            <p className="text-[10px] font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Vaste vrije dagen</p>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map(dag => {
                const active = profile?.vaste_vrije_dagen?.includes(dag);
                return (
                  <button key={dag} onClick={() => toggleVrijeDag(dag)} className="flex-1 py-2 rounded-xl text-[11px] font-semibold" style={{
                    background: active ? "var(--accent-light)" : "var(--bg-base)",
                    border: active ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                    color: active ? "var(--accent)" : "var(--text-muted)",
                  }}>{DAGEN_LABEL[dag]}</button>
                );
              })}
            </div>
          </div>

          {/* Calendar */}
          <div className="rounded-xl p-3" style={{ background: "var(--bg-base)", border: "1px solid var(--bg-surface-2)" }}>
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setCalMonth(subMonths(calMonth, 1))} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface)" }}>
                <ChevronLeft className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
              </button>
              <span className="text-sm font-semibold capitalize" style={{ color: "var(--text-primary)" }}>
                {format(calMonth, "MMMM yyyy", { locale: nl })}
              </span>
              <button onClick={() => setCalMonth(addMonths(calMonth, 1))} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface)" }}>
                <ChevronRight className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
              </button>
            </div>
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map(d => (
                <div key={d} className="text-center text-[9px] font-semibold py-1" style={{ color: "var(--text-muted)" }}>{d}</div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7 gap-0.5">
              {/* Padding for start of month (convert Sun=0 to Mon-based) */}
              {Array.from({ length: (startPad + 6) % 7 }).map((_, i) => (
                <div key={`pad-${i}`} className="h-9" />
              ))}
              {days.map(day => {
                const status = getDayStatus(day);
                const isToday = isSameDay(day, new Date());
                const tc = status ? (TYPE_COLORS[status.type] || TYPE_COLORS.anders) : null;
                return (
                  <div key={day.toISOString()} className="h-9 flex flex-col items-center justify-center rounded-lg relative" style={{
                    background: tc ? tc.bg : isToday ? "var(--accent-light)" : "transparent",
                    border: isToday ? "1.5px solid var(--accent)" : tc ? `1px solid ${tc.border}` : "1px solid transparent",
                  }}>
                    <span className="text-[11px] font-medium" style={{ color: tc ? tc.dot : isToday ? "var(--text-primary)" : "var(--text-secondary)" }}>
                      {format(day, "d")}
                    </span>
                    {tc && (
                      <span className="w-1.5 h-1.5 rounded-full absolute bottom-1" style={{ background: tc.dot }} />
                    )}
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-3 pt-2" style={{ borderTop: "1px solid var(--bg-surface-2)" }}>
              {[
                { label: "Vrije dag", color: "var(--text-muted)" },
                { label: "Vakantie", color: "var(--warn-dot)" },
                { label: "Ziek", color: "var(--danger)" },
                { label: "Verlof", color: "var(--info)" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
                  <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button onClick={() => setShowVerlof(true)} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)", color: "var(--warn-text)" }}>
              Verlof aanvragen
            </button>
            <button onClick={meldZiek} className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1" style={{ background: "var(--danger-light)", border: "1px solid var(--danger-border)", color: "var(--danger)" }}>
              <ThermometerSun className="h-3.5 w-3.5" /> Ziek melden
            </button>
          </div>

          {/* Recent items */}
          {beschikbaarheid.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>Recente aanvragen</p>
              {beschikbaarheid.slice(0, 5).map(b => {
                const sc = statusColors[b.status] || statusColors.aangevraagd;
                return (
                  <div key={b.id} className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ background: "var(--bg-base)" }}>
                    <div>
                      <span className="text-xs font-medium capitalize" style={{ color: "var(--text-primary)" }}>{b.type}</span>
                      <span className="text-[10px] ml-2" style={{ color: "var(--text-muted)" }}>
                        {format(parseISO(b.datum_van), "d MMM", { locale: nl })} → {format(parseISO(b.datum_tot), "d MMM", { locale: nl })}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.text }}>{b.status}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Certificaten */}
        <CertificatenOverzicht
          certificaten={certs}
          toonToevoegen={true}
          medewerker_id={profile?.id}
          onRefresh={fetchCerts}
        />

        {/* Noodcontact */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "#FFF8DC", border: "1px solid var(--warn-border)", borderRadius: 12 }}>
          <p className="text-xs font-semibold flex items-center gap-1" style={{ color: "var(--warn-text)" }}>🚨 Noodcontact</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Naam</span><span style={{ color: "var(--text-primary)" }}>{(profile as any)?.noodcontact_naam || "–"}</span></div>
            <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Telefoon</span><span style={{ color: "var(--text-primary)" }}>{(profile as any)?.noodcontact_tel || "–"}</span></div>
          </div>
        </div>

        {/* Instellingen - Weergave */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Instellingen</p>
          <div>
            <p className="text-[10px] font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Weergave</p>
            <div className="flex gap-1.5">
              {([
                { key: "light", label: "☀ Licht" },
                { key: "system", label: "Systeem" },
                { key: "dark", label: "☾ Donker" },
              ] as const).map(opt => {
                const current = localStorage.getItem("terrevolt_theme") || "light";
                const active = current === opt.key;
                return (
                  <button key={opt.key} onClick={() => {
                    localStorage.setItem("terrevolt_theme", opt.key);
                    if (opt.key === "dark") {
                      document.documentElement.dataset.theme = "dark";
                    } else if (opt.key === "light") {
                      delete document.documentElement.dataset.theme;
                    } else {
                      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                      if (prefersDark) {
                        document.documentElement.dataset.theme = "dark";
                      } else {
                        delete document.documentElement.dataset.theme;
                      }
                    }
                    setLoading(l => !l);
                    setTimeout(() => setLoading(l => !l), 0);
                  }} className="flex-1 py-2.5 rounded-xl text-[11px] font-semibold" style={{
                    background: active ? "var(--accent-light)" : "var(--bg-base)",
                    border: active ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                    color: active ? "var(--accent)" : "var(--text-muted)",
                  }}>{opt.label}</button>
                );
              })}
            </div>
          </div>

          {/* Wachtwoord wijzigen */}
          <PasswordChange />
        </div>

        <button onClick={signOut} className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2" style={{ background: "var(--danger-light)", border: "1px solid var(--danger-border)", color: "var(--danger)" }}>
          <LogOut className="h-4 w-4" /> Uitloggen
        </button>
      </main>

      {/* Verlof modal */}
      {showVerlof && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowVerlof(false)}>
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--text-primary) 35%, transparent)", backdropFilter: "blur(6px)" }} />
          <div className="relative w-full animate-sheet-up rounded-t-3xl p-5 space-y-4" style={{ maxWidth: 430, maxHeight: "85vh", overflowY: "auto", background: "var(--bg-surface)", border: "1px solid var(--border)", borderBottom: "none", paddingBottom: 40 }} onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto" style={{ background: "var(--border)" }} />
            <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Verlof aanvragen</h2>
            <div className="space-y-3">
              <div className="flex gap-2">
                {(["vakantie", "verlof", "anders"] as const).map(t => (
                  <button key={t} onClick={() => setVerlofForm({ ...verlofForm, type: t })} className="flex-1 py-2 rounded-xl text-xs font-semibold capitalize" style={{
                    background: verlofForm.type === t ? "var(--accent-light)" : "var(--bg-base)",
                    border: verlofForm.type === t ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                    color: verlofForm.type === t ? "var(--accent)" : "var(--text-muted)",
                  }}>{t}</button>
                ))}
              </div>
              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px]" style={{ color: "var(--text-muted)" }}>Van</label>
                  <input type="date" value={verlofForm.datum_van} onChange={e => setVerlofForm({ ...verlofForm, datum_van: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)", colorScheme: "light" }} />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[10px]" style={{ color: "var(--text-muted)" }}>Tot</label>
                  <input type="date" value={verlofForm.datum_tot} onChange={e => setVerlofForm({ ...verlofForm, datum_tot: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)", colorScheme: "light" }} />
                </div>
              </div>
              <input value={verlofForm.reden} onChange={e => setVerlofForm({ ...verlofForm, reden: e.target.value })} placeholder="Reden (optioneel)" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              <button onClick={requestVerlof} disabled={!verlofForm.datum_van || !verlofForm.datum_tot} className="w-full py-3 rounded-2xl text-sm font-bold disabled:opacity-40" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", color: "#fff" }}>
                Aanvragen
              </button>
            </div>
          </div>
        </div>
      )}


    </PageShell>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, MapPin, Mail, ShieldAlert, Calendar, Building2, Hash, CreditCard, AlertTriangle, Download, FileText, Check, X, Trash2, Edit2, Save, KeyRound, Copy, Eye, EyeOff, RotateCw } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import CertificatenOverzicht from "@/components/CertificatenOverzicht";
import { StatusBadge, roleLabels, type Employee } from "./MedewerkerKaart";
import { CONTRACT_STATUS_CONFIG } from "@/lib/contractStatus";
import { supabase } from "@/integrations/supabase/client";
import { formatDatum } from "@/lib/formatting";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>{title}</p>
      {children}
    </div>
  );
}

function InfoRow({ icon, label, value, isLink }: { icon: React.ReactNode; label: string; value: string; isLink?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: "#a0abc3" }}>{icon}</span>
      <span className="text-[11px]" style={{ color: "#a0abc3" }}>{label}:</span>
      {isLink ? (
        <a href={isLink} className="text-sm underline" style={{ color: "#3fff8b" }}>{value}</a>
      ) : (
        <span className="text-sm" style={{ color: "#dae6ff" }}>{value}</span>
      )}
    </div>
  );
}

interface Props {
  emp: Employee;
  certs: any[];
  onRefreshCerts: () => void;
  onRefresh?: () => void;
  onDelete?: (userId: string, name: string) => void;
}

function VerificatiePanel({ emp, certs, contract, onActivate, onAfwijzen }: {
  emp: Employee; certs: any[]; contract: any;
  onActivate: () => void; onAfwijzen: (reden: string) => void;
}) {
  const [showAfwijzen, setShowAfwijzen] = useState(false);
  const [afwijsReden, setAfwijsReden] = useState("");
  const [showActiveer, setShowActiveer] = useState(false);

  const heeftCerts = certs.length >= 1;
  const heeftContract = contract && ["ondertekend_beiden", "ondertekend_ot"].includes(contract.status);
  const naamAdresOk = !!(emp.full_name && emp.adres);
  const alleChecks = naamAdresOk && heeftCerts && heeftContract;

  const checks = [
    { label: "Naam en adres kloppen", ok: naamAdresOk },
    { label: "KVK-nummer gecontroleerd", ok: !!emp.kvk_nummer },
    { label: "Minstens 1 certificaat aanwezig", ok: heeftCerts },
    { label: "Contract is ondertekend", ok: heeftContract },
  ];

  return (
    <>
      <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(254,179,0,0.1)", border: "1px solid rgba(254,179,0,0.3)" }}>
        <p className="text-sm font-bold flex items-center gap-1.5" style={{ color: "#feb300" }}>
          <AlertTriangle className="h-4 w-4" /> Verificatie vereist
        </p>
        <p className="text-xs" style={{ color: "#a0abc3" }}>{emp.full_name} heeft het onboarding profiel ingevuld.</p>

        <div className="space-y-1.5 mt-2">
          {checks.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              {c.ok ? (
                <Check className="h-3.5 w-3.5" style={{ color: "#3fff8b" }} />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" style={{ color: "#feb300" }} />
              )}
              <span className="text-xs" style={{ color: c.ok ? "#3fff8b" : "#feb300" }}>{c.label}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-3">
          <button onClick={() => setShowActiveer(true)} disabled={!alleChecks} className="flex-1 py-2 rounded-xl text-xs font-semibold disabled:opacity-40" style={{ background: "#3fff8b", color: "#fff" }}>
            ✓ Activeren
          </button>
          <button onClick={() => setShowAfwijzen(true)} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "rgba(255,113,108,0.1)", color: "#ff716c", border: "1px solid rgba(255,113,108,0.3)" }}>
            ✕ Afwijzen
          </button>
        </div>
      </div>

      <AlertDialog open={showActiveer} onOpenChange={setShowActiveer}>
        <AlertDialogContent style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "#dae6ff" }}>Account activeren</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "#a0abc3" }}>
              Weet je zeker dat je <strong>{emp.full_name}</strong> wilt activeren? Ze kunnen daarna worden ingepland en uren boeken.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: "#142640", color: "#a0abc3", border: "1px solid rgba(106,118,140,0.15)" }}>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={onActivate} style={{ background: "#3fff8b", color: "#fff" }}>Ja, activeren</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showAfwijzen} onOpenChange={setShowAfwijzen}>
        <AlertDialogContent style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "#dae6ff" }}>Account afwijzen</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "#a0abc3" }}>
              Geef een reden op voor het afwijzen van <strong>{emp.full_name}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <textarea value={afwijsReden} onChange={e => setAfwijsReden(e.target.value)} placeholder="Reden..." rows={3} className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: "#142640", color: "#a0abc3", border: "1px solid rgba(106,118,140,0.15)" }}>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onAfwijzen(afwijsReden); setShowAfwijzen(false); }} disabled={!afwijsReden.trim()} style={{ background: "#ff716c", color: "#fff" }}>Afwijzen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function MedewerkerDetail({ emp, certs, onRefreshCerts, onRefresh, onDelete }: Props) {
  const navigate = useNavigate();
  const { profileId: myProfileId } = useProfile();
  const [contract, setContract] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showPwPanel, setShowPwPanel] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newEmail, setNewEmail] = useState(emp.email || "");
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwResult, setPwResult] = useState<{ pw: string; email: string } | null>(null);

  function genPw() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let r = "";
    for (let i = 0; i < 10; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
    setNewPw(r);
    setShowNewPw(true);
  }

  async function saveWachtwoord() {
    if (!newPw || newPw.length < 8) { toast.error("Wachtwoord moet minimaal 8 tekens zijn"); return; }
    const emailTrim = newEmail.trim().toLowerCase();
    if (!emailTrim || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      toast.error("Gebruikersnaam (e-mail) is ongeldig"); return;
    }
    setPwSaving(true);
    const { data, error } = await supabase.functions.invoke("reset-password", {
      body: { user_id: emp.user_id, password: newPw, email: emailTrim },
    });
    if (!error && !data?.error && emailTrim !== (emp.email || "").toLowerCase()) {
      await supabase.from("profiles").update({ email: emailTrim }).eq("id", emp.id);
    }
    setPwSaving(false);
    if (error || data?.error) { toast.error(data?.error || "Fout bij instellen wachtwoord"); return; }
    setPwResult({ pw: newPw, email: emailTrim });
    setNewPw("");
    toast.success("Inloggegevens ingesteld ✓");
    onRefresh?.();
  }

  function kopieerInloggegevens() {
    if (!pwResult) return;
    const tekst = `Inloggegevens TerreVolt Urenregistratie:\nGebruikersnaam: ${pwResult.email}\nWachtwoord: ${pwResult.pw}\n\nLog in op: ${window.location.origin}`;
    navigator.clipboard.writeText(tekst);
    toast.success("Inloggegevens gekopieerd!");
  }


  const [editForm, setEditForm] = useState({
    full_name: emp.full_name,
    telefoon: emp.telefoon || "",
    adres: emp.adres || "",
    email: emp.email || "",
    bedrijfsnaam: emp.bedrijfsnaam || "",
    kvk_nummer: emp.kvk_nummer || "",
    btw_nummer: emp.btw_nummer || "",
    iban: emp.iban || "",
    uurtarief: emp.uurtarief != null ? String(emp.uurtarief) : "",
    noodcontact_naam: emp.noodcontact_naam || "",
    noodcontact_tel: emp.noodcontact_tel || "",
  });

  useEffect(() => {
    setEditForm({
      full_name: emp.full_name,
      telefoon: emp.telefoon || "",
      adres: emp.adres || "",
      email: emp.email || "",
      bedrijfsnaam: emp.bedrijfsnaam || "",
      kvk_nummer: emp.kvk_nummer || "",
      btw_nummer: emp.btw_nummer || "",
      iban: emp.iban || "",
      uurtarief: emp.uurtarief != null ? String(emp.uurtarief) : "",
      noodcontact_naam: emp.noodcontact_naam || "",
      noodcontact_tel: emp.noodcontact_tel || "",
    });
  }, [emp.id, emp.full_name, emp.telefoon, emp.adres, emp.email, emp.bedrijfsnaam, emp.kvk_nummer, emp.btw_nummer, emp.iban, emp.uurtarief, emp.noodcontact_naam, emp.noodcontact_tel]);

  // Reset editing mode and password panel only when switching to a different employee
  useEffect(() => {
    setEditing(false);
    setShowPwPanel(false);
    setNewPw("");
    setNewEmail(emp.email || "");
    setPwResult(null);
  }, [emp.id, emp.email]);

  useEffect(() => {
    if (!emp.id) return;
    supabase
      .from("contracten")
      .select("*")
      .eq("profiel_id", emp.id)
      .in("status", ["ondertekend_beiden", "ondertekend_ot", "verstuurd", "concept"])
      .order("aangemaakt_op", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setContract(data));
  }, [emp.id]);

  const saveProfile = async () => {
    if (!editForm.full_name.trim()) { toast.error("Naam is verplicht"); return; }
    const update: any = {
      full_name: editForm.full_name.trim(),
      telefoon: editForm.telefoon.trim(),
      adres: editForm.adres.trim(),
      email: editForm.email.trim() || null,
      bedrijfsnaam: editForm.bedrijfsnaam.trim() || null,
      kvk_nummer: editForm.kvk_nummer.trim() || null,
      btw_nummer: editForm.btw_nummer.trim() || null,
      iban: editForm.iban.trim() || null,
      uurtarief: editForm.uurtarief ? Number(editForm.uurtarief) : null,
      noodcontact_naam: editForm.noodcontact_naam.trim() || null,
      noodcontact_tel: editForm.noodcontact_tel.trim() || null,
    };
    if (!await mutate(supabase.from("profiles").update(update).eq("id", emp.id))) return;
    toast.success("Gegevens opgeslagen ✓");
    setEditing(false);
    onRefresh?.();
  };

  const contractDays = contract?.einddatum ? differenceInDays(parseISO(contract.einddatum), new Date()) : null;

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

  const handleActivate = async () => {
    if (!myProfileId) return;
    if (!await mutate(supabase.from("profiles").update({
      account_status: "active",
      geverifieerd_door: myProfileId,
      geverifieerd_op: new Date().toISOString(),
    } as any).eq("id", emp.id))) return;
    // Send message to monteur
    await supabase.from("mededelingen").insert({
      titel: "Je account is actief! 🎉",
      inhoud: "Je kunt nu worden ingepland, uren boeken en alle functies van de app gebruiken. Welkom bij het team!",
      verzonden_door: myProfileId,
      ontvanger_type: "persoon",
      ontvanger_id: emp.id,
      urgentie: "normaal",
    });
    toast.success(`${emp.full_name} geactiveerd ✓`);
    onRefresh?.();
  };

  const handleAfwijzen = async (reden: string) => {
    if (!myProfileId) return;
    if (!await mutate(supabase.from("profiles").update({ account_status: "inactive" } as any).eq("id", emp.id))) return;
    await supabase.from("mededelingen").insert({
      titel: "Account afgewezen",
      inhoud: `Je account is helaas niet geactiveerd. Reden: ${reden}\n\nNeem contact op met je manager voor meer informatie.`,
      verzonden_door: myProfileId,
      ontvanger_type: "persoon",
      ontvanger_id: emp.id,
      urgentie: "normaal",
    });
    toast.success(`${emp.full_name} afgewezen`);
    onRefresh?.();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold" style={{ background: "#3fff8b", color: "#fff" }}>
            {emp.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: "#dae6ff" }}>{emp.full_name}</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm capitalize" style={{ color: "#a0abc3" }}>{roleLabels[emp.role] || emp.role}</span>
              <StatusBadge emp={emp} />
            </div>
          </div>
        </div>
        <button onClick={() => editing ? saveProfile() : setEditing(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: editing ? "#3fff8b" : "rgba(10,26,48,0.7)", border: `1px solid ${editing ? "#3fff8b" : "rgba(106,118,140,0.15)"}`, color: editing ? "#fff" : "#3fff8b" }}>
          {editing ? <><Save className="h-3 w-3" /> Opslaan</> : <><Edit2 className="h-3 w-3" /> Bewerken</>}
        </button>
      </div>

      {editing && (
        <button onClick={() => setEditing(false)} className="text-[11px] font-medium" style={{ color: "#a0abc3" }}>Annuleren</button>
      )}

      {/* Verification panel for onboarding status */}
      {emp.account_status === "onboarding" && (
        <VerificatiePanel emp={emp} certs={certs} contract={contract} onActivate={handleActivate} onAfwijzen={handleAfwijzen} />
      )}

      <Section title="Contactgegevens">
        {editing ? (
          <div className="space-y-2">
            {[
              { label: "Naam", key: "full_name" as const },
              { label: "E-mail", key: "email" as const },
              { label: "Telefoon", key: "telefoon" as const },
              { label: "Adres", key: "adres" as const },
            ].map(f => (
              <div key={f.key}>
                <label className="text-[10px] font-medium" style={{ color: "#a0abc3" }}>{f.label}</label>
                <input value={editForm[f.key]} onChange={e => setEditForm({ ...editForm, [f.key]: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm mt-1" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
              </div>
            ))}
          </div>
        ) : (
          <>
            <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label="E-mail" value={emp.email || "–"} isLink={emp.email ? `mailto:${emp.email}` : undefined} />
            <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Telefoon" value={emp.telefoon || "–"} isLink={emp.telefoon ? `tel:${emp.telefoon}` : undefined} />
            <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Adres" value={emp.adres || "–"} />
          </>
        )}
      </Section>

      <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(254,179,0,0.1)", border: "1px solid rgba(254,179,0,0.3)" }}>
        <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "#feb300" }}>
          <ShieldAlert className="h-3.5 w-3.5" /> Noodcontact
        </p>
        {editing ? (
          <div className="space-y-2">
            <div>
              <label className="text-[10px] font-medium" style={{ color: "#a0abc3" }}>Naam</label>
              <input value={editForm.noodcontact_naam} onChange={e => setEditForm({ ...editForm, noodcontact_naam: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm mt-1" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
            </div>
            <div>
              <label className="text-[10px] font-medium" style={{ color: "#a0abc3" }}>Telefoon</label>
              <input value={editForm.noodcontact_tel} onChange={e => setEditForm({ ...editForm, noodcontact_tel: e.target.value })} className="w-full px-3 py-2 rounded-xl text-sm mt-1" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
            </div>
          </div>
        ) : emp.noodcontact_naam ? (
          <>
            <p className="text-sm" style={{ color: "#dae6ff" }}>{emp.noodcontact_naam}</p>
            {emp.noodcontact_tel && (
              <a href={`tel:${emp.noodcontact_tel}`} className="text-sm underline" style={{ color: "#3fff8b" }}>{emp.noodcontact_tel}</a>
            )}
          </>
        ) : (
          <p className="text-sm" style={{ color: "#a0abc3" }}>Geen noodcontact ingesteld</p>
        )}
      </div>

      {/* Contract section */}
      {contract ? (
        <Section title="Contract">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono" style={{ color: "#a0abc3" }}>{contract.contract_nummer}</span>
              {(() => {
                const cfg = CONTRACT_STATUS_CONFIG[contract.status];
                if (!cfg) return null;
                return (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                    {cfg.icoon} {cfg.label}
                  </span>
                );
              })()}
            </div>
            {contract.startdatum && contract.einddatum && (
              <p className="text-xs" style={{ color: "#a0abc3" }}>
                Geldig: {formatDatum(contract.startdatum)} — {formatDatum(contract.einddatum)}
              </p>
            )}
            {contractDays !== null && (
              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{
                background: contractDays < 0 ? "rgba(255,113,108,0.1)" : contractDays <= 30 ? "rgba(254,179,0,0.08)" : "rgba(63,255,139,0.1)",
                color: contractDays < 0 ? "#ff716c" : contractDays <= 30 ? "#feb300" : "#3fff8b",
              }}>
                {contractDays < 0 ? "✕ Verlopen" : contractDays <= 30 ? `⚠ Verloopt binnenkort (${contractDays} dagen)` : `${contractDays} dagen resterend`}
              </span>
            )}
            {contract.pdf_path && (
              <button onClick={downloadPdf} className="flex items-center gap-1.5 text-xs font-medium mt-1" style={{ color: "#3fff8b" }}>
                <Download className="h-3.5 w-3.5" /> PDF downloaden
              </button>
            )}
          </div>
        </Section>
      ) : (
        <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Contract</p>
          <p className="text-xs" style={{ color: "#a0abc3" }}>Geen actief contract</p>
          <button onClick={() => navigate("/kandidaten")} className="text-xs font-medium flex items-center gap-1" style={{ color: "#3fff8b" }}>
            <FileText className="h-3.5 w-3.5" /> Contract aanmaken
          </button>
        </div>
      )}

      {/* ZZP incomplete warning */}
      {!editing && (!emp.kvk_nummer || !emp.iban) && (
        <div className="flex items-start gap-2 rounded-xl p-3" style={{ background: "rgba(254,179,0,0.1)", border: "1px solid rgba(254,179,0,0.3)" }}>
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#feb300" }} />
          <span className="text-xs" style={{ color: "#feb300" }}>ZZP gegevens incompleet — inkooporder kan niet aangemaakt worden</span>
        </div>
      )}

      {/* ZZP Business details */}
      <Section title="ZZP Gegevens">
        {editing ? (
          <div className="space-y-2">
            {[
              { label: "Bedrijfsnaam", key: "bedrijfsnaam" as const },
              { label: "KvK-nummer", key: "kvk_nummer" as const },
              { label: "BTW-nummer", key: "btw_nummer" as const },
              { label: "IBAN", key: "iban" as const },
              { label: "Uurtarief (€)", key: "uurtarief" as const },
            ].map(f => (
              <div key={f.key}>
                <label className="text-[10px] font-medium" style={{ color: "#a0abc3" }}>{f.label}</label>
                <input value={editForm[f.key]} onChange={e => setEditForm({ ...editForm, [f.key]: e.target.value })} type={f.key === "uurtarief" ? "number" : "text"} step={f.key === "uurtarief" ? "0.01" : undefined} className="w-full px-3 py-2 rounded-xl text-sm mt-1" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
              </div>
            ))}
          </div>
        ) : (
          <>
            {emp.bedrijfsnaam && <InfoRow icon={<Building2 className="h-3.5 w-3.5" />} label="Bedrijf" value={emp.bedrijfsnaam} />}
            {emp.kvk_nummer ? <InfoRow icon={<Hash className="h-3.5 w-3.5" />} label="KvK" value={emp.kvk_nummer} /> : <InfoRow icon={<Hash className="h-3.5 w-3.5" />} label="KvK" value="Niet ingevuld" />}
            {emp.btw_nummer && <InfoRow icon={<Hash className="h-3.5 w-3.5" />} label="BTW" value={emp.btw_nummer} />}
            {emp.iban ? <InfoRow icon={<CreditCard className="h-3.5 w-3.5" />} label="IBAN" value={emp.iban} /> : <InfoRow icon={<CreditCard className="h-3.5 w-3.5" />} label="IBAN" value="Niet ingevuld" />}
            {emp.uurtarief != null && (
              <div className="flex items-center gap-2">
                <span style={{ color: "#a0abc3" }}>€</span>
                <span className="text-[11px]" style={{ color: "#a0abc3" }}>Uurtarief:</span>
                <span className="text-sm font-mono font-semibold" style={{ color: "#3fff8b" }}>€ {Number(emp.uurtarief).toFixed(2)}</span>
              </div>
            )}
          </>
        )}
      </Section>

      <CertificatenOverzicht certificaten={certs} toonToevoegen={true} medewerker_id={emp.id} onRefresh={onRefreshCerts} />

      <Section title="Account info">
        <div className="space-y-1">
          <div className="flex items-center gap-2"><StatusBadge emp={emp} /></div>
          {emp.email && <p className="text-[11px]" style={{ color: "#a0abc3" }}>E-mail: <span style={{ color: "#dae6ff" }}>{emp.email}</span></p>}
          {emp.invited_at && <p className="text-[11px]" style={{ color: "#a0abc3" }}>Uitgenodigd op: {format(parseISO(emp.invited_at), "d MMM yyyy HH:mm", { locale: nl })}</p>}
          {emp.activated_at && <p className="text-[11px]" style={{ color: "#a0abc3" }}>Geactiveerd op: {format(parseISO(emp.activated_at), "d MMM yyyy HH:mm", { locale: nl })}</p>}
        </div>

        {!showPwPanel && !pwResult && (
          <button
            onClick={() => setShowPwPanel(true)}
            className="w-full mt-2 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
            style={{ background: "rgba(63,255,139,0.1)", color: "#3fff8b", border: "1px solid rgba(63,255,139,0.3)" }}
          >
            <KeyRound className="h-3.5 w-3.5" /> Gebruikersnaam & wachtwoord instellen
          </button>
        )}

        {showPwPanel && !pwResult && (
          <div className="mt-2 space-y-2 p-3 rounded-xl" style={{ background: "var(--app-navy)", border: "1px solid rgba(63,255,139,0.3)" }}>
            <p className="text-[11px]" style={{ color: "#a0abc3" }}>
              Stel gebruikersnaam (e-mail) en wachtwoord in voor <strong style={{ color: "#dae6ff" }}>{emp.full_name}</strong>. Hiermee logt deze medewerker in.
            </p>
            <div>
              <label className="text-[10px] uppercase tracking-wider" style={{ color: "#6a768c" }}>Gebruikersnaam (e-mail)</label>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="naam@bedrijf.nl"
                autoComplete="off"
                className="w-full px-3 py-2.5 rounded-xl text-sm mt-1"
                style={{ background: "#0a1a30", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }}
              />
            </div>
            <label className="text-[10px] uppercase tracking-wider block" style={{ color: "#6a768c" }}>Wachtwoord</label>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <input
                  type={showNewPw ? "text" : "password"}
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  placeholder="Min. 8 tekens"
                  className="w-full px-3 py-2.5 rounded-xl text-sm pr-8"
                  style={{ background: "#0a1a30", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }}
                />
                <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "#a0abc3" }}>
                  {showNewPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <button type="button" onClick={genPw} className="px-3 py-2.5 rounded-xl text-sm shrink-0" style={{ background: "#0a1a30", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }} title="Genereer wachtwoord">
                <RotateCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowPwPanel(false); setNewPw(""); }} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "#102038", color: "#a0abc3", border: "1px solid rgba(106,118,140,0.15)" }}>
                Annuleren
              </button>
              <button onClick={saveWachtwoord} disabled={pwSaving || newPw.length < 8} className="flex-1 py-2 rounded-xl text-xs font-bold" style={{ background: newPw.length >= 8 ? "linear-gradient(135deg, #3fff8b, #005d2c)" : "#102038", color: newPw.length >= 8 ? "#fff" : "#a0abc3" }}>
                {pwSaving ? "Bezig..." : "Wachtwoord opslaan"}
              </button>
            </div>
          </div>
        )}

        {pwResult && (
          <div className="mt-2 space-y-2 p-3 rounded-xl" style={{ background: "rgba(63,255,139,0.08)", border: "1px solid rgba(63,255,139,0.3)" }}>
            <p className="text-[11px] font-semibold" style={{ color: "#3fff8b" }}>✓ Inloggegevens ingesteld</p>
            <div className="text-[11px] space-y-1" style={{ color: "#a0abc3" }}>
              <p>Gebruikersnaam: <code style={{ color: "#dae6ff", background: "#102038", padding: "1px 6px", borderRadius: 4 }}>{pwResult.email}</code></p>
              <p>Wachtwoord: <code style={{ color: "#dae6ff", background: "#102038", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace" }}>{pwResult.pw}</code></p>
            </div>
            <p className="text-[10px]" style={{ color: "#feb300" }}>⚠ Bewaar of deel deze gegevens nu — ze worden niet opnieuw getoond.</p>
            <div className="flex gap-2">
              <button onClick={kopieerInloggegevens} className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5" style={{ background: "#3fff8b", color: "#003817" }}>
                <Copy className="h-3.5 w-3.5" /> Kopieer inloggegevens
              </button>
              <button onClick={() => { setPwResult(null); setShowPwPanel(false); }} className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: "#102038", color: "#a0abc3", border: "1px solid rgba(106,118,140,0.15)" }}>
                Sluiten
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* Verwijderen */}
      {onDelete && (
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
          style={{ background: "rgba(255,113,108,0.1)", color: "#ff716c", border: "1px solid rgba(255,113,108,0.3)" }}
        >
          <Trash2 className="h-3.5 w-3.5" /> Medewerker verwijderen
        </button>
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2" style={{ color: "#ff716c" }}>
              <Trash2 className="h-4 w-4" /> Medewerker verwijderen
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: "#a0abc3" }}>
              Weet je zeker dat je <strong>{emp.full_name}</strong> wilt verwijderen? Dit verwijdert ook alle uren, planning, certificaten en andere gerelateerde data. Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: "#142640", color: "#a0abc3", border: "1px solid rgba(106,118,140,0.15)" }}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onDelete?.(emp.user_id, emp.full_name); setShowDeleteConfirm(false); }}
              style={{ background: "#ff716c", color: "#fff" }}
            >
              Ja, verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

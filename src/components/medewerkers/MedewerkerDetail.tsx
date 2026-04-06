import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, MapPin, Mail, ShieldAlert, Calendar, Building2, Hash, CreditCard, AlertTriangle, Download, FileText, Check, X, Trash2 } from "lucide-react";
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
    <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{title}</p>
      {children}
    </div>
  );
}

function InfoRow({ icon, label, value, isLink }: { icon: React.ReactNode; label: string; value: string; isLink?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: "var(--text-muted)" }}>{icon}</span>
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{label}:</span>
      {isLink ? (
        <a href={isLink} className="text-sm underline" style={{ color: "var(--accent)" }}>{value}</a>
      ) : (
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>{value}</span>
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
      <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
        <p className="text-sm font-bold flex items-center gap-1.5" style={{ color: "var(--warn-text)" }}>
          <AlertTriangle className="h-4 w-4" /> Verificatie vereist
        </p>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{emp.full_name} heeft het onboarding profiel ingevuld.</p>

        <div className="space-y-1.5 mt-2">
          {checks.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              {c.ok ? (
                <Check className="h-3.5 w-3.5" style={{ color: "var(--success)" }} />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" style={{ color: "var(--warn-text)" }} />
              )}
              <span className="text-xs" style={{ color: c.ok ? "var(--success)" : "var(--warn-text)" }}>{c.label}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-3">
          <button onClick={() => setShowActiveer(true)} disabled={!alleChecks} className="flex-1 py-2 rounded-xl text-xs font-semibold disabled:opacity-40" style={{ background: "var(--success)", color: "#fff" }}>
            ✓ Activeren
          </button>
          <button onClick={() => setShowAfwijzen(true)} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "var(--danger-light)", color: "var(--danger)", border: "1px solid var(--danger-border)" }}>
            ✕ Afwijzen
          </button>
        </div>
      </div>

      <AlertDialog open={showActiveer} onOpenChange={setShowActiveer}>
        <AlertDialogContent style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "var(--text-primary)" }}>Account activeren</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--text-secondary)" }}>
              Weet je zeker dat je <strong>{emp.full_name}</strong> wilt activeren? Ze kunnen daarna worden ingepland en uren boeken.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={onActivate} style={{ background: "var(--success)", color: "#fff" }}>Ja, activeren</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showAfwijzen} onOpenChange={setShowAfwijzen}>
        <AlertDialogContent style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "var(--text-primary)" }}>Account afwijzen</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--text-secondary)" }}>
              Geef een reden op voor het afwijzen van <strong>{emp.full_name}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <textarea value={afwijsReden} onChange={e => setAfwijsReden(e.target.value)} placeholder="Reden..." rows={3} className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onAfwijzen(afwijsReden); setShowAfwijzen(false); }} disabled={!afwijsReden.trim()} style={{ background: "var(--danger)", color: "#fff" }}>Afwijzen</AlertDialogAction>
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

  const contractDays = contract?.einddatum ? differenceInDays(parseISO(contract.einddatum), new Date()) : null;

  async function downloadPdf() {
    if (!contract?.pdf_path) return;
    const { data } = await supabase.storage.from("contracten").createSignedUrl(contract.pdf_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
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
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold" style={{ background: "var(--accent)", color: "#fff" }}>
          {emp.full_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{emp.full_name}</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm capitalize" style={{ color: "var(--text-muted)" }}>{roleLabels[emp.role] || emp.role}</span>
            <StatusBadge emp={emp} />
          </div>
        </div>
      </div>

      {/* Verification panel for onboarding status */}
      {emp.account_status === "onboarding" && (
        <VerificatiePanel emp={emp} certs={certs} contract={contract} onActivate={handleActivate} onAfwijzen={handleAfwijzen} />
      )}

      <Section title="Contactgegevens">
        <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Telefoon" value={emp.telefoon || "–"} isLink={emp.telefoon ? `tel:${emp.telefoon}` : undefined} />
        <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Adres" value={emp.adres || "–"} />
        <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label="E-mail" value="–" />
      </Section>

      <div className="rounded-xl p-3 space-y-2" style={{ background: "#FFF8DC", border: "1px solid var(--warn-border)" }}>
        <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--warn-text)" }}>
          <ShieldAlert className="h-3.5 w-3.5" /> Noodcontact
        </p>
        {emp.noodcontact_naam ? (
          <>
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>{emp.noodcontact_naam}</p>
            {emp.noodcontact_tel && (
              <a href={`tel:${emp.noodcontact_tel}`} className="text-sm underline" style={{ color: "var(--accent)" }}>{emp.noodcontact_tel}</a>
            )}
          </>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Geen noodcontact ingesteld</p>
        )}
      </div>

      {/* Contract section */}
      {contract ? (
        <Section title="Contract">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{contract.contract_nummer}</span>
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
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Geldig: {formatDatum(contract.startdatum)} — {formatDatum(contract.einddatum)}
              </p>
            )}
            {contractDays !== null && (
              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{
                background: contractDays < 0 ? "var(--danger-light)" : contractDays <= 30 ? "var(--warn-bg)" : "var(--success-light)",
                color: contractDays < 0 ? "var(--danger)" : contractDays <= 30 ? "var(--warn-text)" : "var(--success)",
              }}>
                {contractDays < 0 ? "✕ Verlopen" : contractDays <= 30 ? `⚠ Verloopt binnenkort (${contractDays} dagen)` : `${contractDays} dagen resterend`}
              </span>
            )}
            {contract.pdf_path && (
              <button onClick={downloadPdf} className="flex items-center gap-1.5 text-xs font-medium mt-1" style={{ color: "var(--accent)" }}>
                <Download className="h-3.5 w-3.5" /> PDF downloaden
              </button>
            )}
          </div>
        </Section>
      ) : (
        <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Contract</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Geen actief contract</p>
          <button onClick={() => navigate("/kandidaten")} className="text-xs font-medium flex items-center gap-1" style={{ color: "var(--accent)" }}>
            <FileText className="h-3.5 w-3.5" /> Contract aanmaken
          </button>
        </div>
      )}

      {/* ZZP incomplete warning */}
      {(!emp.kvk_nummer || !emp.iban) && (
        <div className="flex items-start gap-2 rounded-xl p-3" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--warn-text)" }} />
          <span className="text-xs" style={{ color: "var(--warn-text)" }}>ZZP gegevens incompleet — inkooporder kan niet aangemaakt worden</span>
        </div>
      )}

      {/* ZZP Business details */}
      {(emp.bedrijfsnaam || emp.kvk_nummer || emp.btw_nummer || emp.iban) && (
        <Section title="ZZP Gegevens">
          {emp.bedrijfsnaam && <InfoRow icon={<Building2 className="h-3.5 w-3.5" />} label="Bedrijf" value={emp.bedrijfsnaam} />}
          {emp.kvk_nummer && <InfoRow icon={<Hash className="h-3.5 w-3.5" />} label="KvK" value={emp.kvk_nummer} />}
          {emp.btw_nummer && <InfoRow icon={<Hash className="h-3.5 w-3.5" />} label="BTW" value={emp.btw_nummer} />}
          {emp.iban && <InfoRow icon={<CreditCard className="h-3.5 w-3.5" />} label="IBAN" value={emp.iban} />}
          {emp.uurtarief != null && (
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--text-muted)" }}>€</span>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Uurtarief:</span>
              <span className="text-sm font-mono font-semibold" style={{ color: "var(--accent)" }}>€ {Number(emp.uurtarief).toFixed(2)}</span>
            </div>
          )}
        </Section>
      )}

      <CertificatenOverzicht certificaten={certs} toonToevoegen={true} medewerker_id={emp.id} onRefresh={onRefreshCerts} />

      <Section title="Account info">
        <div className="space-y-1">
          <div className="flex items-center gap-2"><StatusBadge emp={emp} /></div>
          {emp.invited_at && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Uitgenodigd op: {format(parseISO(emp.invited_at), "d MMM yyyy HH:mm", { locale: nl })}</p>}
          {emp.activated_at && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Geactiveerd op: {format(parseISO(emp.activated_at), "d MMM yyyy HH:mm", { locale: nl })}</p>}
        </div>
      </Section>

      {/* Verwijderen */}
      {onDelete && (
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
          style={{ background: "var(--danger-light)", color: "var(--danger)", border: "1px solid var(--danger-border)" }}
        >
          <Trash2 className="h-3.5 w-3.5" /> Medewerker verwijderen
        </button>
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2" style={{ color: "var(--danger)" }}>
              <Trash2 className="h-4 w-4" /> Medewerker verwijderen
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: "var(--text-secondary)" }}>
              Weet je zeker dat je <strong>{emp.full_name}</strong> wilt verwijderen? Dit verwijdert ook alle uren, planning, certificaten en andere gerelateerde data. Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: "var(--bg-card)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { onDelete?.(emp.user_id, emp.full_name); setShowDeleteConfirm(false); }}
              style={{ background: "var(--danger)", color: "#fff" }}
            >
              Ja, verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

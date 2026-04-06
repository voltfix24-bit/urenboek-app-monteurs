import { Phone, MapPin, Mail, ShieldAlert, Calendar, Building2, Hash, CreditCard } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import CertificatenOverzicht from "@/components/CertificatenOverzicht";
import { StatusBadge, roleLabels, type Employee } from "./MedewerkerKaart";

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
}

export function MedewerkerDetail({ emp, certs, onRefreshCerts }: Props) {
  const contractDays = emp.contract_einddatum ? differenceInDays(parseISO(emp.contract_einddatum), new Date()) : null;

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

      {emp.contract_einddatum && (
        <Section title="Contract">
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>
              Einddatum: {format(parseISO(emp.contract_einddatum), "d MMMM yyyy", { locale: nl })}
            </span>
            {contractDays !== null && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{
                background: contractDays < 0 ? "var(--danger-light)" : contractDays <= 30 ? "var(--warn-bg)" : "var(--success-light)",
                color: contractDays < 0 ? "var(--danger)" : contractDays <= 30 ? "var(--warn-text)" : "var(--success)",
              }}>
                {contractDays < 0 ? "✕ Verlopen" : contractDays <= 30 ? "⚠ Verloopt binnenkort" : `${contractDays} dagen`}
              </span>
            )}
          </div>
        </Section>
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
    </div>
  );
}

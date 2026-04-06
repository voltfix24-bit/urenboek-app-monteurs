import { Copy, Eye, EyeOff, Mail, Key } from "lucide-react";
import { toast } from "sonner";
import { roleLabels } from "./MedewerkerKaart";

const inputStyle = { background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" };

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>{title}</p>
      {children}
    </div>
  );
}

function FormField({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
    </div>
  );
}

export function NieuweGebruikerForm(props: any) {
  const {
    voornaam, setVoornaam, achternaam, setAchternaam, email, setEmail,
    telefoon, setTelefoon, adres, setAdres, role, setRole,
    uurtarief, setUurtarief, rijbewijs, setRijbewijs,
    contractEinddatum, setContractEinddatum,
    noodcontactNaam, setNoodcontactNaam, noodcontactTel, setNoodcontactTel,
    inviteMode, setInviteMode, password, setPassword,
    showPw, setShowPw, generatePassword, loading, onSubmit
  } = props;

  return (
    <div className="rounded-2xl p-4 space-y-4 animate-fade-in" style={{ background: "var(--bg-surface)", border: "1px solid var(--accent-border)" }}>
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Nieuwe medewerker</p>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormSection title="1. Persoonsgegevens">
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Voornaam *" value={voornaam} onChange={setVoornaam} placeholder="Jan" />
            <FormField label="Achternaam *" value={achternaam} onChange={setAchternaam} placeholder="Jansen" />
          </div>
          <FormField label="E-mailadres *" value={email} onChange={setEmail} placeholder="jan@terrevolt.nl" type="email" />
          <FormField label="Telefoonnummer" value={telefoon} onChange={setTelefoon} placeholder="06-12345678" type="tel" />
          <FormField label="Adres" value={adres} onChange={setAdres} placeholder="Straatnaam 1, Stad" />
        </FormSection>

        <FormSection title="2. Functie & tarief">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Rol *</label>
            <div className="flex gap-1.5 flex-wrap">
              {Object.entries(roleLabels).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setRole(value)} className="px-3 py-2 rounded-xl text-xs font-semibold transition-colors" style={{
                  background: role === value ? "var(--accent-light)" : "var(--bg-base)",
                  border: role === value ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                  color: role === value ? "var(--accent)" : "var(--text-muted)",
                }}>{label}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Uurtarief (€/uur)" value={uurtarief} onChange={setUurtarief} placeholder="75.00" type="number" />
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Contract einddatum</label>
              <input type="date" value={contractEinddatum} onChange={e => setContractEinddatum(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Rijbewijs</label>
            <button type="button" onClick={() => setRijbewijs(!rijbewijs)} className="w-10 h-6 rounded-full transition-colors relative" style={{ background: rijbewijs ? "var(--accent)" : "var(--bg-surface-2)" }}>
              <div className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all" style={{ left: rijbewijs ? 22 : 4 }} />
            </button>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{rijbewijs ? "Ja" : "Nee"}</span>
          </div>
        </FormSection>

        <FormSection title="3. Noodcontact">
          <FormField label="Naam noodcontact" value={noodcontactNaam} onChange={setNoodcontactNaam} placeholder="Naam" />
          <FormField label="Telefoon noodcontact" value={noodcontactTel} onChange={setNoodcontactTel} placeholder="06-..." type="tel" />
        </FormSection>

        <FormSection title="4. Certificaten">
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Certificaten kun je na het aanmaken beheren via het medewerker detail.
          </p>
        </FormSection>

        <FormSection title="5. Account aanmaken">
          <div className="flex gap-2">
            <button type="button" onClick={() => setInviteMode("invite")} className="flex-1 p-3 rounded-xl text-left space-y-1" style={{
              background: inviteMode === "invite" ? "var(--accent-light)" : "var(--bg-base)",
              border: inviteMode === "invite" ? "2px solid var(--accent)" : "1px solid var(--border)",
            }}>
              <p className="text-xs font-bold flex items-center gap-1" style={{ color: inviteMode === "invite" ? "var(--accent)" : "var(--text-primary)" }}>
                <Mail className="h-3.5 w-3.5" /> Uitnodiging sturen
              </p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Aanbevolen — monteur stelt zelf wachtwoord in</p>
            </button>
            <button type="button" onClick={() => setInviteMode("password")} className="flex-1 p-3 rounded-xl text-left space-y-1" style={{
              background: inviteMode === "password" ? "var(--accent-light)" : "var(--bg-base)",
              border: inviteMode === "password" ? "2px solid var(--accent)" : "1px solid var(--border)",
            }}>
              <p className="text-xs font-bold flex items-center gap-1" style={{ color: inviteMode === "password" ? "var(--accent)" : "var(--text-primary)" }}>
                <Key className="h-3.5 w-3.5" /> Wachtwoord instellen
              </p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Voor direct toegang</p>
            </button>
          </div>

          {inviteMode === "invite" ? (
            <p className="text-[11px] p-2 rounded-lg" style={{ background: "var(--bg-base)", color: "var(--text-muted)" }}>
              De monteur ontvangt een e-mail met een persoonlijke activatielink.
            </p>
          ) : (
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Wachtwoord</label>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Wachtwoord" className="w-full px-3 py-2.5 rounded-xl text-sm pr-8" style={inputStyle} />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }}>
                    {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <button type="button" onClick={generatePassword} className="px-3 py-2.5 rounded-xl text-sm shrink-0" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>🎲</button>
                {password && (
                  <button type="button" onClick={() => { navigator.clipboard.writeText(password); toast.success("Gekopieerd!"); }} className="px-3 py-2.5 rounded-xl text-sm shrink-0" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
                    <Copy className="h-3.5 w-3.5" style={{ color: "var(--text-muted)" }} />
                  </button>
                )}
              </div>
            </div>
          )}
        </FormSection>

        <button type="submit" disabled={loading} className="w-full py-3 rounded-xl text-sm font-bold text-white transition-colors active:scale-[0.98]" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
          {loading ? "Bezig..." : inviteMode === "invite" ? "Uitnodiging versturen" : "Account aanmaken"}
        </button>
      </form>
    </div>
  );
}

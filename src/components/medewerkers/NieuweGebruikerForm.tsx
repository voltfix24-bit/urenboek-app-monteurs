import { Copy, Eye, EyeOff, Mail, Key } from "lucide-react";
import { toast } from "sonner";
import { roleLabels } from "./MedewerkerKaart";
import { FormField, ValidatedInput } from "@/components/ui/FormField";

const inputStyle = { background: "#030e20", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" };

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#3fff8b" }}>{title}</p>
      {children}
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
    showPw, setShowPw, generatePassword, loading, onSubmit,
    formErrors = {}, clearError,
  } = props;

  const ce = (field: string) => clearError?.(field);

  return (
    <div className="rounded-2xl p-4 space-y-4 animate-fade-in" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(63,255,139,0.3)" }}>
      <p className="text-sm font-semibold" style={{ color: "#dae6ff" }}>Nieuwe medewerker</p>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormSection title="1. Persoonsgegevens">
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Voornaam" error={formErrors.voornaam} required>
              <ValidatedInput value={voornaam} onChange={e => { setVoornaam(e.target.value); ce("voornaam"); }} placeholder="Jan" error={formErrors.voornaam} />
            </FormField>
            <FormField label="Achternaam" error={formErrors.achternaam} required>
              <ValidatedInput value={achternaam} onChange={e => { setAchternaam(e.target.value); ce("achternaam"); }} placeholder="Jansen" error={formErrors.achternaam} />
            </FormField>
          </div>
          <FormField label="E-mailadres" error={formErrors.email} required>
            <ValidatedInput type="email" value={email} onChange={e => { setEmail(e.target.value); ce("email"); }} placeholder="jan@terrevolt.nl" error={formErrors.email} />
          </FormField>
          <FormField label="Telefoonnummer" error={formErrors.telefoon}>
            <ValidatedInput type="tel" value={telefoon} onChange={e => { setTelefoon(e.target.value); ce("telefoon"); }} placeholder="06-12345678" error={formErrors.telefoon} />
          </FormField>
          <FormField label="Adres">
            <ValidatedInput value={adres} onChange={e => setAdres(e.target.value)} placeholder="Straatnaam 1, Stad" />
          </FormField>
        </FormSection>

        <FormSection title="2. Functie & tarief">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: formErrors.role ? "#ff716c" : "#a0abc3" }}>Rol *</label>
            <div className="flex gap-1.5 flex-wrap">
              {Object.entries(roleLabels).map(([value, label]) => (
                <button key={value} type="button" onClick={() => { setRole(value); ce("role"); }} className="px-3 py-2 rounded-xl text-xs font-semibold transition-colors" style={{
                  background: role === value ? "rgba(63,255,139,0.1)" : "#030e20",
                  border: role === value ? "1px solid rgba(63,255,139,0.3)" : "1px solid rgba(106,118,140,0.15)",
                  color: role === value ? "#3fff8b" : "#a0abc3",
                }}>{label}</button>
              ))}
            </div>
            {formErrors.role && <p className="text-[10px] font-medium" style={{ color: "#ff716c" }}>⚠ {formErrors.role}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Uurtarief (€/uur)">
              <ValidatedInput type="number" value={uurtarief} onChange={e => setUurtarief(e.target.value)} placeholder="75.00" />
            </FormField>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Contract einddatum</label>
              <input type="date" value={contractEinddatum} onChange={e => setContractEinddatum(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Rijbewijs</label>
            <button type="button" onClick={() => setRijbewijs(!rijbewijs)} className="w-10 h-6 rounded-full transition-colors relative" style={{ background: rijbewijs ? "#3fff8b" : "#102038" }}>
              <div className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all" style={{ left: rijbewijs ? 22 : 4 }} />
            </button>
            <span className="text-xs" style={{ color: "#a0abc3" }}>{rijbewijs ? "Ja" : "Nee"}</span>
          </div>
        </FormSection>

        <FormSection title="3. Noodcontact">
          <FormField label="Naam noodcontact">
            <ValidatedInput value={noodcontactNaam} onChange={e => setNoodcontactNaam(e.target.value)} placeholder="Naam" />
          </FormField>
          <FormField label="Telefoon noodcontact">
            <ValidatedInput type="tel" value={noodcontactTel} onChange={e => setNoodcontactTel(e.target.value)} placeholder="06-..." />
          </FormField>
        </FormSection>

        <FormSection title="4. Certificaten">
          <p className="text-[11px]" style={{ color: "#a0abc3" }}>
            Certificaten kun je na het aanmaken beheren via het medewerker detail.
          </p>
        </FormSection>

        <FormSection title="5. Account aanmaken">
          <div className="flex gap-2">
            <button type="button" onClick={() => setInviteMode("invite")} className="flex-1 p-3 rounded-xl text-left space-y-1" style={{
              background: inviteMode === "invite" ? "rgba(63,255,139,0.1)" : "#030e20",
              border: inviteMode === "invite" ? "2px solid #3fff8b" : "1px solid rgba(106,118,140,0.15)",
            }}>
              <p className="text-xs font-bold flex items-center gap-1" style={{ color: inviteMode === "invite" ? "#3fff8b" : "#dae6ff" }}>
                <Mail className="h-3.5 w-3.5" /> Uitnodiging sturen
              </p>
              <p className="text-[10px]" style={{ color: "#a0abc3" }}>Aanbevolen — monteur stelt zelf wachtwoord in</p>
            </button>
            <button type="button" onClick={() => setInviteMode("password")} className="flex-1 p-3 rounded-xl text-left space-y-1" style={{
              background: inviteMode === "password" ? "rgba(63,255,139,0.1)" : "#030e20",
              border: inviteMode === "password" ? "2px solid #3fff8b" : "1px solid rgba(106,118,140,0.15)",
            }}>
              <p className="text-xs font-bold flex items-center gap-1" style={{ color: inviteMode === "password" ? "#3fff8b" : "#dae6ff" }}>
                <Key className="h-3.5 w-3.5" /> Wachtwoord instellen
              </p>
              <p className="text-[10px]" style={{ color: "#a0abc3" }}>Voor direct toegang</p>
            </button>
          </div>

          {inviteMode === "invite" ? (
            <p className="text-[11px] p-2 rounded-lg" style={{ background: "#030e20", color: "#a0abc3" }}>
              De monteur ontvangt een e-mail met een persoonlijke activatielink.
            </p>
          ) : (
            <div className="space-y-1">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Wachtwoord</label>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Wachtwoord" className="w-full px-3 py-2.5 rounded-xl text-sm pr-8" style={inputStyle} />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "#a0abc3" }}>
                    {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <button type="button" onClick={generatePassword} className="px-3 py-2.5 rounded-xl text-sm shrink-0" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)" }}>🎲</button>
                {password && (
                  <button type="button" onClick={() => { navigator.clipboard.writeText(password); toast.success("Gekopieerd!"); }} className="px-3 py-2.5 rounded-xl text-sm shrink-0" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)" }}>
                    <Copy className="h-3.5 w-3.5" style={{ color: "#a0abc3" }} />
                  </button>
                )}
              </div>
            </div>
          )}
        </FormSection>

        <button type="submit" disabled={loading} className="w-full py-3 rounded-xl text-sm font-bold text-white transition-colors active:scale-[0.98]" style={{ background: "linear-gradient(135deg, #3fff8b, #005d2c)" }}>
          {loading ? "Bezig..." : inviteMode === "invite" ? "Uitnodiging versturen" : "Account aanmaken"}
        </button>
      </form>
    </div>
  );
}

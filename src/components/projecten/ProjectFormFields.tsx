import { Lock, ClipboardList, Clock, HelpCircle } from "lucide-react";
import { FormField, ValidatedInput } from "@/components/ui/FormField";

export interface FormState {
  nummer: string; naam: string; opdrachtgever_id: string | null;
  stationsnaam: string; straat: string; postcode: string; stad: string; case_type: string;
  contactpersoon_naam: string; contactpersoon_tel: string; contactpersoon_email: string;
  vergoed_methode: 'stuksprijzen' | 'uren' | '';
}

export const emptyForm: FormState = {
  nummer: "", naam: "", opdrachtgever_id: null, stationsnaam: "",
  straat: "", postcode: "", stad: "", case_type: "",
  contactpersoon_naam: "", contactpersoon_tel: "", contactpersoon_email: "",
  vergoed_methode: "",
};

const selectStyle = { background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" };

interface Props {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  opdrachtgevers: { id: string; naam: string }[];
  isManager: boolean;
  errors?: Record<string, string>;
  clearError?: (field: string) => void;
}

export function ProjectFormFields({ form, setForm, opdrachtgevers, isManager, errors = {}, clearError }: Props) {
  const update = (field: keyof FormState, value: string | null) => {
    setForm(f => ({ ...f, [field]: value }));
    if (clearError && errors[field]) clearError(field);
  };

  const methodeOptions: { key: FormState['vergoed_methode']; Icon: any; label: string; desc: string }[] = [
    { key: 'stuksprijzen', Icon: ClipboardList, label: 'Stuksprijzen', desc: 'Van Gelder betaalt per spec-code' },
    { key: 'uren', Icon: Clock, label: 'Op uren', desc: 'Van Gelder betaalt per uur' },
    { key: '', Icon: HelpCircle, label: 'Nog onbekend', desc: 'Later bepalen in Forecast tab' },
  ];

  return (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Projectgegevens</p>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Casenummer" error={errors.nummer} required>
          <ValidatedInput value={form.nummer} onChange={e => update("nummer", e.target.value)} placeholder="Casenummer bijv. 0311927" error={errors.nummer} />
        </FormField>
        <FormField label="Casenaam" error={errors.naam} required>
          <ValidatedInput value={form.naam} onChange={e => update("naam", e.target.value)} placeholder="Casenaam" error={errors.naam} />
        </FormField>
      </div>
      <FormField label="Stationsnaam">
        <ValidatedInput value={form.stationsnaam} onChange={e => update("stationsnaam", e.target.value)} placeholder="Stationsnaam bijv. KOPPOELLN" />
      </FormField>
      <p className="text-[11px] font-semibold uppercase tracking-wider mt-2" style={{ color: "var(--text-muted)" }}>Adres werklocatie *</p>
      <FormField label="Straat + huisnummer" error={errors.straat} required>
        <ValidatedInput value={form.straat} onChange={e => update("straat", e.target.value)} placeholder="Burgemeester Fletzlaan 12" error={errors.straat} />
      </FormField>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Postcode" error={errors.postcode} required>
          <ValidatedInput value={form.postcode} onChange={e => {
            let v = e.target.value;
            if (v.length === 4 && /^\d{4}$/.test(v) && form.postcode.length < 4) v += " ";
            update("postcode", v);
          }} placeholder="1234 AB" maxLength={7} error={errors.postcode} />
        </FormField>
        <FormField label="Stad" error={errors.stad} required>
          <ValidatedInput value={form.stad} onChange={e => update("stad", e.target.value)} placeholder="Amsterdam" error={errors.stad} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FormField label="Opdrachtgever">
          <select value={form.opdrachtgever_id || ""} onChange={e => update("opdrachtgever_id", e.target.value || null)} className="w-full px-3 py-2.5 rounded-xl text-sm" style={selectStyle}>
            <option value="">Geen opdrachtgever</option>
            {opdrachtgevers.map(og => <option key={og.id} value={og.id}>{og.naam}</option>)}
          </select>
        </FormField>
        <FormField label="Case type">
          <select value={form.case_type} onChange={e => update("case_type", e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-sm" style={selectStyle}>
            <option value="">Case type</option>
            <option value="NSA-case">NSA-case</option>
            <option value="Compactstation">Compactstation</option>
            <option value="Provisorium">Provisorium</option>
          </select>
        </FormField>
      </div>

      {/* Vergoedingsmethode */}
      <p className="text-[11px] font-semibold uppercase tracking-wider mt-2" style={{ color: "var(--text-muted)" }}>Vergoedingsmethode</p>
      <div className="grid grid-cols-3 gap-2">
        {methodeOptions.map(o => {
          const active = form.vergoed_methode === o.key;
          return (
            <button
              key={o.key || 'onbekend'}
              type="button"
              onClick={() => update('vergoed_methode', o.key)}
              className="p-3 rounded-xl text-center space-y-1 transition-colors"
              style={{
                background: active ? "var(--accent-light)" : "var(--bg-surface)",
                border: active ? "1.5px solid var(--accent-border)" : "1.5px solid var(--planning-border-soft)",
                cursor: "pointer",
              }}
            >
              <o.Icon className="h-4 w-4 mx-auto" style={{ color: active ? "var(--accent)" : "var(--text-muted)" }} />
              <p className="text-[11px] font-semibold" style={{ color: active ? "var(--accent)" : "var(--text-primary)" }}>{o.label}</p>
              <p className="text-[9px]" style={{ color: "var(--text-muted)" }}>{o.desc}</p>
            </button>
          );
        })}
      </div>

      {isManager && (
        <div className="rounded-xl p-3 space-y-2 mt-1" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
          <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: "var(--warn-text)" }}>
            <Lock className="h-3 w-3" /> Contactpersoon (alleen zichtbaar voor managers)
          </p>
          <FormField label="Naam contactpersoon">
            <ValidatedInput value={form.contactpersoon_naam} onChange={e => update("contactpersoon_naam", e.target.value)} placeholder="Naam contactpersoon" />
          </FormField>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Telefoon" error={errors.contactpersoon_tel}>
              <ValidatedInput type="tel" value={form.contactpersoon_tel} onChange={e => update("contactpersoon_tel", e.target.value)} placeholder="Telefoonnummer" error={errors.contactpersoon_tel} />
            </FormField>
            <FormField label="E-mailadres" error={errors.contactpersoon_email}>
              <ValidatedInput type="email" value={form.contactpersoon_email} onChange={e => update("contactpersoon_email", e.target.value)} placeholder="E-mailadres" error={errors.contactpersoon_email} />
            </FormField>
          </div>
        </div>
      )}
    </>
  );
}

import { Lock } from "lucide-react";

export interface FormState {
  nummer: string; naam: string; opdrachtgever_id: string | null;
  stationsnaam: string; straat: string; postcode: string; stad: string; case_type: string;
  contactpersoon_naam: string; contactpersoon_tel: string; contactpersoon_email: string;
}

export const emptyForm: FormState = {
  nummer: "", naam: "", opdrachtgever_id: null, stationsnaam: "",
  straat: "", postcode: "", stad: "", case_type: "",
  contactpersoon_naam: "", contactpersoon_tel: "", contactpersoon_email: "",
};

const inputStyle = { background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" };

interface Props {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  opdrachtgevers: { id: string; naam: string }[];
  isManager: boolean;
}

export function ProjectFormFields({ form, setForm, opdrachtgevers, isManager }: Props) {
  return (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Projectgegevens</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={form.nummer} onChange={e => setForm(f => ({ ...f, nummer: e.target.value }))} placeholder="Casenummer bijv. 0311927" className="px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
        <input value={form.naam} onChange={e => setForm(f => ({ ...f, naam: e.target.value }))} placeholder="Casenaam" className="px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
      </div>
      <input value={form.stationsnaam} onChange={e => setForm(f => ({ ...f, stationsnaam: e.target.value }))} placeholder="Stationsnaam bijv. KOPPOELLN" className="w-full px-3 py-2.5 rounded-xl text-sm" style={inputStyle} />
      <p className="text-[11px] font-semibold uppercase tracking-wider mt-2" style={{ color: "var(--text-muted)" }}>Adres werklocatie *</p>
      <input value={form.straat} onChange={e => setForm(f => ({ ...f, straat: e.target.value }))} placeholder="Burgemeester Fletzlaan 12" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ ...inputStyle, borderColor: !form.straat.trim() && form.nummer.trim() ? "var(--danger-border)" : undefined }} />
      <div className="grid grid-cols-2 gap-2">
        <input value={form.postcode} onChange={e => {
          let v = e.target.value;
          if (v.length === 4 && /^\d{4}$/.test(v) && form.postcode.length < 4) v += " ";
          setForm(f => ({ ...f, postcode: v }));
        }} placeholder="1234 AB" maxLength={7} className="px-3 py-2.5 rounded-xl text-sm" style={{ ...inputStyle, borderColor: !form.postcode.trim() && form.nummer.trim() ? "var(--danger-border)" : undefined }} />
        <input value={form.stad} onChange={e => setForm(f => ({ ...f, stad: e.target.value }))} placeholder="Amsterdam" className="px-3 py-2.5 rounded-xl text-sm" style={{ ...inputStyle, borderColor: !form.stad.trim() && form.nummer.trim() ? "var(--danger-border)" : undefined }} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select value={form.opdrachtgever_id || ""} onChange={e => setForm(f => ({ ...f, opdrachtgever_id: e.target.value || null }))} className="px-3 py-2.5 rounded-xl text-sm" style={inputStyle}>
          <option value="">Geen opdrachtgever</option>
          {opdrachtgevers.map(og => <option key={og.id} value={og.id}>{og.naam}</option>)}
        </select>
        <select value={form.case_type} onChange={e => setForm(f => ({ ...f, case_type: e.target.value }))} className="px-3 py-2.5 rounded-xl text-sm" style={inputStyle}>
          <option value="">Case type</option>
          <option value="NSA-case">NSA-case</option>
          <option value="Compactstation">Compactstation</option>
          <option value="Provisorium">Provisorium</option>
        </select>
      </div>
      {isManager && (
        <div className="rounded-xl p-3 space-y-2 mt-1" style={{ background: "var(--warn-bg)", border: "1px solid var(--warn-border)" }}>
          <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: "var(--warn-text)" }}>
            <Lock className="h-3 w-3" /> Contactpersoon (alleen zichtbaar voor managers)
          </p>
          <input value={form.contactpersoon_naam} onChange={e => setForm(f => ({ ...f, contactpersoon_naam: e.target.value }))} placeholder="Naam contactpersoon" className="w-full px-3 py-2 rounded-xl text-sm" style={inputStyle} />
          <div className="grid grid-cols-2 gap-2">
            <input type="tel" value={form.contactpersoon_tel} onChange={e => setForm(f => ({ ...f, contactpersoon_tel: e.target.value }))} placeholder="Telefoonnummer" className="px-3 py-2 rounded-xl text-sm" style={inputStyle} />
            <input type="email" value={form.contactpersoon_email} onChange={e => setForm(f => ({ ...f, contactpersoon_email: e.target.value }))} placeholder="E-mailadres" className="px-3 py-2 rounded-xl text-sm" style={inputStyle} />
          </div>
        </div>
      )}
    </>
  );
}

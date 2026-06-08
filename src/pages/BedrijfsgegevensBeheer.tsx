import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useNavBadges } from "@/hooks/useNavBadges";
import { useBedrijfsgegevens, invalidateBedrijfCache, type Bedrijfsgegevens } from "@/hooks/useBedrijfsgegevens";
import { PageShell } from "@/components/PageShell";
import { HeaderLogo } from "@/components/HeaderLogo";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { Spinner } from "@/components/ui/Spinner";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { Info, Zap } from "lucide-react";

const SECTION_HEADER = "text-[11px] font-bold uppercase tracking-wider mb-3 pb-1.5";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className={SECTION_HEADER} style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--planning-border-soft)" }}>{children}</p>;
}

function Field({ label, hint, value, onChange, placeholder, mono }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-xl text-sm"
        style={{ background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)", fontFamily: mono ? "DM Mono, monospace" : "inherit" }} />
      {hint && <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{hint}</p>}
    </div>
  );
}

function NumberField({ label, hint, value, onChange }: {
  label: string; hint?: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</label>
      <input type="number" value={value} onChange={e => onChange(Number(e.target.value))}
        className="w-full px-3 py-2.5 rounded-xl text-sm"
        style={{ background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }} />
      {hint && <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{hint}</p>}
    </div>
  );
}

function formatIban(iban: string): string {
  const clean = iban.replace(/\s/g, "");
  return clean.replace(/(.{4})/g, "$1 ").trim();
}

export default function BedrijfsgegevensBeheer() {
  const { badges } = useNavBadges();
  const { profileId } = useProfile();
  const { bedrijf, loading } = useBedrijfsgegevens();
  const [saving, setSaving] = useState(false);
  const [updatedByName, setUpdatedByName] = useState<string | null>(null);

  const [form, setForm] = useState({
    bedrijfsnaam: "", rechtsvorm: "", website: "",
    straat: "", postcode: "", stad: "", land: "Nederland",
    email: "", telefoon: "",
    kvk_nummer: "", btw_nummer: "", iban: "", iban_naam: "",
    betalingstermijn: 30,
  });

  useEffect(() => {
    if (bedrijf) {
      setForm({
        bedrijfsnaam: bedrijf.bedrijfsnaam || "",
        rechtsvorm: bedrijf.rechtsvorm || "",
        website: bedrijf.website || "",
        straat: bedrijf.straat || "",
        postcode: bedrijf.postcode || "",
        stad: bedrijf.stad || "",
        land: bedrijf.land || "Nederland",
        email: bedrijf.email || "",
        telefoon: bedrijf.telefoon || "",
        kvk_nummer: bedrijf.kvk_nummer || "",
        btw_nummer: bedrijf.btw_nummer || "",
        iban: bedrijf.iban || "",
        iban_naam: bedrijf.iban_naam || "",
        betalingstermijn: bedrijf.betalingstermijn || 30,
      });
      // Load updated_by name
      if (bedrijf.updated_by) {
        supabase.from("profiles").select("full_name").eq("id", bedrijf.updated_by).single().then(({ data }) => {
          if (data) setUpdatedByName(data.full_name);
        });
      }
    }
  }, [bedrijf]);

  const set = (key: string, val: string | number) => setForm(prev => ({ ...prev, [key]: val }));

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.bedrijfsnaam.trim()) e.bedrijfsnaam = "Verplicht";
    if (form.kvk_nummer && !/^\d{8}$/.test(form.kvk_nummer.trim())) e.kvk_nummer = "8 cijfers vereist";
    if (form.btw_nummer && !/^NL\d{9}B\d{2}$/.test(form.btw_nummer.trim())) e.btw_nummer = "Format: NL123456789B01";
    if (form.iban) {
      const clean = form.iban.replace(/\s/g, "");
      if (!/^NL[A-Z0-9]+$/.test(clean)) e.iban = "Moet beginnen met NL";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate() || !bedrijf) return;
    setSaving(true);
    const { error } = await supabase.from("bedrijfsgegevens").update({
      bedrijfsnaam: form.bedrijfsnaam.trim(),
      rechtsvorm: form.rechtsvorm.trim() || null,
      website: form.website.trim() || null,
      straat: form.straat.trim() || null,
      postcode: form.postcode.trim() || null,
      stad: form.stad.trim() || null,
      land: form.land.trim(),
      email: form.email.trim() || null,
      telefoon: form.telefoon.trim() || null,
      kvk_nummer: form.kvk_nummer.trim() || null,
      btw_nummer: form.btw_nummer.trim() || null,
      iban: form.iban.replace(/\s/g, "").trim() || null,
      iban_naam: form.iban_naam.trim() || null,
      betalingstermijn: form.betalingstermijn,
      updated_at: new Date().toISOString(),
      updated_by: profileId,
    } as any).eq("id", bedrijf.id);
    if (error) { toast.error("Fout bij opslaan"); setSaving(false); return; }
    invalidateBedrijfCache();
    toast.success("Bedrijfsgegevens opgeslagen ✓");
    setSaving(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-navy)" }}><Spinner center={false} /></div>;

  return (
    <>
      <DesktopSidebar badges={badges} />
      <PageShell>
        <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--planning-border-soft)" }}>
          <div className="px-4 py-3 flex items-center gap-2.5">
            <HeaderLogo />
            <span className="text-base font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Bedrijfsgegevens</span>
          </div>
        </header>

        <main className="px-4 py-4 space-y-4" style={{ maxWidth: 640, margin: "0 auto" }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>TerreVolt Bedrijfsgegevens</h2>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Deze gegevens verschijnen op alle inkooporders en facturen</p>
          </div>

          {/* Info banner */}
          <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: "rgba(110,155,255,0.1)", border: "1px solid rgba(110,155,255,0.3)" }}>
            <Info className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--info)" }} />
            <p className="text-xs" style={{ color: "var(--info)" }}>Wijzigingen worden automatisch meegenomen in alle nieuwe inkooporders en PDF's.</p>
          </div>

          {/* Form card */}
          <div className="rounded-2xl p-6 space-y-5" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
            {/* Bedrijfsinformatie */}
            <div>
              <SectionTitle>Bedrijfsinformatie</SectionTitle>
              <div className="space-y-3">
                <Field label="Bedrijfsnaam *" value={form.bedrijfsnaam} onChange={v => set("bedrijfsnaam", v)} placeholder="TerreVolt B.V." />
                {errors.bedrijfsnaam && <p className="text-[10px]" style={{ color: "var(--danger)" }}>⚠ {errors.bedrijfsnaam}</p>}
                <Field label="Rechtsvorm" value={form.rechtsvorm} onChange={v => set("rechtsvorm", v)} placeholder="B.V. - Besloten vennootschap" />
                <Field label="Website" value={form.website} onChange={v => set("website", v)} placeholder="https://terrevolt.nl" />
              </div>
            </div>

            {/* Adres */}
            <div>
              <SectionTitle>Adres</SectionTitle>
              <div className="space-y-3">
                <Field label="Straat + huisnummer" value={form.straat} onChange={v => set("straat", v)} placeholder="Vlierweg 12" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Postcode" value={form.postcode} onChange={v => set("postcode", v)} placeholder="1032 LG" />
                  <Field label="Stad" value={form.stad} onChange={v => set("stad", v)} placeholder="Amsterdam" />
                </div>
                <Field label="Land" value={form.land} onChange={v => set("land", v)} placeholder="Nederland" />
              </div>
            </div>

            {/* Contact */}
            <div>
              <SectionTitle>Contact</SectionTitle>
              <div className="space-y-3">
                <Field label="E-mailadres" value={form.email} onChange={v => set("email", v)} placeholder="info@terrevolt.nl" />
                <Field label="Telefoonnummer" value={form.telefoon} onChange={v => set("telefoon", v)} placeholder="+31 20 1234567" />
              </div>
            </div>

            {/* Financieel */}
            <div>
              <SectionTitle>Financieel</SectionTitle>
              <div className="space-y-3">
                <Field label="KVK-nummer" hint="8 cijfers" value={form.kvk_nummer} onChange={v => set("kvk_nummer", v)} placeholder="98495976" mono />
                {errors.kvk_nummer && <p className="text-[10px]" style={{ color: "var(--danger)" }}>⚠ {errors.kvk_nummer}</p>}
                <Field label="BTW-nummer" hint="Format: NL123456789B01" value={form.btw_nummer} onChange={v => set("btw_nummer", v)} placeholder="NL868519522B01" mono />
                {errors.btw_nummer && <p className="text-[10px]" style={{ color: "var(--danger)" }}>⚠ {errors.btw_nummer}</p>}
                <Field label="IBAN" hint="Format: NL49INGB0113028776" value={form.iban} onChange={v => set("iban", v)} placeholder="NL49INGB0113028776" mono />
                {errors.iban && <p className="text-[10px]" style={{ color: "var(--danger)" }}>⚠ {errors.iban}</p>}
                <Field label="IBAN tenaamstelling" value={form.iban_naam} onChange={v => set("iban_naam", v)} placeholder="TerreVolt B.V." />
                <NumberField label="Betalingstermijn (dagen)" value={form.betalingstermijn} onChange={v => set("betalingstermijn", v)} />
              </div>
            </div>

            {/* Preview */}
            <div>
              <SectionTitle>Voorbeeld op inkooporder</SectionTitle>
              <div className="rounded-xl p-4" style={{ background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)" }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="h-4 w-4" style={{ color: "var(--accent)" }} />
                  <span className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>{form.bedrijfsnaam || "—"}</span>
                </div>
                <div className="space-y-0.5 text-[13px]" style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>
                  {form.straat && <p>{form.straat}</p>}
                  {(form.postcode || form.stad) && <p>{[form.postcode, form.stad].filter(Boolean).join(" ")}</p>}
                  {form.land && <p>{form.land}</p>}
                </div>
                <div className="mt-3 space-y-0.5" style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: "var(--text-muted)" }}>
                  {form.kvk_nummer && <p>KVK: {form.kvk_nummer}</p>}
                  {form.btw_nummer && <p>BTW: {form.btw_nummer}</p>}
                  {form.iban && <p>IBAN: {formatIban(form.iban)}</p>}
                  {form.iban_naam && <p className="pl-[3.2em]">t.n.v. {form.iban_naam}</p>}
                </div>
                {form.email && <p className="mt-2 text-[13px]" style={{ color: "var(--text-muted)" }}>{form.email}</p>}
              </div>
            </div>
          </div>

          {/* Save button */}
          <button onClick={save} disabled={saving} className="w-full py-3 rounded-2xl text-sm font-bold disabled:opacity-50" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", color: "#fff" }}>
            {saving ? "Opslaan..." : "Opslaan"}
          </button>

          {/* Last updated */}
          {bedrijf?.updated_at && (
            <p className="text-[11px] text-center" style={{ color: "var(--text-muted)" }}>
              Laatst gewijzigd op {format(parseISO(bedrijf.updated_at), "d MMMM yyyy 'om' HH:mm", { locale: nl })}
              {updatedByName && ` door ${updatedByName}`}
            </p>
          )}
        </main>
      </PageShell>
    </>
  );
}

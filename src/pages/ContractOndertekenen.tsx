import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Spinner } from "@/components/ui/Spinner";
import { HandtekeningCanvas } from "@/components/HandtekeningCanvas";
import { ALLE_ARTIKELEN, vulArtikelen, OVERWEGINGEN } from "@/lib/contractTemplate";
import type { ContractData } from "@/types/app";
import { toast } from "sonner";
import terrevoltLogo from "@/assets/terrevolt-logo.svg";

const CORRECTIE_OPTIES = [
  { key: "naam_handelsnaam", label: "Mijn naam / handelsnaam" },
  { key: "adres", label: "Mijn adres" },
  { key: "kvk_nummer", label: "KVK-nummer" },
  { key: "btw_nummer", label: "BTW-nummer" },
  { key: "uurtarief", label: "Uurtarief" },
  { key: "looptijd", label: "Ingangsdatum / einddatum" },
  { key: "anders", label: "Anders" },
] as const;

export default function ContractOndertekenen() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contractData, setContractData] = useState<ContractData | null>(null);
  const [berichten, setBerichten] = useState<any[]>([]);
  const [stap, setStap] = useState(1);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [gelezen, setGelezen] = useState(false);
  const [naam, setNaam] = useState("");
  const [handtekening, setHandtekening] = useState<string | null>(null);
  const [akkoord, setAkkoord] = useState(false);
  const [saving, setSaving] = useState(false);
  const [klaar, setKlaar] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Account creation state
  const [kandidaatEmail, setKandidaatEmail] = useState("");
  const [kandidaatId, setKandidaatId] = useState("");
  const [wachtwoord, setWachtwoord] = useState("");
  const [wachtwoord2, setWachtwoord2] = useState("");
  const [registreren, setRegistreren] = useState(false);
  const [accountAangemaakt, setAccountAangemaakt] = useState(false);

  // Correctie state
  const [showCorrectie, setShowCorrectie] = useState(false);
  const [correctieItems, setCorrectieItems] = useState<string[]>([]);
  const [correctieToelichting, setCorrectieToelichting] = useState("");
  const [correctieVerstuurd, setCorrectieVerstuurd] = useState(false);
  const [correctieSaving, setCorrectieSaving] = useState(false);

  useEffect(() => {
    async function load() {
      if (!token) { setError("Geen token"); setLoading(false); return; }

      const { data: contracten } = await supabase
        .from("contracten")
        .select("*")
        .in("status", ["verstuurd", "correctie_gevraagd"]);

      const contract = contracten?.find((c: any) => {
        const cd = c.contract_data as any;
        return cd?._token === token;
      });

      if (!contract) {
        setError("Deze link is verlopen of ongeldig");
        setLoading(false);
        return;
      }

      const cd = (contract as any).contract_data as any;
      if (cd._token_geldig_tot && new Date(cd._token_geldig_tot) < new Date()) {
        setError("Deze link is verlopen");
        setLoading(false);
        return;
      }

      // Load berichten thread for this contract (public access via contract_data match)
      // We can't query contract_berichten directly (RLS), but the edge function handles that
      // For display purposes, the candidate sees the contract status
      if ((contract as any).status === "correctie_gevraagd") {
        setCorrectieVerstuurd(true);
      }

      setContractData(cd as ContractData);
      setNaam(cd.ot_naam || "");
      setLoading(false);
    }
    load();
  }, [token]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pct = Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100);
    setScrollPercent(Math.min(pct, 100));
  }, []);

  async function verstuurCorrectie() {
    if (correctieItems.length === 0) { toast.error("Selecteer wat er niet klopt"); return; }
    setCorrectieSaving(true);

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contract-correctie`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ token, wat_klopt_niet: correctieItems, toelichting: correctieToelichting.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Fout bij versturen");
      }

      setCorrectieVerstuurd(true);
      setShowCorrectie(false);
    } catch (err: any) {
      toast.error(err.message || "Er ging iets mis");
    }
    setCorrectieSaving(false);
  }

  function toggleCorrectieItem(key: string) {
    setCorrectieItems(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  async function ondertekenen() {
    if (!naam.trim() || !handtekening || !akkoord) return;
    setSaving(true);

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contract-ondertekenen`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ token, naam: naam.trim(), handtekening }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Fout bij ondertekenen");
      }

      const result = await res.json();
      if (result.email) setKandidaatEmail(result.email);
      if (result.kandidaat_id) setKandidaatId(result.kandidaat_id);
      setKlaar(true);
    } catch (err: any) {
      toast.error(err.message || "Er ging iets mis");
    }
    setSaving(false);
  }

  async function maakAccountAan() {
    if (!wachtwoord || wachtwoord.length < 6) { toast.error("Wachtwoord moet minimaal 6 tekens zijn"); return; }
    if (wachtwoord !== wachtwoord2) { toast.error("Wachtwoorden komen niet overeen"); return; }

    setRegistreren(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contract-register`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ email: kandidaatEmail, password: wachtwoord, kandidaat_id: kandidaatId }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Fout bij registratie");
      }

      setAccountAangemaakt(true);
    } catch (err: any) {
      toast.error(err.message || "Er ging iets mis");
    }
    setRegistreren(false);
  }

  if (loading) return <CenterLayout><Spinner center={false} /></CenterLayout>;
  if (error) return (
    <CenterLayout>
      <img src={terrevoltLogo} alt="TerreVolt" className="h-10 mb-6" />
      <h1 className="text-lg font-bold mb-2" style={{ color: "var(--text-primary)" }}>Link ongeldig</h1>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>{error}</p>
      <p className="text-sm mt-4" style={{ color: "var(--text-muted)" }}>Neem contact op met TerreVolt BV</p>
      <p className="text-sm font-mono" style={{ color: "var(--info)" }}>info@terrevolt.nl</p>
    </CenterLayout>
  );

  if (klaar) return (
    <CenterLayout>
      <div className="text-center space-y-4">
        <div className="text-5xl">✅</div>
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Contract ondertekend!</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          TerreVolt BV ondertekent nu ook en je ontvangt het definitieve contract zodra dit klaar is.
        </p>
        <div className="rounded-xl p-3 mt-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>TerreVolt B.V.</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>info@terrevolt.nl</p>
        </div>
      </div>
    </CenterLayout>
  );

  // Correctie verstuurd confirmation screen
  if (correctieVerstuurd && !showCorrectie) return (
    <CenterLayout>
      <div className="text-center space-y-4">
        <div className="text-5xl">📨</div>
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Correctie verstuurd</h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          TerreVolt heeft je bericht ontvangen en past het contract aan. Je ontvangt een nieuwe link zodra dit klaar is.
        </p>
        <div className="rounded-xl p-3 mt-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>TerreVolt B.V.</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>info@terrevolt.nl</p>
        </div>
      </div>
    </CenterLayout>
  );

  if (!contractData) return null;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-lg mx-auto px-4 py-6">
        <img src={terrevoltLogo} alt="TerreVolt" className="h-8 mb-6" />

        {/* Progress */}
        <div className="flex gap-1 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex-1 h-1 rounded-full" style={{ background: stap >= s ? "var(--accent)" : "var(--bg-surface-2)" }} />
          ))}
        </div>

        {stap === 1 && !showCorrectie && (
          <div className="space-y-4">
            <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Controleer je gegevens</h2>
            <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <Field label="Naam" value={contractData.ot_naam} />
              <Field label="Handelsnaam" value={contractData.ot_handelsnaam} />
              <Field label="Adres" value={`${contractData.ot_adres}, ${contractData.ot_postcode} ${contractData.ot_stad}`} />
              <Field label="KVK" value={contractData.ot_kvk} />
              {contractData.ot_btw && <Field label="BTW" value={contractData.ot_btw} />}
              <Field label="Uurtarief" value={`€${contractData.uurtarief.toFixed(2)}/uur excl. btw`} />
              <Field label="Looptijd" value={`${contractData.startdatum} — ${contractData.einddatum}`} />
            </div>
            <button onClick={() => setShowCorrectie(true)} className="text-xs underline block text-center" style={{ color: "var(--text-muted)" }}>
              ✏ Klopt er iets niet? Geef het door
            </button>
            <button onClick={() => setStap(2)} className="w-full py-3 rounded-xl text-sm font-semibold" style={{ background: "var(--accent)", color: "#fff" }}>
              Alles klopt — doorgaan →
            </button>
          </div>
        )}

        {/* Correctie formulier */}
        {stap === 1 && showCorrectie && (
          <div className="space-y-4">
            <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Wat klopt er niet?</h2>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Selecteer wat er aangepast moet worden. TerreVolt past het contract aan en stuurt je een nieuwe link.
            </p>

            <div className="space-y-2">
              {CORRECTIE_OPTIES.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => toggleCorrectieItem(opt.key)}
                  className="w-full flex items-center gap-3 rounded-xl p-3 text-left text-sm transition-colors"
                  style={{
                    background: correctieItems.includes(opt.key) ? "var(--accent-light)" : "var(--bg-surface)",
                    border: `1.5px solid ${correctieItems.includes(opt.key) ? "var(--accent-border)" : "var(--border)"}`,
                    color: correctieItems.includes(opt.key) ? "var(--accent)" : "var(--text-secondary)",
                    fontWeight: correctieItems.includes(opt.key) ? 700 : 400,
                  }}
                >
                  <span className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 text-xs"
                    style={{
                      borderColor: correctieItems.includes(opt.key) ? "var(--accent)" : "var(--border)",
                      background: correctieItems.includes(opt.key) ? "var(--accent)" : "transparent",
                      color: "#fff",
                    }}>
                    {correctieItems.includes(opt.key) && "✓"}
                  </span>
                  {opt.label}
                </button>
              ))}
            </div>

            <div>
              <label className="text-[11px] font-medium block mb-1" style={{ color: "var(--text-muted)" }}>
                Toelichting — wat moet het zijn?
              </label>
              <textarea
                value={correctieToelichting}
                onChange={e => setCorrectieToelichting(e.target.value)}
                placeholder="Bijv. mijn adres is Kerkstraat 12, 1234 AB Amsterdam"
                maxLength={2000}
                className="w-full rounded-xl p-3 text-sm resize-none"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)", minHeight: 100 }}
              />
              <p className="text-[10px] text-right mt-0.5" style={{ color: "var(--text-muted)" }}>
                {correctieToelichting.length}/2000
              </p>
            </div>

            <button
              onClick={verstuurCorrectie}
              disabled={correctieSaving || correctieItems.length === 0}
              className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {correctieSaving ? "Versturen..." : "Correctie versturen"}
            </button>

            <button
              onClick={() => { setShowCorrectie(false); setCorrectieItems([]); setCorrectieToelichting(""); }}
              className="text-xs underline block text-center"
              style={{ color: "var(--text-muted)" }}
            >
              ← Toch akkoord, ga terug
            </button>
          </div>
        )}

        {stap === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Lees het contract</h2>

            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-2)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${scrollPercent}%`, background: scrollPercent >= 95 ? "var(--success)" : "var(--accent)" }} />
              </div>
              <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>{scrollPercent}%</span>
            </div>

            <div ref={scrollRef} onScroll={handleScroll}
              className="rounded-2xl p-4 space-y-4 text-xs overflow-y-auto"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", maxHeight: 400, color: "var(--text-secondary)" }}>
              <h3 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>OVERWEGINGEN</h3>
              <p className="whitespace-pre-line">{OVERWEGINGEN}</p>
              {vulArtikelen(contractData).map((a, i) => {
                const lines = a.trim().split('\n');
                return (
                  <div key={i}>
                    <h4 className="font-bold text-[11px] mt-3" style={{ color: "var(--text-primary)" }}>{lines[0]}</h4>
                    <p className="whitespace-pre-line mt-1">{lines.slice(1).join('\n').trim()}</p>
                  </div>
                );
              })}
            </div>

            <label className="flex items-start gap-2 cursor-pointer" style={{ opacity: scrollPercent >= 95 ? 1 : 0.4 }}>
              <input type="checkbox" checked={gelezen} disabled={scrollPercent < 95}
                onChange={e => setGelezen(e.target.checked)}
                className="mt-0.5 accent-[var(--accent)]" />
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Ik heb het contract volledig gelezen en begrepen
              </span>
            </label>

            <div className="flex gap-2">
              <button onClick={() => setStap(1)} className="flex-1 py-3 rounded-xl text-sm" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>← Vorige</button>
              <button onClick={() => setStap(3)} disabled={!gelezen}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ background: gelezen ? "var(--accent)" : "var(--bg-surface-2)", color: gelezen ? "#fff" : "var(--text-muted)" }}>
                Ondertekenen →
              </button>
            </div>
          </div>
        )}

        {stap === 3 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Ondertekening</h2>

            <div className="rounded-xl p-3" style={{ background: "var(--info-light)", border: "1px solid var(--info-border)" }}>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Door te ondertekenen ga je akkoord met de overeenkomst van opdracht met TerreVolt BV.
              </p>
            </div>

            <div>
              <label className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Volledige naam</label>
              <input value={naam} onChange={e => setNaam(e.target.value)} placeholder="Typ je volledige naam"
                className="w-full mt-1 rounded-lg p-2.5 text-sm" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>Zoals vermeld in het contract</p>
            </div>

            <div>
              <label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>Handtekening</label>
              <HandtekeningCanvas hoogte={150} onSave={setHandtekening} />
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={akkoord} onChange={e => setAkkoord(e.target.checked)}
                className="mt-0.5 accent-[var(--accent)]" />
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Ik bevestig dat ik dit contract heb gelezen en begrepen en ga akkoord met alle voorwaarden, inclusief het relatiebeding, geheimhoudingsbeding en boetebeding.
              </span>
            </label>

            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {contractData.onderteken_plaats}, {new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}
            </p>

            <div className="flex gap-2">
              <button onClick={() => setStap(2)} className="flex-1 py-3 rounded-xl text-sm" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>← Vorige</button>
              <button onClick={ondertekenen} disabled={saving || !naam.trim() || !handtekening || !akkoord}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ background: (naam.trim() && handtekening && akkoord) ? "var(--accent)" : "var(--bg-surface-2)", color: (naam.trim() && handtekening && akkoord) ? "#fff" : "var(--text-muted)" }}>
                {saving ? "Ondertekenen..." : "Ondertekenen"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CenterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "var(--bg-base)" }}>
      <div className="text-center max-w-sm">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-sm" style={{ color: "var(--text-primary)" }}>{value || "—"}</p>
    </div>
  );
}

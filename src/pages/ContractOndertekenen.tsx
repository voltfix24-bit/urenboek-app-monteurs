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

      // Use edge function to lookup contract (bypasses RLS for unauthenticated users)
      const lookupUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contract-lookup`;
      let res: Response;
      try {
        res = await fetch(lookupUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ token }),
        });
      } catch {
        setError("Kan contract niet laden. Controleer je internetverbinding.");
        setLoading(false);
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "expired") {
          setError("Deze link is verlopen");
        } else if (data.error === "not_found") {
          // Check sessionStorage for recently signed contract
          const storedContractId = sessionStorage.getItem(`contract_signed_${token}`);
          if (storedContractId) {
            // Try loading signed contract data from sessionStorage
            const storedData = sessionStorage.getItem(`contract_data_${token}`);
            if (storedData) {
              try {
                const parsed = JSON.parse(storedData);
                setContractData(parsed.contract_data as ContractData);
                setAccountAangemaakt(parsed.has_account || false);
                if (!parsed.has_account && parsed.kandidaat_email) {
                  setKandidaatEmail(parsed.kandidaat_email);
                  setKandidaatId(parsed.kandidaat_id || "");
                }
                setKlaar(true);
                setLoading(false);
                return;
              } catch { /* fall through */ }
            }
          }
          setError("Deze link is verlopen of ongeldig");
        } else {
          setError(data.error || "Er is een fout opgetreden");
        }
        setLoading(false);
        return;
      }

      // Handle signed contracts
      if (data.status === "signed") {
        if (data.has_account) {
          setAccountAangemaakt(true);
        } else if (data.kandidaat_email) {
          setKandidaatEmail(data.kandidaat_email);
          setKandidaatId(data.kandidaat_id || "");
        }
        setKlaar(true);
        setContractData(data.contract_data as ContractData);
        setLoading(false);
        return;
      }

      // Pending contract
      if (data.status === "pending") {
        if (data.berichten?.length > 0) {
          setBerichten(data.berichten);
        }
        // Check if correctie was requested
        const lastBericht = data.berichten?.[data.berichten.length - 1];
        if (lastBericht?.bericht_type === "correctie" && lastBericht?.richting === "ot_naar_og") {
          setCorrectieVerstuurd(true);
        }
        setContractData(data.contract_data as ContractData);
        setNaam(data.contract_data?.ot_naam || "");
        setLoading(false);
      }
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
      // Store contract reference for page reload detection
      if (result.contract_id) {
        sessionStorage.setItem(`contract_signed_${token}`, result.contract_id);
        sessionStorage.setItem(`contract_data_${token}`, JSON.stringify({
          contract_data: contractData,
          has_account: false,
          kandidaat_email: result.email || "",
          kandidaat_id: result.kandidaat_id || "",
        }));
      }
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
      <h1 className="text-lg font-bold mb-2" style={{ color: "#dae6ff" }}>Link ongeldig</h1>
      <p className="text-sm" style={{ color: "#a0abc3" }}>{error}</p>
      <p className="text-sm mt-4" style={{ color: "#a0abc3" }}>Neem contact op met TerreVolt BV</p>
      <p className="text-sm font-mono" style={{ color: "#6e9bff" }}>info@terrevolt.nl</p>
    </CenterLayout>
  );

  if (klaar && accountAangemaakt) return (
    <CenterLayout>
      <div className="text-center space-y-4">
        <div className="text-5xl">🎉</div>
        <h1 className="text-xl font-bold" style={{ color: "#dae6ff" }}>Account aangemaakt!</h1>
        <p className="text-sm" style={{ color: "#a0abc3" }}>
          Je kunt nu inloggen in de TerreVolt app met je e-mailadres en wachtwoord.
        </p>
        <a href="/auth" className="block w-full py-3 rounded-xl text-sm font-semibold text-center"
          style={{ background: "#3fff8b", color: "#fff" }}>
          Inloggen →
        </a>
        <div className="rounded-xl p-3 mt-4" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
          <p className="text-xs font-semibold" style={{ color: "#dae6ff" }}>TerreVolt B.V.</p>
          <p className="text-xs" style={{ color: "#a0abc3" }}>info@terrevolt.nl</p>
        </div>
      </div>
    </CenterLayout>
  );

  if (klaar) return (
    <div className="min-h-screen" style={{ background: "var(--app-navy)" }}>
      <div className="max-w-lg mx-auto px-4 py-6">
        <img src={terrevoltLogo} alt="TerreVolt" className="h-8 mb-6" />

        <div className="text-center space-y-4 mb-8">
          <div className="text-5xl">✅</div>
          <h1 className="text-xl font-bold" style={{ color: "#dae6ff" }}>Bedankt voor het ondertekenen!</h1>
          <p className="text-sm" style={{ color: "#a0abc3" }}>
            TerreVolt BV ondertekent nu ook en je ontvangt het definitieve contract zodra dit klaar is.
          </p>
        </div>

        {kandidaatEmail && kandidaatId && (
          <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
            <div>
              <h2 className="text-base font-bold" style={{ color: "#dae6ff" }}>Maak je account aan</h2>
              <p className="text-xs mt-1" style={{ color: "#a0abc3" }}>
                Kies een wachtwoord om in te loggen in de TerreVolt app. Hiermee kun je je uren registreren, planning bekijken en meer.
              </p>
            </div>

            <div>
              <label className="text-[11px] font-medium" style={{ color: "#a0abc3" }}>E-mailadres</label>
              <div className="w-full mt-1 rounded-lg p-2.5 text-sm"
                style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>
                {kandidaatEmail}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium" style={{ color: "#a0abc3" }}>Kies een wachtwoord</label>
              <input type="password" value={wachtwoord} onChange={e => setWachtwoord(e.target.value)}
                placeholder="Minimaal 6 tekens"
                className="w-full mt-1 rounded-lg p-2.5 text-sm"
                style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
            </div>

            <div>
              <label className="text-[11px] font-medium" style={{ color: "#a0abc3" }}>Herhaal wachtwoord</label>
              <input type="password" value={wachtwoord2} onChange={e => setWachtwoord2(e.target.value)}
                placeholder="Herhaal je wachtwoord"
                className="w-full mt-1 rounded-lg p-2.5 text-sm"
                style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
            </div>

            <button onClick={maakAccountAan} disabled={registreren || !wachtwoord || wachtwoord.length < 6 || wachtwoord !== wachtwoord2}
              className="w-full py-3 rounded-xl text-sm font-semibold"
              style={{
                background: (wachtwoord && wachtwoord.length >= 6 && wachtwoord === wachtwoord2) ? "#3fff8b" : "#102038",
                color: (wachtwoord && wachtwoord.length >= 6 && wachtwoord === wachtwoord2) ? "#fff" : "#a0abc3",
              }}>
              {registreren ? "Account aanmaken..." : "Account aanmaken"}
            </button>
          </div>
        )}

        <div className="rounded-xl p-3 mt-6 text-center" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
          <p className="text-xs font-semibold" style={{ color: "#dae6ff" }}>TerreVolt B.V.</p>
          <p className="text-xs" style={{ color: "#a0abc3" }}>info@terrevolt.nl</p>
        </div>
      </div>
    </div>
  );

  // Correctie verstuurd confirmation screen
  if (correctieVerstuurd && !showCorrectie) return (
    <CenterLayout>
      <div className="text-center space-y-4">
        <div className="text-5xl">📨</div>
        <h1 className="text-xl font-bold" style={{ color: "#dae6ff" }}>Correctie verstuurd</h1>
        <p className="text-sm" style={{ color: "#a0abc3" }}>
          TerreVolt heeft je bericht ontvangen en past het contract aan. Je ontvangt een nieuwe link zodra dit klaar is.
        </p>
        <div className="rounded-xl p-3 mt-4" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
          <p className="text-xs font-semibold" style={{ color: "#dae6ff" }}>TerreVolt B.V.</p>
          <p className="text-xs" style={{ color: "#a0abc3" }}>info@terrevolt.nl</p>
        </div>
      </div>
    </CenterLayout>
  );

  if (!contractData) return null;

  return (
    <div className="min-h-screen" style={{ background: "var(--app-navy)" }}>
      <div className="max-w-lg mx-auto px-4 py-6">
        <img src={terrevoltLogo} alt="TerreVolt" className="h-8 mb-6" />

        {/* Progress */}
        <div className="flex gap-1 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex-1 h-1 rounded-full" style={{ background: stap >= s ? "#3fff8b" : "#102038" }} />
          ))}
        </div>

        {stap === 1 && !showCorrectie && (
          <div className="space-y-4">
            <h2 className="text-base font-bold" style={{ color: "#dae6ff" }}>Controleer je gegevens</h2>
            <div className="rounded-2xl p-4 space-y-2" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
              <Field label="Naam" value={contractData.ot_naam} />
              <Field label="Handelsnaam" value={contractData.ot_handelsnaam} />
              <Field label="Adres" value={`${contractData.ot_adres}, ${contractData.ot_postcode} ${contractData.ot_stad}`} />
              <Field label="KVK" value={contractData.ot_kvk} />
              {contractData.ot_btw && <Field label="BTW" value={contractData.ot_btw} />}
              <Field label="Uurtarief" value={`€${contractData.uurtarief.toFixed(2)}/uur excl. btw`} />
              <Field label="Looptijd" value={`${contractData.startdatum} — ${contractData.einddatum}`} />
            </div>
            <button onClick={() => setShowCorrectie(true)} className="text-xs underline block text-center" style={{ color: "#a0abc3" }}>
              ✏ Klopt er iets niet? Geef het door
            </button>
            <button onClick={() => setStap(2)} className="w-full py-3 rounded-xl text-sm font-semibold" style={{ background: "#3fff8b", color: "#fff" }}>
              Alles klopt — doorgaan →
            </button>
          </div>
        )}

        {/* Correctie formulier */}
        {stap === 1 && showCorrectie && (
          <div className="space-y-4">
            <h2 className="text-base font-bold" style={{ color: "#dae6ff" }}>Wat klopt er niet?</h2>
            <p className="text-xs" style={{ color: "#a0abc3" }}>
              Selecteer wat er aangepast moet worden. TerreVolt past het contract aan en stuurt je een nieuwe link.
            </p>

            <div className="space-y-2">
              {CORRECTIE_OPTIES.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => toggleCorrectieItem(opt.key)}
                  className="w-full flex items-center gap-3 rounded-xl p-3 text-left text-sm transition-colors"
                  style={{
                    background: correctieItems.includes(opt.key) ? "rgba(63,255,139,0.1)" : "rgba(10,26,48,0.7)",
                    border: `1.5px solid ${correctieItems.includes(opt.key) ? "rgba(63,255,139,0.3)" : "rgba(106,118,140,0.15)"}`,
                    color: correctieItems.includes(opt.key) ? "#3fff8b" : "#a0abc3",
                    fontWeight: correctieItems.includes(opt.key) ? 700 : 400,
                  }}
                >
                  <span className="w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 text-xs"
                    style={{
                      borderColor: correctieItems.includes(opt.key) ? "#3fff8b" : "rgba(106,118,140,0.15)",
                      background: correctieItems.includes(opt.key) ? "#3fff8b" : "transparent",
                      color: "#fff",
                    }}>
                    {correctieItems.includes(opt.key) && "✓"}
                  </span>
                  {opt.label}
                </button>
              ))}
            </div>

            <div>
              <label className="text-[11px] font-medium block mb-1" style={{ color: "#a0abc3" }}>
                Toelichting — wat moet het zijn?
              </label>
              <textarea
                value={correctieToelichting}
                onChange={e => setCorrectieToelichting(e.target.value)}
                placeholder="Bijv. mijn adres is Kerkstraat 12, 1234 AB Amsterdam"
                maxLength={2000}
                className="w-full rounded-xl p-3 text-sm resize-none"
                style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff", minHeight: 100 }}
              />
              <p className="text-[10px] text-right mt-0.5" style={{ color: "#a0abc3" }}>
                {correctieToelichting.length}/2000
              </p>
            </div>

            <button
              onClick={verstuurCorrectie}
              disabled={correctieSaving || correctieItems.length === 0}
              className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
              style={{ background: "#3fff8b", color: "#fff" }}
            >
              {correctieSaving ? "Versturen..." : "Correctie versturen"}
            </button>

            <button
              onClick={() => { setShowCorrectie(false); setCorrectieItems([]); setCorrectieToelichting(""); }}
              className="text-xs underline block text-center"
              style={{ color: "#a0abc3" }}
            >
              ← Toch akkoord, ga terug
            </button>
          </div>
        )}

        {stap === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold" style={{ color: "#dae6ff" }}>Lees het contract</h2>

            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#102038" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${scrollPercent}%`, background: scrollPercent >= 95 ? "#3fff8b" : "#3fff8b" }} />
              </div>
              <span className="text-[10px] font-mono" style={{ color: "#a0abc3" }}>{scrollPercent}%</span>
            </div>

            <div ref={scrollRef} onScroll={handleScroll}
              className="rounded-2xl p-4 space-y-4 text-xs overflow-y-auto"
              style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", maxHeight: 400, color: "#a0abc3" }}>
              <h3 className="font-bold text-sm" style={{ color: "#dae6ff" }}>OVERWEGINGEN</h3>
              <p className="whitespace-pre-line">{OVERWEGINGEN}</p>
              {vulArtikelen(contractData).map((a, i) => {
                const lines = a.trim().split('\n');
                return (
                  <div key={i}>
                    <h4 className="font-bold text-[11px] mt-3" style={{ color: "#dae6ff" }}>{lines[0]}</h4>
                    <p className="whitespace-pre-line mt-1">{lines.slice(1).join('\n').trim()}</p>
                  </div>
                );
              })}
            </div>

            <label className="flex items-start gap-2 cursor-pointer" style={{ opacity: scrollPercent >= 95 ? 1 : 0.4 }}>
              <input type="checkbox" checked={gelezen} disabled={scrollPercent < 95}
                onChange={e => setGelezen(e.target.checked)}
                className="mt-0.5 accent-[#3fff8b]" />
              <span className="text-xs" style={{ color: "#a0abc3" }}>
                Ik heb het contract volledig gelezen en begrepen
              </span>
            </label>

            <div className="flex gap-2">
              <button onClick={() => setStap(1)} className="flex-1 py-3 rounded-xl text-sm" style={{ border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>← Vorige</button>
              <button onClick={() => setStap(3)} disabled={!gelezen}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ background: gelezen ? "#3fff8b" : "#102038", color: gelezen ? "#fff" : "#a0abc3" }}>
                Ondertekenen →
              </button>
            </div>
          </div>
        )}

        {stap === 3 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold" style={{ color: "#dae6ff" }}>Ondertekening</h2>

            <div className="rounded-xl p-3" style={{ background: "rgba(110,155,255,0.1)", border: "1px solid rgba(110,155,255,0.3)" }}>
              <p className="text-xs" style={{ color: "#a0abc3" }}>
                Door te ondertekenen ga je akkoord met de overeenkomst van opdracht met TerreVolt BV.
              </p>
            </div>

            <div>
              <label className="text-[11px] font-medium" style={{ color: "#a0abc3" }}>Volledige naam</label>
              <input value={naam} onChange={e => setNaam(e.target.value)} placeholder="Typ je volledige naam"
                className="w-full mt-1 rounded-lg p-2.5 text-sm" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", color: "#dae6ff" }} />
              <p className="text-[10px] mt-0.5" style={{ color: "#a0abc3" }}>Zoals vermeld in het contract</p>
            </div>

            <div>
              <label className="text-[11px] font-medium mb-1 block" style={{ color: "#a0abc3" }}>Handtekening</label>
              <HandtekeningCanvas hoogte={150} onSave={setHandtekening} />
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={akkoord} onChange={e => setAkkoord(e.target.checked)}
                className="mt-0.5 accent-[#3fff8b]" />
              <span className="text-xs" style={{ color: "#a0abc3" }}>
                Ik bevestig dat ik dit contract heb gelezen en begrepen en ga akkoord met alle voorwaarden, inclusief het relatiebeding, geheimhoudingsbeding en boetebeding.
              </span>
            </label>

            <p className="text-xs" style={{ color: "#a0abc3" }}>
              {contractData.onderteken_plaats}, {new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}
            </p>

            <div className="flex gap-2">
              <button onClick={() => setStap(2)} className="flex-1 py-3 rounded-xl text-sm" style={{ border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>← Vorige</button>
              <button onClick={ondertekenen} disabled={saving || !naam.trim() || !handtekening || !akkoord}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ background: (naam.trim() && handtekening && akkoord) ? "#3fff8b" : "#102038", color: (naam.trim() && handtekening && akkoord) ? "#fff" : "#a0abc3" }}>
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
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "var(--app-navy)" }}>
      <div className="text-center max-w-sm">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#a0abc3" }}>{label}</p>
      <p className="text-sm" style={{ color: "#dae6ff" }}>{value || "—"}</p>
    </div>
  );
}

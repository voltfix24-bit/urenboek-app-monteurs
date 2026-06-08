import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useBedrijfsgegevens, getBedrijfsgegevens } from "@/hooks/useBedrijfsgegevens";
import { PageShell } from "@/components/PageShell";
import { Spinner } from "@/components/ui/Spinner";
import { Input } from "@/components/ui/input";
import { formatDatum } from "@/lib/formatting";
import { vulArtikelen, OVERWEGINGEN, ALLE_ARTIKELEN } from "@/lib/contractTemplate";
import type { Kandidaat, ContractData } from "@/types/app";
import { toast } from "sonner";
import { format, addDays } from "date-fns";

export default function ContractAanmaken() {
  const { kandidaatId } = useParams<{ kandidaatId: string }>();
  const navigate = useNavigate();
  const { profileId } = useProfile();
  const { bedrijf } = useBedrijfsgegevens();
  const [kandidaat, setKandidaat] = useState<Kandidaat | null>(null);
  const [managers, setManagers] = useState<Array<{ id: string; full_name: string; heeft_handtekening: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [stap, setStap] = useState(1);
  const [saving, setSaving] = useState(false);

  // Form state
  const [ogVertegenwoordiger, setOgVertegenwoordiger] = useState("");
  const [ogFunctie, setOgFunctie] = useState("Directeur");
  const [otNaam, setOtNaam] = useState("");
  const [otHandelsnaam, setOtHandelsnaam] = useState("");
  const [otAdres, setOtAdres] = useState("");
  const [otPostcode, setOtPostcode] = useState("");
  const [otStad, setOtStad] = useState("");
  const [otKvk, setOtKvk] = useState("");
  const [otBtw, setOtBtw] = useState("");
  const [uurtarief, setUurtarief] = useState("");
  const [startdatum, setStartdatum] = useState(format(new Date(), "yyyy-MM-dd"));
  const [plaats, setPlaats] = useState("Amsterdam");

  const einddatum = useMemo(() => {
    try { return format(addDays(new Date(startdatum), 365), "yyyy-MM-dd"); } catch { return ""; }
  }, [startdatum]);

  useEffect(() => {
    async function load() {
      const [{ data: k }, { data: mgrs }] = await Promise.all([
        supabase.from("kandidaten").select("*").eq("id", kandidaatId!).single(),
        supabase.from("profiles").select("id, full_name").in("user_id",
          (await supabase.from("user_roles").select("user_id").eq("role", "manager")).data?.map((r: any) => r.user_id) || []
        ),
      ]);

      if (k) {
        const kand = k as unknown as Kandidaat;
        setKandidaat(kand);
        setOtNaam(`${kand.voornaam} ${kand.achternaam}`);
        if (kand.afgesproken_tarief) setUurtarief(kand.afgesproken_tarief.toString());
      }

      if (mgrs) {
        const { data: sigs } = await supabase.from("manager_handtekeningen").select("profiel_id");
        const sigIds = new Set(sigs?.map((s: any) => s.profiel_id) || []);
        setManagers(mgrs.map((m: any) => ({ ...m, heeft_handtekening: sigIds.has(m.id) })));
        if (mgrs.length > 0) setOgVertegenwoordiger(mgrs[0].full_name);
      }
      setLoading(false);
    }
    load();
  }, [kandidaatId]);

  const contractData: ContractData = {
    og_naam: bedrijf?.bedrijfsnaam || "TerreVolt B.V.",
    og_rechtsvorm: bedrijf?.rechtsvorm || "B.V.",
    og_adres: bedrijf?.straat || "",
    og_postcode: bedrijf?.postcode || "",
    og_stad: bedrijf?.stad || "",
    og_kvk: bedrijf?.kvk_nummer || "",
    og_vertegenwoordiger: ogVertegenwoordiger,
    og_functie: ogFunctie,
    ot_naam: otNaam,
    ot_handelsnaam: otHandelsnaam || otNaam,
    ot_adres: otAdres,
    ot_postcode: otPostcode,
    ot_stad: otStad,
    ot_kvk: otKvk,
    ot_btw: otBtw,
    uurtarief: parseFloat(uurtarief) || 0,
    startdatum: formatDatum(startdatum),
    einddatum: einddatum ? formatDatum(einddatum) : "",
    onderteken_datum: formatDatum(new Date()),
    onderteken_plaats: plaats,
    contract_nummer: "", // filled on submit
  };

  async function versturen() {
    if (!uurtarief || parseFloat(uurtarief) <= 0) { toast.error("Vul een geldig uurtarief in"); return; }
    if (!otKvk) { toast.error("KVK-nummer opdrachtnemer is verplicht"); return; }

    setSaving(true);
    try {
      // Get contract nummer
      const { data: numData } = await supabase.rpc("next_contract_nummer");
      const nummer = numData as unknown as string;

      const finalData = { ...contractData, contract_nummer: nummer };
      const selectedManager = managers.find(m => m.full_name === ogVertegenwoordiger);

      const { data: contract, error } = await supabase.from("contracten").insert({
        contract_nummer: nummer,
        kandidaat_id: kandidaatId,
        status: "verstuurd",
        contract_data: finalData as any,
        startdatum,
        einddatum,
        aangemaakt_door: profileId!,
        og_profiel_id: selectedManager?.id || profileId!,
      }).select("id").single();

      if (error) throw error;

      // Create signing token via edge function (uses service role to write to locked-down contract_tokens table)
      const { data: tokenResp, error: tokenErr } = await supabase.functions.invoke("contract-token-create", {
        body: { contract_id: contract!.id },
      });
      if (tokenErr || !tokenResp?.token) {
        throw new Error(tokenErr?.message || "Kon ondertekentoken niet aanmaken");
      }
      const ondertekeningsLink = `${window.location.origin}/contract/ondertekenen/${tokenResp.token}`;

      // Update kandidaat status
      await supabase.from("kandidaten").update({ status: "uitgenodigd" }).eq("id", kandidaatId!);

      toast.success("Contract verstuurd ✓");
      toast.info(
        <div className="space-y-1">
          <p className="text-xs font-semibold">Ondertekeningslink:</p>
          <div className="flex items-center gap-2">
            <code className="text-[10px] break-all flex-1" style={{ color: "#10b981" }}>{ondertekeningsLink}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(ondertekeningsLink); toast.success("Link gekopieerd ✓"); }}
              className="shrink-0 px-2 py-1 rounded text-[10px] font-medium"
              style={{ background: "#10b981", color: "#fff" }}>
              Kopieer
            </button>
          </div>
        </div>,
        { duration: 30000 }
      );
      navigate("/kandidaten");
    } catch (err) {
      toast.error("Fout bij versturen");
      console.error(err);
    }
    setSaving(false);
  }

  if (loading) return <PageShell><Spinner /></PageShell>;
  if (!kandidaat) return <PageShell><p style={{ color: "#6b7280" }}>Kandidaat niet gevonden</p></PageShell>;

  return (
    <PageShell>
      {/* Progress */}
      <div className="flex gap-1 mb-6">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex-1 h-1 rounded-full" style={{ background: stap >= s ? "#10b981" : "#ffffff" }} />
        ))}
      </div>

      {stap === 1 && (
        <div className="space-y-6">
          {/* Opdrachtgever */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: "#ffffff", border: "1px solid #e5e7eb" }}>
            <SectieHeader>TerreVolt BV (Opdrachtgever)</SectieHeader>
            <ReadonlyField label="Bedrijfsnaam" value={bedrijf?.bedrijfsnaam || "TerreVolt B.V."} />
            <ReadonlyField label="Adres" value={`${bedrijf?.straat || ""}, ${bedrijf?.postcode || ""} ${bedrijf?.stad || ""}`} />
            <ReadonlyField label="KVK" value={bedrijf?.kvk_nummer || ""} />
            <div>
              <label className="text-[11px] font-medium" style={{ color: "#6b7280" }}>Vertegenwoordigd door</label>
              <select value={ogVertegenwoordiger} onChange={e => setOgVertegenwoordiger(e.target.value)}
                className="w-full mt-1 rounded-lg p-2.5 text-sm" style={{ background: "var(--app-navy)", border: "1px solid #e5e7eb", color: "#1f2937" }}>
                {managers.map(m => (
                  <option key={m.id} value={m.full_name}>
                    {m.full_name} {m.heeft_handtekening ? "✓" : ""}
                  </option>
                ))}
              </select>
            </div>
            <Input placeholder="Functie" value={ogFunctie} onChange={e => setOgFunctie(e.target.value)} />
          </div>

          {/* Opdrachtnemer */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: "#ffffff", border: "1px solid #e5e7eb" }}>
            <SectieHeader>Opdrachtnemer</SectieHeader>
            <Input placeholder="Volledige naam" value={otNaam} onChange={e => setOtNaam(e.target.value)} />
            <Input placeholder="Handelsnaam (optioneel)" value={otHandelsnaam} onChange={e => setOtHandelsnaam(e.target.value)} />
            <Input placeholder="Adres" value={otAdres} onChange={e => setOtAdres(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Postcode" value={otPostcode} onChange={e => setOtPostcode(e.target.value)} />
              <Input placeholder="Stad" value={otStad} onChange={e => setOtStad(e.target.value)} />
            </div>
            <Input placeholder="KVK-nummer *" value={otKvk} onChange={e => setOtKvk(e.target.value)} />
            <Input placeholder="BTW-nummer (optioneel)" value={otBtw} onChange={e => setOtBtw(e.target.value)} />
          </div>

          <button onClick={() => setStap(2)} className="w-full py-3 rounded-xl text-sm font-semibold" style={{ background: "#10b981", color: "#fff" }}>
            Volgende →
          </button>
        </div>
      )}

      {stap === 2 && (
        <div className="space-y-4">
          <div className="rounded-2xl p-4 space-y-3" style={{ background: "#ffffff", border: "1px solid #e5e7eb" }}>
            <SectieHeader>Contractdetails</SectieHeader>
            <div>
              <label className="text-[11px] font-medium" style={{ color: "#6b7280" }}>Uurtarief (€/uur)</label>
              <Input type="number" value={uurtarief} onChange={e => setUurtarief(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-[11px] font-medium" style={{ color: "#6b7280" }}>Ingangsdatum</label>
              <Input type="date" value={startdatum} onChange={e => setStartdatum(e.target.value)} className="mt-1" />
            </div>
            <ReadonlyField label="Einddatum" value={einddatum ? `${formatDatum(einddatum)} (12 maanden)` : ""} />
            <div>
              <label className="text-[11px] font-medium" style={{ color: "#6b7280" }}>Ondertekeningsplaats</label>
              <Input value={plaats} onChange={e => setPlaats(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStap(1)} className="flex-1 py-3 rounded-xl text-sm" style={{ border: "1px solid #e5e7eb", color: "#6b7280" }}>← Vorige</button>
            <button onClick={() => setStap(3)} className="flex-1 py-3 rounded-xl text-sm font-semibold" style={{ background: "#10b981", color: "#fff" }}>Volgende →</button>
          </div>
        </div>
      )}

      {stap === 3 && (
        <div className="space-y-4">
          {/* Snel aanpassen vlak voor versturen */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: "#ffffff", border: "1px solid #e5e7eb" }}>
            <div className="flex items-center justify-between">
              <SectieHeader>Snel aanpassen</SectieHeader>
              <button
                onClick={() => setStap(1)}
                className="text-[10px] font-medium px-2 py-1 rounded mb-1"
                style={{ color: "#6e9bff", border: "1px solid rgba(110,155,255,0.3)" }}>
                Volledig bewerken
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium" style={{ color: "#6b7280" }}>Uurtarief (€)</label>
                <Input type="number" value={uurtarief} onChange={e => setUurtarief(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-[11px] font-medium" style={{ color: "#6b7280" }}>Ingangsdatum</label>
                <Input type="date" value={startdatum} onChange={e => setStartdatum(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium" style={{ color: "#6b7280" }}>Naam opdrachtnemer</label>
              <Input value={otNaam} onChange={e => setOtNaam(e.target.value)} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium" style={{ color: "#6b7280" }}>KVK opdrachtnemer</label>
                <Input value={otKvk} onChange={e => setOtKvk(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-[11px] font-medium" style={{ color: "#6b7280" }}>Plaats ondertekening</label>
                <Input value={plaats} onChange={e => setPlaats(e.target.value)} className="mt-1" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl p-4 space-y-3" style={{ background: "#ffffff", border: "1px solid #e5e7eb" }}>
            <SectieHeader>Contract preview</SectieHeader>
            <div className="max-h-[400px] overflow-y-auto pr-2 space-y-3 text-xs" style={{ color: "#6b7280" }}>
              <p><strong>Opdrachtgever:</strong> {contractData.og_naam}, {contractData.og_adres}</p>
              <p><strong>Opdrachtnemer:</strong> {contractData.ot_handelsnaam || contractData.ot_naam}, {contractData.ot_adres}</p>
              <p><strong>Uurtarief:</strong> €{contractData.uurtarief.toFixed(2)}/uur excl. btw</p>
              <p><strong>Looptijd:</strong> {contractData.startdatum} — {contractData.einddatum}</p>
              <hr style={{ borderColor: "#e5e7eb" }} />
              {ALLE_ARTIKELEN.map((a, i) => (
                <div key={i}>
                  <p className="font-semibold text-[11px]" style={{ color: "#1f2937" }}>{a.split('\n')[0]}</p>
                  <p className="mt-1 whitespace-pre-line">{a.split('\n').slice(1).join('\n').trim().slice(0, 200)}...</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl p-3" style={{ background: "rgba(110,155,255,0.1)", border: "1px solid rgba(110,155,255,0.3)" }}>
            <p className="text-xs" style={{ color: "#6b7280" }}>
              ℹ Na het versturen ontvangt {kandidaat.voornaam} een ondertekeningslink (geldig 7 dagen).
            </p>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStap(2)} className="flex-1 py-3 rounded-xl text-sm" style={{ border: "1px solid #e5e7eb", color: "#6b7280" }}>← Vorige</button>
            <button onClick={versturen} disabled={saving}
              className="flex-1 py-3 rounded-xl text-sm font-semibold"
              style={{ background: "#10b981", color: "#fff", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Versturen..." : "Contract versturen →"}
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function SectieHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-wider pb-1.5 mb-1" style={{ color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>
      {children}
    </p>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium" style={{ color: "#6b7280" }}>{label}</p>
      <p className="text-sm" style={{ color: "#1f2937" }}>{value || "—"}</p>
    </div>
  );
}

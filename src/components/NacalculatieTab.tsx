import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Info, ArrowRight } from "lucide-react";
import { euro } from "@/lib/formatting";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";

interface Props { projectId: string }

interface UrenBoeking { medewerker_id: string; uren: number; status: string }
interface Profiel { id: string; full_name: string; uurtarief: number }

const mono = { fontFamily: "DM Mono, monospace" };
const margeKleur = (p: number) => p >= 30 ? "#3fff8b" : p >= 15 ? "#feb300" : "#ff716c";
const margeBg = (p: number) => p >= 30 ? "rgba(63,255,139,0.1)" : p >= 15 ? "rgba(254,179,0,0.1)" : "rgba(255,113,108,0.1)";

export function NacalculatieTab({ projectId }: Props) {
  const [loading, setLoading] = useState(true);
  const [methode, setMethode] = useState<string | null>(null);
  const [forecastRegels, setForecastRegels] = useState<any[]>([]);
  const [boekingen, setBoekingen] = useState<UrenBoeking[]>([]);
  const [profielMap, setProfielMap] = useState<Map<string, Profiel>>(new Map());
  const [verwachteOmzet, setVerwachteOmzet] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Parallel fetch
    const [fcRes, urenRes] = await Promise.all([
      supabase.from("project_forecast").select("id, methode, verwachte_omzet").eq("project_id", projectId).maybeSingle(),
      supabase.from("uren_boekingen").select("medewerker_id, uren, status").eq("project_id", projectId),
    ]);

    const fc = fcRes.data;
    const allBoekingen: UrenBoeking[] = (urenRes.data || []).map((u: any) => ({
      medewerker_id: u.medewerker_id,
      uren: Number(u.uren),
      status: u.status,
    }));
    setBoekingen(allBoekingen);
    setMethode(fc?.methode || null);

    let regels: any[] = [];
    if (fc) {
      const { data } = await supabase.from("forecast_regels").select("*").eq("forecast_id", fc.id);
      regels = data || [];
    }
    setForecastRegels(regels);

    if (fc?.methode === "uren") {
      // Prefer persisted verwachte_omzet from the forecast record
      if ((fc as any).verwachte_omzet != null && Number((fc as any).verwachte_omzet) > 0) {
        setVerwachteOmzet(Number((fc as any).verwachte_omzet));
      } else {
        const urenRegels = regels.filter(r => r.type === "uren");
        // Fallback: geplande_uren × uurtarief
        const kosten = urenRegels.reduce(
          (s, r) =>
            s + (Number(r.geplande_uren) || 0) * (Number(r.uurtarief_snap) || 0),
          0
        );
        setVerwachteOmzet(kosten);
      }
    }

    // Profielen
    const medIds = [...new Set([
      ...allBoekingen.map(b => b.medewerker_id),
      ...regels.filter(r => r.medewerker_id).map(r => r.medewerker_id),
    ])];
    if (medIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, uurtarief").in("id", medIds);
      setProfielMap(new Map((profs || []).map((p: any) => [p.id, { id: p.id, full_name: p.full_name, uurtarief: Number(p.uurtarief) || 0 }])));
    }

    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <Spinner padding="py-8" />;

  // ─── BEREKENINGEN ───────────────────────────
  const stuksRegels = forecastRegels.filter(r => r.type === "stuksprijzen" || r.type === "stuks" || r.type === "spec");
  const urenRegels = forecastRegels.filter(r => r.type === "uren");

  // OMZET
  let forecastOmzet = 0;
  let werkelijkOmzet = 0;

  if (methode === "stuksprijzen") {
    forecastOmzet = stuksRegels.reduce((s, r) => s + (Number(r.tarief) || 0) * (Number(r.aantal) || 1), 0);
    werkelijkOmzet = stuksRegels.reduce((s, r) => {
      const a = r.werkelijk_aantal != null ? Number(r.werkelijk_aantal) : (Number(r.aantal) || 1);
      return s + (Number(r.tarief) || 0) * a;
    }, 0);
  } else if (methode === "uren") {
    // For uren: omzet is fixed agreement, stored in forecast
    // Use the sum of tarief fields as verwachte_omzet
    forecastOmzet = verwachteOmzet;
    werkelijkOmzet = verwachteOmzet; // fixed, doesn't change
  }

  // KOSTEN per status
  const kostenPerStatus = (status: string) => {
    return boekingen
      .filter(b => b.status === status)
      .reduce((s, b) => {
        const tarief = profielMap.get(b.medewerker_id)?.uurtarief || 0;
        return s + b.uren * tarief;
      }, 0);
  };
  const urenPerStatus = (status: string) => boekingen.filter(b => b.status === status).reduce((s, b) => s + b.uren, 0);

  const goedgekeurdeKosten = kostenPerStatus("goedgekeurd");
  const ingediende = { uren: urenPerStatus("ingediend"), kosten: kostenPerStatus("ingediend") };
  const concept = { uren: urenPerStatus("concept"), kosten: kostenPerStatus("concept") };
  const totaleKosten = goedgekeurdeKosten; // zekere kosten
  const verwachteKosten = goedgekeurdeKosten + ingediende.kosten + concept.kosten;

  // RESULTAAT
  const resultaat = werkelijkOmzet - totaleKosten;
  const margePerc = werkelijkOmzet > 0 ? (resultaat / werkelijkOmzet) * 100 : 0;

  // Forecast resultaat (for comparison)
  let forecastKosten = 0;
  if (methode === "stuksprijzen") {
    forecastKosten = stuksRegels.reduce((s, r) => s + (Number(r.eigen_kosten) || 0) * (Number(r.aantal) || 1), 0);
  } else if (methode === "uren") {
    forecastKosten = urenRegels.reduce((s, r) => s + (Number(r.geplande_uren) || 0) * (Number(r.uurtarief_snap) || 0), 0);
  }
  const forecastResultaat = forecastOmzet - forecastKosten;
  const forecastMargePerc = forecastOmzet > 0 ? (forecastResultaat / forecastOmzet) * 100 : 0;

  // Per monteur aggregation
  const monteurMap = new Map<string, { goed: number; ingediend: number; concept: number }>();
  boekingen.forEach(b => {
    const cur = monteurMap.get(b.medewerker_id) || { goed: 0, ingediend: 0, concept: 0 };
    if (b.status === "goedgekeurd") cur.goed += b.uren;
    else if (b.status === "ingediend") cur.ingediend += b.uren;
    else if (b.status === "concept") cur.concept += b.uren;
    monteurMap.set(b.medewerker_id, cur);
  });
  const monteurs = Array.from(monteurMap.entries()).map(([id, u]) => ({
    id, ...u, prof: profielMap.get(id),
  })).sort((a, b) => (b.goed + b.ingediend + b.concept) - (a.goed + a.ingediend + a.concept));

  const totaalUrenGoed = urenPerStatus("goedgekeurd");
  const heeftOnzekereUren = ingediende.uren > 0 || concept.uren > 0;
  const heeftBoekingen = boekingen.length > 0;
  const heeftForecast = methode !== null;

  // ─── LEGE STATE ─────────────────────────────
  if (!heeftBoekingen && !heeftForecast) {
    return <EmptyState icoon="📊" titel="Nog geen financiële data" subtitel="Voeg een forecast toe en boek uren om het resultaat te berekenen." />;
  }

  return (
    <div className="space-y-5">

      {/* ━━━ SECTIE 1: FINANCIEEL RESULTAAT ━━━ */}
      <div className="rounded-[20px] p-5" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-wider mb-4" style={{ color: "#a0abc3" }}>
          Financieel resultaat
        </p>

        {/* Omzet */}
        <div className="mb-4">
          <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: "#a0abc3" }}>Omzet</p>
          <p className="text-[11px]" style={{ color: "#a0abc3" }}>(Van Gelder tarief)</p>
          <p className="text-2xl font-bold mt-1" style={{ ...mono, color: werkelijkOmzet > 0 ? "#3fff8b" : "#a0abc3" }}>
            {werkelijkOmzet > 0 ? euro(werkelijkOmzet) : "€ 0"}
          </p>
          {!heeftForecast && (
            <p className="text-[11px] mt-1" style={{ color: "#feb300" }}>
              ⚠ Voeg een forecast toe om de omzet te berekenen.
            </p>
          )}
        </div>

        {/* Personeelskosten */}
        <div className="mb-4">
          <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: "#a0abc3" }}>Personeelskosten</p>
          <p className="text-[11px]" style={{ color: "#a0abc3" }}>(monteurs × uurtarief)</p>
          <p className="text-lg font-semibold mt-1" style={{ ...mono, color: "#dae6ff" }}>
            − {euro(totaleKosten)}
          </p>
        </div>

        {/* Scheiding */}
        <div className="my-3" style={{ borderTop: "1px solid rgba(106,118,140,0.15)" }} />

        {/* Resultaat */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-bold" style={{ color: "#dae6ff" }}>Resultaat</p>
            <p className="text-[22px] font-extrabold mt-0.5" style={{ ...mono, color: margeKleur(margePerc) }}>
              = {euro(resultaat)} {resultaat >= 0 ? "✓" : "✗"}
            </p>
          </div>
          {werkelijkOmzet > 0 && (
            <span className="px-3 py-1.5 rounded-xl text-xs font-bold" style={{ background: margeBg(margePerc), color: margeKleur(margePerc) }}>
              {margePerc.toFixed(1)}%
            </span>
          )}
        </div>

        {!heeftBoekingen && heeftForecast && (
          <div className="mt-4 rounded-xl p-3 flex items-start gap-2" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)" }}>
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "#a0abc3" }} />
            <p className="text-[11px]" style={{ color: "#a0abc3" }}>Er zijn nog geen goedgekeurde uren voor dit project.</p>
          </div>
        )}
      </div>

      {/* Onzekere uren info */}
      {heeftOnzekereUren && (
        <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)" }}>
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "#a0abc3" }} />
          <p className="text-[11px]" style={{ color: "#a0abc3" }}>
            ℹ Inclusief {ingediende.uren > 0 ? `${ingediende.uren}u ingediend` : ""}
            {ingediende.uren > 0 && concept.uren > 0 ? " en " : ""}
            {concept.uren > 0 ? `${concept.uren}u concept` : ""} die nog niet zijn goedgekeurd. Werkelijke kosten kunnen nog wijzigen.
          </p>
        </div>
      )}

      {/* ━━━ SECTIE 2: UREN OVERZICHT ━━━ */}
      {monteurs.length > 0 && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>
            Uren overzicht
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(106,118,140,0.15)" }}>
                  {["Monteur", "Uren goed", "Tarief", "Kosten"].map(h => (
                    <th key={h} className="text-left pb-2 px-2 font-semibold" style={{ color: "#a0abc3", fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monteurs.map(m => {
                  const kosten = m.goed * (m.prof?.uurtarief || 0);
                  const extra = m.ingediend + m.concept;
                  return (
                    <tr key={m.id} style={{ borderBottom: "1px solid color-mix(in srgb, rgba(106,118,140,0.15) 50%, transparent)" }}>
                      <td className="py-2 px-2">
                        <span className="font-medium" style={{ color: "#dae6ff" }}>{m.prof?.full_name || "Onbekend"}</span>
                        {extra > 0 && (
                          <span className="block text-[10px] mt-0.5" style={{ color: "#a0abc3" }}>
                            +{m.ingediend > 0 ? `${m.ingediend}u ingediend` : ""}{m.ingediend > 0 && m.concept > 0 ? ", " : ""}{m.concept > 0 ? `${m.concept}u concept` : ""}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 font-semibold" style={{ ...mono, color: "#3fff8b" }}>{m.goed}u</td>
                      <td className="py-2 px-2" style={{ ...mono, color: "#a0abc3" }}>€{m.prof?.uurtarief || 0}/u</td>
                      <td className="py-2 px-2 font-semibold" style={{ ...mono, color: "#dae6ff" }}>{euro(kosten)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid rgba(63,255,139,0.3)" }}>
                  <td className="py-2 px-2 font-semibold" style={{ color: "#dae6ff" }}>Totaal</td>
                  <td className="py-2 px-2 font-bold" style={{ ...mono, color: "#dae6ff" }}>{totaalUrenGoed}u</td>
                  <td />
                  <td className="py-2 px-2 font-bold" style={{ ...mono, color: "#dae6ff" }}>{euro(goedgekeurdeKosten)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ━━━ SECTIE 3: OMZET DETAIL ━━━ */}
      {methode === "stuksprijzen" && stuksRegels.length > 0 && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>
            Omzet detail (spec-codes)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(106,118,140,0.15)" }}>
                  {["Code", "Omschrijving", "Aant", "Tarief", "Totaal"].map(h => (
                    <th key={h} className="text-left pb-2 px-2 font-semibold" style={{ color: "#a0abc3", fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stuksRegels.map(r => {
                  const a = Number(r.aantal) || 1;
                  const totaal = (Number(r.tarief) || 0) * a;
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid color-mix(in srgb, rgba(106,118,140,0.15) 50%, transparent)" }}>
                      <td className="py-2 px-2 font-semibold" style={{ ...mono, color: "#3fff8b" }}>{r.spec_code}</td>
                      <td className="py-2 px-2" style={{ color: "#dae6ff" }}>{r.spec_omschrijving}</td>
                      <td className="py-2 px-2" style={{ ...mono, color: "#a0abc3" }}>{a}×</td>
                      <td className="py-2 px-2" style={{ ...mono, color: "#a0abc3" }}>{euro(Number(r.tarief) || 0)}</td>
                      <td className="py-2 px-2 font-semibold" style={{ ...mono, color: "#dae6ff" }}>{euro(totaal)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid rgba(63,255,139,0.3)" }}>
                  <td colSpan={4} className="py-2 px-2 font-semibold" style={{ color: "#dae6ff" }}>Totale omzet Van Gelder</td>
                  <td className="py-2 px-2 font-bold" style={{ ...mono, color: "#3fff8b" }}>{euro(forecastOmzet)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {methode === "uren" && (
        <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)" }}>
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "#a0abc3" }} />
          <p className="text-[11px]" style={{ color: "#a0abc3" }}>
            Dit project wordt vergoed op basis van uren. Verwachte omzet vastgelegd in de forecast: <strong style={{ color: "#dae6ff" }}>{euro(verwachteOmzet)}</strong>
          </p>
        </div>
      )}

      {!heeftForecast && (
        <div className="rounded-xl p-4 text-center space-y-2" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)" }}>
          <p className="text-xs" style={{ color: "#a0abc3" }}>Nog geen forecast ingevuld. Voeg een forecast toe om de omzet te berekenen.</p>
          <button className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "#3fff8b" }}>
            Naar Forecast tab <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* ━━━ SECTIE 4: VERGELIJKING FORECAST VS WERKELIJK ━━━ */}
      {heeftForecast && (heeftBoekingen || forecastOmzet > 0) && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "#030e20", border: "1px solid rgba(106,118,140,0.15)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>
            Forecast vs werkelijk
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(106,118,140,0.15)" }}>
                  <th className="text-left pb-2 px-2" style={{ color: "#a0abc3", fontSize: 10, textTransform: "uppercase", fontWeight: 600 }}> </th>
                  <th className="text-right pb-2 px-2" style={{ color: "#a0abc3", fontSize: 10, textTransform: "uppercase", fontWeight: 600 }}>Forecast</th>
                  <th className="text-right pb-2 px-2" style={{ color: "#a0abc3", fontSize: 10, textTransform: "uppercase", fontWeight: 600 }}>Werkelijk</th>
                  <th className="text-right pb-2 px-2" style={{ color: "#a0abc3", fontSize: 10, textTransform: "uppercase", fontWeight: 600 }}> </th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Omzet", fc: forecastOmzet, wk: werkelijkOmzet },
                  { label: "Kosten", fc: forecastKosten, wk: totaleKosten },
                  { label: "Resultaat", fc: forecastResultaat, wk: resultaat },
                ].map(row => {
                  const beter = row.label === "Kosten" ? row.wk < row.fc : row.wk > row.fc;
                  const slechter = row.label === "Kosten" ? row.wk > row.fc : row.wk < row.fc;
                  const gelijk = row.wk === row.fc;
                  return (
                    <tr key={row.label} style={{ borderBottom: "1px solid color-mix(in srgb, rgba(106,118,140,0.15) 50%, transparent)" }}>
                      <td className="py-2.5 px-2 font-medium" style={{ color: "#dae6ff" }}>{row.label}</td>
                      <td className="py-2.5 px-2 text-right" style={{ ...mono, color: "#a0abc3" }}>{euro(row.fc)}</td>
                      <td className="py-2.5 px-2 text-right font-bold" style={{ ...mono, color: "#dae6ff" }}>{euro(row.wk)}</td>
                      <td className="py-2.5 px-2 text-right w-8">
                        {!gelijk && (
                          beter
                            ? <TrendingUp className="h-3.5 w-3.5 inline" style={{ color: "#3fff8b" }} />
                            : slechter
                              ? <TrendingDown className="h-3.5 w-3.5 inline" style={{ color: "#ff716c" }} />
                              : null
                        )}
                      </td>
                    </tr>
                  );
                })}
                {/* Marge row */}
                <tr>
                  <td className="py-2.5 px-2 font-medium" style={{ color: "#dae6ff" }}>Marge</td>
                  <td className="py-2.5 px-2 text-right" style={{ ...mono, color: "#a0abc3" }}>{forecastMargePerc.toFixed(1)}%</td>
                  <td className="py-2.5 px-2 text-right font-bold" style={{ ...mono, color: margeKleur(margePerc) }}>{margePerc.toFixed(1)}%</td>
                  <td className="py-2.5 px-2 text-right w-8">
                    {margePerc !== forecastMargePerc && (
                      margePerc > forecastMargePerc
                        ? <TrendingUp className="h-3.5 w-3.5 inline" style={{ color: "#3fff8b" }} />
                        : <TrendingDown className="h-3.5 w-3.5 inline" style={{ color: "#ff716c" }} />
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

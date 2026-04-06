import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Users, Clock, Calendar } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n);
const euroShort = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

interface Props {
  projectId: string;
}

interface MonteurUren {
  medewerker_id: string;
  totaal_uren: number;
  aantal_dagen: number;
  eerste_dag: string;
  laatste_dag: string;
}

export function NacalculatieTab({ projectId }: Props) {
  const [forecastRegels, setForecastRegels] = useState<any[]>([]);
  const [urenPerMonteur, setUrenPerMonteur] = useState<MonteurUren[]>([]);
  const [profielMap, setProfielMap] = useState<Map<string, { full_name: string; uurtarief: number }>>(new Map());
  const [planningData, setPlanningData] = useState<{ medewerker_id: string; geplande_dagen: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // 1. Forecast
    const { data: forecasts } = await supabase.from("project_forecast").select("id").eq("project_id", projectId).eq("methode", "stuksprijzen").maybeSingle();
    let regels: any[] = [];
    if (forecasts) {
      const { data } = await supabase.from("forecast_regels").select("*").eq("forecast_id", forecasts.id);
      regels = data || [];
    }
    setForecastRegels(regels);

    // 2. Werkelijke uren
    const { data: urenRaw } = await supabase.from("uren_boekingen").select("medewerker_id, uren, datum").eq("project_id", projectId).eq("status", "goedgekeurd");
    const urenMap = new Map<string, { uren: number; dagen: Set<string>; min: string; max: string }>();
    (urenRaw || []).forEach((u: any) => {
      const cur = urenMap.get(u.medewerker_id) || { uren: 0, dagen: new Set<string>(), min: u.datum, max: u.datum };
      cur.uren += Number(u.uren);
      cur.dagen.add(u.datum);
      if (u.datum < cur.min) cur.min = u.datum;
      if (u.datum > cur.max) cur.max = u.datum;
      urenMap.set(u.medewerker_id, cur);
    });
    const monteurUren = Array.from(urenMap.entries()).map(([id, v]) => ({
      medewerker_id: id,
      totaal_uren: v.uren,
      aantal_dagen: v.dagen.size,
      eerste_dag: v.min,
      laatste_dag: v.max,
    }));
    setUrenPerMonteur(monteurUren);

    // 3. Profielen
    const medIds = [...new Set(monteurUren.map(m => m.medewerker_id))];
    if (medIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, uurtarief").in("id", medIds);
      setProfielMap(new Map((profs || []).map((p: any) => [p.id, { full_name: p.full_name, uurtarief: Number(p.uurtarief) || 0 }])));
    }

    // 4. Planning
    const { data: planRaw } = await supabase.from("planning").select("medewerker_id, datum").eq("project_id", projectId);
    const planMap = new Map<string, Set<string>>();
    (planRaw || []).forEach((p: any) => {
      const s = planMap.get(p.medewerker_id) || new Set<string>();
      s.add(p.datum);
      planMap.set(p.medewerker_id, s);
    });
    setPlanningData(Array.from(planMap.entries()).map(([id, s]) => ({ medewerker_id: id, geplande_dagen: s.size })));

    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleWerkelijkAantal = async (regelId: string, val: number | null) => {
    await supabase.from("forecast_regels").update({ werkelijk_aantal: val } as any).eq("id", regelId);
    fetchData();
  };

  if (loading) return <div className="text-center py-8"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} /></div>;

  // Calculations
  const forecastOmzet = forecastRegels.filter(r => r.type === "stuksprijzen" || r.type === "spec").reduce((s, r) => s + (Number(r.tarief) || 0) * (Number(r.aantal) || 1), 0);
  const werkelijkeKosten = urenPerMonteur.reduce((s, m) => {
    const tarief = profielMap.get(m.medewerker_id)?.uurtarief || 0;
    return s + m.totaal_uren * tarief;
  }, 0);
  const werkelijkeMarge = forecastOmzet - werkelijkeKosten;
  const werkelijkeMargePerc = forecastOmzet > 0 ? (werkelijkeMarge / forecastOmzet) * 100 : 0;

  const geplande_uren_totaal = planningData.reduce((s, p) => s + p.geplande_dagen * 8, 0);
  const werkelijke_uren_totaal = urenPerMonteur.reduce((s, m) => s + m.totaal_uren, 0);
  const uren_verschil = werkelijke_uren_totaal - geplande_uren_totaal;

  const margeColor = werkelijkeMargePerc >= 30 ? "var(--success)" : werkelijkeMargePerc >= 15 ? "var(--warn-text)" : "var(--danger)";
  const margeBg = werkelijkeMargePerc >= 30 ? "var(--success-light)" : werkelijkeMargePerc >= 15 ? "var(--warn-light)" : "var(--danger-light)";

  // Werkelijk ontvangen
  const werkelijkOntvangen = forecastRegels.filter(r => r.type === "stuksprijzen" || r.type === "spec").reduce((s, r) => {
    const wa = r.werkelijk_aantal != null ? Number(r.werkelijk_aantal) : Number(r.aantal) || 1;
    return s + (Number(r.tarief) || 0) * wa;
  }, 0);

  // Tijdlijn
  const alleDatums = urenPerMonteur.flatMap(m => [m.eerste_dag, m.laatste_dag]).filter(Boolean);
  const eersteUren = alleDatums.length > 0 ? alleDatums.reduce((a, b) => a < b ? a : b) : null;
  const laatsteUren = alleDatums.length > 0 ? alleDatums.reduce((a, b) => a > b ? a : b) : null;
  const doorlooptijdDagen = eersteUren && laatsteUren ? Math.ceil((new Date(laatsteUren).getTime() - new Date(eersteUren).getTime()) / 86400000) + 1 : 0;

  // Planning map for per-monteur
  const planMap = new Map(planningData.map(p => [p.medewerker_id, p.geplande_dagen]));

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Omzet (Van Gelder)", value: euroShort(forecastOmzet), color: "var(--success)", bg: "var(--success-light)" },
          { label: "Werkelijke kosten", value: euroShort(werkelijkeKosten), color: "var(--text-secondary)", bg: "var(--bg-surface)" },
          { label: "Marge (€)", value: euroShort(werkelijkeMarge), color: margeColor, bg: margeBg },
          { label: "Marge (%)", value: `${werkelijkeMargePerc.toFixed(1)}%`, color: margeColor, bg: margeBg },
        ].map((k, i) => (
          <div key={i} className="rounded-2xl p-4 text-center" style={{ background: k.bg, border: "1px solid var(--border)" }}>
            <p className="text-xl font-extrabold" style={{ color: k.color, fontFamily: "DM Mono, monospace" }}>{k.value}</p>
            <p className="text-[10px] font-medium mt-1" style={{ color: "var(--text-muted)" }}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* Uren vs planning */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
          <Clock className="h-3.5 w-3.5" /> Uren vs planning
        </p>
        {geplande_uren_totaal > 0 && (
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span style={{ color: "var(--text-muted)" }}>Gepland</span>
                <span style={{ fontFamily: "DM Mono, monospace", color: "var(--text-primary)" }}>{geplande_uren_totaal}u</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: "var(--bg-surface-2)" }}>
                <div className="h-full rounded-full" style={{ width: "100%", background: "var(--accent)" }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span style={{ color: "var(--text-muted)" }}>Werkelijk</span>
                <span style={{ fontFamily: "DM Mono, monospace", color: "var(--text-primary)" }}>{werkelijke_uren_totaal}u</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: "var(--bg-surface-2)" }}>
                <div className="h-full rounded-full" style={{
                  width: `${Math.min((werkelijke_uren_totaal / geplande_uren_totaal) * 100, 100)}%`,
                  background: uren_verschil > 0 ? "var(--danger)" : "var(--success)",
                }} />
              </div>
            </div>
          </div>
        )}
        {uren_verschil > 0 ? (
          <div className="flex items-center gap-2 rounded-xl p-2.5" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
            <TrendingUp className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--warn-text)" }} />
            <span className="text-[11px] font-medium" style={{ color: "var(--warn-text)" }}>⚠ {uren_verschil}u meer dan gepland</span>
          </div>
        ) : uren_verschil < 0 ? (
          <div className="flex items-center gap-2 rounded-xl p-2.5" style={{ background: "var(--success-light)", border: "1px solid var(--success-border)" }}>
            <TrendingDown className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--success)" }} />
            <span className="text-[11px] font-medium" style={{ color: "var(--success)" }}>✓ {Math.abs(uren_verschil)}u minder dan gepland</span>
          </div>
        ) : null}
      </div>

      {/* Per monteur */}
      {urenPerMonteur.length > 0 && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
            <Users className="h-3.5 w-3.5" /> Per monteur
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Monteur", "Gepland", "Werkelijk", "Tarief", "Kosten", "Verschil"].map(h => (
                    <th key={h} className="text-left pb-2 px-2 font-semibold" style={{ color: "var(--text-muted)", fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {urenPerMonteur.map(m => {
                  const prof = profielMap.get(m.medewerker_id);
                  const gepland = (planMap.get(m.medewerker_id) || 0) * 8;
                  const verschil = m.totaal_uren - gepland;
                  const kosten = m.totaal_uren * (prof?.uurtarief || 0);
                  return (
                    <tr key={m.medewerker_id} style={{ borderBottom: "1px solid var(--bg-surface-2)" }}>
                      <td className="py-2 px-2 font-medium" style={{ color: "var(--text-primary)" }}>{prof?.full_name || "Onbekend"}</td>
                      <td className="py-2 px-2" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-secondary)" }}>{gepland}u</td>
                      <td className="py-2 px-2" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-primary)" }}>{m.totaal_uren}u</td>
                      <td className="py-2 px-2" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-muted)" }}>€{prof?.uurtarief || 0}/u</td>
                      <td className="py-2 px-2 font-semibold" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-primary)" }}>{euroShort(kosten)}</td>
                      <td className="py-2 px-2 font-bold" style={{ fontFamily: "DM Mono, monospace", color: verschil > 0 ? "var(--danger)" : verschil < 0 ? "var(--success)" : "var(--text-muted)" }}>
                        {verschil > 0 ? "+" : ""}{verschil}u
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Forecast vs werkelijk */}
      {forecastRegels.length > 0 && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Forecast vs werkelijk</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Code", "Omschrijving", "Forecast", "Werkelijk", "Verschil"].map(h => (
                    <th key={h} className="text-left pb-2 px-2 font-semibold" style={{ color: "var(--text-muted)", fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {forecastRegels.filter(r => r.type === "stuksprijzen" || r.type === "spec").map(r => {
                  const forecast = (Number(r.tarief) || 0) * (Number(r.aantal) || 1);
                  const wa = r.werkelijk_aantal != null ? Number(r.werkelijk_aantal) : null;
                  const werkelijk = wa != null ? (Number(r.tarief) || 0) * wa : null;
                  const verschil = werkelijk != null ? werkelijk - forecast : null;
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--bg-surface-2)" }}>
                      <td className="py-2 px-2 font-mono font-semibold" style={{ color: "var(--accent)" }}>{r.spec_code}</td>
                      <td className="py-2 px-2" style={{ color: "var(--text-primary)" }}>{r.spec_omschrijving}</td>
                      <td className="py-2 px-2" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-secondary)" }}>{Number(r.aantal) || 1}×</td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          defaultValue={wa ?? ""}
                          placeholder={String(Number(r.aantal) || 1)}
                          onBlur={e => handleWerkelijkAantal(r.id, e.target.value ? Number(e.target.value) : null)}
                          className="w-16 px-2 py-1 rounded-lg text-xs text-center"
                          style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }}
                        />
                      </td>
                      <td className="py-2 px-2 font-bold" style={{ fontFamily: "DM Mono, monospace", color: verschil != null ? (verschil >= 0 ? "var(--success)" : "var(--danger)") : "var(--text-muted)" }}>
                        {verschil != null ? euroShort(verschil) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--accent-border)" }}>
                  <td colSpan={2} className="py-3 px-2 font-semibold text-xs" style={{ color: "var(--text-primary)" }}>Totaal</td>
                  <td className="py-3 px-2 font-bold" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-primary)" }}>{euroShort(forecastOmzet)}</td>
                  <td className="py-3 px-2 font-bold" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-primary)" }}>{euroShort(werkelijkOntvangen)}</td>
                  <td className="py-3 px-2 font-bold" style={{ fontFamily: "DM Mono, monospace", color: werkelijkOntvangen - forecastOmzet >= 0 ? "var(--success)" : "var(--danger)" }}>
                    {euroShort(werkelijkOntvangen - forecastOmzet)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Tijdlijn */}
      {eersteUren && laatsteUren && (
        <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
            <Calendar className="h-3.5 w-3.5" /> Tijdlijn
          </p>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{format(new Date(eersteUren), "d MMM yyyy", { locale: nl })}</span>
            <div className="flex-1 h-1 rounded-full" style={{ background: "var(--accent-light)" }}>
              <div className="h-full rounded-full" style={{ width: "100%", background: "var(--accent)" }} />
            </div>
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{format(new Date(laatsteUren), "d MMM yyyy", { locale: nl })}</span>
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Doorlooptijd: {doorlooptijdDagen} dagen ({Math.ceil(doorlooptijdDagen / 7)} weken)</p>
        </div>
      )}

      {/* Empty state */}
      {urenPerMonteur.length === 0 && forecastRegels.length === 0 && (
        <div className="text-center py-8 rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Nog geen goedgekeurde uren of forecast data</p>
        </div>
      )}
    </div>
  );
}

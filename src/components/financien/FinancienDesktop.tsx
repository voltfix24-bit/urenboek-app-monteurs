import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addMonths, addQuarters, addWeeks, endOfMonth, endOfQuarter, endOfWeek,
  format, getISOWeek, startOfMonth, startOfQuarter, startOfWeek, subMonths,
  subQuarters, subWeeks,
} from "date-fns";
import { nl } from "date-fns/locale";
import {
  AlertTriangle, ChevronLeft, ChevronRight, Download, FileText, Landmark,
  PiggyBank, TrendingUp, Wallet,
} from "lucide-react";
import { useFinancienData } from "@/hooks/useFinancienData";
import { euroDecimals as fmt, formatUrenGetal } from "@/lib/formatting";
import { exporteerFinancienCsv, exporteerFinancienPdf } from "@/lib/financienExport";
import { Spinner } from "@/components/ui/Spinner";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Modus = "week" | "maand" | "kwartaal";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

function berekenPeriode(modus: Modus, anker: Date) {
  if (modus === "maand") {
    return {
      van: iso(startOfMonth(anker)),
      tot: iso(endOfMonth(anker)),
      label: format(anker, "MMMM yyyy", { locale: nl }),
    };
  }
  if (modus === "kwartaal") {
    return {
      van: iso(startOfQuarter(anker)),
      tot: iso(endOfQuarter(anker)),
      label: `Kwartaal ${Math.floor(anker.getMonth() / 3) + 1} ${anker.getFullYear()}`,
    };
  }
  const ws = startOfWeek(anker, { weekStartsOn: 1 });
  return {
    van: iso(ws),
    tot: iso(endOfWeek(anker, { weekStartsOn: 1 })),
    label: `Week ${getISOWeek(ws)} · ${format(ws, "d MMM yyyy", { locale: nl })}`,
  };
}

export function FinancienDesktop() {
  const navigate = useNavigate();
  const [modus, setModus] = useState<Modus>("week");
  const [anker, setAnker] = useState<Date>(() => new Date());
  const [vasteKosten, setVasteKosten] = useState<string | null>(null);

  const periode = useMemo(() => berekenPeriode(modus, anker), [modus, anker]);
  const { uitkomst, serie, loading, fout, vasteKostenPerWeek, herladen } =
    useFinancienData(periode.van, periode.tot);

  const stap = (richting: 1 | -1) => {
    const next = richting === 1
      ? (modus === "week" ? addWeeks(anker, 1) : modus === "maand" ? addMonths(anker, 1) : addQuarters(anker, 1))
      : (modus === "week" ? subWeeks(anker, 1) : modus === "maand" ? subMonths(anker, 1) : subQuarters(anker, 1));
    setAnker(next);
  };

  async function slaVasteKostenOp() {
    if (vasteKosten === null) return;
    const waarde = parseFloat(vasteKosten.replace(",", "."));
    if (isNaN(waarde) || waarde < 0) { toast.error("Ongeldig bedrag"); return; }
    const { data } = await supabase.from("bedrijfsgegevens").select("id").limit(1);
    const id = data?.[0]?.id;
    if (!id) { toast.error("Bedrijfsgegevens niet gevonden"); return; }
    const { error } = await supabase.from("bedrijfsgegevens")
      .update({ vaste_kosten_per_week: waarde }).eq("id", id);
    if (error) { toast.error("Opslaan mislukt"); return; }
    toast.success(`Vaste kosten op €${waarde.toFixed(2)} per week gezet`);
    setVasteKosten(null);
    herladen();
  }

  if (loading) return <div className="fn-body"><Spinner padding="py-10" /></div>;
  if (fout) return <div className="fn-body"><div className="fn-waarschuwing"><AlertTriangle className="h-4 w-4" />{fout}</div></div>;
  if (!uitkomst) return null;

  const u = uitkomst;
  const margeKleur = u.omzet === 0 ? "var(--text-muted)"
    : u.marge_pct > 30 ? "var(--accent-dark)" : u.marge_pct >= 15 ? "var(--warn-text)" : "var(--danger)";
  const maxSerie = Math.max(1, ...serie.map((s) => Math.max(s.omzet, s.kosten)));

  return (
    <div className="fn-root">
      <header className="fn-header">
        <div>
          <h1 className="fn-title">Financiën</h1>
          <p className="fn-subtitle">Omzet, kosten en marge per week. Tarieven komen uit de database.</p>
        </div>
        <div className="fn-knoppen">
          <button className="mw-btn mw-btn--sm" onClick={() => exporteerFinancienCsv(u, periode.label)}>
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button className="mw-btn mw-btn--sm" onClick={() => exporteerFinancienPdf(u, periode.label)}>
            <FileText className="h-3.5 w-3.5" /> PDF
          </button>
        </div>
      </header>

      <div className="fn-body">
        {/* Weekkiezer + modus */}
        <div className="fn-balk">
          <div className="fn-nav">
            <button className="fn-pijl" onClick={() => stap(-1)} aria-label="Vorige"><ChevronLeft className="h-4 w-4" /></button>
            <span className="fn-periode">{periode.label}</span>
            <button className="fn-pijl" onClick={() => stap(1)} aria-label="Volgende"><ChevronRight className="h-4 w-4" /></button>
            <button className="mw-btn mw-btn--sm" onClick={() => setAnker(new Date())}>
              {modus === "week" ? "Deze week" : modus === "maand" ? "Deze maand" : "Dit kwartaal"}
            </button>
          </div>
          <div className="fn-mode" role="group" aria-label="Periodekeuze">
            {(["week", "maand", "kwartaal"] as Modus[]).map((m) => (
              <button key={m} aria-pressed={modus === m} onClick={() => setModus(m)}>
                {m === "week" ? "Week" : m === "maand" ? "Maand" : "Kwartaal"}
              </button>
            ))}
          </div>
        </div>

        {/* Vier kerncijfers */}
        <div className="fn-kerncijfers">
          <div className="fn-kern">
            <span className="fn-kern-label"><Wallet className="h-3.5 w-3.5" /> Omzet</span>
            <span className="fn-kern-waarde">{fmt(u.omzet)}</span>
            <span className="fn-kern-sub">cases {fmt(u.omzet_cases)} · uitleen {fmt(u.omzet_uitleen)}</span>
          </div>
          <div className="fn-kern">
            <span className="fn-kern-label"><TrendingUp className="h-3.5 w-3.5" /> Kosten</span>
            <span className="fn-kern-waarde">{fmt(u.kosten)}</span>
            <span className="fn-kern-sub">uren {fmt(u.kosten_uren)}{u.reiskosten > 0 ? ` · reis {fmt(u.reiskosten)}` : ""}</span>
          </div>
          <div className="fn-kern">
            <span className="fn-kern-label"><Landmark className="h-3.5 w-3.5" /> Naar G-rekening</span>
            <span className="fn-kern-waarde">{fmt(u.g_rekening)}</span>
            <span className="fn-kern-sub">davon uitleen {fmt(u.g_rekening_uitleen)}</span>
          </div>
          <div className="fn-kern">
            <span className="fn-kern-label"><PiggyBank className="h-3.5 w-3.5" /> Marge</span>
            <span className="fn-kern-waarde" style={{ color: margeKleur }}>{fmt(u.marge)}</span>
            <span className="fn-kern-sub">{u.omzet > 0 ? `${u.marge_pct.toFixed(1)}% van de omzet` : "geen omzet"}</span>
          </div>
        </div>

        {/* Waarschuwingen */}
        {u.waarschuwingen.length > 0 && (
          <div className="fn-fouten">
            {u.waarschuwingen.map((w, i) => (
              <div key={i} className="fn-waarschuwing">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{w.boodschap}</span>
                {w.type === "geen_verkooptarief" && (
                  <button className="fn-link" onClick={() => navigate("/beheer/tarieven")}>Tarief instellen</button>
                )}
                {w.type === "geen_kostentarief" && w.medewerker_id && (
                  <button className="fn-link" onClick={() => navigate("/medewerkers")}>Kostentarief instellen</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tabel per opdrachtgever / project */}
        <section className="mw-card">
          <div className="mw-card-title">Per opdrachtgever / project</div>
          <table className="mw-table">
            <thead>
              <tr>
                <th>Project</th><th className="fn-r">Uren</th><th className="fn-r">Omzet</th>
                <th className="fn-r">G-rekening</th><th className="fn-r">Kosten</th>
                <th className="fn-r">Marge</th><th className="fn-r">Marge %</th>
              </tr>
            </thead>
            <tbody>
              {u.regels.map((r) => (
                <tr key={r.project_id}>
                  <td>
                    <div className="fn-cel">
                      <span className="fn-cel-naam">{r.project_naam}</span>
                      <span className="fn-cel-sub">
                        {r.project_nummer} · {r.soort === "uitleen" ? "Uitleen" : "Klus"}
                        {r.opdrachtgever_naam !== "—" ? ` · ${r.opdrachtgever_naam}` : ""}
                        {r.verwachte_uren > 0 ? ` · ${formatUrenGetal(r.verwachte_uren)}u verwacht` : ""}
                      </span>
                    </div>
                  </td>
                  <td className="fn-r">{formatUrenGetal(r.uren)}</td>
                  <td className="fn-r">{r.tarief_onbekend ? <span className="fn-onbekend">€ ?</span> : fmt(r.omzet)}</td>
                  <td className="fn-r">{fmt(r.g_rekening)}</td>
                  <td className="fn-r">{r.kosten_onbekend && r.kosten === 0 ? <span className="fn-onbekend">€ ?</span> : fmt(r.kosten)}</td>
                  <td className="fn-r">{fmt(r.marge)}</td>
                  <td className="fn-r">{r.omzet > 0 ? `${((r.marge / r.omzet) * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
              {u.regels.length === 0 && (
                <tr><td colSpan={7} className="fn-leeg">Geen uren in deze periode.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Tabel per professional */}
        <section className="mw-card">
          <div className="mw-card-title">Per professional</div>
          <table className="mw-table">
            <thead>
              <tr>
                <th>Naam</th><th className="fn-r">Uren</th><th className="fn-r">Kostentarief</th>
                <th className="fn-r">Kosten</th><th className="fn-r">Gegenereerde omzet</th><th className="fn-r">Bijdrage</th>
              </tr>
            </thead>
            <tbody>
              {u.personen.map((p) => (
                <tr key={p.medewerker_id}>
                  <td>{p.naam}</td>
                  <td className="fn-r">{formatUrenGetal(p.uren)}</td>
                  <td className="fn-r">{p.kostentarief === null ? <span className="fn-onbekend">€ ?</span> : fmt(p.kostentarief)}</td>
                  <td className="fn-r">{fmt(p.kosten)}</td>
                  <td className="fn-r">{fmt(p.omzet)}</td>
                  <td className="fn-r">{fmt(p.bijdrage)}</td>
                </tr>
              ))}
              {u.personen.length === 0 && <tr><td colSpan={6} className="fn-leeg">Geen professionals met uren in deze periode.</td></tr>}
            </tbody>
          </table>

          {u.eigenaren.length > 0 && (
            <>
              <div className="mw-card-sub fn-eigen-kop">Eigenaren</div>
              <table className="mw-table">
                <tbody>
                  {u.eigenaren.map((p) => (
                    <tr key={p.medewerker_id}>
                      <td>{p.naam}</td>
                      <td className="fn-r">{formatUrenGetal(p.uren)}</td>
                      <td className="fn-r">€ 0,00</td>
                      <td className="fn-r">€ 0,00</td>
                      <td className="fn-r">{fmt(p.omzet)}</td>
                      <td className="fn-r">{fmt(p.bijdrage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        {/* Ruimte voor eigen uitbetaling */}
        <section className="mw-card">
          <div className="mw-card-title">Ruimte voor eigen uitbetaling</div>
          <p className="mw-card-sub">Marge minus het G-rekening-deel en de vaste kosten. Een rekenhulp; er wordt niets geboekt.</p>
          <div className="fn-ruimte">
            <div className="fn-ruimte-rij">
              <span>Marge</span><b>{fmt(u.marge)}</b>
            </div>
            <div className="fn-ruimte-rij">
              <span>− Naar G-rekening</span><b>{fmt(-u.g_rekening)}</b>
            </div>
            <div className="fn-ruimte-rij">
              <span>− Vaste kosten</span><b>{fmt(-u.vaste_kosten)}</b>
            </div>
            <div className="fn-ruimte-totaal">
              <span>Ruimte voor eigen uitbetaling</span><b>{fmt(u.uitbetaling.ruimte)}</b>
            </div>
          </div>
          <div className="fn-vaste-kosten">
            <span>Vaste kosten per week</span>
            {vasteKosten === null ? (
              <button className="mw-btn mw-btn--sm" onClick={() => setVasteKosten(String(vasteKostenPerWeek))}>
                {fmt(vasteKostenPerWeek)} wijzigen
              </button>
            ) : (
              <span className="fn-inline">
                <input
                  className="fn-input"
                  value={vasteKosten}
                  onChange={(e) => setVasteKosten(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && slaVasteKostenOp()}
                  aria-label="Vaste kosten per week"
                />
                <button className="mw-btn mw-btn--sm mw-btn--primary" onClick={slaVasteKostenOp}>Opslaan</button>
                <button className="mw-btn mw-btn--sm" onClick={() => setVasteKosten(null)}>Annuleren</button>
              </span>
            )}
          </div>
          {u.uitbetaling.fictief_tarief != null && u.uitbetaling.eigen_uren > 0 && (
            <p className="mw-card-sub">
              Bij een fictief tarief van {fmt(u.uitbetaling.fictief_tarief)}/u voor eigenaren zou dat{" "}
              {fmt(u.uitbetaling.fictief_kosten)} kosten ({formatUrenGetal(u.uitbetaling.eigen_uren)}u).
            </p>
          )}
        </section>

        {/* Grafiek laatste 12 weken */}
        <section className="mw-card">
          <div className="mw-card-title">Laatste {serie.length} weken</div>
          <div className="fn-legenda">
            <span><i style={{ background: "var(--accent)" }} /> Omzet</span>
            <span><i style={{ background: "var(--info)" }} /> Kosten</span>
            <span><i style={{ background: "var(--warn-dot)" }} /> Marge</span>
          </div>
          <div className="fn-grafiek">
            {serie.map((s) => (
              <div key={s.week} className="fn-grafiek-week" title={`Week ${getISOWeek(new Date(s.week))}: omzet ${fmt(s.omzet)}, kosten ${fmt(s.kosten)}, marge ${fmt(s.marge)}`}>
                <div className="fn-staafjes">
                  <span style={{ height: `${(s.omzet / maxSerie) * 100}%`, background: "var(--accent)" }} />
                  <span style={{ height: `${(s.kosten / maxSerie) * 100}%`, background: "var(--info)" }} />
                  <span style={{ height: `${(Math.max(0, s.marge) / maxSerie) * 100}%`, background: "var(--warn-dot)" }} />
                </div>
                <span className="fn-grafiek-label">{getISOWeek(new Date(s.week))}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

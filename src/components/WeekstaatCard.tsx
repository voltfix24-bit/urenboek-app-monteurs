import { useState } from "react";
import { AlertTriangle, Check, X, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

export interface WeekstaatDag {
  id: string;
  datum: string;
  projectNaam: string;
  projectNummer: string;
  taak: string;
  uren: number;
  afwijking: number;
  toelichting?: string | null;
}

interface Props {
  naam: string;
  status: string;
  dagen: WeekstaatDag[];
  contractUren?: number;
  goedgekeurdLabel?: string | null;
  busy?: boolean;
  onApprove: () => void;
  onReject: (reden: string) => void;
}

/** "8u", "12u", "7,5u" — nooit "8.0u". */
export function fmtUren(n: number) {
  const v = Math.round(n * 100) / 100;
  return `${String(v).replace(".", ",")}u`;
}

/** "HOLTHUIZERWEG 7 BRUMMEN" -> "Holthuizerweg 7 Brummen" */
export function nettNaam(naam: string) {
  if (!naam) return "";
  return naam.toLocaleLowerCase("nl-NL").replace(/(^|[\s,.-])\p{L}/gu, t => t.toLocaleUpperCase("nl-NL"));
}

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1";

export function WeekstaatCard({
  naam, status, dagen, contractUren = 40, goedgekeurdLabel, busy = false, onApprove, onReject,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reden, setReden] = useState("");

  const initialen = naam.split(" ").filter(Boolean).map(d => d[0]).slice(0, 2).join("").toUpperCase() || "?";
  const totaalUren = dagen.reduce((s, d) => s + d.uren, 0);
  const afwijkingen = dagen.filter(d => d.afwijking > 0).length;
  const pct = contractUren > 0 ? Math.min(100, Math.round((totaalUren / contractUren) * 100)) : 0;

  const eersteDag = dagen[0];
  const identiek = dagen.length > 1 && eersteDag && dagen.every(d =>
    d.projectNaam === eersteDag.projectNaam && d.taak === eersteDag.taak && d.uren === eersteDag.uren && d.afwijking === 0);

  const badge = (() => {
    if (afwijkingen > 0 && status !== "goedgekeurd") return {
      label: `${afwijkingen} afwijking${afwijkingen === 1 ? "" : "en"}`,
      bg: "var(--warn-light)", fg: "var(--warn-text)", icon: true,
    };
    if (status === "goedgekeurd") return { label: "Goedgekeurd", bg: "var(--accent-light)", fg: "var(--accent-dark)", icon: false };
    if (status === "afgekeurd") return { label: "Afgekeurd", bg: "var(--danger-light)", fg: "var(--danger)", icon: false };
    if (status === "ingediend") return { label: "Ingediend", bg: "var(--bg-surface-2)", fg: "var(--text-secondary)", icon: false };
    return { label: "Concept", bg: "var(--bg-surface-2)", fg: "var(--text-muted)", icon: false };
  })();

  const balkKleur = afwijkingen > 0 && status !== "goedgekeurd" ? "var(--warn-dot)" : "var(--accent)";

  const renderDag = (d: WeekstaatDag) => (
    <div key={d.id} className="py-2" style={{ borderBottom: "1px solid var(--approval-divider)" }}>
      <div className="hidden sm:grid items-baseline gap-2" style={{ gridTemplateColumns: "62px minmax(0,1fr) 52px 44px" }}>
        <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>{format(new Date(d.datum + "T12:00:00"), "EEE d/M", { locale: nl })}</span>
        <span className="text-[13px] truncate" style={{ color: "var(--text-primary)" }}>
          {nettNaam(d.projectNaam)}{d.taak ? ` · ${d.taak}` : ""}
          {d.projectNummer && <span className="ml-1 text-[12px]" style={{ color: "var(--text-muted)" }}>{d.projectNummer}</span>}
        </span>
        <span className="text-[12px] text-right" style={{ color: d.afwijking > 0 ? "var(--warn-text)" : "transparent" }}>
          {d.afwijking > 0 ? `+${fmtUren(d.afwijking)}` : "—"}
        </span>
        <span className="text-[13px] text-right tabular-nums" style={{ color: d.afwijking > 0 ? "var(--warn-text)" : "var(--text-primary)" }}>{fmtUren(d.uren)}</span>
      </div>
      {/* mobiel: twee regels */}
      <div className="sm:hidden">
        <div className="text-[13px]" style={{ color: "var(--text-primary)" }}>
          <span style={{ color: "var(--text-muted)" }}>{format(new Date(d.datum + "T12:00:00"), "EEE d/M", { locale: nl })}</span>{" · "}
          {nettNaam(d.projectNaam)}{d.taak ? ` · ${d.taak}` : ""}
        </div>
        <div className="flex justify-end gap-2 text-[13px] tabular-nums">
          {d.afwijking > 0 && <span className="text-[12px]" style={{ color: "var(--warn-text)" }}>+{fmtUren(d.afwijking)}</span>}
          <span style={{ color: d.afwijking > 0 ? "var(--warn-text)" : "var(--text-primary)" }}>{fmtUren(d.uren)}</span>
        </div>
      </div>
      {d.toelichting && (
        <p className="text-[12px] mt-0.5 sm:ml-[70px]" style={{ color: "var(--text-muted)" }}>{d.toelichting}</p>
      )}
    </div>
  );

  return (
    <article className="w-full mx-auto overflow-hidden" style={{
      maxWidth: 700, background: "var(--bg-surface)", borderRadius: 12,
      border: "0.5px solid var(--approval-border)",
    }}>
      <div style={{ padding: "1rem 1.25rem" }}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center shrink-0" style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "var(--approval-avatar)", color: "var(--approval-avatar-text)", fontSize: 13, fontWeight: 500,
            }}>{initialen}</div>
            <div className="min-w-0">
              <p className="truncate" style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)" }}>{naam}</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {fmtUren(totaalUren).replace("u", " uur")} · {dagen.length} {dagen.length === 1 ? "dag" : "dagen"}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 shrink-0" style={{
            fontSize: 12, padding: "3px 10px", borderRadius: 999, background: badge.bg, color: badge.fg,
          }}>
            {badge.icon && <AlertTriangle size={16} aria-hidden />}
            {badge.label}
          </span>
        </div>

        {/* Dagregels */}
        <div style={{ marginTop: 16 }}>
          {identiek && !detailsOpen ? (
            <div className="flex items-center justify-between gap-2 py-2" style={{ borderBottom: "1px solid var(--approval-divider)" }}>
              <span className="text-[13px] truncate" style={{ color: "var(--text-primary)" }}>
                {format(new Date(dagen[0].datum + "T12:00:00"), "EEEEEE", { locale: nl })} – {format(new Date(dagen[dagen.length - 1].datum + "T12:00:00"), "EEEEEE", { locale: nl })}
                {" · "}{nettNaam(eersteDag.projectNaam)}{eersteDag.taak ? ` · ${eersteDag.taak}` : ""}
                {" · "}{fmtUren(eersteDag.uren)} per dag
              </span>
              <span className="text-[13px] tabular-nums shrink-0" style={{ color: "var(--text-primary)" }}>{fmtUren(totaalUren)}</span>
            </div>
          ) : dagen.map(renderDag)}
        </div>

        {/* Voortgang */}
        <div style={{ marginTop: 16 }}>
          <div className="flex items-center justify-between" style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
            <span>{fmtUren(totaalUren).replace("u", "")} van {contractUren} uur</span>
            <span>{pct}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: "var(--approval-metric)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: balkKleur, borderRadius: 2 }} />
          </div>
        </div>
      </div>

      {/* Actiebalk */}
      {status === "ingediend" ? (
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2"
          style={{ background: "var(--approval-footer)", borderTop: "1px solid var(--approval-divider)", padding: "10px 1.25rem" }}>
          <button type="button" onClick={() => setDetailsOpen(o => !o)}
            className={`text-[13px] rounded-md px-1 py-1 hover:underline ${focusRing}`}
            style={{ color: "var(--text-muted)", background: "none", border: "none" }}>
            {detailsOpen ? "Verberg details" : "Details"}
          </button>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <button type="button" disabled={busy} onClick={() => { setReden(""); setRejectOpen(true); }}
              className={`w-full sm:w-[120px] rounded-lg text-[13px] transition-colors disabled:opacity-50 hover:bg-[var(--danger-light)] ${focusRing}`}
              style={{ height: 32, color: "var(--danger)", background: "transparent", border: "1px solid var(--danger-border)" }}>
              Afwijzen
            </button>
            <button type="button" disabled={busy} onClick={onApprove}
              className={`w-full sm:w-[120px] rounded-lg text-[13px] inline-flex items-center justify-center gap-1.5 transition-opacity disabled:opacity-50 hover:opacity-90 ${focusRing}`}
              style={{ height: 32, color: "#fff", background: "var(--accent)", border: "none", fontWeight: 500 }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Goedkeuren
            </button>
          </div>
        </div>
      ) : goedgekeurdLabel ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--approval-footer)", borderTop: "1px solid var(--approval-divider)", padding: "10px 1.25rem" }}>
          {goedgekeurdLabel}
        </p>
      ) : null}

      {/* Afwijs-dialoog */}
      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Weekstaat afwijzen">
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--text-primary) 40%, transparent)" }} onClick={() => setRejectOpen(false)} />
          <div className="relative w-full max-w-[420px] p-5 space-y-3" style={{ background: "var(--bg-surface)", borderRadius: 12, border: "0.5px solid var(--approval-border)" }}>
            <p style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)" }}>Weekstaat afwijzen</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Geef een reden op voor {naam}.</p>
            <textarea value={reden} onChange={e => setReden(e.target.value)} rows={3} autoFocus
              placeholder="Reden (verplicht)"
              className={`w-full text-[13px] p-3 rounded-lg resize-none ${focusRing}`}
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRejectOpen(false)}
                className={`rounded-lg px-3 text-[13px] ${focusRing}`}
                style={{ height: 32, color: "var(--text-muted)", background: "transparent", border: "1px solid var(--border)" }}>
                Annuleren
              </button>
              <button type="button" disabled={!reden.trim() || busy}
                onClick={() => { onReject(reden.trim()); setRejectOpen(false); }}
                className={`rounded-lg px-3 text-[13px] inline-flex items-center gap-1.5 disabled:opacity-50 ${focusRing}`}
                style={{ height: 32, color: "#fff", background: "var(--danger)", border: "none" }}>
                <X size={14} /> Afwijzen
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

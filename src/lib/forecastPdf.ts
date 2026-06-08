// Generates a clean "prijzenblad" PDF (print) for sharing with the opdrachtgever.
// Only shows what the opdrachtgever should see: codes/descriptions, aantal, tarief, regelbedrag and totaal.
// Excludes internal data like eigen kosten and marges.

import { supabase } from "@/integrations/supabase/client";

interface PrijzenbladRegel {
  spec_code?: string | null;
  spec_omschrijving?: string | null;
  type: string;
  aantal?: number | null;
  tarief?: number | null;
  geplande_uren?: number | null;
  uurtarief_snap?: number | null;
  medewerker_naam?: string | null;
}

const fmtEuro = (n: number) =>
  new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

const fmtAantal = (n: number) =>
  new Intl.NumberFormat("nl-NL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);

const fmtDate = (d = new Date()) =>
  d.toLocaleDateString("nl-NL", { day: "2-digit", month: "long", year: "numeric" });

export async function generateForecastPdf(projectId: string) {
  // Load project + forecast + regels + opdrachtgever
  const { data: project } = await supabase
    .from("projects")
    .select("id, nummer, naam, stationsnaam, adres, straat, postcode, stad, opdrachtgever_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    alert("Project niet gevonden");
    return;
  }

  const { data: forecast } = await supabase
    .from("project_forecast")
    .select("id, methode, verwachte_omzet")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!forecast) {
    alert("Er is nog geen forecast voor dit project. Maak eerst een forecast aan.");
    return;
  }

  const { data: regelsRaw } = await supabase
    .from("forecast_regels")
    .select("*")
    .eq("forecast_id", forecast.id);

  const regels = (regelsRaw || []) as PrijzenbladRegel[];

  if (regels.length === 0) {
    alert("Er zijn nog geen forecastregels om te exporteren.");
    return;
  }

  // Resolve opdrachtgever
  let opdrachtgeverNaam: string | null = null;
  if (project.opdrachtgever_id) {
    const { data: og } = await supabase
      .from("opdrachtgevers")
      .select("naam")
      .eq("id", project.opdrachtgever_id)
      .maybeSingle();
    opdrachtgeverNaam = (og as any)?.naam || null;
  }

  // Resolve medewerker namen voor uren-methode
  if (forecast.methode === "uren") {
    const ids = regels.map((r) => (r as any).medewerker_id).filter(Boolean) as string[];
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const map = new Map((profs || []).map((p: any) => [p.id, p.full_name]));
      regels.forEach((r) => {
        r.medewerker_naam = map.get((r as any).medewerker_id) || "Medewerker";
      });
    }
  }

  // Compute totals (only the customer-facing kant: omzet/tarief × aantal)
  let rows: { col1: string; col2: string; aantal: number; eenheid: string; tarief: number; bedrag: number }[] = [];

  if (forecast.methode === "stuksprijzen") {
    rows = regels.map((r) => {
      const aantal = Number(r.aantal ?? 1);
      const tarief = Number(r.tarief ?? 0);
      return {
        col1: r.spec_code || "—",
        col2: r.spec_omschrijving || "—",
        aantal,
        eenheid: "st",
        tarief,
        bedrag: aantal * tarief,
      };
    });
  } else {
    rows = regels.map((r) => {
      const aantal = Number(r.geplande_uren ?? 0);
      const tarief = Number(r.uurtarief_snap ?? 0);
      return {
        col1: "—",
        col2: r.medewerker_naam || "Medewerker",
        aantal,
        eenheid: "uur",
        tarief,
        bedrag: aantal * tarief,
      };
    });
  }

  const subtotaal = rows.reduce((s, r) => s + r.bedrag, 0);
  const btw = subtotaal * 0.21;
  const totaal = subtotaal + btw;

  const adresregel = [project.straat, [project.postcode, project.stad].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  const showCodeCol = forecast.methode === "stuksprijzen";

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<title>Prijzenblad ${project.nummer} — ${project.naam}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  html, body { padding: 0; margin: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #1a2332;
    font-size: 11pt;
    line-height: 1.45;
    background: #fff;
  }
  .wrap { max-width: 100%; }

  header.doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 16px;
    border-bottom: 2px solid #0a1a30;
    margin-bottom: 24px;
  }
  .brand .logo {
    font-size: 22pt;
    font-weight: 800;
    letter-spacing: -0.5px;
    color: #0a1a30;
    margin: 0;
  }
  .brand .tagline {
    font-size: 9pt;
    color: #6a768c;
    margin-top: 2px;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .doc-meta {
    text-align: right;
    font-size: 9.5pt;
  }
  .doc-meta h1 {
    font-size: 16pt;
    margin: 0 0 6px 0;
    color: #0a1a30;
    letter-spacing: -0.3px;
  }
  .doc-meta .meta-line { color: #6a768c; }
  .doc-meta .meta-line strong { color: #1a2332; }

  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-bottom: 28px;
  }
  .info-block .label {
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: #6a768c;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .info-block .value {
    font-size: 11pt;
    color: #1a2332;
    line-height: 1.5;
  }
  .info-block .value strong { display: block; font-size: 12pt; margin-bottom: 2px; }

  .section-title {
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 1.4px;
    color: #6a768c;
    font-weight: 700;
    margin: 0 0 10px 0;
  }

  table.lines {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0;
  }
  table.lines thead th {
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #6a768c;
    font-weight: 700;
    text-align: left;
    padding: 10px 8px;
    border-bottom: 1.5px solid #0a1a30;
    background: #f6f8fb;
  }
  table.lines tbody td {
    padding: 10px 8px;
    border-bottom: 1px solid #e5e9f0;
    font-size: 10.5pt;
    vertical-align: top;
  }
  table.lines tbody tr:nth-child(even) td { background: #fafbfd; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.code { font-family: "SF Mono", "Menlo", "Consolas", monospace; font-size: 9.5pt; color: #0a4a8a; white-space: nowrap; }
  td.desc { color: #1a2332; }

  .totals {
    margin-top: 18px;
    margin-left: auto;
    width: 50%;
    min-width: 280px;
  }
  .totals .row {
    display: flex;
    justify-content: space-between;
    padding: 8px 12px;
    font-size: 11pt;
  }
  .totals .row.sub { border-top: 1px solid #e5e9f0; color: #1a2332; }
  .totals .row.btw { color: #6a768c; font-size: 10pt; }
  .totals .row.grand {
    background: #0a1a30;
    color: #fff;
    font-weight: 700;
    font-size: 13pt;
    border-radius: 6px;
    margin-top: 6px;
  }

  .terms {
    margin-top: 36px;
    padding: 16px 18px;
    background: #f6f8fb;
    border-left: 3px solid #0a1a30;
    border-radius: 4px;
    font-size: 9.5pt;
    color: #4a5568;
  }
  .terms .label {
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: #0a1a30;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .terms ul { margin: 4px 0 0 0; padding-left: 18px; }
  .terms li { margin-bottom: 3px; }

  footer.doc-footer {
    margin-top: 32px;
    padding-top: 14px;
    border-top: 1px solid #e5e9f0;
    display: flex;
    justify-content: space-between;
    font-size: 8.5pt;
    color: #6a768c;
  }

  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .no-print { display: none; }
    table.lines tbody tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header class="doc-header">
    <div class="brand">
      <p class="logo">TerreVolt</p>
      <div class="tagline">Workforce &amp; Energie</div>
    </div>
    <div class="doc-meta">
      <h1>Prijzenblad</h1>
      <div class="meta-line">Datum: <strong>${fmtDate()}</strong></div>
      <div class="meta-line">Project: <strong>${project.nummer}</strong></div>
      <div class="meta-line">Methode: <strong>${forecast.methode === "stuksprijzen" ? "Stuksprijzen" : "Uren-vergoeding"}</strong></div>
    </div>
  </header>

  <section class="info-grid">
    <div class="info-block">
      <div class="label">Project</div>
      <div class="value">
        <strong>${project.naam}</strong>
        ${project.stationsnaam ? `${escapeHtml(project.stationsnaam)}<br/>` : ""}
        ${adresregel ? escapeHtml(adresregel) : project.adres ? escapeHtml(project.adres) : ""}
      </div>
    </div>
    <div class="info-block">
      <div class="label">Opdrachtgever</div>
      <div class="value">
        <strong>${opdrachtgeverNaam ? escapeHtml(opdrachtgeverNaam) : "—"}</strong>
      </div>
    </div>
  </section>

  <h2 class="section-title">Specificatie</h2>
  <table class="lines">
    <thead>
      <tr>
        ${showCodeCol ? `<th style="width:14%;">Code</th>` : ""}
        <th>Omschrijving</th>
        <th class="num" style="width:10%;">Aantal</th>
        <th style="width:8%;">Eenheid</th>
        <th class="num" style="width:14%;">Tarief</th>
        <th class="num" style="width:16%;">Bedrag</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (r) => `
        <tr>
          ${showCodeCol ? `<td class="code">${escapeHtml(r.col1)}</td>` : ""}
          <td class="desc">${escapeHtml(r.col2)}</td>
          <td class="num">${fmtAantal(r.aantal)}</td>
          <td>${r.eenheid}</td>
          <td class="num">${fmtEuro(r.tarief)}</td>
          <td class="num"><strong>${fmtEuro(r.bedrag)}</strong></td>
        </tr>`,
        )
        .join("")}
    </tbody>
  </table>

  <div class="totals">
    <div class="row sub">
      <span>Subtotaal</span>
      <span>${fmtEuro(subtotaal)}</span>
    </div>
    <div class="row btw">
      <span>BTW (21%)</span>
      <span>${fmtEuro(btw)}</span>
    </div>
    <div class="row grand">
      <span>Totaal incl. BTW</span>
      <span>${fmtEuro(totaal)}</span>
    </div>
  </div>

  <div class="terms">
    <div class="label">Voorwaarden</div>
    <ul>
      <li>Prijzen zijn indicatief op basis van de huidige projectscope.</li>
      <li>Meerwerk wordt apart op nacalculatie verrekend.</li>
      <li>Tarieven zijn exclusief BTW; de opgevoerde BTW is een richtbedrag.</li>
      <li>Geldig tot 30 dagen na opmaakdatum.</li>
    </ul>
  </div>

  <footer class="doc-footer">
    <span>TerreVolt BV</span>
    <span>Prijzenblad ${project.nummer} · ${fmtDate()}</span>
  </footer>
</div>
<script>
  window.onload = () => { setTimeout(() => window.print(), 250); };
</script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  } else {
    alert("Pop-ups zijn geblokkeerd. Sta pop-ups toe om de PDF te downloaden.");
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

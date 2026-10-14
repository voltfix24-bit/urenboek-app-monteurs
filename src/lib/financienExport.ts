/**
 * Export van het financieel overzicht. Cijfers komen uit FinancienUitkomst
 * (lib/financien.ts); er wordt hier niets herberekend en geen tarief ingevuld.
 */
import { euroDecimals, formatUrenGetal } from "@/lib/formatting";
import type { FinancienUitkomst } from "@/lib/financien";

function csvRij(velden: (string | number)[]): string {
  return velden
    .map((v) => {
      const s = typeof v === "number" ? v.toFixed(2).replace(".", ",") : String(v ?? "");
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(";");
}

export function exporteerFinancienCsv(u: FinancienUitkomst, periode: string) {
  const lijnen: string[] = [];
  lijnen.push(csvRij(["Financieel overzicht", periode]));
  lijnen.push("");
  lijnen.push(csvRij(["Kerncijfers", "Bedrag"]));
  lijnen.push(csvRij(["Omzet", u.omzet]));
  lijnen.push(csvRij(["Omzet cases", u.omzet_cases]));
  lijnen.push(csvRij(["Omzet uitleen", u.omzet_uitleen]));
  lijnen.push(csvRij(["Kosten", u.kosten]));
  lijnen.push(csvRij(["Naar G-rekening", u.g_rekening]));
  lijnen.push(csvRij(["Marge", u.marge]));
  lijnen.push(csvRij(["Marge %", Number(u.marge_pct.toFixed(1))]));
  lijnen.push("");
  lijnen.push(csvRij(["Per opdrachtgever / project", "Nummer", "Type", "Uren", "Omzet", "G-rekening", "Kosten", "Marge", "Marge %"]));
  for (const r of u.regels) {
    lijnen.push(csvRij([
      r.project_naam, r.project_nummer, r.soort === "uitleen" ? "Uitleen" : "Klus",
      Number(r.uren.toFixed(2)), r.omzet, r.g_rekening, r.kosten, r.marge,
      r.omzet > 0 ? Number(((r.marge / r.omzet) * 100).toFixed(1)) : 0,
    ]));
  }
  lijnen.push("");
  lijnen.push(csvRij(["Per professional", "Uren", "Kostentarief", "Kosten", "Gegenereerde omzet", "Bijdrage"]));
  for (const p of [...u.personen, ...u.eigenaren]) {
    lijnen.push(csvRij([
      p.naam + (p.is_eigenaar ? " (eigenaar)" : ""), Number(p.uren.toFixed(2)),
      p.kostentarief ?? 0, p.kosten, p.omzet, p.bijdrage,
    ]));
  }

  const blob = new Blob(["\uFEFF" + lijnen.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `financien_${u.van}_tot_${u.tot}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function exporteerFinancienPdf(u: FinancienUitkomst, periode: string) {
  const kern = [
    ["Omzet", u.omzet], ["Kosten", u.kosten], ["Naar G-rekening", u.g_rekening], ["Marge", u.marge],
  ].map(([l, w]) => `<div class="kern"><span>${l}</span><b>${euroDecimals(Number(w))}</b></div>`).join("");

  const projectRijen = u.regels.map((r) => `<tr>
    <td>${esc(r.project_naam)}<small>${esc(r.project_nummer)} · ${r.soort === "uitleen" ? "Uitleen" : "Klus"}${r.opdrachtgever_naam !== "—" ? " · " + esc(r.opdrachtgever_naam) : ""}</small></td>
    <td class="r">${formatUrenGetal(r.uren)}</td>
    <td class="r">${r.tarief_onbekend ? "€ ?" : euroDecimals(r.omzet)}</td>
    <td class="r">${euroDecimals(r.g_rekening)}</td>
    <td class="r">${euroDecimals(r.kosten)}</td>
    <td class="r">${euroDecimals(r.marge)}</td>
    <td class="r">${r.omzet > 0 ? ((r.marge / r.omzet) * 100).toFixed(1) + "%" : "—"}</td>
  </tr>`).join("");

  const persoonRijen = [...u.personen, ...u.eigenaren].map((p) => `<tr>
    <td>${esc(p.naam)}${p.is_eigenaar ? " <small>(eigenaar)</small>" : ""}</td>
    <td class="r">${formatUrenGetal(p.uren)}</td>
    <td class="r">${p.kostentarief === null ? "€ ?" : euroDecimals(p.kostentarief)}</td>
    <td class="r">${euroDecimals(p.kosten)}</td>
    <td class="r">${euroDecimals(p.omzet)}</td>
    <td class="r">${euroDecimals(p.bijdrage)}</td>
  </tr>`).join("");

  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<title>Financieel overzicht ${esc(periode)}</title>
<style>
  * { box-sizing: border-box; }
  body { font: 13px/1.45 'Hanken Grotesk', system-ui, sans-serif; color: #121c2a; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #6c7a71; margin-bottom: 18px; }
  .kernens { display: flex; gap: 10px; margin-bottom: 22px; }
  .kern { flex: 1; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; }
  .kern span { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #6c7a71; }
  .kern b { font: 500 18px 'DM Mono', monospace; }
  h2 { font-size: 15px; margin: 22px 0 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; font-size: 11px; color: #6c7a71; border-bottom: 1px solid #e5e7eb; padding: 5px 6px; }
  td { padding: 6px; border-bottom: 1px solid #f0f2f5; }
  td small { display: block; color: #6c7a71; font-size: 11px; }
  .r { text-align: right; font-family: 'DM Mono', monospace; }
  .voet { margin-top: 24px; font-size: 11px; color: #6c7a71; display: flex; justify-content: space-between; }
</style></head><body>
<h1>Financieel overzicht</h1>
<div class="sub">${esc(periode)} · ${u.van} tot ${u.tot}</div>
<div class="kernens">${kern}</div>
<h2>Per opdrachtgever / project</h2>
<table><thead><tr><th>Project</th><th class="r">Uren</th><th class="r">Omzet</th><th class="r">G-rekening</th><th class="r">Kosten</th><th class="r">Marge</th><th class="r">Marge %</th></tr></thead>
<tbody>${projectRijen}</tbody></table>
<h2>Per professional</h2>
<table><thead><tr><th>Naam</th><th class="r">Uren</th><th class="r">Kostentarief</th><th class="r">Kosten</th><th class="r">Omzet</th><th class="r">Bijdrage</th></tr></thead>
<tbody>${persoonRijen}</tbody></table>
<div class="voet"><span>TerreVolt BV</span><span>${new Date().toLocaleDateString("nl-NL")}</span></div>
<script>window.onload = () => { setTimeout(() => window.print(), 250); };</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  } else {
    alert("Pop-ups zijn geblokkeerd. Sta pop-ups toe om de PDF te downloaden.");
  }
}

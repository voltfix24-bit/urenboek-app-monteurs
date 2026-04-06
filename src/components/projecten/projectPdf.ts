export function generateProjectPdf(project: any, ogNaam: string | null, isManager: boolean) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${project.naam}</title><style>
    body{font-family:system-ui,sans-serif;padding:40px;color:#2D4A1E;max-width:800px;margin:0 auto}
    h1{font-size:22px;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin:16px 0}
    td,th{text-align:left;padding:8px 12px;border-bottom:1px solid #C5D4B2;font-size:13px}
    th{color:#5A7A42;font-weight:500;width:140px}.badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;background:#D4E8C2;color:#4A7C2F;font-weight:600}
    .section{margin-top:24px;padding-top:16px;border-top:2px solid #EBF0E4}
    .section h2{font-size:15px;color:#5A7A42;margin-bottom:8px}
    @media print{body{padding:20px}}
  </style></head><body>
    <h1>${project.naam}</h1>
    <span class="badge">${project.nummer}</span>
    <table><tbody>
      <tr><th>Status</th><td>${project.active ? "Actief" : "Inactief"}</td></tr>
      ${project.case_type ? `<tr><th>Case type</th><td>${project.case_type}</td></tr>` : ""}
      ${project.stationsnaam ? `<tr><th>Stationsnaam</th><td>${project.stationsnaam}</td></tr>` : ""}
      ${project.adres ? `<tr><th>Adres</th><td>${project.adres}</td></tr>` : ""}
      ${ogNaam ? `<tr><th>Opdrachtgever</th><td>${ogNaam}</td></tr>` : ""}
    </tbody></table>
    ${isManager && (project.contactpersoon_naam || project.contactpersoon_tel || project.contactpersoon_email) ? `
      <div class="section"><h2>Contactpersoon opdrachtgever</h2><table><tbody>
        ${project.contactpersoon_naam ? `<tr><th>Naam</th><td>${project.contactpersoon_naam}</td></tr>` : ""}
        ${project.contactpersoon_tel ? `<tr><th>Telefoon</th><td>${project.contactpersoon_tel}</td></tr>` : ""}
        ${project.contactpersoon_email ? `<tr><th>Email</th><td>${project.contactpersoon_email}</td></tr>` : ""}
      </tbody></table></div>
    ` : ""}
    <p style="margin-top:32px;font-size:10px;color:#8AAD6E">Gegenereerd op ${new Date().toLocaleDateString("nl-NL")} · TerreVolt BV</p>
    <script>window.onload=()=>window.print()</script>
  </body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

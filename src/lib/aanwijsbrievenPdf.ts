// Genereert één PDF met daarin één pagina per aanwijzing (BEI-aanwijsbrief).
import jsPDF from "jspdf";
import { fmtDatum } from "@/lib/medewerkersDesktop";

export interface AanwijsbriefRegel {
  norm: string;
  rol: string;
  partij: string;
  aangewezen_door: string;
  aangewezen_op: string;
  geldig_tot: string;
}

export async function genereerAanwijsbrievenPdf(medewerkerNaam: string, regels: AanwijsbriefRegel[]): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 20;
  const pageW = doc.internal.pageSize.getWidth();

  regels.forEach((r, i) => {
    if (i > 0) doc.addPage();
    let y = margin;

    doc.setFillColor(16, 185, 129);
    doc.rect(0, 0, pageW, 30, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Aanwijsbrief BEI", margin, 18);

    y = 44;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);

    const rows: [string, string][] = [
      ["Medewerker", medewerkerNaam],
      ["Norm", r.norm],
      ["Rol", r.rol],
      ["Partij (installatieverantwoordelijke)", r.partij],
      ["Aangewezen door", r.aangewezen_door],
      ["Aangewezen op", fmtDatum(r.aangewezen_op)],
      ["Geldig tot", fmtDatum(r.geldig_tot)],
    ];
    for (const [label, waarde] of rows) {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(80, 80, 80);
      doc.text(label + ":", margin, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      doc.text(String(waarde), margin + 75, y);
      y += 8;
    }

    y += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const tekst = `Hierbij wordt bovengenoemde persoon conform de BEI (Bedrijfsvoering Elektrische Installaties) aangewezen in de rol van ${r.rol} voor de norm ${r.norm}, voor werkzaamheden onder verantwoordelijkheid van ${r.partij}. Deze aanwijzing is geldig tot en met ${fmtDatum(r.geldig_tot)}.`;
    const regelsTekst = doc.splitTextToSize(tekst, pageW - margin * 2);
    doc.text(regelsTekst, margin, y);
    y += regelsTekst.length * 5 + 20;

    const kolW = (pageW - margin * 2 - 10) / 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Aanwijzer", margin, y);
    doc.text("Aangewezene", margin + kolW + 10, y);
    y += 20;

    doc.setDrawColor(180, 180, 180);
    doc.line(margin, y, margin + kolW, y);
    doc.line(margin + kolW + 10, y, margin + kolW * 2 + 10, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(`Naam: ${r.aangewezen_door}`, margin, y);
    doc.text(`Naam: ${medewerkerNaam}`, margin + kolW + 10, y);
    y += 6;
    doc.text("Datum:", margin, y);
    doc.text("Datum:", margin + kolW + 10, y);
  });

  doc.save(`Aanwijsbrieven_${medewerkerNaam.replace(/\s+/g, "_")}.pdf`);
}

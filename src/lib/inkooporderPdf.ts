import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { euroDecimals as euro } from "@/lib/formatting";
import { getBedrijfsgegevens } from "@/hooks/useBedrijfsgegevens";
import terrevoltLogoPng from "@/assets/terrevolt-logo.png";

export async function generateInkooporderPdf(
  order: any,
  regels: any[],
  prof: any
) {
  const bedrijf = await getBedrijfsgegevens();

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  // ── HEADER BALK ──────────────────
  doc.setFillColor(45, 90, 26);
  doc.rect(0, 0, pageW, 26, "F");

  // Logo links in header
  try {
    const logoW = 12 * (129 / 36);
    doc.addImage(terrevoltLogoPng, "PNG", margin, 7, logoW, 12, undefined, "FAST");
  } catch {
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("TerreVolt B.V.", margin, 17);
  }

  // "INKOOPORDER" rechts in header
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("INKOOPORDER", pageW - margin, 11, { align: "right" });

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(order.order_nummer, pageW - margin, 20, { align: "right" });

  // ── KLEURSTREEP ──────────────────
  doc.setFillColor(122, 173, 86);
  doc.rect(0, 26, pageW * 0.5, 2, "F");
  doc.setFillColor(200, 168, 75);
  doc.rect(pageW * 0.5, 26, pageW * 0.3, 2, "F");

  // ── PARTIJEN BLOK ────────────────
  let y = 34;
  const rechtsX = pageW / 2 + 4;

  // Labels
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(122, 173, 86);
  doc.text("OPDRACHTGEVER", margin, y);
  doc.text("OPDRACHTNEMER", rechtsX, y);
  y += 5;

  // Links: TerreVolt naam
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 60, 15);
  doc.text(bedrijf?.bedrijfsnaam || "TerreVolt B.V.", margin, y);

  // Rechts: Monteur naam
  const monteurNaam = prof?.bedrijfsnaam || prof?.full_name || order.medewerker_naam || "";
  doc.text(monteurNaam, rechtsX, y);
  y += 5;

  // TerreVolt adresregels
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);

  const ogRegels: string[] = [];
  if (bedrijf?.straat) ogRegels.push(bedrijf.straat);
  if (bedrijf?.postcode || bedrijf?.stad)
    ogRegels.push([bedrijf?.postcode, bedrijf?.stad].filter(Boolean).join(" "));
  if (bedrijf?.kvk_nummer) ogRegels.push(`KVK: ${bedrijf.kvk_nummer}`);
  if (bedrijf?.btw_nummer) ogRegels.push(`BTW: ${bedrijf.btw_nummer}`);
  if (bedrijf?.email) ogRegels.push(bedrijf.email);

  ogRegels.forEach((r) => {
    doc.text(r, margin, y);
    y += 4;
  });

  // Monteur adresregels
  let yR = 44;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);

  const adres = prof?.factuuradres || prof?.adres;
  if (adres) {
    const adresDelen = adres.split(",").map((s: string) => s.trim()).filter(Boolean);
    adresDelen.forEach((deel: string) => {
      doc.text(deel, rechtsX, yR);
      yR += 4;
    });
  }

  if (prof?.kvk_nummer) {
    doc.text(`KVK: ${prof.kvk_nummer}`, rechtsX, yR);
    yR += 4;
  } else {
    doc.setTextColor(180, 120, 0);
    doc.text("KVK: niet ingevuld", rechtsX, yR);
    doc.setTextColor(80, 80, 80);
    yR += 4;
  }

  if (prof?.btw_nummer) {
    doc.text(`BTW: ${prof.btw_nummer}`, rechtsX, yR);
    yR += 4;
  }

  if (prof?.iban) {
    doc.text(`IBAN: ${prof.iban}`, rechtsX, yR);
    yR += 4;
  } else {
    doc.setTextColor(180, 120, 0);
    doc.text("IBAN: niet ingevuld", rechtsX, yR);
    doc.setTextColor(80, 80, 80);
    yR += 4;
  }

  if (prof?.telefoon) {
    doc.text(`Tel: ${prof.telefoon}`, rechtsX, yR);
    yR += 4;
  }

  // Verticale scheidingslijn
  const scheidingY = 34;
  const scheidingH = Math.max(y, yR) - scheidingY + 2;
  doc.setDrawColor(210, 228, 200);
  doc.setLineWidth(0.3);
  doc.line(pageW / 2, scheidingY, pageW / 2, scheidingY + scheidingH);

  // ── BENTO INFO BALK ──────────────
  const bentoY = Math.max(y, yR) + 6;

  doc.setFillColor(238, 245, 232);
  doc.rect(0, bentoY, pageW, 16, "F");
  doc.setDrawColor(212, 224, 204);
  doc.setLineWidth(0.2);
  doc.line(0, bentoY, pageW, bentoY);
  doc.line(0, bentoY + 16, pageW, bentoY + 16);

  const bentoItems = [
    {
      label: "PERIODE",
      waarde: `${format(new Date(order.periode_van), "d MMM", { locale: nl })} — ${format(new Date(order.periode_tot), "d MMM yyyy", { locale: nl })}`,
    },
    {
      label: "DATUM",
      waarde: format(new Date(order.aangemaakt_op), "d MMMM yyyy", { locale: nl }),
    },
    {
      label: "TOTAAL UREN",
      waarde: `${order.totaal_uren} uur`,
    },
    {
      label: "BETALINGSTERMIJN",
      waarde: `${bedrijf?.betalingstermijn || 30} dagen`,
    },
  ];

  const bentoW = pageW / bentoItems.length;
  bentoItems.forEach((item, i) => {
    const bx = i * bentoW + 6;

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 140, 70);
    doc.text(item.label, bx, bentoY + 5);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 60, 15);
    doc.text(item.waarde, bx, bentoY + 12);

    if (i < bentoItems.length - 1) {
      doc.setDrawColor(210, 228, 200);
      doc.setLineWidth(0.2);
      doc.line((i + 1) * bentoW, bentoY + 2, (i + 1) * bentoW, bentoY + 14);
    }
  });

  // ── TABEL ────────────────────────
  const tableY = bentoY + 20;

  autoTable(doc, {
    startY: tableY,
    margin: { left: margin, right: margin },
    head: [["Datum", "Project", "Activiteit", "Uren", "Tarief", "Bedrag"]],
    body: regels.map((r) => [
      format(new Date(r.datum + "T12:00:00"), "dd-MM-yyyy"),
      r.project_naam || "",
      r.activiteit || "—",
      String(r.uren),
      euro(r.uurtarief),
      euro(r.bedrag),
    ]),
    foot: [
      ["", "", "", "", "Subtotaal excl. BTW:", euro(order.totaal_excl_btw)],
      ["", "", "", "", "BTW 21%:", euro(order.btw_bedrag)],
      ["", "", "", "", "Totaal incl. BTW:", euro(order.totaal_incl_btw)],
    ],
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 },
      textColor: [30, 30, 30],
      lineColor: [210, 228, 200],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [45, 90, 26],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
      cellPadding: { top: 4, bottom: 4, left: 3, right: 3 },
    },
    footStyles: {
      fillColor: [238, 245, 232],
      textColor: [30, 60, 15],
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 252, 245],
    },
    columnStyles: {
      0: { cellWidth: 22, textColor: [100, 100, 100] },
      1: { cellWidth: "auto", fontStyle: "bold", textColor: [30, 60, 15] },
      2: { cellWidth: 26 },
      3: { cellWidth: 12, halign: "center", fontStyle: "bold" },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 26, halign: "right", fontStyle: "bold", textColor: [30, 60, 15] },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 200;

  // ── TOTAAL BLOK ──────────────────
  const totaalW = 70;
  const totaalX = pageW - margin - totaalW;
  const totaalY = finalY + 6;

  doc.setFillColor(45, 90, 26);
  doc.roundedRect(totaalX, totaalY, totaalW, 10, 2, 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAAL INCL. BTW", totaalX + 4, totaalY + 4.5);
  doc.setFontSize(10);
  doc.text(euro(order.totaal_incl_btw), totaalX + totaalW - 4, totaalY + 6.5, { align: "right" });

  // ── FOOTER ───────────────────────
  const footerY = totaalY + 18;

  doc.setDrawColor(210, 228, 200);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY, pageW - margin, footerY);

  const termijn = bedrijf?.betalingstermijn || 30;
  const email = bedrijf?.email || "info@terrevolt.nl";

  // Links: betalingsinstructies
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 140, 70);
  doc.text("BETALINGSINSTRUCTIES", margin, footerY + 6);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(7.5);
  const betalingTekst = [
    `Betaling binnen ${termijn} dagen na ontvangst van uw factuur.`,
    `Stuur uw factuur naar: ${email}`,
    `Vermeld ordernummer ${order.order_nummer} op uw factuur.`,
  ];
  let footerTextY = footerY + 11;
  betalingTekst.forEach((regel) => {
    doc.text(regel, margin, footerTextY);
    footerTextY += 4;
  });

  // Rechts: TerreVolt bankgegevens
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(100, 140, 70);
  doc.text("BANKGEGEVENS TERREVOLT", rechtsX, footerY + 6);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(7.5);
  const bankTekst: string[] = [];
  if (bedrijf?.bedrijfsnaam) bankTekst.push(bedrijf.bedrijfsnaam);
  if (bedrijf?.iban) bankTekst.push(`IBAN: ${bedrijf.iban}`);
  if (bedrijf?.iban_naam) bankTekst.push(`T.n.v. ${bedrijf.iban_naam}`);
  if (bedrijf?.kvk_nummer) bankTekst.push(`KVK: ${bedrijf.kvk_nummer}`);

  let bankY = footerY + 11;
  bankTekst.forEach((r) => {
    doc.text(r, rechtsX, bankY);
    bankY += 4;
  });

  // ── DOC FOOTER ───────────────────
  doc.setFillColor(45, 90, 26);
  doc.rect(0, pageH - 10, pageW, 10, "F");
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(255, 255, 255);
  doc.text(
    `© ${new Date().getFullYear()} ${bedrijf?.bedrijfsnaam || "TerreVolt B.V."} · Vertrouwelijk document`,
    margin,
    pageH - 4
  );
  doc.text(
    `Ref: ${order.order_nummer} · Pagina 01`,
    pageW - margin,
    pageH - 4,
    { align: "right" }
  );

  doc.save(`Inkooporder_${order.order_nummer}.pdf`);
}

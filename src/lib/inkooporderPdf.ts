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
  prof: any,
  goedkeurderNaam?: string
) {
  const bedrijf = await getBedrijfsgegevens();
  const bNaam = bedrijf?.bedrijfsnaam || "TerreVolt B.V.";

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const ml = 16;
  const mr = 16;
  const contentW = pageW - ml - mr;
  const rechtsX = pageW / 2 + 4;

  // ── KLEUREN ──────────────────────
  const groen = [45, 74, 30] as [number, number, number];
  const groenMid = [74, 124, 47] as [number, number, number];
  const groenTint = [238, 245, 232] as [number, number, number];
  const groenLicht = [245, 247, 240] as [number, number, number];
  const goud = [200, 168, 75] as [number, number, number];
  const goudLicht = [255, 248, 220] as [number, number, number];
  const rand = [200, 217, 184] as [number, number, number];
  const tekst = [7, 33, 0] as [number, number, number];
  const muted = [90, 122, 66] as [number, number, number];
  const faint = [66, 73, 60] as [number, number, number];

  // Achtergrond hele pagina
  doc.setFillColor(...groenLicht);
  doc.rect(0, 0, pageW, pageH, "F");

  // ── LOGO ─────────────────────────
  const logoH = 10;
  const logoW = logoH * (129 / 36);

  try {
    doc.addImage(
      terrevoltLogoPng, "PNG",
      ml, ml,
      logoW, logoH,
      undefined, "FAST"
    );
  } catch {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...groen);
    doc.text("TerreVolt B.V.", ml, ml + 8);
  }

  // Subtitel onder logo
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...muted);
  doc.text("ELEKTROTECHNIEK & INSTALLATIE", ml, ml + logoH + 5);

  // ── TITEL RECHTS ─────────────────
  doc.setFontSize(34);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...groen);
  doc.text("Inkooporder", pageW - mr, ml + 2, { align: "right" });

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...groenMid);
  doc.text(order.order_nummer, pageW - mr, ml + 12, { align: "right" });

  // Datums rechts
  const datumStr = format(new Date(order.aangemaakt_op), "d MMMM yyyy", { locale: nl });

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...faint);

  let dY = ml + 20;
  const datumRegels = [
    { label: "Datum:", waarde: datumStr },
    { label: "Geaccordeerd door:", waarde: goedkeurderNaam || bNaam },
    { label: "Accordeerdatum:", waarde: datumStr },
  ];

  datumRegels.forEach((r) => {
    doc.setFont("helvetica", "normal");
    doc.text(r.label, pageW - mr, dY, { align: "right" });
    dY += 4;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...groen);
    doc.text(r.waarde, pageW - mr, dY, { align: "right" });
    doc.setTextColor(...faint);
    dY += 5;
  });

  // ── PARTIJEN ─────────────────────
  const partijY = ml + logoH + 14;
  const partijH = 36;
  const halfW = (contentW - 4) / 2;

  // Witte box links (opdrachtnemer)
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(ml, partijY, halfW, partijH, 2, 2, "F");
  doc.setDrawColor(...rand);
  doc.setLineWidth(0.3);
  doc.roundedRect(ml, partijY, halfW, partijH, 2, 2, "S");

  // Witte box rechts (opdrachtgever)
  const rechtsBoxX = ml + halfW + 4;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(rechtsBoxX, partijY, halfW, partijH, 2, 2, "F");
  doc.setDrawColor(...rand);
  doc.roundedRect(rechtsBoxX, partijY, halfW, partijH, 2, 2, "S");

  // Links: Opdrachtnemer
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...groen);
  doc.text("OPDRACHTNEMER", ml + 4, partijY + 6);

  const monteurNaam = prof?.bedrijfsnaam || prof?.full_name || order.medewerker_naam || "";

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...tekst);
  doc.text(monteurNaam, ml + 4, partijY + 13);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...muted);

  let lY = partijY + 19;

  const adres = prof?.factuuradres || prof?.adres || "";
  if (adres) {
    const adresDelen = adres.split(",").map((s: string) => s.trim()).filter(Boolean);
    adresDelen.slice(0, 2).forEach((deel: string) => {
      doc.text(deel, ml + 4, lY);
      lY += 4;
    });
  }

  if (prof?.kvk_nummer) {
    doc.setTextColor(...groenMid);
    doc.text(`KVK: ${prof.kvk_nummer}`, ml + 4, lY);
    lY += 4;
  }

  if (prof?.btw_nummer) {
    doc.setTextColor(...groenMid);
    doc.text(`BTW: ${prof.btw_nummer}`, ml + 4, lY);
    lY += 4;
  }

  if (prof?.iban) {
    doc.setTextColor(...groenMid);
    doc.text(`IBAN: ${prof.iban}`, ml + 4, lY);
  }

  // Rechts: Opdrachtgever
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...groen);
  doc.text("OPDRACHTGEVER", rechtsBoxX + 4, partijY + 6);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...tekst);
  doc.text(bNaam, rechtsBoxX + 4, partijY + 13);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...muted);

  let rY = partijY + 19;

  const ogAdres = [
    bedrijf?.straat,
    [bedrijf?.postcode, bedrijf?.stad].filter(Boolean).join(" "),
  ].filter(Boolean);

  ogAdres.forEach((r) => {
    doc.text(r as string, rechtsBoxX + 4, rY);
    rY += 4;
  });

  if (bedrijf?.kvk_nummer) {
    doc.setTextColor(...groenMid);
    doc.text(`KVK: ${bedrijf.kvk_nummer}`, rechtsBoxX + 4, rY);
    rY += 4;
  }

  if (bedrijf?.btw_nummer) {
    doc.setTextColor(...groenMid);
    doc.text(`BTW: ${bedrijf.btw_nummer}`, rechtsBoxX + 4, rY);
    rY += 4;
  }

  if (bedrijf?.email) {
    doc.setTextColor(...muted);
    doc.text(bedrijf.email, rechtsBoxX + 4, rY);
  }

  // ── TABEL ────────────────────────
  const tableY = partijY + partijH + 6;

  const tabelBody = regels.map((r) => [
    format(new Date(r.datum + "T12:00:00"), "dd-MM-yyyy"),
    r.project_naam || "",
    r.activiteit || r.beschrijving || r.type || "Werkzaamheden",
    String(r.uren),
    `€ ${Number(r.uurtarief).toFixed(2)}`,
    `€ ${Number(r.bedrag).toFixed(2).replace(".", ",")}`,
  ]);

  autoTable(doc, {
    startY: tableY,
    margin: { left: ml, right: mr },
    head: [[
      "Datum",
      "Project",
      "Werkzaamheden",
      "Uren",
      "Tarief excl. btw",
      "Bedrag excl. btw",
    ]],
    body: tabelBody,
    theme: "plain",
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 5, bottom: 5, left: 4, right: 4 },
      textColor: [tekst[0], tekst[1], tekst[2]] as [number, number, number],
      lineColor: [200, 217, 184] as [number, number, number],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [245, 247, 240] as [number, number, number],
      textColor: [groen[0], groen[1], groen[2]] as [number, number, number],
      fontStyle: "bold",
      fontSize: 7.5,
      lineColor: [groen[0], groen[1], groen[2]] as [number, number, number],
      lineWidth: { bottom: 0.5 },
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255] as [number, number, number],
    },
    columnStyles: {
      0: { cellWidth: 22, textColor: [faint[0], faint[1], faint[2]] as [number, number, number] },
      1: { cellWidth: 42, fontStyle: "bold", textColor: [groen[0], groen[1], groen[2]] as [number, number, number] },
      2: { cellWidth: "auto" },
      3: { cellWidth: 12, halign: "center", fontStyle: "bold" },
      4: { cellWidth: 26, halign: "right" },
      5: { cellWidth: 28, halign: "right", fontStyle: "bold", textColor: [groen[0], groen[1], groen[2]] as [number, number, number] },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 180;

  // ── FINANCIEEL RECHTS ─────────────
  const finW = 78;
  const finX = pageW - mr - finW;
  let finY = finalY + 6;

  const finRegels = [
    { label: "Subtotaal excl. BTW", waarde: euro(order.totaal_excl_btw) },
    { label: "BTW 21%", waarde: euro(order.btw_bedrag) },
  ];

  finRegels.forEach((r) => {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...muted);
    doc.text(r.label, finX, finY);

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...tekst);
    doc.text(r.waarde, finX + finW, finY, { align: "right" });

    finY += 7;

    doc.setDrawColor(...rand);
    doc.setLineWidth(0.2);
    doc.line(finX, finY - 2, finX + finW, finY - 2);
  });

  // Totaal box met gouden achtergrond
  const totH = 14;
  doc.setFillColor(...goudLicht);
  doc.roundedRect(finX, finY, finW, totH, 2, 2, "F");
  // Groene linker rand
  doc.setFillColor(...groenMid);
  doc.rect(finX, finY, 3, totH, "F");

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...groen);
  doc.text("TOTAAL INCL. BTW", finX + 6, finY + 5.5);

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...groen);
  doc.text(euro(order.totaal_incl_btw), finX + finW - 4, finY + 10, { align: "right" });

  // ── FOOTER ───────────────────────
  const footerY = finY + totH + 8;

  doc.setDrawColor(...rand);
  doc.setLineWidth(0.3);
  doc.line(ml, footerY, pageW - mr, footerY);

  const termijn = bedrijf?.betalingstermijn || 30;
  const email = bedrijf?.email || "info@terrevolt.nl";

  // Links: betalingsinstructies
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...muted);
  doc.text("BETALINGSINSTRUCTIES", ml, footerY + 7);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...faint);

  const instrRegels = [
    `Betaling binnen ${termijn} dagen na ontvangst van een correcte factuur.`,
    `Vermeld verplicht ordernummer ${order.order_nummer} op uw factuur.`,
    `Stuur uw factuur naar: ${email}`,
  ];

  let iY = footerY + 12;
  instrRegels.forEach((r) => {
    doc.text(r, ml, iY);
    iY += 4.5;
  });

  // Cursief: geen factuur
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...muted);
  doc.text(
    "Dit document is geen factuur. Het dient als basis voor uw facturatie aan " + bNaam + ".",
    ml, iY + 2
  );

  // Rechts: bankgegevens
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...muted);
  doc.text("BANKGEGEVENS " + bNaam.toUpperCase(), rechtsX, footerY + 7);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...faint);

  let bY = footerY + 12;
  const bankRegels: string[] = [];
  if (bNaam) bankRegels.push(bNaam);
  if (bedrijf?.iban) bankRegels.push(`IBAN: ${bedrijf.iban}`);
  if (bedrijf?.iban_naam) bankRegels.push(`T.n.v. ${bedrijf.iban_naam}`);
  if (bedrijf?.kvk_nummer) bankRegels.push(`KVK: ${bedrijf.kvk_nummer}`);

  bankRegels.forEach((r) => {
    doc.text(r, rechtsX, bY);
    bY += 4.5;
  });

  // ── ONDERSTE BALK ─────────────────
  const periodeStr =
    format(new Date(order.periode_van), "d MMM", { locale: nl }) +
    " – " +
    format(new Date(order.periode_tot), "d MMM yyyy", { locale: nl });

  doc.setFillColor(...groenTint);
  doc.rect(0, pageH - 10, pageW, 10, "F");
  doc.setDrawColor(...rand);
  doc.setLineWidth(0.2);
  doc.line(0, pageH - 10, pageW, pageH - 10);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...muted);
  doc.text(
    `Doc: ${order.order_nummer} · Periode ${periodeStr}`,
    ml, pageH - 4
  );
  doc.text(
    "Definitief goedgekeurd voor facturatie · Pagina 01",
    pageW - mr, pageH - 4,
    { align: "right" }
  );

  doc.save(`Inkooporder_${order.order_nummer}.pdf`);
}

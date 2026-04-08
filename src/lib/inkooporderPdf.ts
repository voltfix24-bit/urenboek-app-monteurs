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
  const bNaam = bedrijf?.bedrijfsnaam || "TerreVolt B.V.";

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const rechtsX = pageW / 2 + 4;

  // ── KLEUREN ──────────────────────
  const groen = [0, 59, 30] as const;
  const groenMid = [44, 106, 68] as const;
  const groenTint = [244, 248, 241] as const;
  const goud = [200, 168, 75] as const;
  const goudLicht = [254, 249, 236] as const;
  const rand = [192, 201, 191] as const;
  const randLicht = [227, 227, 222] as const;
  const tekst = [26, 28, 25] as const;
  const muted = [64, 73, 65] as const;
  const faint = [112, 121, 113] as const;

  // ── LOGO BOX LINKS BOVEN ─────────
  doc.setFillColor(...groen);
  doc.roundedRect(margin, margin, 14, 14, 2, 2, "F");

  try {
    doc.addImage(
      terrevoltLogoPng, "PNG",
      margin + 1, margin + 2.5,
      12, 9,
      undefined, "FAST"
    );
  } catch {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("TV", margin + 3, margin + 10);
  }

  // Bedrijfsnaam rechts van logo box
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...groen);
  doc.text(bNaam, margin + 17, margin + 8);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...groenMid);
  doc.text("ELEKTROTECHNIEK & INSTALLATIE", margin + 17, margin + 13);

  // ── GROTE TITEL ──────────────────
  doc.setFontSize(32);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...groen);
  doc.text("Inkooporder", margin, margin + 35);

  // Status badge
  const badgeY = margin + 38;
  const badgeTekst = "OFFICIEEL VERZONDEN";
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  const badgeW = doc.getTextWidth(badgeTekst) + 8;
  doc.setFillColor(...groen);
  doc.roundedRect(margin, badgeY, badgeW, 5.5, 1, 1, "F");
  doc.text(badgeTekst, margin + 4, badgeY + 3.8);

  // ── ORDER BOX RECHTS ─────────────
  const boxW = 56;
  const boxX = pageW - margin - boxW;

  doc.setFillColor(...groenTint);
  doc.roundedRect(boxX, margin, boxW, 18, 2, 2, "F");
  doc.setDrawColor(...randLicht);
  doc.setLineWidth(0.3);
  doc.roundedRect(boxX, margin, boxW, 18, 2, 2, "S");

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...faint);
  doc.text("ORDERNUMMER", boxX + 4, margin + 6);

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...groen);
  doc.text(order.order_nummer, boxX + 4, margin + 14);

  // Datum onder order box
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...faint);
  doc.text("DATUM", boxX + 4, margin + 24);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...tekst);
  doc.text(
    format(new Date(order.aangemaakt_op), "d MMMM yyyy", { locale: nl }),
    boxX + 4, margin + 30
  );

  // ── PARTIJEN ─────────────────────
  const partijY = margin + 52;

  // Scheidingslijn boven partijen
  doc.setDrawColor(...randLicht);
  doc.setLineWidth(0.3);
  doc.line(margin, partijY - 4, pageW - margin, partijY - 4);

  // LINKS: Opdrachtnemer (monteur)
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...groen);
  doc.text("OPDRACHTNEMER", margin, partijY);

  doc.setDrawColor(...groen);
  doc.setLineWidth(0.5);
  doc.line(margin, partijY + 1.5, margin + 55, partijY + 1.5);

  const monteurNaam = prof?.bedrijfsnaam || prof?.full_name || order.medewerker_naam || "";

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...tekst);
  doc.text(monteurNaam, margin, partijY + 8);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...muted);

  let yL = partijY + 14;

  const adres = prof?.factuuradres || prof?.adres || "";
  if (adres) {
    adres.split(",").map((s: string) => s.trim()).filter(Boolean).forEach((deel: string) => {
      doc.text(deel, margin, yL);
      yL += 4;
    });
  }

  if (prof?.kvk_nummer) {
    doc.setTextColor(...groenMid);
    doc.text(`KVK: ${prof.kvk_nummer}`, margin, yL);
  } else {
    doc.setTextColor(180, 120, 0);
    doc.text("KVK: niet ingevuld", margin, yL);
  }
  yL += 4;

  if (prof?.btw_nummer) {
    doc.setTextColor(...groenMid);
    doc.text(`BTW: ${prof.btw_nummer}`, margin, yL);
    yL += 4;
  }

  if (prof?.iban) {
    doc.setTextColor(...groenMid);
    doc.text(`IBAN: ${prof.iban}`, margin, yL);
  } else {
    doc.setTextColor(180, 120, 0);
    doc.text("IBAN: niet ingevuld", margin, yL);
  }
  yL += 4;

  if (prof?.telefoon) {
    doc.setTextColor(...muted);
    doc.text(`Tel: ${prof.telefoon}`, margin, yL);
    yL += 4;
  }

  // RECHTS: Opdrachtgever (TerreVolt)
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...groen);
  doc.text("OPDRACHTGEVER", rechtsX, partijY);

  doc.setDrawColor(...groen);
  doc.setLineWidth(0.5);
  doc.line(rechtsX, partijY + 1.5, rechtsX + 55, partijY + 1.5);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...tekst);
  doc.text(bNaam, rechtsX, partijY + 8);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...muted);

  let yR = partijY + 14;

  const ogRegels: string[] = [];
  if (bedrijf?.straat) ogRegels.push(bedrijf.straat);
  if (bedrijf?.postcode || bedrijf?.stad)
    ogRegels.push([bedrijf?.postcode, bedrijf?.stad].filter(Boolean).join(" "));

  ogRegels.forEach((r) => {
    doc.text(r, rechtsX, yR);
    yR += 4;
  });

  if (bedrijf?.kvk_nummer) {
    doc.setTextColor(...groenMid);
    doc.text(`KVK: ${bedrijf.kvk_nummer}`, rechtsX, yR);
    yR += 4;
  }

  if (bedrijf?.btw_nummer) {
    doc.setTextColor(...groenMid);
    doc.text(`BTW: ${bedrijf.btw_nummer}`, rechtsX, yR);
    yR += 4;
  }

  if (bedrijf?.email) {
    doc.setTextColor(...muted);
    doc.text(bedrijf.email, rechtsX, yR);
    yR += 4;
  }

  // Verticale scheiding tussen partijen
  const scheidingMidden = pageW / 2;
  const scheidingTop = partijY - 1;
  const scheidingBtm = Math.max(yL, yR) + 2;
  doc.setDrawColor(...randLicht);
  doc.setLineWidth(0.3);
  doc.line(scheidingMidden, scheidingTop, scheidingMidden, scheidingBtm);

  // ── META BALK ────────────────────
  const metaY = Math.max(yL, yR) + 8;
  const metaH = 14;

  doc.setFillColor(...groenTint);
  doc.roundedRect(margin, metaY, pageW - margin * 2, metaH, 2, 2, "F");
  doc.setDrawColor(...randLicht);
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, metaY, pageW - margin * 2, metaH, 2, 2, "S");

  const metaItems = [
    {
      label: "PERIODE",
      waarde:
        format(new Date(order.periode_van), "d MMM", { locale: nl }) +
        " — " +
        format(new Date(order.periode_tot), "d MMM yyyy", { locale: nl }),
    },
    {
      label: "BETALINGSTERMIJN",
      waarde: `${bedrijf?.betalingstermijn || 30} dagen`,
    },
    {
      label: "TOTAAL UREN",
      waarde: `${order.totaal_uren} uur`,
    },
    {
      label: "UURTARIEF",
      waarde: regels.length > 0 ? euro(regels[0].uurtarief) : "—",
    },
  ];

  const metaW = (pageW - margin * 2) / metaItems.length;

  metaItems.forEach((item, i) => {
    const mx = margin + i * metaW + 5;

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...faint);
    doc.text(item.label, mx, metaY + 5);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...groen);
    doc.text(item.waarde, mx, metaY + 11);

    if (i < metaItems.length - 1) {
      doc.setDrawColor(...rand);
      doc.setLineWidth(0.2);
      doc.line(
        margin + (i + 1) * metaW, metaY + 2,
        margin + (i + 1) * metaW, metaY + metaH - 2
      );
    }
  });

  // ── TABEL ────────────────────────
  const tableY = metaY + metaH + 8;

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
    theme: "grid",
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 5, bottom: 5, left: 4, right: 4 },
      textColor: [tekst[0], tekst[1], tekst[2]] as [number, number, number],
      lineColor: [randLicht[0], randLicht[1], randLicht[2]] as [number, number, number],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [groen[0], groen[1], groen[2]] as [number, number, number],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
      cellPadding: { top: 5, bottom: 5, left: 4, right: 4 },
    },
    alternateRowStyles: {
      fillColor: [groenTint[0], groenTint[1], groenTint[2]] as [number, number, number],
    },
    columnStyles: {
      0: { cellWidth: 24, textColor: [muted[0], muted[1], muted[2]] as [number, number, number] },
      1: { cellWidth: "auto", fontStyle: "bold", textColor: [groen[0], groen[1], groen[2]] as [number, number, number] },
      2: { cellWidth: 28 },
      3: { cellWidth: 14, halign: "center", fontStyle: "bold" },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 28, halign: "right", fontStyle: "bold", textColor: [groen[0], groen[1], groen[2]] as [number, number, number] },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 200;

  // ── FINANCIEEL OVERZICHT ──────────
  const finW = 72;
  const finX = pageW - margin - finW;
  let finY = finalY + 8;

  const finRegels = [
    { label: "SUBTOTAAL EXCL. BTW", waarde: euro(order.totaal_excl_btw) },
    { label: "BTW (21%)", waarde: euro(order.btw_bedrag) },
  ];

  finRegels.forEach((r) => {
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...faint);
    doc.text(r.label, finX, finY);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...tekst);
    doc.text(r.waarde, finX + finW, finY, { align: "right" });
    finY += 7;
  });

  // Totaal box (goud)
  const totaalBoxH = 13;
  doc.setFillColor(...goudLicht);
  doc.roundedRect(finX, finY, finW, totaalBoxH, 2, 2, "F");
  doc.setDrawColor(...goud);
  doc.setLineWidth(0.5);
  doc.roundedRect(finX, finY, finW, totaalBoxH, 2, 2, "S");

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...groen);
  doc.text("TOTAAL INCL. BTW", finX + 4, finY + 5.5);

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...groen);
  doc.text(euro(order.totaal_incl_btw), finX + finW - 4, finY + 9.5, { align: "right" });

  // ── FOOTER ───────────────────────
  const footerY = finY + totaalBoxH + 14;

  doc.setDrawColor(...randLicht);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY, pageW - margin, footerY);

  const termijn = bedrijf?.betalingstermijn || 30;
  const email = bedrijf?.email || "info@terrevolt.nl";

  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...faint);
  doc.text("BETALINGSINSTRUCTIES", margin, footerY + 7);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...muted);

  const footerRegels = [
    `Betaling binnen ${termijn} dagen na ontvangst van uw factuur.`,
    `Stuur uw factuur naar: ${email}`,
    `Vermeld ordernummer ${order.order_nummer} op uw factuur.`,
  ];

  let footTY = footerY + 12;
  footerRegels.forEach((r) => {
    doc.text(r, margin, footTY);
    footTY += 4;
  });

  // Rechts: bankgegevens
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...faint);
  doc.text("BANKGEGEVENS TERREVOLT", rechtsX, footerY + 7);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...muted);

  let footRY = footerY + 12;
  const bankRegels: string[] = [];

  if (bNaam) bankRegels.push(bNaam);
  if (bedrijf?.iban) bankRegels.push(`IBAN: ${bedrijf.iban}`);
  if (bedrijf?.iban_naam) bankRegels.push(`T.n.v. ${bedrijf.iban_naam}`);
  if (bedrijf?.kvk_nummer) bankRegels.push(`KVK: ${bedrijf.kvk_nummer}`);

  bankRegels.forEach((r) => {
    doc.text(r, rechtsX, footRY);
    footRY += 4;
  });

  // ── ONDERSTE BALK ─────────────────
  const balkY = pageH - 10;
  doc.setFillColor(...groen);
  doc.rect(0, balkY, pageW, 10, "F");

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(255, 255, 255);
  doc.text(
    `© ${new Date().getFullYear()} ${bNaam} · Vertrouwelijk`,
    margin, balkY + 6
  );
  doc.text(
    `Ref: ${order.order_nummer} · Pagina 01`,
    pageW - margin, balkY + 6,
    { align: "right" }
  );

  doc.save(`Inkooporder_${order.order_nummer}.pdf`);
}

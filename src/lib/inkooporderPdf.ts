import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { euroDecimals as euro } from "@/lib/formatting";
import { getBedrijfsgegevens } from "@/hooks/useBedrijfsgegevens";
import terrevoltLogoPng from "@/assets/terrevolt-logo.png";

function formatIban(iban: string): string {
  return iban.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function activiteitLabel(r: any): string {
  if (r.activiteit && r.activiteit !== "") return r.activiteit;
  if (r.beschrijving && r.beschrijving !== "") return r.beschrijving;
  if (r.type && r.type !== "") {
    if (r.type === "monteren") return "Montagewerkzaamheden";
    if (r.type === "schakelen") return "Schakelwerkzaamheden";
    return r.type;
  }
  return "Elektrotechnische werkzaamheden";
}

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
  doc.text("ELEKTROTECHNIEK & INSTALLATIE", ml, ml + logoH + 4);

  // ── TITEL RECHTS ─────────────────
  doc.setFontSize(30);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...groen);
  doc.text("Inkooporder", pageW - mr, ml + 8, { align: "right" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...groenMid);
  doc.text(order.order_nummer, pageW - mr, ml + 16, { align: "right" });

  // ── STATUS BADGE ─────────────────
  const badgeTekst = "Definitief goedgekeurd voor facturatie";
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  const badgeW = doc.getTextWidth(badgeTekst) + 8;
  const badgeH = 5;
  const badgeY = ml + 18;
  const badgeX = pageW - mr - badgeW;

  doc.setFillColor(...groenMid);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(badgeTekst, badgeX + 4, badgeY + 3.5);

  // ── DATUMS RECHTS — compact ──────
  const datumStr = format(new Date(order.aangemaakt_op), "d MMMM yyyy", { locale: nl });

  const datumInfo = [
    { label: "Datum", waarde: datumStr },
    { label: "Geaccordeerd", waarde: goedkeurderNaam || bNaam },
    { label: "Datum akkoord", waarde: datumStr },
  ];

  let dY = ml + 26;
  datumInfo.forEach((r) => {
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...faint);
    doc.text(r.label + ":", pageW - mr, dY, { align: "right" });
    dY += 3.5;
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...groen);
    doc.text(r.waarde, pageW - mr, dY, { align: "right" });
    dY += 4.5;
  });

  // ── PARTIJEN — dynamische hoogte ─
  const partijY = Math.max(ml + logoH + 8, dY + 2);
  const halfW = (contentW - 4) / 2;

  const monteurNaam = prof?.bedrijfsnaam || prof?.full_name || order.medewerker_naam || "";
  const adres = prof?.factuuradres || prof?.adres || "";

  // Opdrachtnemer regels
  const otRegels: string[] = [];
  otRegels.push(monteurNaam);
  if (adres) {
    adres.split(",").map((s: string) => s.trim()).filter(Boolean).slice(0, 2).forEach((d: string) => otRegels.push(d));
  }
  if (prof?.kvk_nummer) otRegels.push(`KVK: ${prof.kvk_nummer}`);
  if (prof?.btw_nummer) otRegels.push(`BTW: ${prof.btw_nummer}`);
  if (prof?.iban) otRegels.push(`IBAN: ${formatIban(prof.iban)}`);
  if (prof?.telefoon) otRegels.push(`Tel: ${prof.telefoon}`);

  // Opdrachtgever regels
  const ogRegelsArr: string[] = [];
  ogRegelsArr.push(bNaam);
  if (bedrijf?.straat) ogRegelsArr.push(bedrijf.straat);
  const pc = [bedrijf?.postcode, bedrijf?.stad].filter(Boolean).join(" ");
  if (pc) ogRegelsArr.push(pc);
  if (bedrijf?.kvk_nummer) ogRegelsArr.push(`KVK: ${bedrijf.kvk_nummer}`);
  if (bedrijf?.btw_nummer) ogRegelsArr.push(`BTW: ${bedrijf.btw_nummer}`);
  if (bedrijf?.iban) ogRegelsArr.push(`IBAN: ${formatIban(bedrijf.iban)}`);
  if (bedrijf?.email) ogRegelsArr.push(bedrijf.email);

  // Hoogte: label (6) + naam (8) + extra regels × 4.5 + padding (14)
  const otHoogte = 6 + 8 + (otRegels.length - 1) * 4.5 + 14;
  const ogHoogte = 6 + 8 + (ogRegelsArr.length - 1) * 4.5 + 14;
  const partijH = Math.max(otHoogte, ogHoogte);

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

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...tekst);
  doc.text(monteurNaam, ml + 4, partijY + 13);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...muted);

  let lY = partijY + 19;
  // Print extra regels (skip naam, already printed)
  otRegels.slice(1).forEach((regel) => {
    if (regel.startsWith("KVK:") || regel.startsWith("BTW:") || regel.startsWith("IBAN:")) {
      doc.setTextColor(...groenMid);
    } else {
      doc.setTextColor(...muted);
    }
    doc.text(regel, ml + 4, lY);
    lY += 4.5;
  });

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

  let rY = partijY + 19;
  ogRegelsArr.slice(1).forEach((regel) => {
    if (regel.startsWith("KVK:") || regel.startsWith("BTW:") || regel.startsWith("IBAN:")) {
      doc.setTextColor(...groenMid);
    } else {
      doc.setTextColor(...muted);
    }
    doc.text(regel, rechtsBoxX + 4, rY);
    rY += 4.5;
  });

  // ── SAMENVATTINGSBALK ────────────
  const samenvatY = partijY + partijH + 5;
  const samenvatH = 12;

  doc.setFillColor(...groenTint);
  doc.roundedRect(ml, samenvatY, contentW, samenvatH, 2, 2, "F");
  doc.setDrawColor(...rand);
  doc.setLineWidth(0.2);
  doc.roundedRect(ml, samenvatY, contentW, samenvatH, 2, 2, "S");

  const samenvatItems = [
    {
      label: "PERIODE",
      waarde: format(new Date(order.periode_van + "T12:00:00"), "d MMM", { locale: nl }) +
        " – " + format(new Date(order.periode_tot + "T12:00:00"), "d MMM yyyy", { locale: nl }),
    },
    { label: "TOTAAL UREN", waarde: `${order.totaal_uren} uur` },
    {
      label: "UURTARIEF EXCL. BTW",
      waarde: regels.length > 0 ? euro(regels[0].uurtarief) : "—",
    },
    {
      label: "BETAALTERMIJN",
      waarde: `${bedrijf?.betalingstermijn || 30} dagen`,
    },
  ];

  const itemW = contentW / samenvatItems.length;
  samenvatItems.forEach((item, i) => {
    const ix = ml + i * itemW + 4;

    doc.setFontSize(6);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...muted);
    doc.text(item.label, ix, samenvatY + 5);

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...groen);
    doc.text(item.waarde, ix, samenvatY + 10);

    if (i < samenvatItems.length - 1) {
      doc.setDrawColor(...rand);
      doc.setLineWidth(0.2);
      doc.line(
        ml + (i + 1) * itemW, samenvatY + 2,
        ml + (i + 1) * itemW, samenvatY + samenvatH - 2
      );
    }
  });

  // ── TABEL ────────────────────────
  const tableY = samenvatY + samenvatH + 5;

  const tabelBody = regels.map((r) => [
    format(new Date(r.datum + "T12:00:00"), "d MMM", { locale: nl }),
    r.project_naam || "",
    activiteitLabel(r),
    String(r.uren),
    euro(Number(r.uurtarief)),
    euro(Number(r.bedrag)),
  ]);

  autoTable(doc, {
    startY: tableY,
    margin: { left: ml, right: mr },
    head: [[
      "Datum",
      "Project",
      "Werkzaamheden",
      "u",
      "Tarief excl. btw",
      "Bedrag excl. btw",
    ]],
    body: tabelBody,
    theme: "grid",
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 5, bottom: 5, left: 4, right: 4 },
      textColor: [tekst[0], tekst[1], tekst[2]] as [number, number, number],
      lineColor: [220, 232, 212] as [number, number, number],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [groen[0], groen[1], groen[2]] as [number, number, number],
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: "bold",
      fontSize: 7.5,
      cellPadding: { top: 5, bottom: 5, left: 4, right: 4 },
    },
    bodyStyles: {
      lineColor: [220, 232, 212] as [number, number, number],
      lineWidth: 0.15,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255] as [number, number, number],
    },
    columnStyles: {
      0: { cellWidth: 20, textColor: [faint[0], faint[1], faint[2]] as [number, number, number], overflow: "linebreak" as const },
      1: { cellWidth: 34, fontStyle: "bold", textColor: [groen[0], groen[1], groen[2]] as [number, number, number], overflow: "linebreak" as const },
      2: { cellWidth: "auto", overflow: "linebreak" as const },
      3: { cellWidth: 10, halign: "center" as const, fontStyle: "bold", overflow: "linebreak" as const },
      4: { cellWidth: 24, halign: "right" as const, overflow: "linebreak" as const },
      5: { cellWidth: 26, halign: "right" as const, fontStyle: "bold", textColor: [groen[0], groen[1], groen[2]] as [number, number, number], overflow: "linebreak" as const },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 180;

  // ── FINANCIEEL RECHTS ─────────────
  const balkY = pageH - 12;
  const beschikbaarVoorFinancieel = balkY - 70 - finalY;
  const finStartY = beschikbaarVoorFinancieel > 30 ? finalY + 8 : finalY + 4;

  const finW = 78;
  const finX = pageW - mr - finW;
  let finY = finStartY;

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

  // Totaal box
  const totH = 14;
  doc.setFillColor(...goudLicht);
  doc.roundedRect(finX, finY, finW, totH, 2, 2, "F");
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
  const footerY = finY + totH + 16;

  doc.setDrawColor(...rand);
  doc.setLineWidth(0.3);
  doc.line(ml, footerY, pageW - mr, footerY);

  const termijn = bedrijf?.betalingstermijn || 30;
  const email = bedrijf?.email || "info@terrevolt.nl";

  // Links: betalingsinstructies
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...muted);
  doc.text("BETALINGSINSTRUCTIES", ml, footerY + 8);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...faint);

  const instrRegels = [
    `Betaling binnen ${termijn} dagen na ontvangst van een correcte factuur.`,
    `Vermeld verplicht ordernummer ${order.order_nummer} op uw factuur.`,
    `Stuur uw factuur naar: ${email}`,
  ];

  let iY = footerY + 13;
  instrRegels.forEach((r) => {
    doc.text(r, ml, iY);
    iY += 4.5;
  });

  // Geen factuur disclaimer
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...muted);
  const geenFactuurTekst =
    "Dit document is geen factuur — gebruik het als basis voor uw eigen facturatie.";
  const geenFactuurRegels = doc.splitTextToSize(geenFactuurTekst, contentW / 2 - 4);
  doc.text(geenFactuurRegels, ml, iY + 4);

  // Rechts: factuuradministratie
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...muted);
  doc.text("FACTUURADMINISTRATIE", rechtsX, footerY + 8);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...faint);

  const adminRegels = [
    "Facturen uitsluitend onder vermelding",
    `van ordernummer ${order.order_nummer}`,
    `naar ${bedrijf?.email || "info@terrevolt.nl"}`,
    `Betaling binnen ${bedrijf?.betalingstermijn || 30} dagen na`,
    "ontvangst van een correcte factuur.",
  ];

  let aY = footerY + 13;
  adminRegels.forEach((r) => {
    doc.text(r, rechtsX, aY);
    aY += 4;
  });

  // ── ONDERSTE BALK ─────────────────
  const periodeStr =
    format(new Date(order.periode_van + "T12:00:00"), "d MMM yyyy", { locale: nl }) +
    " – " +
    format(new Date(order.periode_tot + "T12:00:00"), "d MMM yyyy", { locale: nl });

  doc.setFillColor(...groenTint);
  doc.rect(0, balkY, pageW, 12, "F");
  doc.setDrawColor(...rand);
  doc.setLineWidth(0.2);
  doc.line(0, balkY, pageW, balkY);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...muted);
  doc.text(
    `Doc: ${order.order_nummer} · Periode ${periodeStr}`,
    ml, balkY + 6
  );
  doc.text(
    "Definitief goedgekeurd voor facturatie · Pagina 01",
    pageW - mr, balkY + 6,
    { align: "right" }
  );

  doc.save(`Inkooporder_${order.order_nummer}.pdf`);
}

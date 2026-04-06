import jsPDF from 'jspdf';
import type { ContractData } from '@/types/app';
import { OVERWEGINGEN, vulArtikelen } from './contractTemplate';

export async function generateContractPdf(
  data: ContractData,
  handtekeningOg?: string,
  handtekeningOt?: string,
  naamOg?: string,
  naamOt?: string,
): Promise<{ dataUri: string; hash: string }> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 20;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - margin * 2;

  function checkPage(y: number, nodig: number = 20): number {
    if (y + nodig > pageH - 20) { doc.addPage(); return margin; }
    return y;
  }

  function renderTekst(tekst: string, y: number, fontSize = 9, bold = false, kleur: [number, number, number] = [0, 0, 0]): number {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...kleur);
    const regels = doc.splitTextToSize(tekst.trim(), contentW);
    y = checkPage(y, regels.length * 5);
    doc.text(regels, margin, y);
    return y + regels.length * 5 + 3;
  }

  // VOORBLAD
  doc.setFillColor(74, 124, 47);
  doc.rect(0, 0, pageW, 42, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('TerreVolt BV', margin, 18);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Model Overeenkomst van Opdracht', margin, 28);
  doc.setFontSize(9);
  doc.text("Voor zelfstandige opdrachtnemers (zzp'ers)", margin, 36);

  let y = 55;
  doc.setFontSize(8);
  doc.setTextColor(130, 130, 130);
  doc.text(`${data.contract_nummer}  |  Versie april 2026`, margin, y);
  y += 10;

  // PARTIJEN
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(45, 74, 30);
  doc.text('PARTIJEN', margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('1. Opdrachtgever', margin, y);
  y += 6;

  y = renderTekst(
    `${data.og_naam}, gevestigd te ${data.og_stad}, kantoorhoudende te ${data.og_adres}, ${data.og_postcode} ${data.og_stad}, ingeschreven in het Handelsregister van de Kamer van Koophandel onder nummer ${data.og_kvk}, rechtsgeldig vertegenwoordigd door ${data.og_vertegenwoordiger}, hierna te noemen: "Opdrachtgever";`,
    y
  );
  y += 4;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  y = checkPage(y);
  doc.text('2. Opdrachtnemer', margin, y);
  y += 6;

  const otNaam = data.ot_handelsnaam || data.ot_naam;
  y = renderTekst(
    `${otNaam}, gevestigd te ${data.ot_stad}, kantoorhoudende te ${data.ot_adres}, ${data.ot_postcode} ${data.ot_stad}, ingeschreven in het Handelsregister van de Kamer van Koophandel onder nummer ${data.ot_kvk}${data.ot_btw ? `, btw-identificatienummer ${data.ot_btw}` : ''}, hierna te noemen: "Opdrachtnemer".`,
    y
  );
  y += 4;

  y = renderTekst('Opdrachtgever en Opdrachtnemer worden hierna gezamenlijk aangeduid als "Partijen".', y, 9, false, [80, 80, 80]);
  y += 6;

  // OVERWEGINGEN
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(45, 74, 30);
  y = checkPage(y, 15);
  doc.text('OVERWEGINGEN', margin, y);
  y += 8;
  y = renderTekst(OVERWEGINGEN, y);
  y += 6;
  y = renderTekst('Partijen komen als volgt overeen:', y, 10, true, [45, 74, 30]);
  y += 4;

  // ARTIKELEN
  const artikelen = vulArtikelen(data);
  for (const artikel of artikelen) {
    const regels = artikel.trim().split('\n');
    const header = regels[0];
    const rest = regels.slice(1).join('\n').trim();
    y = checkPage(y, 20);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(45, 74, 30);
    doc.text(header.trim(), margin, y);
    y += 6;
    const paragrafen = rest.split('\n\n');
    for (const para of paragrafen) {
      if (!para.trim()) continue;
      y = renderTekst(para.trim(), y);
    }
    y += 4;
  }

  // BIJLAGE + ONDERTEKENING
  doc.addPage();
  y = margin;
  doc.setFillColor(235, 240, 228);
  doc.rect(0, y - 4, pageW, 14, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(45, 74, 30);
  doc.text('BIJLAGE — CONTRACTGEGEVENS', margin, y + 5);
  y += 18;

  const details: [string, string][] = [
    ['Contractnummer', data.contract_nummer],
    ['Ingangsdatum', data.startdatum],
    ['Einddatum', data.einddatum],
    ['Uurtarief', `EUR ${data.uurtarief.toFixed(2)} per uur exclusief btw`],
    ['Facturatiefrequentie', 'Wekelijks'],
    ['Betalingstermijn', '30 dagen'],
    ['Ondertekeningsplaats', data.onderteken_plaats],
  ];

  doc.setFontSize(9);
  for (const [label, waarde] of details) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text(label + ':', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    const wRegels = doc.splitTextToSize(waarde, contentW - 60);
    doc.text(wRegels, margin + 60, y);
    y += Math.max(wRegels.length * 5, 7);
  }

  y += 10;
  doc.setFillColor(235, 240, 228);
  doc.rect(0, y - 4, pageW, 14, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(45, 74, 30);
  doc.text('ONDERTEKENING', margin, y + 5);
  y += 18;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(`Aldus overeengekomen en in tweevoud ondertekend te ${data.onderteken_plaats} op ${data.onderteken_datum}.`, margin, y);
  y += 12;

  const kolW = (contentW - 10) / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Voor TerreVolt BV', margin, y);
  doc.text('Voor Opdrachtnemer', margin + kolW + 10, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(`Naam: ${naamOg || ''}`, margin, y);
  doc.text(`Naam: ${naamOt || ''}`, margin + kolW + 10, y);
  y += 5;
  doc.text(`Functie: ${data.og_functie}`, margin, y);
  doc.text(`Handelsnaam: ${data.ot_handelsnaam || data.ot_naam}`, margin + kolW + 10, y);
  y += 12;

  const htHoogte = 28;
  if (handtekeningOg) {
    try { doc.addImage(handtekeningOg, 'PNG', margin, y, kolW, htHoogte); } catch {}
  } else {
    doc.setDrawColor(200, 200, 200);
    doc.rect(margin, y, kolW, htHoogte);
  }
  if (handtekeningOt) {
    try { doc.addImage(handtekeningOt, 'PNG', margin + kolW + 10, y, kolW, htHoogte); } catch {}
  } else {
    doc.setDrawColor(200, 200, 200);
    doc.rect(margin + kolW + 10, y, kolW, htHoogte);
  }
  y += htHoogte + 6;

  doc.setDrawColor(180, 180, 180);
  doc.line(margin, y, margin + kolW, y);
  doc.line(margin + kolW + 10, y, margin + contentW, y);
  y += 10;

  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  const auditTekst = `Dit document is digitaal ondertekend via het TerreVolt platform. Contract: ${data.contract_nummer}. Gegenereerd: ${data.onderteken_datum}. Bewaar dit document voor uw administratie (wettelijke bewaarplicht 7 jaar).`;
  const aLines = doc.splitTextToSize(auditTekst, contentW);
  doc.text(aLines, margin, y);

  // Paginanummers
  const totaal = (doc.internal as any).pages.length - 1;
  for (let i = 1; i <= totaal; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text(`TerreVolt BV — Vertrouwelijk  |  Pagina ${i} van ${totaal}`, pageW / 2, pageH - 8, { align: 'center' });
  }

  const dataUri = doc.output('datauristring');
  const bytes = doc.output('arraybuffer');
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  return { dataUri, hash };
}

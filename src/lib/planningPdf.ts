import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import terrevoltLogoPng from "@/assets/terrevolt-logo.png";

interface PlanningEntry {
  id: string;
  medewerker_id: string;
  project_id: string;
  datum: string;
  starttijd: string | null;
  eindtijd: string | null;
  notitie: string | null;
  activiteit: string | null;
}

interface MedewerkerInfo {
  id: string;
  full_name: string;
}

interface ProjectInfo {
  id: string;
  naam: string;
  nummer: string;
  stad?: string | null;
}

function berekenUren(starttijd: string | null, eindtijd: string | null): number {
  const s = starttijd ? parseInt(starttijd.split(":")[0]) : 7;
  const e = eindtijd ? parseInt(eindtijd.split(":")[0]) : s + 9;
  return Math.max(0, e - s - 1);
}

export async function generatePlanningPdf(
  weekNumber: number,
  weekStart: Date,
  weekEnd: Date,
  entries: PlanningEntry[],
  medewerkers: MedewerkerInfo[],
  projects: ProjectInfo[],
  managerNaam: string
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const ml = 16;
  const mr = 16;

  const groen = [45, 74, 30] as [number, number, number];
  const groenTint = [238, 245, 232] as [number, number, number];
  const groenLicht = [245, 247, 240] as [number, number, number];
  const rand = [200, 217, 184] as [number, number, number];
  const tekst = [7, 33, 0] as [number, number, number];
  const muted = [90, 122, 66] as [number, number, number];

  doc.setFillColor(...groenLicht);
  doc.rect(0, 0, pageW, pageH, "F");

  const logoH = 10;
  const logoW = logoH * (129 / 36);
  try {
    doc.addImage(terrevoltLogoPng, "PNG", ml, ml, logoW, logoH, undefined, "FAST");
  } catch {
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...groen);
    doc.text("TerreVolt B.V.", ml, ml + 8);
  }

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...muted);
  doc.text("WEEKPLANNING", pageW - mr, ml + 4, { align: "right" });

  let y = ml + 20;
  doc.setFillColor(...groen);
  doc.rect(ml, y, pageW - ml - mr, 14, "F");
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(245, 247, 240);
  doc.text(`Week ${weekNumber} — Planning`, ml + 4, y + 9.5);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${format(weekStart, "EEE d MMM", { locale: nl })} t/m ${format(weekEnd, "EEE d MMM yyyy", { locale: nl })}`,
    pageW - mr - 4,
    y + 9.5,
    { align: "right" }
  );

  y += 20;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...muted);
  doc.text(
    `Gegenereerd door: ${managerNaam}   •   ${format(new Date(), "d MMMM yyyy HH:mm", { locale: nl })}`,
    ml,
    y
  );
  y += 8;

  const weekDates = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const weekDateStrings = weekDates.map((d) => format(d, "yyyy-MM-dd"));

  const totaalUren = entries
    .filter((e) => weekDateStrings.includes(e.datum))
    .reduce((sum, e) => sum + berekenUren(e.starttijd, e.eindtijd), 0);

  const actieveMonteurs = new Set(
    entries.filter((e) => weekDateStrings.includes(e.datum)).map((e) => e.medewerker_id)
  ).size;

  const actieveProjecten = new Set(
    entries.filter((e) => weekDateStrings.includes(e.datum)).map((e) => e.project_id)
  ).size;

  doc.setFillColor(...groenTint);
  doc.rect(ml, y, pageW - ml - mr, 10, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...groen);
  const summaryItems = [
    `${actieveMonteurs} monteurs`,
    `${actieveProjecten} klussen`,
    `${totaalUren} uur totaal`,
  ];
  const colW = (pageW - ml - mr) / 3;
  summaryItems.forEach((item, i) => {
    doc.text(item, ml + colW * i + colW / 2, y + 6.5, { align: "center" });
  });
  y += 16;

  const uniqueProjectIds = Array.from(
    new Set(
      entries.filter((e) => weekDateStrings.includes(e.datum)).map((e) => e.project_id)
    )
  );

  const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr"];

  for (const projectId of uniqueProjectIds) {
    const project = projects.find((p) => p.id === projectId);
    const projectEntries = entries.filter(
      (e) => e.project_id === projectId && weekDateStrings.includes(e.datum)
    );

    const projectTotaal = projectEntries.reduce(
      (sum, e) => sum + berekenUren(e.starttijd, e.eindtijd),
      0
    );

    if (y + 60 > pageH - 20) {
      doc.addPage();
      doc.setFillColor(...groenLicht);
      doc.rect(0, 0, pageW, pageH, "F");
      y = 20;
    }

    doc.setFillColor(...groen);
    doc.rect(ml, y, pageW - ml - mr, 10, "F");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(245, 247, 240);
    doc.text(project?.naam || "Onbekend project", ml + 4, y + 6.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const subInfo = `${project?.nummer || ""}${project?.stad ? "  •  " + project.stad : ""}`;
    if (subInfo.trim()) {
      doc.text(subInfo, ml + 4, y + 9.5);
    }
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`Totaal: ${projectTotaal}u`, pageW - mr - 4, y + 6.5, { align: "right" });

    y += 12;

    const tableRows: any[] = [];

    weekDates.forEach((date, di) => {
      const dateStr = format(date, "yyyy-MM-dd");
      const dagEntries = projectEntries.filter((e) => e.datum === dateStr);

      if (dagEntries.length === 0) return;

      dagEntries.forEach((entry, ei) => {
        const monteur = medewerkers.find((m) => m.id === entry.medewerker_id);
        const uren = berekenUren(entry.starttijd, entry.eindtijd);
        const tijden =
          entry.starttijd && entry.eindtijd
            ? `${entry.starttijd.slice(0, 5)} – ${entry.eindtijd.slice(0, 5)}`
            : "07:00 – 16:00";

        tableRows.push([
          ei === 0 ? `${DAGEN[di]} ${format(date, "d MMM", { locale: nl })}` : "",
          monteur?.full_name || "Onbekend",
          tijden,
          `${uren}u`,
        ]);
      });

      const dagTotaal = dagEntries.reduce(
        (sum, e) => sum + berekenUren(e.starttijd, e.eindtijd),
        0
      );
      tableRows.push(["", "", "Dag totaal:", `${dagTotaal}u`]);
    });

    autoTable(doc, {
      startY: y,
      head: [["Dag", "Monteur", "Tijden", "Uren"]],
      body: tableRows,
      theme: "plain",
      styles: {
        fontSize: 8,
        cellPadding: 3,
        font: "helvetica",
        textColor: tekst,
      },
      headStyles: {
        fillColor: groenTint,
        textColor: groen,
        fontStyle: "bold",
        lineColor: rand,
        lineWidth: 0.3,
      },
      bodyStyles: {
        lineColor: rand,
        lineWidth: 0.2,
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 28 },
        1: { cellWidth: 60 },
        2: { cellWidth: 35, textColor: muted },
        3: { cellWidth: 18, halign: "right", fontStyle: "bold", textColor: groen },
      },
      margin: { left: ml, right: mr },
      didParseCell: (data) => {
        if (
          data.section === "body" &&
          String(data.row.cells[2]?.raw) === "Dag totaal:"
        ) {
          data.cell.styles.textColor = muted;
          data.cell.styles.fontSize = 7;
          if (data.column.index === 3) {
            data.cell.styles.textColor = groen;
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...muted);
    doc.setDrawColor(...rand);
    doc.line(ml, pageH - 12, pageW - mr, pageH - 12, "S");
    doc.text("TerreVolt B.V. — Weekplanning", ml, pageH - 7);
    doc.text(`Pagina ${i} / ${totalPages}`, pageW - mr, pageH - 7, { align: "right" });
  }

  const filename = `TerreVolt_Planning_Week${weekNumber}_${format(weekStart, "yyyy")}.pdf`;
  doc.save(filename);
}

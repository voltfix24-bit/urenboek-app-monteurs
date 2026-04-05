import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, startOfISOWeek, addDays, getISOWeek, getISOWeekYear, addWeeks } from "date-fns";
import { nl } from "date-fns/locale";
import { BottomNav } from "@/components/BottomNav";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ReportEntry { date: string; project_number: string; description: string; hours: number; status: string; full_name: string; }

function getWeekRange(weekStart: Date) {
  return { start: format(weekStart, "yyyy-MM-dd"), end: format(addDays(weekStart, 6), "yyyy-MM-dd") };
}

export default function Rapportage() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfISOWeek(new Date()));
  const [filter, setFilter] = useState<string>("goedgekeurd");
  const [entries, setEntries] = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const weekNumber = getISOWeek(currentWeekStart);
  const weekYear = getISOWeekYear(currentWeekStart);
  const { start: startDate, end: endDate } = getWeekRange(currentWeekStart);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("time_entries").select("*").gte("date", startDate).lte("date", endDate).order("date");
    if (filter !== "alle") query = query.eq("status", filter);
    const { data: timeEntries, error } = await query;
    if (error) { toast.error("Fout bij ophalen"); setLoading(false); return; }
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name");
    const profileMap = new Map(profiles?.map((p) => [p.user_id, p.full_name]) ?? []);
    setEntries((timeEntries ?? []).map((e) => ({ date: e.date, project_number: e.project_number, description: e.description, hours: Number(e.hours), status: e.status, full_name: profileMap.get(e.user_id) || "Onbekend" })));
    setLoading(false);
  }, [startDate, endDate, filter]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const totalHours = entries.reduce((s, e) => s + e.hours, 0);
  const uniqueProjects = new Set(entries.map((e) => e.project_number)).size;
  const uniqueEmployees = new Set(entries.map((e) => e.full_name)).size;

  const perMedewerker = entries.reduce<Record<string, number>>((acc, e) => { acc[e.full_name] = (acc[e.full_name] || 0) + e.hours; return acc; }, {});
  const medewerkerStats = Object.entries(perMedewerker).sort((a, b) => b[1] - a[1]);
  const maxMedUren = Math.max(...medewerkerStats.map((m) => m[1]), 1);

  const perProject = entries.reduce<Record<string, number>>((acc, e) => { acc[e.project_number] = (acc[e.project_number] || 0) + e.hours; return acc; }, {});
  const projectStats = Object.entries(perProject).sort((a, b) => b[1] - a[1]);

  const exportCSV = () => {
    const rows = [["Datum", "Project", "Medewerker", "Omschrijving", "Uren"]];
    entries.forEach((e) => rows.push([e.date, e.project_number, e.full_name, e.description, String(e.hours)]));
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `terrevolt-uren-${startDate}-${endDate}.csv`; a.click();
    URL.revokeObjectURL(url); toast.success("CSV gedownload!");
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const margin = 16;

    // Header - now light theme
    doc.setFillColor(235, 240, 228);
    doc.rect(0, 0, pw, 36, "F");
    doc.setFillColor(74, 124, 47);
    doc.roundedRect(margin, 8, 20, 20, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text("\u26A1", margin + 6.5, 21);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(45, 74, 30);
    doc.text("TerreVolt", margin + 24, 17);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(138, 173, 110);
    doc.text("Urenrapportage", margin + 24, 23);

    doc.setFontSize(10);
    doc.setTextColor(90, 122, 66);
    doc.text(`Week ${weekNumber} \u2022 ${format(currentWeekStart, "d MMM", { locale: nl })} \u2013 ${format(addDays(currentWeekStart, 6), "d MMM yyyy", { locale: nl })}`, pw - margin, 17, { align: "right" });
    doc.text(`Filter: ${filter === "alle" ? "Alle uren" : filter}`, pw - margin, 23, { align: "right" });

    let y = 44;
    const boxW = (pw - margin * 2 - 8) / 3;
    const kpis = [
      { label: "Totaal uren", value: totalHours + "u", color: [45, 122, 58] },
      { label: "Projecten", value: String(uniqueProjects), color: [45, 90, 138] },
      { label: "Monteurs", value: String(uniqueEmployees), color: [139, 105, 20] },
    ];
    kpis.forEach((k, i) => {
      const x = margin + i * (boxW + 4);
      doc.setFillColor(223, 232, 214);
      doc.roundedRect(x, y, boxW, 22, 3, 3, "F");
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(k.color[0], k.color[1], k.color[2]);
      doc.text(k.value, x + boxW / 2, y + 12, { align: "center" });
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(138, 173, 110);
      doc.text(k.label, x + boxW / 2, y + 19, { align: "center" });
    });
    y += 30;

    if (medewerkerStats.length > 0) {
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(138, 173, 110);
      doc.text("PER MONTEUR", margin, y); y += 6;
      const maxUren = Math.max(...medewerkerStats.map(m => m[1]), 1);
      medewerkerStats.forEach(([naam, uren]) => {
        doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(45, 74, 30);
        doc.text(naam, margin, y);
        doc.setFont("helvetica", "bold"); doc.setTextColor(74, 124, 47);
        doc.text(uren + "u", pw - margin, y, { align: "right" });
        y += 3;
        const barW = pw - margin * 2 - 40;
        doc.setFillColor(197, 212, 178);
        doc.roundedRect(margin, y, barW, 3, 1.5, 1.5, "F");
        const fillW = (uren / maxUren) * barW;
        doc.setFillColor(74, 124, 47);
        doc.roundedRect(margin, y, Math.max(fillW, 2), 3, 1.5, 1.5, "F");
        y += 8;
      });
      y += 4;
    }

    if (projectStats.length > 0) {
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(138, 173, 110);
      doc.text("PER PROJECT", margin, y); y += 6;
      projectStats.forEach(([project, uren]) => {
        doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(45, 74, 30);
        doc.text(project, margin, y);
        doc.setFont("helvetica", "bold"); doc.setTextColor(74, 124, 47);
        doc.text(uren + "u", pw - margin, y, { align: "right" });
        y += 6;
      });
      y += 6;
    }

    if (entries.length > 0) {
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(138, 173, 110);
      doc.text("DETAIL OVERZICHT", margin, y); y += 4;
      autoTable(doc, {
        startY: y, margin: { left: margin, right: margin },
        head: [["Datum", "Project", "Medewerker", "Omschrijving", "Uren"]],
        body: entries.map(e => [format(new Date(e.date), "EEE d/M", { locale: nl }), e.project_number, e.full_name, e.description || "\u2013", e.hours + "u"]),
        styles: { fontSize: 8, cellPadding: 3, textColor: [45, 74, 30], fillColor: [245, 247, 240], lineColor: [197, 212, 178], lineWidth: 0.2 },
        headStyles: { fillColor: [223, 232, 214], textColor: [74, 124, 47], fontStyle: "bold", fontSize: 8 },
        alternateRowStyles: { fillColor: [235, 240, 228] },
      });
    }

    const footerY = ph - 10;
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(138, 173, 110);
    doc.text(`TerreVolt BV \u2022 Gegenereerd op ${format(new Date(), "d MMMM yyyy 'om' HH:mm", { locale: nl })}`, margin, footerY);
    doc.text("Pagina 1", pw - margin, footerY, { align: "right" });
    doc.save(`terrevolt-week${weekNumber}-${weekYear}.pdf`);
    toast.success("PDF gedownload!");
  };

  if (!isManager) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "#F5F7F0" }}><p style={{ color: "#8AAD6E" }}>Alleen managers hebben toegang.</p></div>;
  }

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "#F5F7F0", maxWidth: 430, margin: "0 auto", paddingBottom: 80 }}>
      <header className="sticky top-0 z-30" style={{ background: "rgba(235,240,228,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid #C5D4B2" }}>
        <div className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <HeaderLogo />
            <span className="text-base font-bold tracking-tight" style={{ color: "#2D4A1E" }}>Rapportage</span>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentWeekStart((p) => addWeeks(p, -1))} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#DFE8D6", color: "#5A7A42" }}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <p className="text-lg font-extrabold" style={{ color: "#2D4A1E" }}>Week {weekNumber}</p>
              <p className="text-[11px]" style={{ color: "#8AAD6E" }}>
                {format(currentWeekStart, "d MMM", { locale: nl })} – {format(addDays(currentWeekStart, 6), "d MMM yyyy", { locale: nl })}
              </p>
            </div>
            <button onClick={() => setCurrentWeekStart((p) => addWeeks(p, 1))} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#DFE8D6", color: "#5A7A42" }}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button onClick={() => setCurrentWeekStart(startOfISOWeek(new Date()))} className="w-full py-1.5 rounded-xl text-[11px] font-semibold transition-colors" style={{ background: "#F5F7F0", border: "1px solid #C5D4B2", color: "#5A7A42" }}>
            Deze week
          </button>

          <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {([["goedgekeurd", "Goedgekeurd"], ["ingediend", "Ingediend"], ["alle", "Alle uren"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className="shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-colors" style={{
                background: filter === k ? "#D4E8C2" : "#F5F7F0",
                border: filter === k ? "1px solid #9DC87A" : "1px solid #C5D4B2",
                color: filter === k ? "#4A7C2F" : "#8AAD6E",
              }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          {[
            { label: "Uren", value: totalHours + "u", icon: "⏱", color: "#2D7A3A" },
            { label: "Projecten", value: String(uniqueProjects), icon: "📁", color: "#2D5A8A" },
            { label: "Monteurs", value: String(uniqueEmployees), icon: "👷", color: "#D4A017" },
          ].map((k, i) => (
            <div key={i} className="flex-1 rounded-2xl p-3 text-center" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
              <p className="text-lg mb-0.5">{k.icon}</p>
              <p className="text-xl font-extrabold" style={{ color: k.color }}>{k.value}</p>
              <p className="text-[10px] font-medium mt-0.5" style={{ color: "#8AAD6E" }}>{k.label}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-10">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "#4A7C2F", borderTopColor: "transparent" }} />
            <p className="text-xs mt-3" style={{ color: "#8AAD6E" }}>Laden...</p>
          </div>
        ) : (
          <>
            {medewerkerStats.length > 0 && (
              <div className="rounded-2xl p-4 space-y-3" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#8AAD6E" }}>Per monteur</p>
                {medewerkerStats.map(([naam, uren]) => (
                  <div key={naam} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: "#2D4A1E" }}>{naam}</span>
                      <span className="text-xs font-bold tabular-nums" style={{ color: "#4A7C2F" }}>{uren}u</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "#DFE8D6" }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(uren / maxMedUren) * 100}%`, background: "linear-gradient(90deg, #4A7C2F, #6B9E4A)" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {projectStats.length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#8AAD6E" }}>Per project</p>
                {projectStats.map(([project, uren]) => (
                  <div key={project} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #DFE8D6" }}>
                    <span className="text-sm font-medium" style={{ color: "#2D4A1E" }}>{project}</span>
                    <span className="text-xs font-bold tabular-nums" style={{ color: "#4A7C2F" }}>{uren}u</span>
                  </div>
                ))}
              </div>
            )}

            {entries.length === 0 && (
              <div className="text-center py-10 rounded-2xl" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2" }}>
                <p className="text-3xl mb-2">📊</p>
                <p className="text-sm font-medium" style={{ color: "#2D4A1E" }}>Geen data gevonden</p>
                <p className="text-xs mt-1" style={{ color: "#8AAD6E" }}>Geen uren in deze periode</p>
              </div>
            )}

            {entries.length > 0 && (
              <div className="flex gap-2">
                <button onClick={exportPDF} className="flex-1 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-colors active:scale-[0.98]" style={{ background: "#D4E8C2", border: "1px solid #9DC87A", color: "#4A7C2F" }}>
                  <FileText className="h-4 w-4" /> PDF
                </button>
                <button onClick={exportCSV} className="flex-1 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-colors active:scale-[0.98]" style={{ background: "#EBF0E4", border: "1px solid #C5D4B2", color: "#5A7A42" }}>
                  <Download className="h-4 w-4" /> CSV
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

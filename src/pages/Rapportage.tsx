import { useState, useEffect, useCallback } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { HeaderLogo } from "@/components/HeaderLogo";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { query } from "@/lib/supabaseHelpers";
import { Download, ChevronLeft, ChevronRight, FileText, Clock, FolderOpen, Users, BarChart3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, startOfISOWeek, addDays, getISOWeek, getISOWeekYear, addWeeks } from "date-fns";
import { nl } from "date-fns/locale";
import { BottomNav } from "@/components/BottomNav";
import { PageShell } from "@/components/PageShell";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ReportEntry { datum: string; project_nummer: string; project_naam: string; beschrijving: string; uren: number; status: string; full_name: string; }

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
    let q = supabase.from("uren_boekingen").select("*").gte("datum", startDate).lte("datum", endDate).order("datum");
    if (filter !== "alle") q = q.eq("status", filter);
    const boekingen = await query(q);
    if (!boekingen) { setLoading(false); return; }

    const medIds = [...new Set(boekingen.map((b: any) => b.medewerker_id))];
    const projIds = [...new Set(boekingen.map((b: any) => b.project_id))];
    const [profiles, projects] = await Promise.all([
      medIds.length > 0 ? query(supabase.from("profiles").select("id, full_name").in("id", medIds)) : [],
      projIds.length > 0 ? query(supabase.from("projects").select("id, naam, nummer").in("id", projIds)) : [],
    ]);
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));
    const projMap = new Map((projects ?? []).map((p: any) => [p.id, p]));

    setEntries(boekingen.map((e: any) => {
      const proj = projMap.get(e.project_id) || { naam: "Onbekend", nummer: "" };
      return {
        datum: e.datum, project_nummer: proj.nummer, project_naam: proj.naam,
        beschrijving: e.beschrijving || e.type || "", uren: Number(e.uren),
        status: e.status, full_name: profileMap.get(e.medewerker_id) || "Onbekend",
      };
    }));
    setLoading(false);
  }, [startDate, endDate, filter]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const totalHours = entries.reduce((s, e) => s + e.uren, 0);
  const uniqueProjects = new Set(entries.map((e) => e.project_nummer)).size;
  const uniqueEmployees = new Set(entries.map((e) => e.full_name)).size;

  const perMedewerker = entries.reduce<Record<string, number>>((acc, e) => { acc[e.full_name] = (acc[e.full_name] || 0) + e.uren; return acc; }, {});
  const medewerkerStats = Object.entries(perMedewerker).sort((a, b) => b[1] - a[1]);
  const maxMedUren = Math.max(...medewerkerStats.map((m) => m[1]), 1);

  const perProject = entries.reduce<Record<string, number>>((acc, e) => { acc[e.project_nummer || e.project_naam] = (acc[e.project_nummer || e.project_naam] || 0) + e.uren; return acc; }, {});
  const projectStats = Object.entries(perProject).sort((a, b) => b[1] - a[1]);

  const exportCSV = () => {
    const rows = [["Datum", "Project", "Medewerker", "Omschrijving", "Uren", "Status"]];
    entries.forEach((e) => rows.push([e.datum, e.project_nummer, e.full_name, e.beschrijving, String(e.uren), e.status]));
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
        body: entries.map(e => [format(new Date(e.datum), "EEE d/M", { locale: nl }), e.project_nummer, e.full_name, e.beschrijving || "\u2013", e.uren + "u"]),
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
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-navy)" }}><p style={{ color: "#a0abc3" }}>Alleen managers hebben toegang.</p></div>;
  }

  return (
    <PageShell>
      <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, rgba(10,26,48,0.7) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(106,118,140,0.15)" }}>
        <div className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            <HeaderLogo />
            <span className="text-base font-bold tracking-tight" style={{ color: "#dae6ff" }}>Rapportage</span>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentWeekStart((p) => addWeeks(p, -1))} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#102038", color: "#a0abc3" }}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <p className="text-lg font-extrabold" style={{ color: "#dae6ff" }}>Week {weekNumber}</p>
              <p className="text-[11px]" style={{ color: "#a0abc3" }}>
                {format(currentWeekStart, "d MMM", { locale: nl })} – {format(addDays(currentWeekStart, 6), "d MMM yyyy", { locale: nl })}
              </p>
            </div>
            <button onClick={() => setCurrentWeekStart((p) => addWeeks(p, 1))} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#102038", color: "#a0abc3" }}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button onClick={() => setCurrentWeekStart(startOfISOWeek(new Date()))} className="w-full py-1.5 rounded-xl text-[11px] font-semibold transition-colors" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>
            Deze week
          </button>

          <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {([["goedgekeurd", "Goedgekeurd"], ["ingediend", "Ingediend"], ["alle", "Alle uren"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className="shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-colors" style={{
                background: filter === k ? "rgba(63,255,139,0.1)" : "var(--app-navy)",
                border: filter === k ? "1px solid rgba(63,255,139,0.3)" : "1px solid rgba(106,118,140,0.15)",
                color: filter === k ? "#3fff8b" : "#a0abc3",
              }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          {[
            { label: "Uren", value: totalHours + "u", Icon: Clock, color: "#3fff8b" },
            { label: "Projecten", value: String(uniqueProjects), Icon: FolderOpen, color: "#6e9bff" },
            { label: "Monteurs", value: String(uniqueEmployees), Icon: Users, color: "#feb300" },
          ].map((k, i) => (
            <div key={i} className="flex-1 rounded-2xl p-3 text-center" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
              <k.Icon className="h-5 w-5 mx-auto mb-1" style={{ color: k.color }} />
              <p className="text-xl font-extrabold" style={{ color: k.color }}>{k.value}</p>
              <p className="text-[10px] font-medium mt-0.5" style={{ color: "#a0abc3" }}>{k.label}</p>
            </div>
          ))}
        </div>

        {loading ? (
          <Spinner />
        ) : (
          <>
            {medewerkerStats.length > 0 && (
              <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Per monteur</p>
                {medewerkerStats.map(([naam, uren]) => (
                  <div key={naam} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: "#dae6ff" }}>{naam}</span>
                      <span className="text-xs font-bold tabular-nums" style={{ color: "#3fff8b" }}>{uren}u</span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "#102038" }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(uren / maxMedUren) * 100}%`, background: "linear-gradient(90deg, #3fff8b, #22c55e)" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {projectStats.length > 0 && (
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#a0abc3" }}>Per project</p>
                {projectStats.map(([project, uren]) => (
                  <div key={project} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #102038" }}>
                    <span className="text-sm font-medium" style={{ color: "#dae6ff" }}>{project}</span>
                    <span className="text-xs font-bold tabular-nums" style={{ color: "#3fff8b" }}>{uren}u</span>
                  </div>
                ))}
              </div>
            )}

            {entries.length === 0 && (
              <div className="text-center py-10 rounded-2xl" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
                <BarChart3 className="h-8 w-8 mx-auto mb-2" style={{ color: "#a0abc3" }} />
                <p className="text-sm font-medium" style={{ color: "#dae6ff" }}>Geen data gevonden</p>
                <p className="text-xs mt-1" style={{ color: "#a0abc3" }}>Geen uren in deze periode</p>
              </div>
            )}

            {entries.length > 0 && (
              <div className="flex gap-2">
                <button onClick={exportPDF} className="flex-1 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-colors active:scale-[0.98]" style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)", color: "#3fff8b" }}>
                  <FileText className="h-4 w-4" /> PDF
                </button>
                <button onClick={exportCSV} className="flex-1 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-colors active:scale-[0.98]" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>
                  <Download className="h-4 w-4" /> CSV
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </PageShell>
  );
}

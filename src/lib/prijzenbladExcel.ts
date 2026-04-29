import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Genereert een Prijzenblad Excel op basis van de vaste TerreVolt-template.
 * Vult alleen de aantallen (kolom F) in per bestekcode (kolom A) en zet de
 * totaalsom onderin. Rest van de opmaak/inhoud blijft exact gelijk aan template.
 */
export async function generatePrijzenbladExcel(projectId: string) {
  try {
    // 1. Project + forecast-regels ophalen
    const { data: project } = await supabase
      .from("projects")
      .select("nummer, naam")
      .eq("id", projectId)
      .single();

    const { data: fc } = await supabase
      .from("project_forecast")
      .select("id, methode")
      .eq("project_id", projectId)
      .maybeSingle();

    if (!fc) {
      toast.error("Geen forecast gevonden voor dit project");
      return;
    }

    const { data: regels } = await supabase
      .from("forecast_regels")
      .select("spec_code, aantal")
      .eq("forecast_id", fc.id);

    if (!regels || regels.length === 0) {
      toast.error("Geen regels in de forecast");
      return;
    }

    // Map: spec_code → aantal (sommatie als zelfde code meerdere keren voorkomt)
    const aantalMap = new Map<string, number>();
    for (const r of regels) {
      if (!r.spec_code) continue;
      const cur = aantalMap.get(r.spec_code) ?? 0;
      aantalMap.set(r.spec_code, cur + Number(r.aantal ?? 0));
    }

    // 2. Template ophalen
    const res = await fetch("/templates/prijzenblad-template.xlsx");
    if (!res.ok) {
      toast.error("Kon Excel-template niet laden");
      return;
    }
    const buf = await res.arrayBuffer();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("Blad1") ?? wb.worksheets[0];
    if (!ws) {
      toast.error("Template heeft geen werkblad");
      return;
    }

    // 3. Per rij: als kolom A een spec-code is en we hebben een aantal → invullen in F
    const codeRows: number[] = [];
    let totaalRow: number | null = null;
    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      const aRaw = row.getCell(1).value;
      const a = aRaw == null ? "" : String(aRaw).trim();
      const bRaw = row.getCell(2).value;
      const b = bRaw == null ? "" : String(bRaw).trim().toLowerCase();
      if (/^R\d{6}$/.test(a)) {
        codeRows.push(rowNum);
        const aantal = aantalMap.get(a);
        if (aantal && aantal > 0) {
          row.getCell(6).value = aantal; // kolom F
        }
      }
      if (b === "totaal") {
        totaalRow = rowNum;
      }
    });

    // 4. Totaal-formule = SOM(prijs * aantal) over alle code-rijen
    if (codeRows.length > 0) {
      const minR = Math.min(...codeRows);
      const maxR = Math.max(...codeRows);
      const totalFormula = `SUMPRODUCT(E${minR}:E${maxR},F${minR}:F${maxR})`;
      const targetRow = totaalRow ?? maxR + 2;
      // Plaats het bedrag rechts van de "Totaal"-tekst (kolom D, E of F — zoek eerste lege)
      const totaalCell = ws.getCell(targetRow, 5); // kolom E
      totaalCell.value = { formula: totalFormula } as ExcelJS.CellFormulaValue;
      totaalCell.numFmt = '"€"\\ #,##0.00';
      totaalCell.font = { bold: true };
      // Label vetgedrukt
      const labelCell = ws.getCell(targetRow, 2);
      if (labelCell.value) {
        labelCell.font = { ...(labelCell.font || {}), bold: true };
      }
    }

    // 5. Download
    const out = await wb.xlsx.writeBuffer();
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = (s: string) =>
      s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
    const nr = safe(project?.nummer ?? "project");
    const naam = safe(project?.naam ?? "");
    a.download = naam
      ? `Prijzenblad-${nr}-${naam}.xlsx`
      : `Prijzenblad-${nr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("Prijzenblad Excel gedownload ✓");
  } catch (err) {
    console.error("[prijzenbladExcel]", err);
    toast.error("Kon prijzenblad niet genereren");
  }
}

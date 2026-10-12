import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { loadSpecCodes, TarievenNietBeschikbaarError } from "@/lib/specCodes";

/** Herkent uitsluitend de defecte template-rij (kolom A = 3) voor R410010. */
export function isDefecteMsMofRij(omschrijving: string): boolean {
  return omschrijving.trim() === "Monteren MS mof (verbindings-, eind- of overgangsmof).";
}

/**
 * Actieve tarieven uit de manager-only database-tabel, afgerond op centen.
 * Gooit TarievenNietBeschikbaarError bij netwerkfout of geen toegang —
 * er is bewust GEEN fallback naar vaste bedragen.
 */
export async function loadTariefMap(client: any = supabase): Promise<Map<string, number>> {
  const codes = await loadSpecCodes(client);
  const map = new Map<string, number>();
  for (const c of codes) {
    const t = Number(c.tarief);
    if (Number.isFinite(t)) map.set(c.code, Math.round(t * 100) / 100);
  }
  if (map.size === 0) throw new TarievenNietBeschikbaarError();
  return map;
}

/**
 * Vult een (prijsloos) prijzenblad-werkblad: kolom E = tarief uit DB,
 * kolom F = aantal, totaal = SUMPRODUCT(E,F). Geeft codes terug die een
 * aantal hebben maar geen tarief (de export moet dan stoppen).
 */
export function vulPrijzenblad(
  ws: ExcelJS.Worksheet,
  tariefMap: Map<string, number>,
  aantalMap: Map<string, number>,
): { ontbrekend: string[] } {
  const codeRows: number[] = [];
  const ontbrekend: string[] = [];
  let totaalRow: number | null = null;
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    const aRaw = row.getCell(1).value;
    let a = aRaw == null ? "" : String(aRaw).trim();
    const bRaw = row.getCell(2).value;
    const bOrig = bRaw == null ? "" : String(bRaw).trim();
    const b = bOrig.toLowerCase();
    if (a === "3" && isDefecteMsMofRij(bOrig)) {
      a = "R410010";
      row.getCell(1).value = a;
    }
    if (/^R\d{6}$/.test(a)) {
      codeRows.push(rowNum);
      const prijs = tariefMap.get(a);
      const aantal = aantalMap.get(a);
      row.getCell(5).value = prijs !== undefined ? Math.round(prijs * 100) / 100 : null; // kolom E
      if (aantal && aantal > 0) {
        row.getCell(6).value = aantal; // kolom F
        if (prijs === undefined) ontbrekend.push(a);
      }
    }
    if (b === "totaal") totaalRow = rowNum;
  });

  if (codeRows.length > 0) {
    const minR = Math.min(...codeRows);
    const maxR = Math.max(...codeRows);
    const targetRow = totaalRow ?? maxR + 2;
    const totaalCell = ws.getCell(targetRow, 5);
    totaalCell.value = { formula: `SUMPRODUCT(E${minR}:E${maxR},F${minR}:F${maxR})` } as ExcelJS.CellFormulaValue;
    totaalCell.numFmt = '"€"\\ #,##0.00';
    totaalCell.font = { bold: true };
    const labelCell = ws.getCell(targetRow, 2);
    if (labelCell.value) labelCell.font = { ...(labelCell.font || {}), bold: true };
  }
  return { ontbrekend };
}

/**
 * Genereert een Prijzenblad Excel. De publieke template bevat geen prijzen;
 * tarieven worden alleen na geautoriseerde (manager) ophaal ingevuld.
 */
export async function generatePrijzenbladExcel(projectId: string) {
  try {
    // 1. Tarieven eerst: zonder geautoriseerde prijzen geen export.
    let tariefMap: Map<string, number>;
    try {
      tariefMap = await loadTariefMap();
    } catch (err) {
      console.error("[prijzenbladExcel] tarieven", err);
      toast.error("Prijzenblad niet gemaakt: tarieven konden niet veilig worden opgehaald (alleen managers, controleer verbinding).");
      return;
    }

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
    if (!fc) { toast.error("Geen forecast gevonden voor dit project"); return; }

    const { data: regels } = await supabase
      .from("forecast_regels")
      .select("spec_code, aantal")
      .eq("forecast_id", fc.id);
    if (!regels || regels.length === 0) { toast.error("Geen regels in de forecast"); return; }

    const aantalMap = new Map<string, number>();
    for (const r of regels) {
      if (!r.spec_code) continue;
      aantalMap.set(r.spec_code, (aantalMap.get(r.spec_code) ?? 0) + Number(r.aantal ?? 0));
    }

    // 2. Template (zonder prijzen)
    const res = await fetch("/templates/prijzenblad-template.xlsx");
    if (!res.ok) { toast.error("Kon Excel-template niet laden"); return; }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());
    const ws = wb.getWorksheet("Blad1") ?? wb.worksheets[0];
    if (!ws) { toast.error("Template heeft geen werkblad"); return; }

    // 3. Vullen
    const { ontbrekend } = vulPrijzenblad(ws, tariefMap, aantalMap);
    if (ontbrekend.length > 0) {
      toast.error(`Prijzenblad niet gemaakt: geen actief tarief voor ${ontbrekend.join(", ")}`);
      return;
    }

    // 4. Download
    const out = await wb.xlsx.writeBuffer();
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
    const nr = safe(project?.nummer ?? "project");
    const naam = safe(project?.naam ?? "");
    a.download = naam ? `Prijzenblad-${nr}-${naam}.xlsx` : `Prijzenblad-${nr}.xlsx`;
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

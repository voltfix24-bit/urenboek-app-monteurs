import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * Bewaakt UTF-8 hygiëne: faalt zodra brondbestanden mojibake of
 * replacement-tekens bevatten. Veelvoorkomende oorzaken:
 *  - bestand opgeslagen als cp1252 i.p.v. utf-8
 *  - utf-8 bytes per ongeluk dubbel-gedecodeerd (â€, Ã©, Â·, â‚¬, ðŸ…)
 *  - kapotte tekens worden weergegeven als U+FFFD ("�")
 */
const SUSPECT = /\uFFFD|Â|Ã[\u0080-\u00BF]|â€|â†|â‚¬|ðŸ/;

const ROOTS = ["src", "supabase/functions"];
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".html", ".css"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".next", "coverage"]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.has(extname(name))) out.push(p);
  }
  return out;
}

describe("source encoding", () => {
  const files = ROOTS.flatMap((r) => walk(r));

  it("bevat geen mojibake of replacement-tekens", () => {
    const offenders: string[] = [];
    for (const f of files) {
      // Lees als binary om ongeldige UTF-8 te detecteren.
      const buf = readFileSync(f);
      // Vlag ongeldige UTF-8 bytes (Node decodeert die als U+FFFD).
      const text = buf.toString("utf8");
      const lines = text.split(/\r?\n/);
      lines.forEach((line, i) => {
        if (SUSPECT.test(line)) {
          offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 120)}`);
        }
      });
    }
    if (offenders.length > 0) {
      throw new Error(
        "Mojibake / replacement-tekens gevonden. Sla het bestand op als UTF-8 en gebruik · — – … € i.p.v. losse vervangtekens.\n" +
          offenders.slice(0, 30).join("\n"),
      );
    }
    expect(offenders).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";

/**
 * Bewaakt UTF-8 hygiene: faalt zodra bronbestanden mojibake of
 * replacement-tekens bevatten. Veelvoorkomende oorzaken:
 *  - bestand opgeslagen als cp1252 i.p.v. utf-8
 *  - utf-8 bytes per ongeluk dubbel-gedecodeerd
 *  - kapotte tekens weergegeven als U+FFFD
 *
 * Alle patronen staan als \uXXXX zodat dit bestand zichzelf niet triggert.
 */
const SUSPECT = new RegExp(
  [
    "\\uFFFD",           // replacement char
    "\\u00C2",           // standalone A-circumflex (Â)
    "\\u00C3[\\u0080-\\u00BF]", // Ã + UTF-8 continuation byte
    "\\u00E2\\u20AC",    // â€  (Windows-1252 mojibake voor U+201x)
    "\\u00E2\\u2020",    // â†  (pijl-mojibake)
    "\\u00E2\\u201A\\u00AC", // â‚¬ (euro mojibake)
    "\\uD83D\\uDC1F",    // ðŸ-stijl high surrogate (placeholder)
  ].join("|"),
);

const ROOTS = ["src", "supabase/functions"];
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".html", ".css"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".next", "coverage"]);
const SELF = resolve(__filename);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.has(extname(name)) && resolve(p) !== SELF) out.push(p);
  }
  return out;
}

describe("source encoding", () => {
  const files = ROOTS.flatMap((r) => walk(r));

  it("bevat geen mojibake of replacement-tekens", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f).toString("utf8");
      text.split(/\r?\n/).forEach((line, i) => {
        if (SUSPECT.test(line)) {
          offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 120)}`);
        }
      });
    }
    if (offenders.length > 0) {
      throw new Error(
        "Mojibake / replacement-tekens gevonden. Sla het bestand op als UTF-8 en gebruik nette interpunctie.\n" +
          offenders.slice(0, 30).join("\n"),
      );
    }
    expect(offenders).toEqual([]);
  });
});

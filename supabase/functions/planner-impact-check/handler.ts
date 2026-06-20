// Pure handler-factory voor planner-impact-check.
// Read-only: doet uitsluitend SELECT via RPC planner_impact_check_v1.
// Geen writes, geen persoonsgegevens in respons.

export type ImpactStatus =
  | "niet_gesynced"
  | "gesynced_geen_uren"
  | "uren_geregistreerd"
  | "onbekend";

export type StatusUren =
  | "geen"
  | "concept"
  | "ingediend"
  | "goedgekeurd"
  | "afgekeurd"
  | "gemengd";

export interface ImpactResult {
  external_id: string;
  status: ImpactStatus;
  uren_totaal: number;
  status_uren: StatusUren;
  laatste_boeking_at: string | null;
}

export interface RpcRow {
  external_id: string;
  has_planning: boolean;
  uren_totaal: number | string | null;
  statussen: string[] | null;
  laatste_boeking_at: string | null;
}

export interface Deps {
  env: (k: string) => string | undefined;
  rpc: (ids: string[]) => Promise<{ data: RpcRow[] | null; error: { message: string } | null }>;
  checkRateLimit: (key: string) => Promise<boolean>;
  corsHeaders: Record<string, string>;
  clientIp: (req: Request) => string;
}

const ID_REGEX = /^[^:\s]+:[^:\s]+$/;
const MAX_IDS = 500;

export function classifyStatusUren(statussen: string[]): StatusUren {
  const allowed = new Set(["concept", "ingediend", "goedgekeurd", "afgekeurd"]);
  const seen = Array.from(new Set(statussen.filter((s) => allowed.has(s))));
  if (seen.length === 0) return "geen";
  if (seen.length === 1) return seen[0] as StatusUren;
  return "gemengd";
}

export function classifyStatus(hasPlanning: boolean, uren: number): ImpactStatus {
  if (!hasPlanning) return "niet_gesynced";
  return uren > 0 ? "uren_geregistreerd" : "gesynced_geen_uren";
}

/** Constant-time vergelijking van twee strings. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Vergelijk toch met dummy om timing minimal te houden.
    let diff = 1;
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function dedupePreserveOrder(arr: unknown[]): { ordered: string[]; valid: Set<string> } {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const valid = new Set<string>();
  for (const v of arr) {
    if (typeof v !== "string") continue;
    if (v.length === 0 || v.length > 200) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    ordered.push(v);
    if (ID_REGEX.test(v)) valid.add(v);
  }
  return { ordered, valid };
}

export function createHandler(deps: Deps) {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...deps.corsHeaders, "content-type": "application/json" },
    });
  const genericError = (status: number) => json(status, { error: "Verzoek geweigerd" });

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: deps.corsHeaders });
    if (req.method !== "POST") return genericError(405);

    const expected = deps.env("URENAPP_SYNC_SECRET");
    if (!expected) return json(500, { error: "Interne fout" });

    const provided =
      req.headers.get("x-urenapp-secret") ??
      (req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");

    if (!provided || !safeEqual(provided, expected)) return genericError(401);

    // Rate-limit op secret-hash + IP
    const ip = deps.clientIp(req) || "unknown";
    const secretHash = (await sha256Hex(expected)).slice(0, 16);
    const rateKey = `planner-impact:${secretHash}:${ip}`;
    const allowed = await deps.checkRateLimit(rateKey);
    if (!allowed) return json(429, { error: "Te veel verzoeken" });

    let body: any;
    try { body = await req.json(); } catch { return genericError(400); }
    if (!body || typeof body !== "object" || !Array.isArray(body.external_ids)) {
      return genericError(400);
    }
    if (body.external_ids.length === 0) return genericError(400);
    if (body.external_ids.length > MAX_IDS) return genericError(413);

    const { ordered, valid } = dedupePreserveOrder(body.external_ids);
    if (ordered.length === 0) return genericError(400);

    const validIds = Array.from(valid);
    const rpcRows: RpcRow[] = [];
    if (validIds.length > 0) {
      const { data, error } = await deps.rpc(validIds);
      if (error) return json(500, { error: "Interne fout" });
      for (const r of data ?? []) rpcRows.push(r);
    }
    const byId = new Map<string, RpcRow>();
    for (const r of rpcRows) byId.set(r.external_id, r);

    const results: ImpactResult[] = ordered.map((id) => {
      if (!valid.has(id)) {
        return { external_id: id, status: "onbekend", uren_totaal: 0, status_uren: "geen", laatste_boeking_at: null };
      }
      const row = byId.get(id);
      if (!row) {
        return { external_id: id, status: "niet_gesynced", uren_totaal: 0, status_uren: "geen", laatste_boeking_at: null };
      }
      const uren = Number(row.uren_totaal ?? 0);
      const statussen = Array.isArray(row.statussen) ? row.statussen : [];
      return {
        external_id: id,
        status: classifyStatus(!!row.has_planning, uren),
        uren_totaal: uren,
        status_uren: classifyStatusUren(statussen),
        laatste_boeking_at: row.laatste_boeking_at,
      };
    });

    return json(200, { results });
  };
}

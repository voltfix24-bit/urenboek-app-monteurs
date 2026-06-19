import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCcw, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, XCircle, History } from "lucide-react";

interface AuditRow {
  id: string;
  created_at: string;
  manager_user_id: string;
  manager_naam: string | null;
  external_id: string;
  datum: string;
  planning_id: string | null;
  uitkomst: string;
  fout_reden: string | null;
  project_nummer: string | null;
  project_naam: string | null;
  monteur_naam: string | null;
}

type ActieType = "import" | "update" | "verwijdering" | "markering_verwijderd" | "sync";
type Status = "geslaagd" | "deels" | "mislukt";

interface Bucket {
  key: string;
  ts: string;
  manager_naam: string | null;
  manager_user_id: string;
  type: ActieType;
  status: Status;
  tellers: {
    aangemaakt: number;
    bijgewerkt: number;
    verwijderd: number;
    gemarkeerd: number;
    overgeslagen: number;
    geweigerd: number;
    fout: number;
  };
  rows: AuditRow[];
}

const ACTIE_LABEL: Record<ActieType, string> = {
  import: "Import",
  update: "Update",
  verwijdering: "Verwijdering",
  markering_verwijderd: "Markering verwijderd",
  sync: "Sync",
};
const ACTIE_COLOR: Record<ActieType, { bg: string; fg: string }> = {
  import: { bg: "var(--accent)", fg: "white" },
  update: { bg: "var(--warn-light)", fg: "var(--warn-text)" },
  verwijdering: { bg: "#fee2e2", fg: "#b91c1c" },
  markering_verwijderd: { bg: "#fef3c7", fg: "#92400e" },
  sync: { bg: "var(--bg-surface-2)", fg: "var(--text-muted)" },
};

const SUCCES_UITKOMSTEN = new Set([
  "gesynchroniseerd", "reeds_gesynchroniseerd",
  "geadopteerd", "reeds_geadopteerd",
  "bijgewerkt", "overgeslagen",
  "verwijderd", "gemarkeerd_verwijderd",
]);
const FAIL_UITKOMSTEN = new Set(["geweigerd", "fout"]);

function bucketKey(r: AuditRow): string {
  // minuut-bucket per manager
  const min = new Date(r.created_at);
  min.setSeconds(0, 0);
  return `${r.manager_user_id}|${min.toISOString()}`;
}

function aggregate(rows: AuditRow[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const r of rows) {
    const key = bucketKey(r);
    let b = map.get(key);
    if (!b) {
      b = {
        key,
        ts: r.created_at,
        manager_naam: r.manager_naam,
        manager_user_id: r.manager_user_id,
        type: "sync",
        status: "geslaagd",
        tellers: { aangemaakt: 0, bijgewerkt: 0, verwijderd: 0, gemarkeerd: 0, overgeslagen: 0, geweigerd: 0, fout: 0 },
        rows: [],
      };
      map.set(key, b);
    }
    b.rows.push(r);
    if (new Date(r.created_at) > new Date(b.ts)) b.ts = r.created_at;
    switch (r.uitkomst) {
      case "gesynchroniseerd":
      case "geadopteerd":
        b.tellers.aangemaakt++; break;
      case "reeds_gesynchroniseerd":
      case "reeds_geadopteerd":
      case "overgeslagen":
        b.tellers.overgeslagen++; break;
      case "bijgewerkt":
        b.tellers.bijgewerkt++; break;
      case "verwijderd":
        b.tellers.verwijderd++; break;
      case "gemarkeerd_verwijderd":
        b.tellers.gemarkeerd++; break;
      case "geweigerd":
        b.tellers.geweigerd++; break;
      case "fout":
        b.tellers.fout++; break;
    }
  }
  for (const b of map.values()) {
    // type bepalen op basis van dominante uitkomst
    const t = b.tellers;
    if (t.verwijderd > 0 && t.gemarkeerd === 0) b.type = "verwijdering";
    else if (t.gemarkeerd > 0 && t.verwijderd === 0) b.type = "markering_verwijderd";
    else if (t.verwijderd > 0 || t.gemarkeerd > 0) b.type = "verwijdering";
    else if (t.bijgewerkt > 0) b.type = "update";
    else if (t.aangemaakt > 0) b.type = "import";
    else b.type = "sync";

    let okCount = 0, badCount = 0;
    for (const r of b.rows) {
      if (FAIL_UITKOMSTEN.has(r.uitkomst)) badCount++;
      else if (SUCCES_UITKOMSTEN.has(r.uitkomst)) okCount++;
    }
    if (badCount === 0) b.status = "geslaagd";
    else if (okCount === 0) b.status = "mislukt";
    else b.status = "deels";
  }
  return Array.from(map.values()).sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
}

export function PlannerSyncAuditPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const laden = async () => {
    setBusy(true); setError(null);
    try {
      const { data, error } = await (supabase.rpc as any)(
        "list_planner_planning_sync_audit_v1",
        { _limit: 200 },
      );
      if (error) throw error;
      setRows((data ?? []) as AuditRow[]);
    } catch (e: any) {
      setError(e?.message ?? "Onbekende fout");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { if (open && rows.length === 0 && !busy) void laden(); }, [open]);

  const buckets = aggregate(rows);

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2"
        style={{ color: "var(--text-primary)" }}
      >
        <span className="flex items-center gap-2 font-semibold">
          <History className="h-4 w-4" />
          Laatste sync-acties
          {rows.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)" }}>
              {buckets.length}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {open && (
            <span
              onClick={(e) => { e.stopPropagation(); void laden(); }}
              role="button"
              aria-label="Vernieuwen"
              className="px-2 py-1 text-[11px] rounded-lg inline-flex items-center gap-1 cursor-pointer"
              style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
              Vernieuwen
            </span>
          )}
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {error && (
            <div className="p-2 rounded text-xs flex items-center gap-2" style={{ background: "#fee2e2", color: "#b91c1c" }}>
              <AlertTriangle className="h-3 w-3" /> {error}
            </div>
          )}
          {!error && !busy && buckets.length === 0 && (
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Nog geen sync-acties geregistreerd.</div>
          )}
          {buckets.map((b) => {
            const isOpen = expanded.has(b.key);
            const col = ACTIE_COLOR[b.type];
            const statusIcon = b.status === "geslaagd"
              ? <CheckCircle2 className="h-3 w-3" style={{ color: "var(--accent)" }} />
              : b.status === "mislukt"
                ? <XCircle className="h-3 w-3" style={{ color: "#b91c1c" }} />
                : <AlertTriangle className="h-3 w-3" style={{ color: "var(--warn-text)" }} />;
            return (
              <div key={b.key} className="rounded-lg" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)" }}>
                <button
                  onClick={() => {
                    setExpanded(prev => {
                      const next = new Set(prev);
                      if (next.has(b.key)) next.delete(b.key); else next.add(b.key);
                      return next;
                    });
                  }}
                  className="w-full p-2 flex items-start gap-2 text-left"
                >
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase" style={{ background: col.bg, color: col.fg }}>
                        {ACTIE_LABEL[b.type]}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>
                        {statusIcon}
                        {b.status === "geslaagd" ? "Geslaagd" : b.status === "mislukt" ? "Mislukt" : "Deels geslaagd"}
                      </span>
                      <span className="text-[11px]" style={{ color: "var(--text-muted)", fontFamily: "DM Mono, monospace" }}>
                        {fmtDateTime(b.ts)}
                      </span>
                      {b.manager_naam && (
                        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          · {b.manager_naam}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]" style={{ color: "var(--text-primary)" }}>
                      {b.tellers.aangemaakt > 0 && <span>aangemaakt: <strong>{b.tellers.aangemaakt}</strong></span>}
                      {b.tellers.bijgewerkt > 0 && <span>bijgewerkt: <strong>{b.tellers.bijgewerkt}</strong></span>}
                      {b.tellers.verwijderd > 0 && <span>verwijderd: <strong>{b.tellers.verwijderd}</strong></span>}
                      {b.tellers.gemarkeerd > 0 && <span>gemarkeerd: <strong>{b.tellers.gemarkeerd}</strong></span>}
                      {b.tellers.overgeslagen > 0 && <span style={{ color: "var(--text-muted)" }}>overgeslagen: <strong>{b.tellers.overgeslagen}</strong></span>}
                      {b.tellers.geweigerd > 0 && <span style={{ color: "#b91c1c" }}>geweigerd: <strong>{b.tellers.geweigerd}</strong></span>}
                      {b.tellers.fout > 0 && <span style={{ color: "#b91c1c" }}>fout: <strong>{b.tellers.fout}</strong></span>}
                    </div>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t px-2 py-2 space-y-1" style={{ borderColor: "var(--planning-border-soft)" }}>
                    {b.rows.map(r => (
                      <div key={r.id} className="p-2 rounded text-[11px]" style={{ background: "var(--bg-surface)" }}>
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-bold uppercase text-[10px]" style={{
                            color: FAIL_UITKOMSTEN.has(r.uitkomst) ? "#b91c1c"
                              : r.uitkomst === "overgeslagen" || r.uitkomst.startsWith("reeds_") ? "var(--text-muted)"
                              : "var(--accent)"
                          }}>
                            {r.uitkomst}
                          </span>
                          <span style={{ color: "var(--text-muted)", fontFamily: "DM Mono, monospace" }}>{r.datum}</span>
                        </div>
                        <div style={{ color: "var(--text-primary)" }}>
                          {r.project_nummer ? <strong style={{ fontFamily: "DM Mono, monospace" }}>{r.project_nummer}</strong> : null}
                          {r.project_naam ? ` ${r.project_naam}` : null}
                          {r.monteur_naam ? <> · {r.monteur_naam}</> : null}
                        </div>
                        <div style={{ color: "var(--text-muted)", fontFamily: "DM Mono, monospace", fontSize: 10 }}>
                          planner_id: {r.external_id}
                          {r.planning_id ? <> · planning_id: {r.planning_id}</> : null}
                        </div>
                        {r.fout_reden && (
                          <div className="mt-1" style={{ color: "#b91c1c" }}>
                            <AlertTriangle className="h-3 w-3 inline mr-1" />
                            {r.fout_reden}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

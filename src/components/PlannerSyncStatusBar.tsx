import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertTriangle, XCircle, History, Loader2, RefreshCcw } from "lucide-react";

interface Summary {
  laatste_succes: string | null;
  laatste_succes_uitkomst: string | null;
  laatste_fout: string | null;
  laatste_fout_reden: string | null;
  open_soft_deleted: number;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
}

export function PlannerSyncStatusBar({
  conflicten,
  verwijderingen,
  refreshKey = 0,
  onScrollNaarAudit,
}: {
  conflicten: number | null;
  verwijderingen: number | null;
  refreshKey?: number;
  onScrollNaarAudit?: () => void;
}) {
  const [data, setData] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);

  const laden = async () => {
    setBusy(true);
    try {
      const { data, error } = await (supabase.rpc as any)("get_planner_sync_status_summary_v1");
      if (!error) setData(data as Summary);
    } finally { setBusy(false); }
  };

  useEffect(() => { void laden(); }, [refreshKey]);

  const heeftConflict = (conflicten ?? 0) > 0;
  const heeftDeletes = (verwijderingen ?? 0) > 0;
  const heeftFout = !!data?.laatste_fout;

  return (
    <div className="rounded-xl p-3" style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--planning-border-soft)",
    }}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-[11px]">
          <CheckCircle2 className="h-3.5 w-3.5" style={{ color: data?.laatste_succes ? "var(--accent)" : "var(--text-muted)" }} />
          <span style={{ color: "var(--text-muted)" }}>Laatste sync:</span>
          <strong style={{ color: "var(--text-primary)", fontFamily: "DM Mono, monospace" }}>{fmt(data?.laatste_succes ?? null)}</strong>
        </div>

        <div className="flex items-center gap-1.5 text-[11px]">
          <AlertTriangle className="h-3.5 w-3.5" style={{ color: heeftConflict ? "#b91c1c" : "var(--text-muted)" }} />
          <span style={{ color: "var(--text-muted)" }}>Conflicten:</span>
          <strong style={{ color: heeftConflict ? "#b91c1c" : "var(--text-primary)" }}>
            {conflicten ?? "—"}
          </strong>
        </div>

        <div className="flex items-center gap-1.5 text-[11px]">
          <XCircle className="h-3.5 w-3.5" style={{ color: heeftDeletes ? "#92400e" : "var(--text-muted)" }} />
          <span style={{ color: "var(--text-muted)" }}>Verwijderingen te verwerken:</span>
          <strong style={{ color: heeftDeletes ? "#92400e" : "var(--text-primary)" }}>
            {verwijderingen ?? "—"}
          </strong>
        </div>

        {(data?.open_soft_deleted ?? 0) > 0 && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <span style={{ color: "var(--text-muted)" }}>Gemarkeerd verwijderd (open):</span>
            <strong style={{ color: "#92400e" }}>{data!.open_soft_deleted}</strong>
          </div>
        )}

        <button
          onClick={onScrollNaarAudit}
          className="ml-auto inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg font-semibold"
          style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
        >
          <History className="h-3 w-3" /> Laatste sync-acties
        </button>
        <button
          onClick={() => void laden()}
          disabled={busy}
          aria-label="Status vernieuwen"
          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg"
          style={{ background: "var(--bg-surface-2)", color: "var(--text-muted)", opacity: busy ? 0.5 : 1 }}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
        </button>
      </div>

      {heeftFout && (
        <div className="mt-2 p-2 rounded text-[11px] flex items-start gap-2" style={{ background: "#fee2e2", color: "#b91c1c" }}>
          <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
          <div>
            <strong>Laatste fout</strong> ({fmt(data!.laatste_fout)}): {data!.laatste_fout_reden ?? "onbekend"}
          </div>
        </div>
      )}
    </div>
  );
}

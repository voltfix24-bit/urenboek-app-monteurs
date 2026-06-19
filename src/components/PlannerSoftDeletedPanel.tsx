import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, RefreshCcw, ChevronDown, ChevronRight, AlertTriangle, Undo2, Trash2 } from "lucide-react";

interface Row {
  planning_id: string;
  external_id: string;
  datum: string;
  external_deleted_at: string;
  project_nummer: string | null;
  project_naam: string | null;
  monteur_naam: string | null;
  activiteit: string | null;
  notitie: string | null;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
}

export function PlannerSoftDeletedPanel({ onChange }: { onChange?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmRow, setConfirmRow] = useState<Row | null>(null);
  const [restoreBusyId, setRestoreBusyId] = useState<string | null>(null);

  const laden = async () => {
    setBusy(true); setError(null);
    try {
      const { data, error } = await (supabase.rpc as any)("list_planner_soft_deleted_planning_v1", { _limit: 100 });
      if (error) throw error;
      setRows((data ?? []) as Row[]);
    } catch (e: any) { setError(e?.message ?? "Onbekende fout"); }
    finally { setBusy(false); }
  };

  useEffect(() => { if (open) void laden(); }, [open]);

  const herstel = async (r: Row) => {
    setRestoreBusyId(r.planning_id);
    try {
      const { data, error } = await (supabase.rpc as any)("restore_planner_planning_soft_delete_v1", { _external_id: r.external_id });
      if (error) throw error;
      const u = (data?.uitkomst ?? "") as string;
      if (u === "hersteld") toast.success("Regel hersteld; wordt weer meegenomen in sync.");
      else if (u === "reeds_actief") toast.info("Regel was al actief.");
      else toast.error(`Niet hersteld: ${data?.fout_reden ?? u ?? "onbekend"}`);
      setConfirmRow(null);
      await laden();
      onChange?.();
    } catch (e: any) {
      toast.error(`Herstellen mislukt: ${e?.message ?? "onbekend"}`);
    } finally {
      setRestoreBusyId(null);
    }
  };

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-2" style={{ color: "var(--text-primary)" }}>
        <span className="flex items-center gap-2 font-semibold">
          <Trash2 className="h-4 w-4" /> Gemarkeerd verwijderd (soft-delete)
          {rows.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: "#fef3c7", color: "#92400e" }}>{rows.length}</span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {open && (
            <span onClick={(e) => { e.stopPropagation(); void laden(); }} role="button" aria-label="Vernieuwen"
              className="px-2 py-1 text-[11px] rounded-lg inline-flex items-center gap-1 cursor-pointer"
              style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />} Vernieuwen
            </span>
          )}
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Deze regels zijn niet hard verwijderd omdat er urenboekingen aan vastzaten. Herstellen sluit ze weer aan op Planner-sync; bestaande boekingen blijven behouden.
          </p>
          {error && (
            <div className="p-2 rounded text-xs flex items-center gap-2" style={{ background: "#fee2e2", color: "#b91c1c" }}>
              <AlertTriangle className="h-3 w-3" /> {error}
            </div>
          )}
          {!error && !busy && rows.length === 0 && (
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Geen gemarkeerde regels.</div>
          )}
          {rows.map(r => (
            <div key={r.planning_id} className="p-2 rounded-lg flex items-start gap-2"
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)" }}>
              <div className="flex-1 min-w-0 text-[11px]">
                <div style={{ color: "var(--text-primary)" }}>
                  {r.project_nummer && <strong style={{ fontFamily: "DM Mono, monospace" }}>{r.project_nummer}</strong>}
                  {r.project_naam && ` ${r.project_naam}`}
                  {r.monteur_naam && <> · {r.monteur_naam}</>}
                </div>
                <div style={{ color: "var(--text-muted)", fontFamily: "DM Mono, monospace" }}>
                  {r.datum} · gemarkeerd op {fmt(r.external_deleted_at)}
                </div>
                <div style={{ color: "var(--text-muted)" }}>
                  {r.activiteit ?? "—"}{r.notitie ? ` · ${r.notitie}` : ""}
                </div>
              </div>
              <button
                onClick={() => setConfirmRow(r)}
                disabled={restoreBusyId === r.planning_id}
                className="px-2 py-1 text-[11px] rounded-lg font-semibold inline-flex items-center gap-1 shrink-0"
                style={{ background: "#dbeafe", color: "#1e40af", opacity: restoreBusyId === r.planning_id ? 0.5 : 1 }}
              >
                {restoreBusyId === r.planning_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                Herstel
              </button>
            </div>
          ))}
        </div>
      )}

      {confirmRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setConfirmRow(null)}>
          <div className="rounded-xl p-5 max-w-sm w-full" style={{ background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)" }} onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-base mb-2" style={{ color: "var(--text-primary)" }}>Markering verwijderd herstellen</h3>
            <p className="text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>
              De regel wordt weer als actief gemarkeerd en blijft gekoppeld aan Planner via dezelfde external_id.
              Bestaande urenboekingen blijven ongewijzigd. Deze actie wordt vastgelegd in het audit-log.
            </p>
            <div className="text-[11px] p-2 rounded mb-3" style={{ background: "var(--bg-surface-2)" }}>
              <div style={{ color: "var(--text-primary)" }}>
                {confirmRow.project_nummer ? <strong style={{ fontFamily: "DM Mono, monospace" }}>{confirmRow.project_nummer}</strong> : null}
                {confirmRow.project_naam ? ` ${confirmRow.project_naam}` : null}
              </div>
              <div style={{ color: "var(--text-muted)", fontFamily: "DM Mono, monospace" }}>{confirmRow.datum}</div>
              {confirmRow.monteur_naam && <div style={{ color: "var(--text-muted)" }}>{confirmRow.monteur_naam}</div>}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmRow(null)} disabled={restoreBusyId !== null}
                className="px-3 py-1.5 text-xs rounded-lg" style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}>
                Annuleer
              </button>
              <button onClick={() => herstel(confirmRow)} disabled={restoreBusyId !== null}
                className="px-3 py-1.5 text-xs rounded-lg font-semibold inline-flex items-center gap-1.5"
                style={{ background: "#1e40af", color: "white", opacity: restoreBusyId !== null ? 0.5 : 1 }}>
                {restoreBusyId !== null ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                Herstellen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

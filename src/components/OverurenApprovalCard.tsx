import { useState } from "react";
import { AlertTriangle, CircleAlert, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface OverurenApprovalCardProps {
  name: string;
  dateLabel: string;
  deviationLabel: string;
  bookedHours: number;
  plannedHours: number | null;
  overtimeHours: number;
  travelHours: number;
  timeLabel: string;
  projectNames: string[];
  explanation: string | null;
  done: boolean;
  approved: boolean;
  handledLabel: string | null;
  onApprove: () => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onRequestExplanation: () => void;
}

function Metric({ label, value, danger = false }: { label: string; value: number | null; danger?: boolean }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--approval-metric)" }}>
      <span className="block text-xs font-normal" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span
        className="mt-1 block text-[22px] font-medium leading-none"
        style={{ color: danger ? "var(--danger)" : "var(--text-primary)", fontFamily: "DM Mono, monospace" }}
      >
        {value == null ? "—" : value}
        {value != null && <span className="ml-0.5 text-[13px] font-normal" style={{ color: "var(--text-muted)" }}>u</span>}
      </span>
    </div>
  );
}

export function OverurenApprovalCard({
  name,
  dateLabel,
  deviationLabel,
  bookedHours,
  plannedHours,
  overtimeHours,
  travelHours,
  timeLabel,
  projectNames,
  explanation,
  done,
  approved,
  handledLabel,
  onApprove,
  onReject,
  onRequestExplanation,
}: OverurenApprovalCardProps) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join("");
  const [busyAction, setBusyAction] = useState<"approve" | "reject" | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [reasonError, setReasonError] = useState(false);

  const runApprove = async () => {
    setBusyAction("approve");
    try { await onApprove(); } finally { setBusyAction(null); }
  };

  const runReject = async () => {
    if (!rejectReason.trim()) {
      setReasonError(true);
      return;
    }
    setBusyAction("reject");
    try {
      await onReject(rejectReason.trim());
      setRejectOpen(false);
      setRejectReason("");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <article
      className="mx-auto w-full max-w-[720px] overflow-hidden rounded-xl transition-opacity"
      style={{ background: "var(--bg-surface)", border: "0.5px solid var(--approval-border)", opacity: done ? 0.72 : 1 }}
    >
      <div className="space-y-5 px-5 py-4">
        <header className="flex items-start justify-between gap-4 max-sm:flex-col max-sm:gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-medium"
              style={{ background: "var(--approval-avatar)", color: "var(--approval-avatar-text)" }}
              aria-hidden="true"
            >
              {initials}
            </div>
            <div className="min-w-0 space-y-1">
              <h2 className="text-[15px] font-medium leading-5" style={{ color: "var(--text-primary)", letterSpacing: 0 }}>{name}</h2>
              <p className="text-[13px] font-normal leading-4" style={{ color: "var(--text-muted)" }}>{dateLabel}</p>
            </div>
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium max-sm:ml-12"
            style={{ background: "var(--danger-light)", color: "var(--danger)" }}
          >
            <CircleAlert aria-hidden="true" className="size-4" />
            {deviationLabel}
          </span>
        </header>

        <div className="grid grid-cols-4 gap-3 max-sm:grid-cols-2">
          <Metric label="Geboekt" value={bookedHours} danger />
          <Metric label="Gepland" value={plannedHours} />
          <Metric label="Waarvan overwerk" value={overtimeHours} />
          <Metric label="Reistijd" value={travelHours} />
        </div>

        <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-2 border-t pt-5 text-[13px] font-normal max-sm:grid-cols-[92px_minmax(0,1fr)]" style={{ borderColor: "var(--approval-divider)" }}>
          <dt style={{ color: "var(--text-muted)" }}>Tijden</dt>
          <dd style={{ color: "var(--text-primary)" }}>{timeLabel}</dd>
          <dt style={{ color: "var(--text-muted)" }}>Project</dt>
          <dd style={{ color: "var(--text-primary)" }}>{projectNames.length ? projectNames.join(", ") : "Geen project gevonden"}</dd>
          <dt style={{ color: "var(--text-muted)" }}>Toelichting</dt>
          <dd style={{ color: explanation ? "var(--text-primary)" : "var(--danger)" }}>
            {explanation ? explanation : (
              <span className="inline-flex items-start gap-1.5">
                <AlertTriangle aria-hidden="true" className="mt-px size-4 shrink-0" />
                Geen toelichting ontvangen
              </span>
            )}
          </dd>
        </dl>

        {done && (
          <div className="text-[13px] font-normal" style={{ color: approved ? "var(--success)" : "var(--danger)" }}>
            {approved ? "Goedgekeurd" : "Afgewezen"}{handledLabel ? ` · ${handledLabel}` : ""}
          </div>
        )}
      </div>

      {!done && (
        <footer
          className="flex items-center justify-between gap-3 border-t px-5 py-3 max-sm:flex-col max-sm:items-stretch"
          style={{ background: "var(--approval-footer)", borderColor: "var(--approval-divider)" }}
        >
          <Button
            variant="ghost"
            className="h-[34px] justify-start px-0 text-[13px] font-normal hover:bg-transparent focus-visible:ring-2 max-sm:w-full"
            style={{ color: "var(--text-muted)" }}
            onClick={onRequestExplanation}
          >
            Toelichting opvragen
          </Button>
          <div className="flex gap-2 max-sm:flex-col-reverse">
            <Button
              variant="outline"
              className="h-[34px] w-28 border text-[13px] font-medium hover:bg-[var(--danger-light)] focus-visible:ring-2 max-sm:w-full"
              style={{ borderColor: "var(--danger-border)", color: "var(--danger)", background: "var(--bg-surface)" }}
              disabled={busyAction !== null}
              onClick={() => setRejectOpen(true)}
            >
              {busyAction === "reject" && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
              Afwijzen
            </Button>
            <Button
              className="h-[34px] w-28 text-[13px] font-medium focus-visible:ring-2 max-sm:w-full"
              disabled={busyAction !== null}
              onClick={runApprove}
            >
              {busyAction === "approve" && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
              Goedkeuren
            </Button>
          </div>
        </footer>
      )}

      <Dialog open={rejectOpen} onOpenChange={(open) => { if (!busyAction) setRejectOpen(open); }}>
        <DialogContent className="max-w-sm rounded-xl" style={{ background: "var(--bg-surface)", borderColor: "var(--approval-border)" }}>
          <DialogHeader>
            <DialogTitle className="text-[15px] font-medium" style={{ color: "var(--text-primary)", letterSpacing: 0 }}>Uren afwijzen</DialogTitle>
            <DialogDescription className="text-[13px] font-normal" style={{ color: "var(--text-muted)" }}>
              Geef aan waarom deze uren niet kunnen worden goedgekeurd.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <label htmlFor={`reject-${name}`} className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>Reden</label>
            <Textarea
              id={`reject-${name}`}
              value={rejectReason}
              onChange={(event) => { setRejectReason(event.target.value); setReasonError(false); }}
              placeholder="Schrijf een korte reden…"
              aria-invalid={reasonError}
              disabled={busyAction !== null}
              className="text-[13px] font-normal"
            />
            {reasonError && <p className="flex items-center gap-1 text-xs" style={{ color: "var(--danger)" }}><AlertTriangle className="size-4" />Een reden is verplicht.</p>}
          </div>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button variant="ghost" className="h-[34px] text-[13px] font-normal" disabled={busyAction !== null} onClick={() => setRejectOpen(false)}>Annuleren</Button>
            <Button variant="destructive" className="h-[34px] text-[13px] font-medium" disabled={busyAction !== null} onClick={runReject}>
              {busyAction === "reject" && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
              Afwijzen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
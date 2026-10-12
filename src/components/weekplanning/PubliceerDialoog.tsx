import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  weekNumber: number;
  tellers: { nieuw: number; gewijzigd: number; verwijderd: number };
  namen: string[];
  conflicten: string[];
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function PubliceerDialoog({ open, weekNumber, tellers, namen, conflicten, busy, onOpenChange, onConfirm }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="wp-publish-dialog">
        <DialogTitle className="text-xl font-extrabold">Week {weekNumber} publiceren?</DialogTitle>
        <DialogDescription className="text-sm" style={{ color: "var(--wp-meta)" }}>
          Na publiceren zien monteurs de wijzigingen direct in hun app en kunnen ze erop uren boeken.
        </DialogDescription>
        <div className="wp-counters">
          <div className="wp-counter is-nieuw"><strong>{tellers.nieuw}</strong><span>nieuw</span></div>
          <div className="wp-counter is-gewijzigd"><strong>{tellers.gewijzigd}</strong><span>gewijzigd</span></div>
          <div className="wp-counter is-verwijderd"><strong>{tellers.verwijderd}</strong><span>verwijderd</span></div>
        </div>
        {namen.length > 0 && <p className="text-sm" style={{ color: "var(--wp-meta)" }}>Geraakt: {namen.join(", ")}</p>}
        {conflicten.length > 0 && (
          <div className="wp-alert">
            <strong className="block">Conflicten</strong>
            {conflicten.slice(0, 5).map((c) => <span key={c} className="block">{c}</span>)}
            {conflicten.length > 5 && <span className="block">en {conflicten.length - 5} meer</span>}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button type="button" className="wp-btn-primary" disabled={busy} onClick={onConfirm}>{busy ? "Publiceren…" : "Publiceren"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

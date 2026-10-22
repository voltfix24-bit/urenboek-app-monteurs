import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatUrenGetal } from "@/lib/formatting";

interface Props {
  uren: number | null;
  disabled?: boolean;
  onPreset: (uren: number) => void;
  onDelta: (delta: number) => void;
}

export function UrenKeuze({ uren, disabled, onPreset, onDelta }: Props) {
  return <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Geplande uren">
    {[8, 4].map((n) => <Button key={n} type="button" variant="outline" aria-pressed={uren === n} disabled={disabled} onClick={() => onPreset(n)}>{n} uur</Button>)}
    <Button type="button" variant="outline" aria-label="1 uur minder" disabled={disabled || (uren !== null && uren <= 0.5)} onClick={() => onDelta(-1)}><Minus size={15} />1 uur</Button>
    <Button type="button" variant="outline" aria-label="1 uur meer" disabled={disabled} onClick={() => onDelta(1)}><Plus size={15} />1 uur</Button>
    {uren !== null && <output className="text-sm font-medium">{formatUrenGetal(uren)} uur</output>}
  </div>;
}
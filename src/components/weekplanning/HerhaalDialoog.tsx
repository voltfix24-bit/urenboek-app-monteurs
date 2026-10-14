import { useEffect, useState } from "react";
import { format, getISOWeek } from "date-fns";
import { nl } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { WpProject } from "@/hooks/useWeekPlanningData";
import { repeatDates, repeatEnd } from "@/lib/weekPlanningV2";
import { DAG_KORT } from "./wpUtils";
import { ProjectZoeker } from "./ProjectZoeker";

export interface RepeatChoice { projectId: string; dates: string[] }
export function HerhaalDialoog({ open, onClose, projects, initialProject, initialDays, start, busy, onPreview, onConfirm }: {
  open: boolean; onClose: () => void; projects: WpProject[]; initialProject: string | null; initialDays: number[]; start: Date; busy: boolean;
  onPreview: (choice: RepeatChoice) => Promise<{ count: number; skipped: string[]; same: number }>;
  onConfirm: (choice: RepeatChoice) => void;
}) {
  const [projectId, setProjectId] = useState(initialProject ?? "");
  const [days, setDays] = useState(initialDays);
  const [interval, setInterval] = useState("1");
  const [month, setMonth] = useState("11");
  const [preview, setPreview] = useState<{ count: number; skipped: string[]; same: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const dates = repeatDates(start, repeatEnd(start, Number(month)), days, Number(interval));
  const signature = `${projectId}|${dates.join(",")}`;
  useEffect(() => {
    let active = true;
    setPreview(null);
    if (!projectId || !dates.length || !open) return;
    setChecking(true);
    onPreview({ projectId, dates }).then((p) => { if (active) setPreview(p); }).catch(() => { if (active) setPreview(null); }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [signature, open]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}><DialogContent className="wp-repeat"><DialogHeader><DialogTitle>Herhalen</DialogTitle></DialogHeader>
    <label>Project</label><ProjectZoeker projects={projects} onSelect={setProjectId} className="wp-bar-btn" />
    <strong>{projects.find((p) => p.id === projectId)?.naam ?? "Kies een project"}</strong>
    <div className="flex gap-2">{DAG_KORT.map((name, i) => <Button key={name} variant={days.includes(i) ? "default" : "outline"} aria-pressed={days.includes(i)} onClick={() => setDays((d) => d.includes(i) ? d.filter((x) => x !== i) : [...d, i])}>{name}</Button>)}</div>
    <div className="grid grid-cols-2 gap-3"><Select value={interval} onValueChange={setInterval}><SelectTrigger aria-label="Herhaalfrequentie"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Elke week</SelectItem><SelectItem value="2">Om de week</SelectItem></SelectContent></Select>
    <Select value={month} onValueChange={setMonth}><SelectTrigger aria-label="Tot en met"><SelectValue /></SelectTrigger><SelectContent>{[["9", "Eind oktober"], ["10", "Eind november"], ["11", "Eind december"], ["2", "Eind maart"]].map(([v, name]) => <SelectItem key={v} value={v}>{name}</SelectItem>)}</SelectContent></Select></div>
    <div aria-live="polite">{checking ? "Dagen controleren…" : preview ? <><strong>{preview.count} dagen inplannen · week {getISOWeek(start)} t/m week {getISOWeek(repeatEnd(start, Number(month)))} · {projects.find((p) => p.id === projectId)?.naam} · 07:00–16:00</strong><p className="text-sm text-muted-foreground">{format(start, "d MMM yyyy", { locale: nl })} – {format(repeatEnd(start, Number(month)), "d MMM yyyy", { locale: nl })}</p>{preview.skipped.length > 0 && <p className="wp-repeat-skipped">Overgeslagen: {preview.skipped.join(", ")}</p>}</> : "Geen preview beschikbaar"}</div>
    <Button disabled={busy || checking || !preview?.count} onClick={() => onConfirm({ projectId, dates })}>Inplannen ({preview?.count ?? 0})</Button>
  </DialogContent></Dialog>;
}
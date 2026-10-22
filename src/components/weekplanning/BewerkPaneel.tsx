import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { berekenUren, type Afwezigheid, type Cel, type PlanWaarden } from "@/lib/weekPlanning";
import { formatUrenGetal } from "@/lib/formatting";
import type { WpProject } from "@/hooks/useWeekPlanningData";
import { projectKleur } from "./wpUtils";
import { UrenKeuze } from "./UrenKeuze";
import { urenTijdblok, pasPlanningUrenAan } from "@/lib/planningHours";

interface Props {
  cel: Cel;
  naam: string;
  weekNumber: number;
  projects: WpProject[];
  weekProjectIds: string[];
  afwezigheid: Afwezigheid | null;
  ploegGrootte: number;
  conceptModus: boolean;
  busy: boolean;
  onSave: (w: PlanWaarden, helePloeg: boolean) => void;
  onDelete: (helePloeg: boolean) => void;
  onRevert: () => void;
  onClose: () => void;
}

const AFW_TEKST: Record<Afwezigheid, string> = { verlof: "heeft verlof", ziek: "is ziek gemeld", vrij: "heeft een vaste vrije dag", elders: "werkt voor een andere opdracht" };
const STATUS_TEKST = { nieuw: "nieuw", gewijzigd: "gewijzigd", verwijderd: "wordt verwijderd" } as const;

export function BewerkPaneel({ cel, naam, weekNumber, projects, weekProjectIds, afwezigheid, ploegGrootte, conceptModus, busy, onSave, onDelete, onRevert, onClose }: Props) {
  const [projectId, setProjectId] = useState(cel.project_id ?? "");
  const [start, setStart] = useState(cel.starttijd ?? "07:00");
  const [eind, setEind] = useState(cel.eindtijd ?? "16:00");
  const [notitie, setNotitie] = useState(cel.notitie ?? "");
  const [zoek, setZoek] = useState("");
  const [helePloeg, setHelePloeg] = useState(true);
  const [werklocatie, setWerklocatie] = useState(cel.werklocatie ?? "");
  const [contact, setContact] = useState(cel.contactpersoon ?? "");
  const [telefoon, setTelefoon] = useState(cel.contact_telefoon ?? "");
  const project = projects.find((p) => p.id === projectId);
  const isUitleen = project?.soort === "uitleen";
  const kiesProject = (id: string) => {
    setProjectId(id);
    if (id === cel.project_id) return;
    const p = projects.find((x) => x.id === id);
    setWerklocatie(p?.adres ?? ""); setContact(p?.contactpersoon_naam ?? ""); setTelefoon(p?.contactpersoon_tel ?? "");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const lijst = useMemo(() => {
    const q = zoek.trim().toLocaleLowerCase("nl");
    const sorted = [...projects].sort((a, b) => {
      const wa = weekProjectIds.includes(a.id) ? 0 : 1;
      const wb = weekProjectIds.includes(b.id) ? 0 : 1;
      return wa - wb || a.nummer.localeCompare(b.nummer, "nl", { numeric: true });
    });
    return q ? sorted.filter((p) => `${p.nummer} ${p.naam} ${p.stad ?? ""} ${p.straat ?? ""}`.toLocaleLowerCase("nl").includes(q)) : sorted;
  }, [projects, weekProjectIds, zoek]);

  const datum = new Date(`${cel.datum}T12:00:00`);
  const dagIndex = (datum.getDay() + 6) % 7;
  const tijdFout = start >= eind ? "Eindtijd moet na de starttijd liggen." : "";
  const alleenLezen = cel.beschermd;
  const isConcept = cel.status === "nieuw" || cel.status === "gewijzigd" || cel.status === "verwijderd";

  return (
    <>
      <div className="wp-overlay" onClick={onClose} aria-hidden="true" />
      <aside className="wp-panel" role="dialog" aria-modal="true" aria-label={`${naam} bewerken`}>
        <div className="wp-panel-head">
          <div>
            <h2>{naam}</h2>
            <p>{format(datum, "EEEE d MMM", { locale: nl }).replace(/^./, (c) => c.toUpperCase())} · week {weekNumber}</p>
          </div>
          <button type="button" className="wp-icon-btn" aria-label="Sluiten" onClick={onClose} autoFocus><X size={16} /></button>
        </div>

        <div className="wp-panel-body">
          {alleenLezen && (
            <div className="wp-alert is-info"><Lock size={13} className="mr-1 inline" aria-hidden="true" />Deze dag komt uit de Planner-koppeling. Je kunt hem hier niet wijzigen of verwijderen.</div>
          )}
          {isConcept && cel.status !== "pub" && (
            <div className="wp-alert is-info flex items-center justify-between gap-2">
              <span>In concept: {STATUS_TEKST[cel.status as keyof typeof STATUS_TEKST]}. Monteurs zien dit pas na publiceren.</span>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onRevert}>Terugdraaien</Button>
            </div>
          )}
          {afwezigheid && <div className={`wp-alert${afwezigheid === "vrij" ? " is-info" : ""}`}>{naam} {AFW_TEKST[afwezigheid]} op deze dag.{afwezigheid === "vrij" && " Inplannen en uren boeken blijven mogelijk."}</div>}

          <div>
            <p className="wp-panel-label">Project</p>
            <Input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek project" className="mb-2 h-9" disabled={alleenLezen} aria-label="Zoek project" />
            <div className="wp-project-list">
              {lijst.map((p) => (
                <button key={p.id} type="button" className="wp-project-card" aria-pressed={projectId === p.id} disabled={alleenLezen} onClick={() => kiesProject(p.id)}>
                  <i style={{ background: projectKleur(p.id, weekProjectIds).color }} />
                  <span className="min-w-0"><strong className="truncate">{p.naam || p.nummer}</strong><small className="truncate">{p.nummer}{p.stad ? ` · ${p.stad}` : ""}</small></span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="wp-panel-label">Uren</p>
            <UrenKeuze uren={berekenUren(start, eind)} disabled={alleenLezen || busy}
              onPreset={(n) => { const [s, e] = urenTijdblok(n, start); setStart(s); setEind(e); }}
              onDelta={(n) => { const [s, e] = pasPlanningUrenAan(start, eind, n); setStart(s); setEind(e); }} />
            <p className="wp-hint mt-1">{tijdFout || `${formatUrenGetal(berekenUren(start, eind))} u netto · 60 min vaste pauze`}</p>
          </div>

          {isUitleen && (
            <div className="space-y-2">
              <p className="wp-panel-label">Werklocatie</p>
              <Input value={werklocatie} onChange={(e) => setWerklocatie(e.target.value)} placeholder="Optioneel" className="h-9" disabled={alleenLezen} aria-label="Werklocatie" />
              <p className="wp-panel-label">Contactpersoon / telefoon</p>
              <div className="flex gap-2">
                <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Naam" className="h-9" disabled={alleenLezen} aria-label="Contactpersoon" />
                <Input type="tel" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} placeholder="Telefoon" className="h-9" disabled={alleenLezen} aria-label="Telefoon contactpersoon" />
              </div>
            </div>
          )}

          <div>
            <p className="wp-panel-label">Notitie</p>
            <Textarea value={notitie} onChange={(e) => setNotitie(e.target.value)} rows={3} disabled={alleenLezen} aria-label="Notitie" />
          </div>

          {ploegGrootte > 1 && !alleenLezen && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={helePloeg} onCheckedChange={(v) => setHelePloeg(v === true)} />
              Hele ploeg bijwerken ({ploegGrootte} personen)
            </label>
          )}
          {!conceptModus && <p className="wp-hint">Conceptmodus staat uit: wijzigingen zijn direct zichtbaar voor monteurs.</p>}
          <p className="wp-hint">{DAG_INFO(dagIndex)}</p>
        </div>

        <div className="wp-panel-foot">
          {!alleenLezen && cel.status !== "verwijderd" && (
            <button type="button" className="wp-danger-link" disabled={busy} onClick={() => onDelete(helePloeg)}>Verwijderen</button>
          )}
          <span className="flex-1" />
          <Button type="button" variant="outline" onClick={onClose}>Annuleren</Button>
          <Button type="button" className="wp-btn-primary" disabled={busy || alleenLezen || !projectId || !!tijdFout}
            onClick={() => onSave({
              project_id: projectId, starttijd: start, eindtijd: eind, notitie,
              werklocatie: isUitleen ? werklocatie.trim() || null : null,
              contactpersoon: isUitleen ? contact.trim() || null : null,
              contact_telefoon: isUitleen ? telefoon.trim() || null : null,
            }, helePloeg)}>
            Bijwerken
          </Button>
        </div>
      </aside>
    </>
  );
}

function DAG_INFO(_dag: number) {
  return "Pauze altijd 60 minuten.";
}

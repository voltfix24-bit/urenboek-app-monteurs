import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Clock, MapPin, Search, Users } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { volledigAdres } from "@/lib/utils";

interface Project { id: string; naam: string; nummer: string; straat?: string | null; postcode?: string | null; stad?: string | null; adres?: string | null; }
interface Medewerker { id: string; full_name: string; }
interface FormValue { medewerker_id: string; project_id: string; datum: string; starttijd: string; eindtijd: string; notitie: string; }

interface Props {
  open: boolean;
  editId: string | null;
  weekNumber: number;
  weekDates: Date[];
  medewerkerNaam: string;
  modalStatus: { label: string; color: string; bg: string } | null;
  conflicts: string[];
  form: FormValue;
  selectedDates: string[];
  projects: Project[];
  medewerkers: Medewerker[];
  existingDates: string[];
  saving: boolean;
  extraMedewerkerIds: string[];
  onExtraMedewerkerIdsChange: (ids: string[]) => void;
  onOpenChange: (open: boolean) => void;
  onFormChange: (form: FormValue) => void;
  onToggleDate: (date: string) => void;
  onSave: () => void;
  onDelete: () => void;
}

const RECENT_KEY = "terrevolt-recent-planning-projects";
const PRESETS = [["07:00", "16:00"], ["07:30", "16:30"], ["08:00", "17:00"]];
const PAUZE_MINUTEN = 60;
const TIME_OPTIONS = Array.from({ length: 49 }, (_, index) => {
  const minutes = index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

function numericProjectSort(a: Project, b: Project) {
  return a.nummer.localeCompare(b.nummer, "nl", { numeric: true, sensitivity: "base" });
}

function TimeField({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="planning-time-field">
      <label>{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className={`planning-time-input ${error ? "has-error" : ""}`}>
            <Clock aria-hidden="true" />
            <input value={value} inputMode="numeric" aria-label={`${label}tijd`} onChange={(event) => onChange(event.target.value)} onFocus={() => setOpen(true)} />
            <ChevronDown aria-hidden="true" />
          </div>
        </PopoverTrigger>
        <PopoverContent align="start" className="planning-time-menu">
          {TIME_OPTIONS.map((time) => <button type="button" key={time} className={time === value ? "is-selected" : ""} onClick={() => { onChange(time); setOpen(false); }}>{time}</button>)}
        </PopoverContent>
      </Popover>
      {error && <p className="planning-inline-error">{error}</p>}
    </div>
  );
}

export function PlanningDialog({ open, editId, weekNumber, weekDates, medewerkerNaam, modalStatus, conflicts, form, selectedDates, projects, medewerkers, existingDates, saving, extraMedewerkerIds, onExtraMedewerkerIdsChange, onOpenChange, onFormChange, onToggleDate, onSave, onDelete }: Props) {
  const [projectOpen, setProjectOpen] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const selectedProject = projects.find((project) => project.id === form.project_id);

  useEffect(() => {
    if (!open) return;
    try { setRecentIds(JSON.parse(localStorage.getItem(RECENT_KEY) || "[]")); } catch { setRecentIds([]); }
  }, [open]);

  const sortedProjects = useMemo(() => [...projects].sort(numericProjectSort), [projects]);
  const recentProjects = recentIds.map((id) => projects.find((project) => project.id === id)).filter((project): project is Project => Boolean(project));
  const overigeProjects = sortedProjects.filter((project) => !recentIds.includes(project.id));
  const start = /^\d{2}:\d{2}$/.test(form.starttijd) ? Number(form.starttijd.slice(0, 2)) * 60 + Number(form.starttijd.slice(3)) : NaN;
  const einde = /^\d{2}:\d{2}$/.test(form.eindtijd) ? Number(form.eindtijd.slice(0, 2)) * 60 + Number(form.eindtijd.slice(3)) : NaN;
  const timeError = Number.isFinite(start) && Number.isFinite(einde) && einde <= start ? "Eindtijd moet na de starttijd liggen." : "";
  const brutoMinuten = Number.isFinite(start) && Number.isFinite(einde) && einde > start ? einde - start : 0;
  // Vaste pauze; identiek aan de urenberekening in het weekraster en de PDF.
  const nettoUren = Math.round(Math.max(0, brutoMinuten - PAUZE_MINUTEN) / 60);

  const selectProject = (project: Project) => {
    onFormChange({ ...form, project_id: project.id });
    const next = [project.id, ...recentIds.filter((id) => id !== project.id)].slice(0, 5);
    setRecentIds(next);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    setProjectOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="planning-dialog" onOpenAutoFocus={(event) => event.preventDefault()}>
        <header className="planning-dialog-header">
          <DialogTitle>{medewerkerNaam ? `${medewerkerNaam} ${editId ? "bewerken" : "inplannen"}` : "Medewerker inplannen"}</DialogTitle>
          <DialogDescription asChild><div className="planning-dialog-subtitle">{modalStatus && <span className="planning-availability" style={{ color: modalStatus.color, background: modalStatus.bg }}>{modalStatus.label}</span>}<span>Week {weekNumber}</span></div></DialogDescription>
        </header>

        <div className="planning-dialog-body">
          {conflicts.length > 0 && <div className="planning-conflicts">{conflicts.map((conflict) => <p key={conflict}>{conflict}</p>)}</div>}

          <div className="planning-field-group">
            <label>Dagen</label>
            <div className="planning-day-picker">
              {weekDates.map((date) => {
                const datum = format(date, "yyyy-MM-dd");
                const selected = editId ? form.datum === datum : selectedDates.includes(datum);
                const disabled = Boolean(editId && form.datum !== datum);
                return <Button key={datum} type="button" variant="outline" disabled={disabled} aria-pressed={selected} title={existingDates.includes(datum) && !selected ? "Deze dag heeft al planning" : undefined} onClick={() => onToggleDate(datum)}><span>{format(date, "EEE", { locale: nl })}</span><strong>{format(date, "d/M")}</strong></Button>;
              })}
            </div>
            <p className="planning-selection-count">{selectedDates.length || 1} {(selectedDates.length || 1) === 1 ? "dag" : "dagen"} geselecteerd</p>
          </div>

          <div className="planning-field-group">
            <label>Project</label>
            <Popover open={projectOpen} onOpenChange={setProjectOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="planning-project-trigger" aria-expanded={projectOpen}>
                  <Search aria-hidden="true" />
                  <span>{selectedProject ? `${selectedProject.nummer} · ${volledigAdres(selectedProject) || selectedProject.naam}` : "Zoek op projectnummer of adres"}</span>
                  <ChevronDown aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="planning-project-popover">
                <Command filter={(value, search) => value.toLocaleLowerCase("nl").includes(search.toLocaleLowerCase("nl")) ? 1 : 0}>
                  <CommandInput placeholder="Zoek nummer of adres…" />
                  <CommandList>
                    <CommandEmpty>Geen project gevonden.</CommandEmpty>
                    {recentProjects.length > 0 && <CommandGroup heading="Recent gebruikt">{recentProjects.map((project) => <ProjectOption key={`recent-${project.id}`} project={project} selected={project.id === form.project_id} onSelect={() => selectProject(project)} />)}</CommandGroup>}
                    <CommandGroup heading="Alle projecten">{overigeProjects.map((project) => <ProjectOption key={project.id} project={project} selected={project.id === form.project_id} onSelect={() => selectProject(project)} />)}</CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedProject && <p className="planning-address"><MapPin aria-hidden="true" />{volledigAdres(selectedProject) || "Geen adres ingevuld"}</p>}
          </div>

          <div className="planning-time-grid">
            <TimeField label="Start" value={form.starttijd} onChange={(value) => onFormChange({ ...form, starttijd: value })} />
            <TimeField label="Eind" value={form.eindtijd} onChange={(value) => onFormChange({ ...form, eindtijd: value })} error={timeError} />
            <div className="planning-time-field">
              <label htmlFor="planning-break">Pauze</label>
              <div className="planning-break-input"><input id="planning-break" type="number" value={PAUZE_MINUTEN} readOnly disabled aria-describedby="planning-break-hint" /><span>min</span></div>
            </div>
            <div className="planning-presets">{PRESETS.map(([starttijd, eindtijd]) => <Button key={starttijd} type="button" variant="outline" onClick={() => onFormChange({ ...form, starttijd, eindtijd })}>{starttijd} – {eindtijd}</Button>)}</div>
          </div>
          <div className="planning-hours" id="planning-break-hint"><span>{brutoMinuten / 60 || 0} uur, min {PAUZE_MINUTEN} min vaste pauze</span><strong>{nettoUren}u</strong></div>

          <div className="planning-field-group"><label htmlFor="planning-note">Notitie</label><input id="planning-note" className="planning-note" value={form.notitie} onChange={(event) => onFormChange({ ...form, notitie: event.target.value })} placeholder="Optioneel" /></div>

          {showExtra && !editId && <div className="planning-extra-list"><p>Meer monteurs</p>{medewerkers.filter((medewerker) => medewerker.id !== form.medewerker_id).map((medewerker) => { const checked = extraMedewerkerIds.includes(medewerker.id); return <label key={medewerker.id}><input type="checkbox" checked={checked} onChange={() => onExtraMedewerkerIdsChange(checked ? extraMedewerkerIds.filter((id) => id !== medewerker.id) : [...extraMedewerkerIds, medewerker.id])} />{medewerker.full_name}</label>; })}</div>}
        </div>

        <footer className="planning-dialog-footer">
          {!editId ? <Button type="button" variant="ghost" className="planning-more-button" onClick={() => setShowExtra((value) => !value)}><Users aria-hidden="true" />Meer monteurs toevoegen</Button> : <Button type="button" variant="ghost" className="planning-delete-button" onClick={onDelete} disabled={saving}>Verwijderen</Button>}
          <div className="planning-footer-spacer" aria-hidden="true" />
          <div><Button type="button" variant="outline" className="planning-footer-action" onClick={() => onOpenChange(false)} disabled={saving}>Annuleren</Button><Button type="button" className="planning-footer-action planning-save-button" onClick={onSave} disabled={saving || Boolean(timeError) || !form.project_id}>{saving ? "Opslaan…" : editId ? "Bijwerken" : "Inplannen"}</Button></div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function ProjectOption({ project, selected, onSelect }: { project: Project; selected: boolean; onSelect: () => void }) {
  const adres = volledigAdres(project);
  return <CommandItem value={`${project.nummer} ${adres} ${project.stad || ""} ${project.naam}`} onSelect={onSelect}><span className="planning-project-option"><strong>{adres || project.naam}</strong><small>{project.nummer}{project.stad ? ` · ${project.stad}` : ""}</small></span>{selected && <Check aria-hidden="true" />}</CommandItem>;
}
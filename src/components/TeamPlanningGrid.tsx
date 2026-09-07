import { AlertTriangle, ChevronDown, Plus } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Button } from "@/components/ui/button";

export interface TeamPlanningEntry {
  id: string;
  medewerker_id: string;
  project_id: string;
  datum: string;
  starttijd: string;
  eindtijd: string;
  activiteit_kleur: string | null;
}

export interface TeamPlanningMedewerker {
  id: string;
  full_name: string;
  role?: string | null;
}

export interface TeamPlanningProject {
  id: string;
  naam: string;
  nummer: string;
}

interface BeschikbaarheidItem {
  medewerker_id: string;
  datum_van: string;
  datum_tot: string;
  type: string;
  status: string;
}

interface Props {
  medewerkers: TeamPlanningMedewerker[];
  entries: TeamPlanningEntry[];
  projects: TeamPlanningProject[];
  beschikbaarheid: BeschikbaarheidItem[];
  weekDates: Date[];
  expandedMedewerker: string | null;
  onToggleExpanded: (id: string) => void;
  onOpenCell: (medewerkerId: string, datum: string) => void;
  berekenUren: (starttijd: string | null, eindtijd: string | null) => number;
  renderExpanded: (medewerker: TeamPlanningMedewerker) => ReactNode;
}

const DAG_LABELS = ["Ma", "Di", "Wo", "Do", "Vr"];
const PROJECT_COLORS = ["planning-project-1", "planning-project-2", "planning-project-3", "planning-project-4", "planning-project-5", "planning-project-6"];

function initialen(naam: string) {
  return naam.split(" ").filter(Boolean).map((deel) => deel[0]).slice(0, 2).join("").toUpperCase();
}

function korteNaam(naam: string) {
  const delen = naam.split(" ").filter(Boolean);
  if (delen.length < 2) return naam;
  return `${delen[0]} ${delen[delen.length - 1][0].toUpperCase()}.`;
}


function projectColor(projectId: string, projectIds: string[]) {
  const index = Math.max(0, projectIds.indexOf(projectId));
  return `var(--${PROJECT_COLORS[index % PROJECT_COLORS.length]})`;
}

export function TeamPlanningGrid({ medewerkers, entries, projects, beschikbaarheid, weekDates, expandedMedewerker, onToggleExpanded, onOpenCell, berekenUren, renderExpanded }: Props) {
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const projectIds = Array.from(new Set(entries.map((entry) => entry.project_id)));
  const sortedMedewerkers = [...medewerkers].sort((a, b) => {
    const aHeeftPlanning = entries.some((entry) => entry.medewerker_id === a.id);
    const bHeeftPlanning = entries.some((entry) => entry.medewerker_id === b.id);
    if (aHeeftPlanning !== bHeeftPlanning) return aHeeftPlanning ? -1 : 1;
    return a.full_name.localeCompare(b.full_name, "nl", { sensitivity: "base" });
  });
  const dagAantallen = weekDates.map((date) => {
    const datum = format(date, "yyyy-MM-dd");
    return new Set(entries.filter((entry) => entry.datum === datum).map((entry) => entry.medewerker_id)).size;
  });
  const dagUren = weekDates.map((date) => {
    const datum = format(date, "yyyy-MM-dd");
    return entries
      .filter((entry) => entry.datum === datum)
      .reduce((sum, entry) => sum + berekenUren(entry.starttijd, entry.eindtijd), 0);
  });
  const weekTotaal = entries.reduce((sum, entry) => sum + berekenUren(entry.starttijd, entry.eindtijd), 0);

  return (
    <>
      <div className={`team-planning-scroll ${medewerkers.length > 20 ? "is-compact" : ""}`} tabIndex={0} aria-label="Teamplanning weekraster">
        <div className="team-planning-grid" role="table" aria-label="Planning per medewerker en werkdag">
          <div className="team-planning-header" role="row">
            <div className="team-planning-name-head" role="columnheader">Medewerker</div>
            {weekDates.map((date, index) => (
              <div key={date.toISOString()} className="team-planning-day-head" role="columnheader">
                <span>{DAG_LABELS[index]}</span>
                <strong>{format(date, "d MMM", { locale: nl })}</strong>
              </div>
            ))}
            <div className="team-planning-total-head" role="columnheader">Totaal</div>
          </div>

          {sortedMedewerkers.map((medewerker) => {
            const medewerkerEntries = entries.filter((entry) => entry.medewerker_id === medewerker.id);
            const totaal = medewerkerEntries.reduce((sum, entry) => sum + berekenUren(entry.starttijd, entry.eindtijd), 0);
            const expanded = expandedMedewerker === medewerker.id;
            return (
              <div className="contents" key={medewerker.id}>
                <div className="team-planning-row" role="row">
                  <div className="team-planning-name" role="rowheader">
                    <span className="team-planning-avatar" aria-hidden="true">{initialen(medewerker.full_name)}</span>
                    <span className="team-planning-person">
                      <strong className="team-planning-name-full" title={medewerker.full_name}>{medewerker.full_name}</strong>
                      <strong className="team-planning-name-short" title={medewerker.full_name}>{korteNaam(medewerker.full_name)}</strong>

                      {medewerker.role && medewerker.role !== "monteur" && <small>{medewerker.role === "wv" ? "Werkvoorbereider" : medewerker.role.charAt(0).toUpperCase() + medewerker.role.slice(1)}</small>}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="team-planning-expand"
                      aria-label={`${expanded ? "Sluit" : "Open"} details van ${medewerker.full_name}`}
                      aria-expanded={expanded}
                      onClick={() => onToggleExpanded(medewerker.id)}
                    >
                      <ChevronDown className={expanded ? "rotate-180" : ""} />
                    </Button>
                  </div>

                  {weekDates.map((date) => {
                    const datum = format(date, "yyyy-MM-dd");
                    const entry = entries.find((item) => item.medewerker_id === medewerker.id && item.datum === datum);
                    const project = entry ? projectMap.get(entry.project_id) : undefined;
                    const afwezigheid = beschikbaarheid.find((item) => item.medewerker_id === medewerker.id && item.status === "goedgekeurd" && datum >= item.datum_van && datum <= item.datum_tot);
                    const color = entry ? projectColor(entry.project_id, projectIds) : undefined;
                    return (
                      <Button
                        key={datum}
                        type="button"
                        variant="ghost"
                        className={`team-planning-cell ${entry ? "is-filled" : "is-empty"} ${afwezigheid ? "is-unavailable" : ""}`}
                        style={color ? { "--cell-project": color } as CSSProperties : undefined}
                        onClick={() => onOpenCell(medewerker.id, datum)}
                        aria-label={entry ? `${project?.naam || "Planning"}, ${berekenUren(entry.starttijd, entry.eindtijd)} uur, bewerken` : `${medewerker.full_name} op ${format(date, "d MMMM", { locale: nl })} inplannen`}
                      >
                        {afwezigheid && !entry ? (
                          <><AlertTriangle aria-hidden="true" /><span>{afwezigheid.type === "ziek" ? "Ziek" : "Verlof"}</span></>
                        ) : entry ? (
                          <><strong title={project?.naam || project?.nummer}>{project?.naam || project?.nummer || "Onbekend project"}</strong><span>{berekenUren(entry.starttijd, entry.eindtijd)}u</span></>
                        ) : (
                          <Plus aria-hidden="true" />
                        )}
                      </Button>
                    );
                  })}

                  <div className={`team-planning-row-total ${totaal === 0 ? "is-zero" : ""}`} role="cell">{totaal}u</div>
                </div>
                {expanded && <div className="team-planning-expanded">{renderExpanded(medewerker)}</div>}
              </div>
            );
          })}

          <div className="team-planning-footer" role="row">
            <div className="team-planning-name" role="rowheader"><strong>Dagtotaal</strong></div>
            {dagAantallen.map((aantal, index) => (
              <div key={weekDates[index].toISOString()} role="cell">
                {aantal} {aantal === 1 ? "monteur" : "monteurs"} · {dagUren[index]}u
              </div>
            ))}
            <div role="cell"><strong>{weekTotaal}u</strong></div>
          </div>
        </div>
      </div>

      {projectIds.length > 0 && (
        <div className="team-planning-legend" aria-label="Projectlegenda">
          {projectIds.map((projectId) => {
            const project = projectMap.get(projectId);
            return <span key={projectId}><i style={{ background: projectColor(projectId, projectIds) }} />{project?.naam || project?.nummer || "Onbekend project"}</span>;
          })}
        </div>
      )}
    </>
  );
}
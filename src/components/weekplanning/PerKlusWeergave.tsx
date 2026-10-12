import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { berekenUren, celTelt, type Cel } from "@/lib/weekPlanning";
import { formatUren } from "@/lib/formatting";
import type { WpMedewerker, WpProject } from "@/hooks/useWeekPlanningData";
import { DAG_KORT, initialen, projectKleur } from "./wpUtils";

interface Props { cellen: Cel[]; weekDates: Date[]; projects: WpProject[]; medewerkers: WpMedewerker[]; weekProjectIds: string[]; filterProject: string | null }

export function PerKlusWeergave({ cellen, weekDates, projects, medewerkers, weekProjectIds, filterProject }: Props) {
  const telt = cellen.filter(celTelt).filter((c) => !filterProject || c.project_id === filterProject);
  const ids = weekProjectIds.filter((id) => telt.some((c) => c.project_id === id));
  if (ids.length === 0) return <p className="py-16 text-center text-sm" style={{ color: "var(--text-muted)" }}>Geen planning deze week.</p>;
  return (
    <div className="wp-klus-grid">
      {ids.map((id) => {
        const p = projects.find((x) => x.id === id);
        const rows = telt.filter((c) => c.project_id === id);
        const totaal = rows.reduce((s, c) => s + berekenUren(c.starttijd, c.eindtijd), 0);
        return (
          <article key={id} className="wp-klus-card">
            <div className="wp-klus-head">
              <div className="min-w-0">
                <code>{p?.nummer ?? "—"}</code>
                <h3><i style={{ background: projectKleur(id, weekProjectIds).color }} /><span className="truncate">{p?.naam ?? "Onbekend project"}</span></h3>
                {p?.stad && <small>{p.stad}</small>}
              </div>
              <strong className="wp-mono text-sm">{formatUren(totaal)}</strong>
            </div>
            {weekDates.map((d, i) => {
              const datum = format(d, "yyyy-MM-dd");
              const dag = rows.filter((c) => c.datum === datum);
              if (dag.length === 0) return null;
              return (
                <div key={datum} className="wp-klus-day">
                  <span>{DAG_KORT[i]} {format(d, "d MMM", { locale: nl })}</span>
                  <div className="wp-klus-chips">
                    {dag.map((c) => {
                      const naam = medewerkers.find((m) => m.id === c.medewerker_id)?.full_name ?? "?";
                      return <span key={c.medewerker_id} title={`${naam}${c.status !== "pub" ? " (concept)" : ""}`} className={c.status !== "pub" ? "is-concept" : ""}>{initialen(naam)}</span>;
                    })}
                  </div>
                  <span className="wp-mono">{formatUren(dag.reduce((s, c) => s + berekenUren(c.starttijd, c.eindtijd), 0))}</span>
                </div>
              );
            })}
          </article>
        );
      })}
    </div>
  );
}

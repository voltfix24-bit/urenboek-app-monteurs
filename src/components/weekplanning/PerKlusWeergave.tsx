import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { berekenUren, celTelt, type Cel } from "@/lib/weekPlanning";
import { formatUren } from "@/lib/formatting";
import { bezettingPerDag, klusKopstatus } from "@/lib/weekPlanningV2";
import type { WpMedewerker, WpProject } from "@/hooks/useWeekPlanningData";
import { DAG_KORT, initialen, projectKleur } from "./wpUtils";

interface Props { cellen: Cel[]; weekDates: Date[]; projects: WpProject[]; medewerkers: WpMedewerker[]; weekProjectIds: string[]; filterProject: string | null; onVrijOpDag?: (datum: string) => void }

export function PerKlusWeergave({ cellen, weekDates, projects, medewerkers, weekProjectIds, filterProject, onVrijOpDag }: Props) {
  const telt = cellen.filter(celTelt).filter((c) => !filterProject || c.project_id === filterProject);
  const ids = weekProjectIds.filter((id) => telt.some((c) => c.project_id === id));
  if (ids.length === 0) return <p className="py-16 text-center text-sm" style={{ color: "var(--text-muted)" }}>Geen planning deze week.</p>;
  return (
    <div className="wp-klus-grid">
      {ids.map((id) => {
        const p = projects.find((x) => x.id === id);
        const rows = telt.filter((c) => c.project_id === id);
        const totaal = rows.reduce((s, c) => s + berekenUren(c.starttijd, c.eindtijd), 0);
        const isUitleen = p?.soort === "uitleen";
        const dagen = weekDates.map((d, i) => {
          const datum = format(d, "yyyy-MM-dd");
          const dag = rows.filter((c) => c.datum === datum);
          const bez = bezettingPerDag(new Set(dag.map((c) => c.medewerker_id)).size, p?.benodigd_per_dag ?? null);
          return { datum, dag, bez, i };
        });
        const kop = isUitleen ? `${rows.length} ${rows.length === 1 ? "mensdag" : "mensdagen"}` : klusKopstatus(dagen.map((d) => d.bez));
        return (
          <article key={id} className="wp-klus-card">
            <div className="wp-klus-head">
              <div className="min-w-0">
                <code>{p?.nummer ?? "—"}</code>
                <h3><i style={{ background: projectKleur(id, weekProjectIds).color }} /><span className="truncate">{p?.naam ?? "Onbekend project"}</span></h3>
                {p?.stad && <small>{p.stad}</small>}
              </div>
              <div className="flex flex-col items-end gap-1">
                <strong className="wp-mono text-sm">{formatUren(totaal)}</strong>
                <span className={`wp-klus-status ${!isUitleen && kop.startsWith("Tekort") ? "is-tekort" : ""}`}>{kop}</span>
              </div>
            </div>
            {dagen.map(({ datum, dag, bez, i }) => {
              if (dag.length === 0 && bez.nodig == null) return null;
              const cls = bez.status === "tekort" ? "is-tekort" : bez.status === "precies" ? "is-precies" : bez.status === "meer" ? "is-meer" : "";
              const klikbaar = bez.status === "tekort" && !!onVrijOpDag;
              return (
                <div
                  key={datum}
                  className={`wp-klus-day ${cls}`}
                  {...(klikbaar ? { role: "button", tabIndex: 0, onClick: () => onVrijOpDag?.(datum), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") onVrijOpDag?.(datum); } } : {})}
                >
                  <span>{DAG_KORT[i]} {format(weekDates[i], "d MMM", { locale: nl })}</span>
                  <div className="wp-klus-chips">
                    {dag.map((c) => {
                      const naam = medewerkers.find((m) => m.id === c.medewerker_id)?.full_name ?? "?";
                      return <span key={c.medewerker_id} title={`${naam}${c.status !== "pub" ? " (concept)" : ""}`} className={c.status !== "pub" ? "is-concept" : ""}>{initialen(naam)}</span>;
                    })}
                  </div>
                  {!isUitleen && bez.nodig != null && <span className="wp-klus-norm">{bez.ingepland} / {bez.nodig}</span>}
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

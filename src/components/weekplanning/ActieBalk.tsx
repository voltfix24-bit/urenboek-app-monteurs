import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { bepaalDoelen, celBezet, celKey, TIJDBLOKKEN, type BeschikbaarheidBasis, type Cel } from "@/lib/weekPlanning";
import type { WpMedewerker, WpProject } from "@/hooks/useWeekPlanningData";
import { DAG_KORT, korteNaam, leesRecent, projectKleur } from "./wpUtils";
import { ProjectZoeker } from "./ProjectZoeker";

interface Props {
  medewerkers: WpMedewerker[];
  selMedIds: string[];
  selColumns: number[];
  weekDates: Date[];
  cellen: Map<string, Cel>;
  beschikbaarheid: BeschikbaarheidBasis[];
  projects: WpProject[];
  weekProjectIds: string[];
  projectId: string | null;
  tijd: [string, string];
  busy: boolean;
  conceptModus: boolean;
  onProjectChange: (id: string) => void;
  onTijdChange: (t: [string, string]) => void;
  onPlan: (medIds: string[], datums: string[], notitie: string, uitleen?: { werklocatie: string | null; contactpersoon: string | null; contact_telefoon: string | null }) => void;
  onClear: () => void;
  onClose: () => void;
}

export function ActieBalk(props: Props) {
  const { medewerkers, selMedIds, selColumns, weekDates, cellen, beschikbaarheid, projects, weekProjectIds, projectId, tijd, busy } = props;
  const [notitie, setNotitie] = useState("");
  const [ploegMee, setPloegMee] = useState(true);
  const project = projects.find((p) => p.id === projectId);
  const isUitleen = project?.soort === "uitleen";
  const [werklocatie, setWerklocatie] = useState("");
  const [contact, setContact] = useState("");
  const [telefoon, setTelefoon] = useState("");
  useEffect(() => {
    setWerklocatie(project?.adres ?? "");
    setContact(project?.contactpersoon_naam ?? "");
    setTelefoon(project?.contactpersoon_tel ?? "");
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const medMap = useMemo(() => new Map(medewerkers.map((m) => [m.id, m])), [medewerkers]);
  const datums = selColumns.map((c) => format(weekDates[c], "yyyy-MM-dd"));

  const partners = useMemo(() => {
    const ids = new Set<string>();
    selMedIds.forEach((id) => medMap.get(id)?.planning_partner_ids.forEach((p) => { if (!selMedIds.includes(p) && medMap.has(p)) ids.add(p); }));
    return Array.from(ids);
  }, [selMedIds, medMap]);

  const medIds = ploegMee ? [...selMedIds, ...partners] : selMedIds;
  const { doelen, overgeslagen } = bepaalDoelen(medIds, datums, cellen, medewerkers, beschikbaarheid);
  const heeftInhoud = selMedIds.some((m) => datums.some((d) => celBezet(cellen.get(celKey(m, d)))));

  const recent = leesRecent().filter((id) => !weekProjectIds.includes(id) && projects.some((p) => p.id === id)).slice(0, 3);
  const knoppen = [...weekProjectIds.slice(0, 5), ...recent];
  if (projectId && !knoppen.includes(projectId)) knoppen.unshift(projectId);

  const c0 = Math.min(...selColumns);
  const c1 = Math.max(...selColumns);
  const titel = selMedIds.length === 1 ? medMap.get(selMedIds[0])?.full_name ?? "Medewerker" : `${selMedIds.length} medewerkers`;
  const dagen = `${selColumns.length} ${selColumns.length === 1 ? "dag" : "dagen"}`;
  const periode = `${DAG_KORT[c0]}${c1 > c0 ? `–${DAG_KORT[c1]}` : ""} ${format(weekDates[c0], "d MMM", { locale: nl })}`;

  return (
    <div className="wp-bar" role="region" aria-label="Inplannen">
      <div className="wp-bar-row">
        <span className="wp-bar-title">{titel} · {dagen}</span>
        <span className="wp-bar-sub">{periode}</span>
        <span className="wp-bar-spacer" />
        {partners.length > 0 && (
          <label className="wp-bar-toggle">
            <Switch checked={ploegMee} onCheckedChange={setPloegMee} aria-label="Vaste ploeg meenemen" />
            Vaste ploeg meenemen: {partners.map((p) => korteNaam(medMap.get(p)?.full_name ?? "")).join(", ")}
          </label>
        )}
        <button type="button" className="wp-bar-close" aria-label="Selectie wissen" onClick={props.onClose}><X size={18} /></button>
      </div>

      <div className="wp-bar-row">
        {knoppen.map((id) => {
          const p = projects.find((x) => x.id === id);
          if (!p) return null;
          return (
            <button key={id} type="button" className="wp-bar-btn" aria-pressed={projectId === id} title={`${p.nummer} · ${p.naam}`} onClick={() => props.onProjectChange(id)}>
              <i style={{ background: projectKleur(id, weekProjectIds).color }} /><span>{p.naam || p.nummer}</span>
            </button>
          );
        })}
        <ProjectZoeker projects={projects} onSelect={props.onProjectChange} className="wp-bar-btn" />
      </div>

      <div className="wp-bar-row">
        {TIJDBLOKKEN.map(([s, e]) => (
          <button key={s} type="button" className="wp-bar-btn is-mono" aria-pressed={tijd[0] === s && tijd[1] === e} onClick={() => props.onTijdChange([s, e])}>{s}–{e}</button>
        ))}
        <span className="wp-bar-sub">8 u netto per dag (60 min pauze)</span>
        <input className="wp-bar-note" placeholder="Notitie (optioneel)" value={notitie} onChange={(e) => setNotitie(e.target.value)} aria-label="Notitie" />
        {heeftInhoud && <button type="button" className="wp-bar-clear" disabled={busy} onClick={props.onClear}>Leegmaken</button>}
        <button type="button" className="wp-bar-plan" disabled={busy || !projectId || doelen.length === 0} onClick={() => props.onPlan(medIds, datums, notitie, isUitleen ? { werklocatie: werklocatie.trim() || null, contactpersoon: contact.trim() || null, contact_telefoon: telefoon.trim() || null } : undefined)}>
          Inplannen ({doelen.length})
        </button>
      </div>

      {isUitleen && (
        <div className="wp-bar-row wp-uitleen-velden">
          <input className="wp-bar-note" placeholder="Werklocatie (optioneel)" value={werklocatie} onChange={(e) => setWerklocatie(e.target.value)} aria-label="Werklocatie" />
          <input className="wp-bar-note" placeholder="Contactpersoon (optioneel)" value={contact} onChange={(e) => setContact(e.target.value)} aria-label="Contactpersoon" />
          <input className="wp-bar-note" type="tel" placeholder="Telefoon (optioneel)" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} aria-label="Telefoon contactpersoon" />
        </div>
      )}

      {overgeslagen.length > 0 && (
        <div className="wp-bar-skip">
          Overgeslagen: {overgeslagen.slice(0, 6).map((o) => `${korteNaam(medMap.get(o.medewerker_id)?.full_name ?? "")} ${format(new Date(`${o.datum}T12:00:00`), "EEEEEE", { locale: nl })} (${o.reden})`).join(", ")}
          {overgeslagen.length > 6 ? ` en ${overgeslagen.length - 6} meer` : ""}
        </div>
      )}
    </div>
  );
}

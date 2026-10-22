import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { getISOWeek } from "date-fns";
import { bepaalAfwezigheid, bepaalDoelen, berekenUren, celBezet, celKey, celTelt, TIJDBLOKKEN, type BeschikbaarheidBasis, type Cel } from "@/lib/weekPlanning";
import { weekgrensWaarschuwing } from "@/lib/weekPlanningV2";
import { formatUrenGetal } from "@/lib/formatting";
import type { WpMedewerker, WpProject } from "@/hooks/useWeekPlanningData";
import { DAG_KORT, korteNaam, leesRecent, projectKleur } from "./wpUtils";
import { ProjectZoeker } from "./ProjectZoeker";
import { UrenKeuze } from "./UrenKeuze";
import { urenTijdblok, pasPlanningUrenAan } from "@/lib/planningHours";

export interface SelCel { medId: string; datum: string }
export type UitleenWaarden = { werklocatie: string | null; contactpersoon: string | null; contact_telefoon: string | null };
/** Velden die bij "Wijzigen" gekozen zijn; ontbrekende velden blijven per dag ongewijzigd. */
export interface WijzigKeuze { project_id?: string; tijd?: [string, string]; urenDelta?: number; notitie?: string; uitleen?: UitleenWaarden }

/** Bepaalt doelen per losse geselecteerde lege cel (ingevulde cellen tellen niet mee, verlof/ziek wordt overgeslagen). */
export function doelenVoorCellen(paren: SelCel[], cellen: Map<string, Cel>, medewerkers: WpMedewerker[], beschikbaarheid: BeschikbaarheidBasis[]) {
  const doelen: ReturnType<typeof bepaalDoelen>["doelen"] = [];
  const overgeslagen: ReturnType<typeof bepaalDoelen>["overgeslagen"] = [];
  const gezien = new Set<string>();
  [...paren].sort((a, b) => a.datum.localeCompare(b.datum)).forEach((p) => {
    const k = celKey(p.medId, p.datum);
    if (gezien.has(k)) return;
    gezien.add(k);
    if (celBezet(cellen.get(k))) return;
    const r = bepaalDoelen([p.medId], [p.datum], cellen, medewerkers, beschikbaarheid);
    doelen.push(...r.doelen); overgeslagen.push(...r.overgeslagen);
  });
  return { doelen, overgeslagen };
}

interface Props {
  medewerkers: WpMedewerker[];
  selCellen: SelCel[];
  weekDates: Date[];
  cellen: Map<string, Cel>;
  beschikbaarheid: BeschikbaarheidBasis[];
  projects: WpProject[];
  weekProjectIds: string[];
  projectId: string | null;
  busy: boolean;
  conceptModus: boolean;
  weekgrens: number;
  weekChunks: string[][];
  weekUrenPerChunk: Map<string, number>[];
  onProjectChange: (id: string) => void;
  onPlan: (paren: SelCel[], tijd: [string, string], notitie: string, uitleen?: UitleenWaarden) => void;
  onVerwijder: (cellen: Cel[]) => void;
  onWijzig: (cellen: Cel[], keuze: WijzigKeuze) => void;
  onBeschikbaarheid: (paren: SelCel[], beschikbaar: boolean) => void;
  onRepeat: () => void;
  /** Actieve detacheringen (manager-only); Used voor "Uitleen invullen". */
  detacheringen?: { medewerker_id: string; project_id: string | null; van: string; tot: string | null }[];
  onDetacheringVullen?: (projectId: string, paren: SelCel[]) => void;
  enterProjectId: string | null;
  onClose: () => void;
}

export function ActieBalk(props: Props) {
  const { medewerkers, selCellen, weekDates, cellen, beschikbaarheid, projects, weekProjectIds, projectId, busy, weekgrens, weekChunks, weekUrenPerChunk } = props;
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
  const weekDatums = weekDates.map((d) => format(d, "yyyy-MM-dd"));
  const selMedIds = Array.from(new Set(selCellen.map((s) => s.medId)));
  const selColumns = Array.from(new Set(selCellen.map((s) => weekDatums.indexOf(s.datum)))).filter((c) => c >= 0).sort((a, b) => a - b);

  // Partner alleen op de dagen waarop de medewerker zelf geselecteerd is
  const partnerParen = useMemo(() => {
    const sel = new Set(selCellen.map((s) => celKey(s.medId, s.datum)));
    const uit: SelCel[] = [];
    const extra = new Set<string>();
    selCellen.forEach((s) => medMap.get(s.medId)?.planning_partner_ids.forEach((p) => {
      const k = celKey(p, s.datum);
      if (!medMap.has(p) || sel.has(k) || extra.has(k)) return;
      extra.add(k); uit.push({ medId: p, datum: s.datum });
    }));
    return uit;
  }, [selCellen, medMap]);
  const partners = Array.from(new Set(partnerParen.map((p) => p.medId)));

  const paren = ploegMee ? [...selCellen, ...partnerParen] : selCellen;
  const { doelen, overgeslagen } = doelenVoorCellen(paren, cellen, medewerkers, beschikbaarheid);
  const ingevuld = selCellen.map((s) => cellen.get(celKey(s.medId, s.datum))).filter((c): c is Cel => celTelt(c));
  const heeftInhoud = ingevuld.length > 0;
  const [tijd, setTijd] = useState<[string, string] | null>(() => (heeftInhoud ? null : TIJDBLOKKEN[0]));
  const [urenDelta, setUrenDelta] = useState(0);
  const tijdRef = useRef(tijd);
  tijdRef.current = tijd;
  const weekgrensWaarschuwingTekst = useMemo(() => {
    if (!tijdRef.current || doelen.length === 0) return null;
    const toeTeVoegen = berekenUren(tijdRef.current[0], tijdRef.current[1]);
    for (const d of doelen) {
      const chunkIdx = weekChunks.findIndex((c) => c.includes(d.datum));
      if (chunkIdx < 0) continue;
      const bestaand = weekUrenPerChunk[chunkIdx]?.get(d.medewerker_id) ?? 0;
      const naam = medMap.get(d.medewerker_id)?.full_name ?? "Medewerker";
      const dag = weekDates.find((_, i) => weekDatums[i] === d.datum) ?? weekDates[0];
      const msg = weekgrensWaarschuwing(naam, bestaand, toeTeVoegen, getISOWeek(dag), weekgrens, formatUrenGetal);
      if (msg) return msg;
    }
    return null;
  }, [doelen, weekChunks, weekUrenPerChunk, weekgrens, medMap, weekDates, weekDatums]);
  const [projectGekozen, setProjectGekozen] = useState(!heeftInhoud);
  const kiesProject = (id: string) => { setProjectGekozen(true); props.onProjectChange(id); };
  const uitleenWaarden = (): UitleenWaarden => ({ werklocatie: werklocatie.trim() || null, contactpersoon: contact.trim() || null, contact_telefoon: telefoon.trim() || null });
  const keuze: WijzigKeuze = {
    ...(projectGekozen && projectId ? { project_id: projectId, ...(isUitleen ? { uitleen: uitleenWaarden() } : {}) } : {}),
    ...(tijd ? { tijd } : urenDelta ? { urenDelta } : {}),
    ...(notitie.trim() ? { notitie } : {}),
  };
  const leegBeschikbaar = selCellen.filter((s) => !celBezet(cellen.get(celKey(s.medId, s.datum))) && !bepaalAfwezigheid(medMap.get(s.medId), s.datum, beschikbaarheid));
  const elders = selCellen.filter((s) => bepaalAfwezigheid(medMap.get(s.medId), s.datum, beschikbaarheid) === "elders");
  const ietsGekozen = !!(keuze.project_id || keuze.tijd || keuze.urenDelta || keuze.notitie);

  // Eén gezamenlijke actieve uitleen van de geselecteerde medewerkers?
  const detProjecten = useMemo(() => {
    const nu = new Date().toISOString().slice(0, 10);
    const set = new Set<string>();
    for (const id of selMedIds) {
      const d = (props.detacheringen ?? []).find((x) => x.medewerker_id === id && x.project_id && x.van <= nu && (!x.tot || x.tot >= nu));
      if (d?.project_id) set.add(d.project_id);
    }
    return set;
  }, [props.detacheringen, selMedIds]);
  const detProjectId = detProjecten.size === 1 ? Array.from(detProjecten)[0] : null;

  const recent = leesRecent().filter((id) => !weekProjectIds.includes(id) && projects.some((p) => p.id === id)).slice(0, 3);
  const knoppen = [...weekProjectIds.slice(0, 5), ...recent];
  if (projectId && !knoppen.includes(projectId)) knoppen.unshift(projectId);

  const c0 = selColumns[0] ?? 0;
  const c1 = selColumns[selColumns.length - 1] ?? 0;
  const aaneen = c1 - c0 + 1 === selColumns.length;
  const titel = selMedIds.length === 1 ? medMap.get(selMedIds[0])?.full_name ?? "Medewerker" : `${selMedIds.length} medewerkers`;
  const dagen = `${selColumns.length} ${selColumns.length === 1 ? "dag" : "dagen"}`;
  const periode = aaneen
    ? `${DAG_KORT[c0]}${c1 > c0 ? `–${DAG_KORT[c1]}` : ""} ${format(weekDates[c0], "d MMM", { locale: nl })}`
    : selColumns.map((c) => `${DAG_KORT[c]} ${format(weekDates[c], "d")}`).join(", ");

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
            <button key={id} type="button" className="wp-bar-btn" aria-pressed={projectGekozen && projectId === id} title={`${p.nummer} · ${p.naam}`} onClick={() => kiesProject(id)}>
              <i style={{ background: projectKleur(id, weekProjectIds).color }} /><span>{p.naam || p.nummer}{props.enterProjectId === id ? " ↵" : ""}</span>
            </button>
          );
        })}
        <ProjectZoeker projects={projects} onSelect={kiesProject} className="wp-bar-btn" />
      </div>

      <div className="wp-bar-row">
        <Button variant="outline" className="wp-bar-btn" disabled={busy} onClick={props.onRepeat}>Herhalen…</Button>
        <UrenKeuze uren={tijd ? berekenUren(...tijd) : null} disabled={busy}
          onPreset={(n) => { setUrenDelta(0); setTijd(tijd && berekenUren(...tijd) === n ? null : urenTijdblok(n)); }}
          onDelta={(delta) => { if (tijd) setTijd(pasPlanningUrenAan(...tijd, delta)); else if (heeftInhoud) setUrenDelta((n) => n + delta); else setTijd(urenTijdblok(8 + delta)); }} />
        {!tijd && urenDelta !== 0 && <span className="wp-bar-sub">{urenDelta > 0 ? "+" : ""}{urenDelta} uur per geselecteerde dag</span>}
        <input className="wp-bar-note" placeholder="Notitie (optioneel)" value={notitie} onChange={(e) => setNotitie(e.target.value)} aria-label="Notitie" />
        {leegBeschikbaar.length > 0 && <button type="button" className="wp-bar-btn" disabled={busy} title="Werkt deze dag(en) voor een andere opdracht" onClick={() => props.onBeschikbaarheid(leegBeschikbaar, false)}>Niet beschikbaar ({leegBeschikbaar.length})</button>}
        {elders.length > 0 && <button type="button" className="wp-bar-btn" disabled={busy} onClick={() => props.onBeschikbaarheid(elders, true)}>Weer beschikbaar ({elders.length})</button>}
        {detProjectId && props.onDetacheringVullen && leegBeschikbaar.length > 0 && (
          <button type="button" className="wp-bar-btn" disabled={busy} title="Vult de lege dagen met de actieve uitleen van deze medewerker" onClick={() => props.onDetacheringVullen!(detProjectId, paren)}>
            Uitleen invullen ({leegBeschikbaar.length})
          </button>
        )}
        {heeftInhoud && <button type="button" className="wp-bar-clear" disabled={busy} onClick={() => props.onVerwijder(ingevuld)}>Verwijderen ({ingevuld.length})</button>}
        {heeftInhoud && <button type="button" className="wp-bar-btn" disabled={busy || !ietsGekozen} onClick={() => props.onWijzig(ingevuld, keuze)}>Wijzigen ({ingevuld.length})</button>}
        {(doelen.length > 0 || !heeftInhoud) && (
          <button type="button" className="wp-bar-plan" disabled={busy || !projectId || !projectGekozen || !tijd || doelen.length === 0} onClick={() => tijd && props.onPlan(paren, tijd, notitie, isUitleen ? uitleenWaarden() : undefined)}>
            Inplannen ({doelen.length})
          </button>
        )}
      </div>

      {isUitleen && (
        <div className="wp-bar-row wp-uitleen-velden">
          <input className="wp-bar-note" placeholder="Werklocatie (optioneel)" value={werklocatie} onChange={(e) => setWerklocatie(e.target.value)} aria-label="Werklocatie" />
          <input className="wp-bar-note" placeholder="Contactpersoon (optioneel)" value={contact} onChange={(e) => setContact(e.target.value)} aria-label="Contactpersoon" />
          <input className="wp-bar-note" type="tel" placeholder="Telefoon (optioneel)" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} aria-label="Telefoon contactpersoon" />
        </div>
      )}

      {weekgrensWaarschuwingTekst && !heeftInhoud && (
        <div className="wp-bar-warn-row">{weekgrensWaarschuwingTekst}</div>
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

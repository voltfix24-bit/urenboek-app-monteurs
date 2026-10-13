import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format, getISOWeek, getISOWeekYear } from "date-fns";
import { nl } from "date-fns/locale";
import { Check, Lock, Mail, MapPin, MoreHorizontal, Phone, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { volledigAdres } from "@/lib/utils";
import { generateProjectPdf } from "./projectPdf";
import { ForecastTab } from "@/components/ForecastTab";
import { StatusBadge } from "@/components/StatusBadge";
import { STATUS_CONFIG, STATUS_VOLGORDE, STATUS_TRANSITIONS, terugzetFasen, volgendeFase, type ProjectStatus } from "@/lib/projectStatus";
import { projectChecklist, type ChecklistKey } from "@/lib/projectChecklist";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useProjectInzet } from "@/hooks/useProjectInzet";
import { berekenUren } from "@/lib/weekPlanning";
import { formatUren } from "@/lib/formatting";
import { UitleenUrenKaart } from "./UitleenUrenKaart";

const initialen = (n: string) => n.split(" ").filter(Boolean).map((d) => d[0]).slice(0, 2).join("").toUpperCase();
const isoWeek = (datum: string) => { const d = new Date(`${datum}T12:00:00`); return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, "0")}`; };

interface Props {
  project: any;
  ogNaam: string | null;
  isManager: boolean;
  zietFinancien: boolean;
  confirmDeleteId: string | null;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
  navigate: (path: string) => void;
  onStartIntake: () => void;
  onZetSoort?: (soort: "project" | "uitleen") => void;
}

type Tab = "overzicht" | "forecast" | "planning";

export function DesktopProjectDetail({ project, ogNaam, isManager, zietFinancien, confirmDeleteId, onEdit, onToggle, onDelete, onCancelDelete, navigate, onStartIntake, onZetSoort }: Props) {
  const [params, setParams] = useSearchParams();
  const { profileId } = useProfile();
  const inzet = useProjectInzet(project.id);
  const [busy, setBusy] = useState(false);

  const tabParam = params.get("tab");
  const uitleen = project.soort === "uitleen";
  const tab: Tab = tabParam === "forecast" && zietFinancien && !uitleen ? "forecast" : tabParam === "planning" ? "planning" : "overzicht";
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.set("focus", project.id);
    if (t === "overzicht") next.delete("tab"); else next.set("tab", t);
    setParams(next, { replace: true });
  };

  const status = (project.status || "nieuw") as ProjectStatus;
  const checklist = projectChecklist(project);
  const checklistKlaar = checklist.every((c) => c.klaar);
  const adres = volledigAdres(project);
  const huidigJaar = new Date().getFullYear();

  const changeStatus = async (nieuw: ProjectStatus) => {
    if (!STATUS_TRANSITIONS[status].includes(nieuw)) return;
    setBusy(true);
    const { error } = await supabase.from("projects").update({ status: nieuw, status_gewijzigd_op: new Date().toISOString(), status_gewijzigd_door: profileId }).eq("id", project.id);
    setBusy(false);
    if (error) { toast.error("Fase wijzigen mislukt"); return; }
    toast.success(`Fase gewijzigd naar ${STATUS_CONFIG[nieuw].label.toLowerCase()}`);
    window.dispatchEvent(new CustomEvent("project-status-changed"));
  };

  const zetJaar = async () => {
    const { error } = await supabase.from("projects").update({ projectjaar: huidigJaar }).eq("id", project.id);
    if (error) { toast.error("Opslaan mislukt"); return; }
    toast.success(`Projectjaar op ${huidigJaar} gezet`);
    window.dispatchEvent(new CustomEvent("project-status-changed"));
  };

  const planningUrl = (datum?: string | null) => `/manager-planning?project=${project.id}${datum ? `&week=${isoWeek(datum)}` : ""}`;

  // Volgende actie per fase
  const volgende = volgendeFase(status);
  let actie: { label: string; onClick: () => void; blocked?: string } | null = null;
  if (status === "nieuw") actie = { label: "Planning maken →", onClick: () => navigate(planningUrl()), blocked: checklistKlaar ? undefined : "Rond eerst de checklist af" };
  else if (status === "gepland") actie = { label: "Planning publiceren →", onClick: () => navigate(planningUrl(inzet.eersteConceptDatum ?? inzet.eersteDatum)) };
  else if (status === "in_uitvoering" && volgende) actie = { label: "Markeer als opgeleverd", onClick: () => changeStatus("opgeleverd") };
  else if (status === "opgeleverd" && volgende) actie = { label: "Markeer als gefactureerd", onClick: () => changeStatus("gefactureerd") };
  else if (status === "gefactureerd" && volgende) actie = { label: "Project sluiten", onClick: () => changeStatus("gesloten") };

  const checkActie: Record<ChecklistKey, { label: string; onClick: () => void }> = {
    adres: { label: "Invullen", onClick: onEdit },
    projectjaar: { label: `Zet op ${huidigJaar}`, onClick: zetJaar },
    opdrachtgever: { label: "Kiezen", onClick: onEdit },
    intake: { label: "Intake starten", onClick: onStartIntake },
  };

  const huidigeIndex = STATUS_VOLGORDE.indexOf(status);
  const faseNotitie = project.status_gewijzigd_op
    ? `${STATUS_CONFIG[status].label} sinds ${format(new Date(project.status_gewijzigd_op), "d MMM yyyy", { locale: nl })}.`
    : `Huidige fase: ${STATUS_CONFIG[status].label.toLowerCase()}.`;

  const perMedewerker = Array.from(inzet.actief.reduce((m, c) => {
    const cur = m.get(c.medewerker_id) ?? { dagen: 0, uren: 0, concept: false };
    cur.dagen++; cur.uren += berekenUren(c.starttijd, c.eindtijd); cur.concept ||= c.status !== "pub";
    return m.set(c.medewerker_id, cur);
  }, new Map<string, { dagen: number; uren: number; concept: boolean }>()).entries());

  const actieKnop = !uitleen && actie && (actie.blocked ? (
    <Tooltip>
      <TooltipTrigger asChild><span tabIndex={0}><Button className="pj-btn-next is-blocked" disabled>{actie.label}</Button></span></TooltipTrigger>
      <TooltipContent>{actie.blocked}</TooltipContent>
    </Tooltip>
  ) : <Button className="pj-btn-next" disabled={busy} onClick={actie.onClick}>{actie.label}</Button>);

  return (
    <div className="pj-detail-inner">
      <div className="pj-kop">
        <div className="min-w-0">
          <code>{uitleen ? [project.nummer, "Uitleen"].join(" · ") : [project.nummer, project.case_type, project.stationsnaam].filter(Boolean).join(" · ")}</code>
          <h2>{project.naam}</h2>
          <p>{[ogNaam, project.stad, !project.active ? "Gearchiveerd" : null].filter(Boolean).join(" · ") || "—"}</p>
        </div>
        {isManager && (
          <div className="pj-actions">
            <Button variant="outline" onClick={onEdit}>Bewerken</Button>
            {actieKnop}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="Meer acties"><MoreHorizontal size={18} /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => generateProjectPdf(project, ogNaam, isManager)}>PDF downloaden</DropdownMenuItem>
                {onZetSoort && <DropdownMenuItem onSelect={() => onZetSoort(uitleen ? "project" : "uitleen")}>{uitleen ? "Omzetten naar klus" : "Omzetten naar uitleen"}</DropdownMenuItem>}
                {!uitleen && terugzetFasen(status).length > 0 && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Fase terugzetten</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {terugzetFasen(status).map((f) => <DropdownMenuItem key={f} onSelect={() => changeStatus(f)}>{STATUS_CONFIG[f].label}</DropdownMenuItem>)}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                <DropdownMenuItem onSelect={onToggle}>{project.active ? "Archiveren" : "Terugzetten uit archief"}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={inzet.heeftData} onSelect={onDelete} style={{ color: "var(--danger)" }}>
                  <span className="flex flex-col">
                    Verwijderen
                    {inzet.heeftData && <span className="text-xs" style={{ color: "var(--text-muted)" }}>Kan niet: project heeft planning, uren of orders. Archiveer het.</span>}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {!uitleen && <div className="pj-steps" aria-label="Projectfase">
        <div className="pj-steps-row">
          {STATUS_VOLGORDE.map((s, i) => (
            <div key={s} className={`pj-step ${i < huidigeIndex ? "is-past" : i === huidigeIndex ? "is-current" : ""}`} aria-current={i === huidigeIndex ? "step" : undefined}>
              <span /><p>{STATUS_CONFIG[s].label}</p>
            </div>
          ))}
        </div>
        <p className="pj-step-note">{faseNotitie}</p>
      </div>}

      <div className="pj-tabs" role="tablist">
        {(["overzicht", ...(zietFinancien && !uitleen ? ["forecast"] : []), "planning"] as Tab[]).map((t) => (
          <button key={t} role="tab" type="button" className="pj-tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === "overzicht" ? "Overzicht" : t === "forecast" ? "Forecast" : "Planning"}
          </button>
        ))}
      </div>

      {tab === "overzicht" && uitleen && (
        <div className="pj-grid">
          <section className="pj-card">
            <h3>Gegevens</h3>
            <dl className="pj-fields">
              <dt>Nummer</dt><dd className="pj-mono" style={{ fontSize: 14 }}>{project.nummer}</dd>
              <dt>Opdrachtgever</dt><dd>{ogNaam || "—"}</dd>
              <dt>Werklocatie</dt>
              <dd>{project.adres || "—"}{project.adres && <a href={`https://maps.google.com/?q=${encodeURIComponent(project.adres)}`} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-[13px]" style={{ color: "var(--accent-dark)" }}><MapPin className="h-3 w-3" />Kaart</a>}</dd>
              <dt>Contactpersoon</dt><dd>{project.contactpersoon_naam || "—"}</dd>
              <dt>Telefoon</dt><dd>{project.contactpersoon_tel ? <a href={`tel:${project.contactpersoon_tel}`} style={{ color: "var(--accent-dark)" }}>{project.contactpersoon_tel}</a> : "—"}</dd>
            </dl>
          </section>
          <UitleenUrenKaart projectId={project.id} />
        </div>
      )}

      {tab === "overzicht" && !uitleen && (
        <div className="pj-grid">
          <section className="pj-card">
            <h3>Klaar voor uitvoering</h3>
            {checklist.map((c) => (
              <div key={c.key} className="pj-check">
                <span className={`pj-check-icon ${c.klaar ? "is-done" : "is-open"}`} aria-hidden="true">{c.klaar ? <Check size={14} /> : "!"}</span>
                <span className="flex-1">{c.label}</span>
                {!c.klaar && isManager && <Button size="sm" variant="outline" onClick={checkActie[c.key].onClick}>{checkActie[c.key].label}</Button>}
                {c.klaar && c.key === "intake" && isManager && <button type="button" className="text-xs" style={{ color: "var(--text-muted)" }} onClick={onStartIntake}>Opnieuw doen</button>}
              </div>
            ))}
          </section>

          <section className="pj-card">
            <h3>Gegevens</h3>
            <dl className="pj-fields">
              <dt>Casenummer</dt><dd className="pj-mono" style={{ fontSize: 14 }}>{project.nummer}</dd>
              <dt>Case type</dt><dd>{project.case_type || "—"}</dd>
              <dt>Opdrachtgever</dt><dd>{ogNaam || "—"}</dd>
              <dt>Stationsnaam</dt><dd>{project.stationsnaam || "—"}</dd>
              <dt>Adres</dt>
              <dd>{adres || "—"}{adres && <a href={`https://maps.google.com/?q=${encodeURIComponent(adres)}`} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-[13px]" style={{ color: "var(--accent-dark)" }}><MapPin className="h-3 w-3" />Kaart</a>}</dd>
              <dt>Projectjaar</dt><dd>{project.projectjaar ?? "—"}</dd>
            </dl>
            {isManager && (project.contactpersoon_naam || project.contactpersoon_tel || project.contactpersoon_email) && (
              <div className="pj-contact">
                <p><Lock size={12} aria-hidden="true" />Contactpersoon · alleen managers</p>
                {project.contactpersoon_naam && <p className="font-semibold">{project.contactpersoon_naam}</p>}
                {project.contactpersoon_tel && <a href={`tel:${project.contactpersoon_tel}`} className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--accent-dark)" }}><Phone className="h-3 w-3" />{project.contactpersoon_tel}</a>}
                {project.contactpersoon_email && <a href={`mailto:${project.contactpersoon_email}`} className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--accent-dark)" }}><Mail className="h-3 w-3" />{project.contactpersoon_email}</a>}
              </div>
            )}
          </section>

          <section className="pj-card is-wide">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="!mb-0">Komende inzet</h3>
              <Button variant="outline" size="sm" onClick={() => navigate(planningUrl(inzet.eersteDatum))}>Planning openen →</Button>
            </div>
            {inzet.loading ? <p className="wp-hint">Laden…</p> : inzet.inzet.length === 0 ? <p className="wp-hint">Nog niemand ingepland.</p> : inzet.inzet.slice(0, 8).map((c) => {
              const naam = inzet.medewerkers.get(c.medewerker_id)?.full_name ?? "Onbekend";
              return (
                <div key={`${c.medewerker_id}-${c.datum}`} className="pj-inzet">
                  <span>{format(new Date(`${c.datum}T12:00:00`), "EEEEEE d MMM", { locale: nl })}</span>
                  <span className="min-w-0 flex-1 truncate" style={c.status === "verwijderd" ? { textDecoration: "line-through", color: "var(--text-muted)" } : undefined}>{c.activiteit || c.notitie || `${c.starttijd}–${c.eindtijd}`}</span>
                  {c.status !== "pub" && <span className="pj-concept-tag">concept</span>}
                  <span className="pj-avatar" aria-hidden="true">{initialen(naam)}</span>
                  <span className="w-44 truncate">{naam}</span>
                </div>
              );
            })}
          </section>
        </div>
      )}

      {tab === "forecast" && zietFinancien && !uitleen && (
        <div style={{ paddingTop: 20 }}><ForecastTab projectId={project.id} /></div>
      )}

      {tab === "planning" && (
        <div className="pj-grid">
          <section className="pj-card is-wide">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="!mb-1">{inzet.actief.length === 0 ? "Nog geen planning" : inzet.heeftConcept ? "Planning in concept" : "Planning gepubliceerd"}</h3>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {inzet.actief.length} {inzet.actief.length === 1 ? "dag" : "dagen"} · {perMedewerker.length} {perMedewerker.length === 1 ? "monteur" : "monteurs"} · {inzet.conflicten} {inzet.conflicten === 1 ? "conflict" : "conflicten"}
                </p>
              </div>
              <Button className="pj-btn-next" onClick={() => navigate(planningUrl(inzet.eersteConceptDatum ?? inzet.eersteDatum))}>Planning openen →</Button>
            </div>
            <div className="mt-4">
              {perMedewerker.map(([id, v]) => {
                const naam = inzet.medewerkers.get(id)?.full_name ?? "Onbekend";
                return (
                  <div key={id} className="pj-inzet">
                    <span className="pj-avatar" aria-hidden="true">{initialen(naam)}</span>
                    <span className="flex-1">{naam}</span>
                    {v.concept && <span className="pj-concept-tag">concept</span>}
                    <span className="pj-mono">{v.dagen} {v.dagen === 1 ? "dag" : "dagen"} · {formatUren(v.uren)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {confirmDeleteId === project.id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(18,28,42,.4)" }} onClick={onCancelDelete}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="verwijder-titel" className="rounded-2xl p-6" style={{ background: "var(--bg-surface)", maxWidth: 380, width: "calc(100% - 32px)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h3 id="verwijder-titel" className="text-base font-bold">Project verwijderen?</h3>
              <button type="button" onClick={onCancelDelete} aria-label="Sluiten"><X size={16} /></button>
            </div>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>“{project.naam}” wordt definitief verwijderd. Dit kan niet ongedaan worden gemaakt.</p>
            <div className="mt-5 flex gap-3">
              <Button variant="outline" className="flex-1" onClick={onCancelDelete}>Annuleren</Button>
              <Button className="flex-1" style={{ background: "var(--danger)", color: "var(--wp-on-dark)" }} onClick={onDelete}>Definitief verwijderen</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function DesktopFormPanel({ title, children, onCancel, onSubmit, submitLabel }: {
  title: string; children: React.ReactNode; onCancel: () => void; onSubmit: () => void; submitLabel: string;
}) {
  return (
    <div className="pj-detail-inner space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-extrabold" style={{ color: "var(--text-primary)" }}>{title}</h2>
        <button onClick={onCancel} className="wp-icon-btn" aria-label="Sluiten"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3">{children}</div>
      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Annuleren</Button>
        <Button className="pj-btn-next flex-1" onClick={onSubmit}>{submitLabel}</Button>
      </div>
    </div>
  );
}

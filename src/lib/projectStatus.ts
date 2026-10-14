/** Eén levenscyclus van 6 fasen. Kleuren komen uit CSS-variabelen (--fase-*). */
export const STATUS_CONFIG = {
  nieuw: { label: 'Nieuw', kleur: 'var(--fase-nieuw-text)', bg: 'var(--fase-nieuw-bg)', dot: 'var(--fase-nieuw-dot)', volgorde: 1 },
  gepland: { label: 'Gepland', kleur: 'var(--fase-gepland-text)', bg: 'var(--fase-gepland-bg)', dot: 'var(--fase-gepland-dot)', volgorde: 2 },
  in_uitvoering: { label: 'In uitvoering', kleur: 'var(--fase-uitvoering-text)', bg: 'var(--fase-uitvoering-bg)', dot: 'var(--fase-uitvoering-dot)', volgorde: 3 },
  opgeleverd: { label: 'Opgeleverd', kleur: 'var(--fase-opgeleverd-text)', bg: 'var(--fase-opgeleverd-bg)', dot: 'var(--fase-opgeleverd-dot)', volgorde: 4 },
  gefactureerd: { label: 'Gefactureerd', kleur: 'var(--fase-gefactureerd-text)', bg: 'var(--fase-gefactureerd-bg)', dot: 'var(--fase-gefactureerd-dot)', volgorde: 5 },
  gesloten: { label: 'Gesloten', kleur: 'var(--fase-gesloten-text)', bg: 'var(--fase-gesloten-bg)', dot: 'var(--fase-gesloten-dot)', volgorde: 6 },
} as const;


export type ProjectStatus = keyof typeof STATUS_CONFIG;

export const STATUS_VOLGORDE: ProjectStatus[] = [
  'nieuw', 'gepland', 'in_uitvoering',
  'opgeleverd', 'gefactureerd', 'gesloten'
];

/** Groepering voor de projectlijst: lopende klussen, uitleen, afgerond. */
export const LOPEND_STATUS: ProjectStatus[] = ['nieuw', 'gepland', 'in_uitvoering'];
export const AFGEROND_STATUS: ProjectStatus[] = ['opgeleverd', 'gefactureerd', 'gesloten'];

export type ProjectGroep = 'lopend' | 'uitleen' | 'afgerond';

export function projectGroep(p: { soort?: string | null; status?: string }): ProjectGroep {
  if (p.soort === 'uitleen') return 'uitleen';
  const s = (p.status || 'nieuw') as ProjectStatus;
  return AFGEROND_STATUS.includes(s) ? 'afgerond' : 'lopend';
}

export const STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  nieuw: ['gepland', 'gesloten'],
  gepland: ['in_uitvoering', 'nieuw', 'gesloten'],
  in_uitvoering: ['opgeleverd', 'gepland'],
  opgeleverd: ['gefactureerd', 'in_uitvoering'],
  gefactureerd: ['gesloten'],
  gesloten: ['nieuw'],
};

/** Volgende fase in de levenscyclus, als die overgang is toegestaan. */
export function volgendeFase(huidig: ProjectStatus): ProjectStatus | null {
  const i = STATUS_VOLGORDE.indexOf(huidig);
  const next = STATUS_VOLGORDE[i + 1];
  return next && STATUS_TRANSITIONS[huidig].includes(next) ? next : null;
}

/** Fasen waarnaar je terug kunt zetten (toegestaan én eerder in de cyclus, of heropenen vanuit gesloten). */
export function terugzetFasen(huidig: ProjectStatus): ProjectStatus[] {
  return STATUS_TRANSITIONS[huidig].filter((t) => STATUS_CONFIG[t].volgorde < STATUS_CONFIG[huidig].volgorde);
}

export function bepaalAutoStatus(
  huidig: ProjectStatus,
  isDefinitiefPlanning: boolean,
): ProjectStatus | null {
  if (huidig === 'gepland' && isDefinitiefPlanning) {
    return 'in_uitvoering';
  }
  return null;
}

export const STATUS_CONFIG = {
  nieuw: {
    label: 'Nieuw',
    kleur: 'var(--text-muted)',
    bg: 'var(--bg-surface-2)',
    border: 'var(--border)',
    icoon: '📋',
    volgorde: 1,
  },
  gepland: {
    label: 'Gepland',
    kleur: 'var(--info)',
    bg: 'var(--info-light)',
    border: 'var(--info-border)',
    icoon: '📅',
    volgorde: 2,
  },
  in_uitvoering: {
    label: 'In uitvoering',
    kleur: 'var(--warn-text)',
    bg: 'var(--warn-light)',
    border: 'var(--warn-border)',
    icoon: '⚡',
    volgorde: 3,
  },
  opgeleverd: {
    label: 'Opgeleverd',
    kleur: 'var(--success)',
    bg: 'var(--success-light)',
    border: 'var(--success-border)',
    icoon: '✓',
    volgorde: 4,
  },
  gefactureerd: {
    label: 'Gefactureerd',
    kleur: 'var(--accent)',
    bg: 'var(--accent-light)',
    border: 'var(--accent-border)',
    icoon: '💶',
    volgorde: 5,
  },
  gesloten: {
    label: 'Gesloten',
    kleur: 'var(--text-muted)',
    bg: 'var(--bg-surface-2)',
    border: 'var(--border)',
    icoon: '🔒',
    volgorde: 6,
  },
} as const;

export type ProjectStatus = keyof typeof STATUS_CONFIG;

export const STATUS_VOLGORDE: ProjectStatus[] = [
  'nieuw', 'gepland', 'in_uitvoering',
  'opgeleverd', 'gefactureerd', 'gesloten'
];

export const STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  nieuw: ['gepland', 'gesloten'],
  gepland: ['in_uitvoering', 'nieuw', 'gesloten'],
  in_uitvoering: ['opgeleverd', 'gepland'],
  opgeleverd: ['gefactureerd', 'in_uitvoering'],
  gefactureerd: ['gesloten'],
  gesloten: ['nieuw'],
};

export function bepaalAutoStatus(
  huidig: ProjectStatus,
  isDefinitiefPlanning: boolean,
): ProjectStatus | null {
  if (huidig === 'gepland' && isDefinitiefPlanning) {
    return 'in_uitvoering';
  }
  return null;
}

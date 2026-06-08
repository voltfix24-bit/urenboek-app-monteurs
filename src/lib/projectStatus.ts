export const STATUS_CONFIG = {
  nieuw: {
    label: 'Nieuw',
    kleur: '#a0abc3',
    bg: 'rgba(10,26,48,0.7)',
    border: 'rgba(106,118,140,0.15)',
    icoon: '📋',
    volgorde: 1,
  },
  gepland: {
    label: 'Gepland',
    kleur: '#6e9bff',
    bg: 'rgba(110,155,255,0.1)',
    border: 'rgba(110,155,255,0.3)',
    icoon: '📅',
    volgorde: 2,
  },
  in_uitvoering: {
    label: 'In uitvoering',
    kleur: '#feb300',
    bg: 'rgba(254,179,0,0.1)',
    border: 'rgba(254,179,0,0.3)',
    icoon: '⚡',
    volgorde: 3,
  },
  opgeleverd: {
    label: 'Opgeleverd',
    kleur: '#3fff8b',
    bg: 'rgba(63,255,139,0.1)',
    border: 'rgba(63,255,139,0.3)',
    icoon: '✓',
    volgorde: 4,
  },
  gefactureerd: {
    label: 'Gefactureerd',
    kleur: '#3fff8b',
    bg: 'rgba(63,255,139,0.1)',
    border: 'rgba(63,255,139,0.3)',
    icoon: '💶',
    volgorde: 5,
  },
  gesloten: {
    label: 'Gesloten',
    kleur: '#a0abc3',
    bg: 'rgba(10,26,48,0.7)',
    border: 'rgba(106,118,140,0.15)',
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

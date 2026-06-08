export const STATUS_CONFIG = {
  nieuw: {
    label: 'Nieuw',
    kleur: '#6b7280',
    bg: '#ffffff',
    border: '#e5e7eb',
    icoon: '📋',
    volgorde: 1,
  },
  gepland: {
    label: 'Gepland',
    kleur: '#2563eb',
    bg: 'rgba(110,155,255,0.1)',
    border: 'rgba(110,155,255,0.3)',
    icoon: '📅',
    volgorde: 2,
  },
  in_uitvoering: {
    label: 'In uitvoering',
    kleur: '#d97706',
    bg: 'rgba(254,179,0,0.1)',
    border: 'rgba(254,179,0,0.3)',
    icoon: '⚡',
    volgorde: 3,
  },
  opgeleverd: {
    label: 'Opgeleverd',
    kleur: '#10b981',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    icoon: '✓',
    volgorde: 4,
  },
  gefactureerd: {
    label: 'Gefactureerd',
    kleur: '#10b981',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    icoon: '💶',
    volgorde: 5,
  },
  gesloten: {
    label: 'Gesloten',
    kleur: '#6b7280',
    bg: '#ffffff',
    border: '#e5e7eb',
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

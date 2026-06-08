export const STATUS_CONFIG = {
  nieuw: {
    label: 'Nieuw',
    kleur: '#374151',
    bg: '#f3f4f6',
    border: '#d1d5db',
    icoon: '📋',
    volgorde: 1,
  },
  gepland: {
    label: 'Gepland',
    kleur: '#1e40af',
    bg: '#dbeafe',
    border: '#93c5fd',
    icoon: '📅',
    volgorde: 2,
  },
  in_uitvoering: {
    label: 'In uitvoering',
    kleur: '#854d0e',
    bg: '#fef3c7',
    border: '#fcd34d',
    icoon: '⚡',
    volgorde: 3,
  },
  opgeleverd: {
    label: 'Opgeleverd',
    kleur: '#064e3b',
    bg: '#d1fae5',
    border: '#6ee7b7',
    icoon: '✓',
    volgorde: 4,
  },
  gefactureerd: {
    label: 'Gefactureerd',
    kleur: '#064e3b',
    bg: '#d1fae5',
    border: '#6ee7b7',
    icoon: '💶',
    volgorde: 5,
  },
  gesloten: {
    label: 'Gesloten',
    kleur: '#4b5563',
    bg: '#e5e7eb',
    border: '#9ca3af',
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

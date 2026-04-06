export interface StatusConfig {
  label: string;
  labelMonteur?: string;
  color: string;
  bg: string;
  border: string;
  icoon?: string;
}

export const CONTRACT_STATUS_CONFIG: Record<string, StatusConfig> = {
  concept: {
    label: 'Concept',
    labelMonteur: 'Wordt voorbereid',
    color: 'var(--text-muted)',
    bg: 'var(--bg-surface-2)',
    border: 'var(--border)',
    icoon: '📝',
  },
  verstuurd: {
    label: 'Verstuurd',
    labelMonteur: 'Wacht op jouw handtekening',
    color: 'var(--info)',
    bg: 'var(--info-light)',
    border: 'var(--info-border)',
    icoon: '📧',
  },
  ondertekend_ot: {
    label: 'Wacht op TerreVolt',
    labelMonteur: 'Ondertekend — wacht op TerreVolt',
    color: 'var(--warn-text)',
    bg: 'var(--warn-light)',
    border: 'var(--warn-border)',
    icoon: '⏳',
  },
  ondertekend_beiden: {
    label: 'Actief ✓',
    labelMonteur: 'Actief ✓',
    color: 'var(--success)',
    bg: 'var(--success-light)',
    border: 'var(--success-border)',
    icoon: '✅',
  },
  verlopen: {
    label: 'Verlopen',
    labelMonteur: 'Verlopen',
    color: 'var(--danger)',
    bg: 'var(--danger-light)',
    border: 'var(--danger-border)',
    icoon: '⏰',
  },
  opgezegd: {
    label: 'Opgezegd',
    labelMonteur: 'Beëindigd',
    color: 'var(--text-muted)',
    bg: 'var(--bg-surface-2)',
    border: 'var(--border)',
    icoon: '🔒',
  },
  correctie_gevraagd: {
    label: 'Correctie gevraagd',
    labelMonteur: 'Correctie doorgegeven',
    color: 'var(--danger)',
    bg: 'var(--danger-light)',
    border: 'var(--danger-border)',
    icoon: '⚠️',
  },
};

export const KANDIDAAT_STATUS_CONFIG: Record<string, StatusConfig> = {
  gesprek: {
    label: 'Gesprek',
    color: 'var(--text-muted)',
    bg: 'var(--bg-surface-2)',
    border: 'var(--border)',
  },
  tarief_afgesproken: {
    label: 'Tarief afgesproken',
    color: 'var(--info)',
    bg: 'var(--info-light)',
    border: 'var(--info-border)',
  },
  uitgenodigd: {
    label: 'Uitgenodigd',
    color: 'var(--warn-text)',
    bg: 'var(--warn-light)',
    border: 'var(--warn-border)',
  },
  gecontracteerd: {
    label: 'Gecontracteerd',
    color: 'var(--success)',
    bg: 'var(--success-light)',
    border: 'var(--success-border)',
  },
  afgewezen: {
    label: 'Afgewezen',
    color: 'var(--danger)',
    bg: 'var(--danger-light)',
    border: 'var(--danger-border)',
  },
  on_hold: {
    label: 'On hold',
    color: 'var(--warning)',
    bg: 'var(--warning-light)',
    border: 'var(--warning-border)',
  },
};

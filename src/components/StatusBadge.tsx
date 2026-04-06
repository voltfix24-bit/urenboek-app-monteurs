import { STATUS_CONFIG, type ProjectStatus } from "@/lib/projectStatus";

interface StatusBadgeProps {
  status: ProjectStatus;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export function StatusBadge({ status, size = 'md', onClick }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.nieuw;
  return (
    <span
      onClick={onClick}
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
        color: config.kleur,
        borderRadius: size === 'lg' ? 12 : 20,
        padding: size === 'sm' ? '2px 8px' : size === 'lg' ? '8px 16px' : '4px 12px',
        fontSize: size === 'sm' ? 10 : size === 'lg' ? 14 : 12,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap' as const,
      }}
    >
      {config.icoon} {config.label}
    </span>
  );
}

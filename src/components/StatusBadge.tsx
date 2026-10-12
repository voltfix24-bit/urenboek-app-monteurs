import { STATUS_CONFIG, type ProjectStatus } from "@/lib/projectStatus";

interface StatusBadgeProps {
  status: ProjectStatus | string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

/** Fasepill met dot, zonder emoji. */
export function StatusBadge({ status, size = 'md', onClick }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status as ProjectStatus] || STATUS_CONFIG.nieuw;
  return (
    <span
      onClick={onClick}
      className={`fase-pill is-${size}`}
      style={{ background: config.bg, color: config.kleur, cursor: onClick ? 'pointer' : 'default' }}
    >
      <i style={{ background: config.dot }} aria-hidden="true" />
      {config.label}
    </span>
  );
}

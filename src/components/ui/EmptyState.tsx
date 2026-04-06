import React from "react";

interface EmptyStateProps {
  icoon?: string;
  titel: string;
  subtitel?: string;
  actie?: React.ReactNode;
}

export function EmptyState({ icoon, titel, subtitel, actie }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icoon && (
        <div className="text-4xl mb-3">{icoon}</div>
      )}
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {titel}
      </p>
      {subtitel && (
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {subtitel}
        </p>
      )}
      {actie && (
        <div className="mt-4">{actie}</div>
      )}
    </div>
  );
}

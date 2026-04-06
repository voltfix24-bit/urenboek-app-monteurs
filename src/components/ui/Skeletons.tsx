import React from "react";

function SkeletonBase({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`animate-pulse rounded-lg ${className}`}
      style={{
        background: "var(--bg-surface-2)",
        ...style,
      }}
    />
  );
}

/** Skeleton for a uren entry card */
export function UrenCardSkeleton() {
  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <SkeletonBase style={{ width: 32, height: 32, borderRadius: "50%" }} />
          <div className="space-y-1.5">
            <SkeletonBase style={{ width: 120, height: 12 }} />
            <SkeletonBase style={{ width: 80, height: 10 }} />
          </div>
        </div>
        <SkeletonBase style={{ width: 40, height: 20, borderRadius: 8 }} />
      </div>
      <SkeletonBase style={{ width: "100%", height: 10 }} />
    </div>
  );
}

/** Skeleton for a planning card */
export function PlanningCardSkeleton() {
  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <SkeletonBase style={{ width: 140, height: 14 }} />
          <SkeletonBase style={{ width: 90, height: 10 }} />
        </div>
        <SkeletonBase style={{ width: 80, height: 24, borderRadius: 8 }} />
      </div>
      <SkeletonBase style={{ width: "70%", height: 10 }} />
      <SkeletonBase style={{ width: "100%", height: 36, borderRadius: 12 }} />
    </div>
  );
}

/** Skeleton for a project card */
export function ProjectCardSkeleton() {
  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <SkeletonBase style={{ width: 100, height: 14 }} />
          <SkeletonBase style={{ width: 60, height: 10 }} />
        </div>
        <SkeletonBase style={{ width: 50, height: 20, borderRadius: 10 }} />
      </div>
      <SkeletonBase style={{ width: "80%", height: 10 }} />
      <SkeletonBase style={{ width: "60%", height: 10 }} />
    </div>
  );
}

/** Skeleton for an employee row */
export function MedewerkerSkeleton() {
  return (
    <div className="rounded-2xl p-3.5 flex items-center gap-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <SkeletonBase style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
      <div className="flex-1 space-y-1.5">
        <SkeletonBase style={{ width: 110, height: 13 }} />
        <SkeletonBase style={{ width: 70, height: 10 }} />
      </div>
      <SkeletonBase style={{ width: 55, height: 20, borderRadius: 10 }} />
    </div>
  );
}

/** Skeleton for a dashboard KPI block */
export function KpiSkeleton() {
  return (
    <div className="rounded-2xl p-3 text-center space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <SkeletonBase style={{ width: 20, height: 20, borderRadius: "50%", margin: "0 auto" }} />
      <SkeletonBase style={{ width: 40, height: 20, margin: "0 auto" }} />
      <SkeletonBase style={{ width: 50, height: 8, margin: "0 auto" }} />
    </div>
  );
}

/** Skeleton for a goedkeuring grouped card */
export function GoedkeuringCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: "var(--bg-surface-2)" }}>
        <SkeletonBase style={{ width: 32, height: 32, borderRadius: "50%" }} />
        <div className="flex-1 space-y-1.5">
          <SkeletonBase style={{ width: 100, height: 13 }} />
          <SkeletonBase style={{ width: 70, height: 10 }} />
        </div>
      </div>
      <div className="px-4 py-3 space-y-3">
        {[1, 2].map(i => (
          <div key={i} className="flex items-center gap-2">
            <SkeletonBase style={{ width: 60, height: 10 }} />
            <SkeletonBase style={{ width: 50, height: 16, borderRadius: 6 }} />
            <SkeletonBase className="flex-1" style={{ height: 10 }} />
            <SkeletonBase style={{ width: 30, height: 12 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton for overuren melding card */
export function OverurenCardSkeleton() {
  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2.5">
        <SkeletonBase style={{ width: 32, height: 32, borderRadius: "50%" }} />
        <div className="flex-1 space-y-1.5">
          <SkeletonBase style={{ width: 110, height: 13 }} />
          <SkeletonBase style={{ width: 80, height: 10 }} />
        </div>
      </div>
      <div className="flex gap-4">
        <SkeletonBase style={{ width: 50, height: 28 }} />
        <SkeletonBase style={{ width: 50, height: 28 }} />
      </div>
      <SkeletonBase style={{ width: "100%", height: 32, borderRadius: 12 }} />
    </div>
  );
}

/** Generic list skeleton */
export function ListSkeleton({
  count = 4,
  ItemSkeleton,
}: {
  count?: number;
  ItemSkeleton: React.ComponentType;
}) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <React.Fragment key={i}><ItemSkeleton /></React.Fragment>
      ))}
    </div>
  );
}

/** Dashboard section skeleton (KPI strip + cards) */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {[1, 2, 3, 4].map(i => <KpiSkeleton key={i} />)}
      </div>
      <ProjectCardSkeleton />
      <UrenCardSkeleton />
      <UrenCardSkeleton />
    </div>
  );
}

import { ReactNode } from "react";
import { DesktopSidebar } from "./DesktopSidebar";
import { BottomNav } from "./BottomNav";
import { useNavBadges } from "@/hooks/useNavBadges";

interface PageShellProps {
  children: ReactNode;
  mobileConstrained?: boolean;
}

/**
 * Wraps any page with:
 * - DesktopSidebar on lg+ (fixed left 240px)
 * - BottomNav on mobile (already lg:hidden)
 * - Single content wrapper that responds to viewport via Tailwind classes
 *   (NO duplicate render of children — that would double-mount components,
 *    duplicate effects, realtime channels, and DOM IDs).
 */
export function PageShell({ children, mobileConstrained = true }: PageShellProps) {
  const { badges } = useNavBadges();

  return (
    <>
      <DesktopSidebar badges={badges} />
      <div
        className="min-h-screen overflow-x-hidden"
        style={{ background: "#030e20" }}
      >
        <div
          className={
            // Mobile: max width 430 centered, padding for bottom nav
            // Desktop (lg+): shift right past sidebar, wider content area, no bottom-nav padding
            (mobileConstrained
              ? "mx-auto max-w-[430px] pb-20 "
              : "pb-20 ") +
            "lg:max-w-none lg:mx-0 lg:ml-[240px] lg:pb-10 lg:px-10 lg:pt-8"
          }
          style={{ minHeight: "100vh" }}
        >
          {children}
        </div>
      </div>
      <BottomNav badges={badges} />
    </>
  );
}

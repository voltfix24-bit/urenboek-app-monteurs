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
 * - Content shifts right on desktop, centered on mobile
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
        {/* Mobile wrapper */}
        <div
          className="lg:hidden"
          style={mobileConstrained ? { maxWidth: 430, margin: "0 auto", paddingBottom: 80 } : { paddingBottom: 80 }}
        >
          {children}
        </div>
        {/* Desktop wrapper */}
        <div
          className="hidden lg:block"
          style={{ marginLeft: 240, minHeight: "100vh" }}
        >
          {children}
        </div>
      </div>
      <BottomNav badges={badges} />
    </>
  );
}
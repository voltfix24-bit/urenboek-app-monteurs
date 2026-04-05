import { ReactNode } from "react";
import { DesktopSidebar } from "./DesktopSidebar";
import { BottomNav } from "./BottomNav";

interface AppLayoutProps {
  children: ReactNode;
  /** Title shown in desktop page header */
  title?: string;
  /** Subtitle shown in desktop page header */
  subtitle?: string;
  /** Extra actions (buttons) for desktop header right side */
  headerActions?: ReactNode;
  /** Hide the default mobile wrapper (maxWidth etc) - for pages that handle their own layout */
  rawDesktop?: boolean;
}

export function AppLayout({ children, title, subtitle, headerActions, rawDesktop }: AppLayoutProps) {
  return (
    <>
      <DesktopSidebar />

      {/* Desktop content area */}
      <div className="hidden lg:block" style={{ marginLeft: 240, minHeight: "100vh", background: "#F5F7F0" }}>
        {title && (
          <header className="flex items-center justify-between px-10 pt-8 pb-4">
            <div>
              <h1 className="text-[22px] font-medium" style={{ color: "#2D4A1E" }}>{title}</h1>
              {subtitle && <p className="text-sm mt-0.5" style={{ color: "#8AAD6E" }}>{subtitle}</p>}
            </div>
            {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
          </header>
        )}
        <div className={title ? "px-10 pb-10" : "px-10 py-8"}>
          {children}
        </div>
      </div>

      {/* Mobile content area */}
      <div className="lg:hidden">
        {children}
        <BottomNav />
      </div>
    </>
  );
}
import { ReactNode, useEffect, useRef, useState, TouchEvent } from "react";
import { createPortal } from "react-dom";

interface BottomSheetProps {
  /** Bepaalt of het sheet zichtbaar is */
  open: boolean;
  /** Wordt aangeroepen wanneer de gebruiker sluit (backdrop tap, ESC, of swipe-down) */
  onClose: () => void;
  /** Inhoud van het sheet */
  children: ReactNode;
  /** Optionele titel die in de header bovenaan komt */
  title?: ReactNode;
  /** Optionele actie aan de rechterkant van de header (bv. een sluitknop of save knop) */
  headerAction?: ReactNode;
  /** Maximale hoogte als percentage van viewport (default 90vh) */
  maxHeightVh?: number;
  /** Border radius bovenaan het sheet (default 40) */
  topRadius?: number;
  /** Of het sheet via swipe-down gesloten kan worden (default true) */
  draggable?: boolean;
  /** Extra padding aan onderzijde bovenop safe-area (default 24) */
  extraBottomPadding?: number;
  /** Optionele aria-label voor toegankelijkheid */
  ariaLabel?: string;
  /** Of de body padding moet hebben (default true). Zet uit voor full-bleed content zoals chat. */
  padded?: boolean;
}

/**
 * Herbruikbaar mobiel bottom sheet met:
 * - Safe-area aware padding (iPhone home indicator)
 * - Drag handle + swipe-to-dismiss
 * - Tap backdrop om te sluiten
 * - ESC om te sluiten
 * - Body scroll lock zolang sheet open is
 * - Portal naar document.body zodat z-index altijd klopt
 *
 * Op desktop (lg+) blijft dit ook werken — de meeste callers tonen het sheet
 * alleen op mobiel via `lg:hidden` op hun parent. Het component zelf doet daar
 * geen aanname over.
 */
export function BottomSheet({
  open,
  onClose,
  children,
  title,
  headerAction,
  maxHeightVh = 90,
  topRadius = 40,
  draggable = true,
  extraBottomPadding = 24,
  ariaLabel,
  padded = true,
}: BottomSheetProps) {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  // Body scroll lock terwijl sheet open is
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // ESC om te sluiten
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Reset drag state telkens als het sheet (her)opent
  useEffect(() => {
    if (open) {
      setDragY(0);
      setIsDragging(false);
      startYRef.current = null;
    }
  }, [open]);

  if (!open) return null;

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (!draggable) return;
    startYRef.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (!draggable || startYRef.current === null) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) setDragY(delta);
  };

  const handleTouchEnd = () => {
    if (!draggable) return;
    setIsDragging(false);
    if (dragY > 120) {
      onClose();
    } else {
      setDragY(0);
    }
    startYRef.current = null;
  };

  const sheet = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || (typeof title === "string" ? title : undefined)}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: "relative",
          background: "var(--app-navy)",
          borderTopLeftRadius: topRadius,
          borderTopRightRadius: topRadius,
          borderTop: "1px solid var(--planning-border-soft)",
          maxHeight: `${maxHeightVh}vh`,
          overflowY: "auto",
          padding: padded ? "0 24px" : 0,
          paddingTop: 0,
          paddingBottom: padded
            ? `calc(env(safe-area-inset-bottom, 34px) + ${extraBottomPadding}px)`
            : `env(safe-area-inset-bottom, 34px)`,
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? "none" : "transform 0.3s ease",
          width: "100%",
          maxWidth: 480,
          marginInline: "auto",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "12px 0 8px",
            cursor: draggable ? "grab" : "default",
          }}
        >
          <div
            style={{
              width: 48,
              height: 6,
              borderRadius: 9999,
              background: "var(--border-strong)",
            }}
          />
        </div>

        {/* Optionele header */}
        {(title || headerAction) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 20,
              paddingTop: 8,
            }}
          >
            {typeof title === "string" ? (
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  fontFamily: "Hanken Grotesk",
                  margin: 0,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {title}
              </h3>
            ) : (
              <div style={{ flex: 1, minWidth: 0 }}>{title}</div>
            )}
            {headerAction}
          </div>
        )}

        {children}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}

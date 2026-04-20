/**
 * Klein versie-label onderaan elke pagina.
 * Handig voor support: zo zie je direct welke versie een monteur draait.
 */
export function VersionFooter() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        bottom: 2,
        right: 6,
        zIndex: 1,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 9,
        lineHeight: 1,
        letterSpacing: "0.05em",
        color: "rgba(218,230,255,0.25)",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      v{__APP_VERSION__} · {__BUILD_DATE__}
    </div>
  );
}

import { MapPin, Phone } from "lucide-react";

/** Alleen weergave: werklocatie (opent kaart) en contactpersoon (bellen) van een uitleendag. */
export function UitleenInfo({ werklocatie, contactpersoon, telefoon }: { werklocatie?: string | null; contactpersoon?: string | null; telefoon?: string | null }) {
  if (!werklocatie && !contactpersoon && !telefoon) return null;
  const linkStyle = { display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--accent)", fontFamily: "Hanken Grotesk", marginTop: 2, minWidth: 0 } as const;
  return (
    <div onClick={(e) => e.stopPropagation()}>
      {werklocatie && (
        <a href={`https://maps.google.com/?q=${encodeURIComponent(werklocatie)}`} target="_blank" rel="noopener noreferrer" style={linkStyle}>
          <MapPin size={12} aria-hidden="true" /><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{werklocatie}</span>
        </a>
      )}
      {(contactpersoon || telefoon) && (telefoon ? (
        <a href={`tel:${telefoon.replace(/\s/g, "")}`} style={linkStyle}><Phone size={12} aria-hidden="true" />{[contactpersoon, telefoon].filter(Boolean).join(" · ")}</a>
      ) : (
        <span style={{ ...linkStyle, color: "var(--text-muted)" }}><Phone size={12} aria-hidden="true" />{contactpersoon}</span>
      ))}
    </div>
  );
}

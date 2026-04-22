import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CERT_CONFIG } from "@/lib/certificaten";
import { differenceInDays, parseISO, format } from "date-fns";
import { nl } from "date-fns/locale";
import { Pencil, Paperclip } from "lucide-react";
import CertificatenForm from "./CertificatenForm";

interface Certificaat {
  id: string;
  type: string;
  naam: string;
  subtype?: string | null;
  vervaldatum: string | null;
  ggi_gebieden?: string[] | null;
  bestand_url?: string | null;
}

interface Props {
  certificaten: Certificaat[];
  toonToevoegen?: boolean;
  medewerker_id?: string;
  onRefresh?: () => void;
}

function vervaldatumStatus(verval: string | null) {
  if (!verval) return { label: "Geen vervaldatum", color: "#a0abc3" };
  const diff = differenceInDays(parseISO(verval), new Date());
  if (diff < 0) return { label: "✕ Verlopen", color: "#ff716c" };
  if (diff <= 30) return { label: "⚠ Verloopt binnenkort", color: "#feb300" };
  return { label: "Geldig", color: "#3fff8b" };
}

export default function CertificatenOverzicht({ certificaten, toonToevoegen, medewerker_id, onRefresh }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [initialType, setInitialType] = useState<string | undefined>(undefined);

  const openForm = (type?: string) => {
    setInitialType(type);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setInitialType(undefined);
  };

  const openFile = async (path: string) => {
    // Open een tab synchroon zodat iOS Safari de popup-blocker niet triggert
    const newWin = window.open("", "_blank");
    const { data, error } = await supabase.storage.from("certificaten").createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      if (newWin) newWin.close();
      return;
    }
    if (newWin) {
      newWin.location.href = data.signedUrl;
    } else {
      // Fallback (popup-blocker actief): navigeer in dezelfde tab
      window.location.href = data.signedUrl;
    }
  };

  if (showForm && medewerker_id) {
    return (
      <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Certificaten beheren</p>
        <CertificatenForm
          medewerker_id={medewerker_id}
          initialType={initialType}
          onSaved={() => { closeForm(); onRefresh?.(); }}
          onCancel={closeForm}
        />
      </div>
    );
  }

  const grouped: Record<string, Certificaat[]> = {};
  for (const c of certificaten) {
    if (!grouped[c.type]) grouped[c.type] = [];
    grouped[c.type].push(c);
  }

  // Telling: hoeveel van de verplichte certificaten zijn aanwezig?
  const totaal = CERT_CONFIG.length;
  const aanwezig = CERT_CONFIG.filter(cfg => (grouped[cfg.type]?.length ?? 0) > 0).length;
  const ontbreekt = totaal - aanwezig;

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Certificaten</p>
          <span
            className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
            style={{
              background: ontbreekt === 0 ? "rgba(63,255,139,0.12)" : "rgba(254,179,0,0.12)",
              color: ontbreekt === 0 ? "#3fff8b" : "#feb300",
              border: `1px solid ${ontbreekt === 0 ? "rgba(63,255,139,0.3)" : "rgba(254,179,0,0.3)"}`,
            }}
          >
            {aanwezig}/{totaal}
          </span>
        </div>
        {toonToevoegen && medewerker_id && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#3fff8b" }}>
            <Pencil className="h-3 w-3" /> Bewerken
          </button>
        )}
      </div>

      <div className="space-y-2">
        {CERT_CONFIG.map(cfg => {
          const items = grouped[cfg.type] ?? [];
          const isLeeg = items.length === 0;
          const hasFile = items.some(c => c.bestand_url);

          // ── ONTBREKEND CERTIFICAAT ──
          if (isLeeg) {
            return (
              <div
                key={cfg.type}
                className="p-3 rounded-xl flex items-start justify-between gap-3"
                style={{
                  background: "rgba(254,179,0,0.05)",
                  border: "1px dashed rgba(254,179,0,0.35)",
                }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold mb-0.5 flex items-center gap-1.5" style={{ color: "#dae6ff" }}>
                    <span style={{ color: "#feb300", fontSize: 14, lineHeight: 1 }}>○</span>
                    {cfg.kortLabel || cfg.label}
                  </p>
                  <p className="text-[11px]" style={{ color: "#feb300", fontWeight: 600 }}>
                    Ontbreekt — nog niet ingevuld
                  </p>
                </div>
                {toonToevoegen && medewerker_id && (
                  <button
                    onClick={() => setShowForm(true)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap"
                    style={{
                      background: "rgba(63,255,139,0.1)",
                      border: "1px solid rgba(63,255,139,0.3)",
                      color: "#3fff8b",
                    }}
                  >
                    + Toevoegen
                  </button>
                )}
              </div>
            );
          }

          // ── AANWEZIG CERTIFICAAT ──
          return (
            <div key={cfg.type} className="p-3 rounded-xl" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)" }}>
              <p className="text-sm font-semibold mb-1 flex items-center gap-1.5" style={{ color: "#dae6ff" }}>
                <span style={{ color: "#3fff8b", fontSize: 14, lineHeight: 1 }}>●</span>
                {cfg.kortLabel || cfg.label}
              </p>

              {cfg.heeftNiveau && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {items.map(c => c.subtype && (
                    <span key={c.id} className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{ background: "rgba(63,255,139,0.1)", color: "#3fff8b", border: "1px solid rgba(63,255,139,0.3)" }}>
                      {c.subtype}
                    </span>
                  ))}
                </div>
              )}

              {cfg.heeftGebieden && items[0]?.ggi_gebieden && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {items[0].ggi_gebieden.map(g => (
                    <span key={g} className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{ background: "rgba(63,255,139,0.1)", color: "#3fff8b", border: "1px solid rgba(63,255,139,0.3)" }}>
                      {cfg.gebieden?.find(gb => gb.code === g)?.label || g}
                    </span>
                  ))}
                </div>
              )}

              {cfg.type === "POORT" && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ background: "rgba(63,255,139,0.1)", color: "#3fff8b" }}>
                  ✓ Behaald
                </span>
              )}

              {cfg.heeftVervaldatum && items[0]?.vervaldatum && (() => {
                const status = vervaldatumStatus(items[0].vervaldatum);
                return (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px]" style={{ color: "#a0abc3" }}>
                      Geldig tot: {format(parseISO(items[0].vervaldatum!), "d MMM yyyy", { locale: nl })}
                    </span>
                    <span className="text-[10px] font-bold" style={{ color: status.color }}>{status.label}</span>
                  </div>
                );
              })()}

              {/* File indicator */}
              <div className="mt-1.5">
                {hasFile ? (
                  <button onClick={() => {
                    const fileItem = items.find(c => c.bestand_url);
                    if (fileItem?.bestand_url) openFile(fileItem.bestand_url);
                  }}
                    className="flex items-center gap-1 text-[11px] font-medium" style={{ color: "#3fff8b" }}>
                    <Paperclip className="h-3 w-3" /> Bewijs aanwezig
                  </button>
                ) : (
                  <span className="flex items-center gap-1 text-[11px]" style={{ color: "#feb300" }}>
                    <Paperclip className="h-3 w-3" /> Geen bewijs geüpload
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

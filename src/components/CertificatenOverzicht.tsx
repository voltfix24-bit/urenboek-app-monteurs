import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CERT_CONFIG } from "@/lib/certificaten";
import { differenceInDays, parseISO, format } from "date-fns";
import { nl } from "date-fns/locale";
import { Pencil, Award, Paperclip } from "lucide-react";
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
          onSaved={() => { setShowForm(false); onRefresh?.(); }}
          onCancel={() => setShowForm(false)}
        />
      </div>
    );
  }

  const grouped: Record<string, Certificaat[]> = {};
  for (const c of certificaten) {
    if (!grouped[c.type]) grouped[c.type] = [];
    grouped[c.type].push(c);
  }

  const hasAnyCerts = certificaten.length > 0;

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#a0abc3" }}>Certificaten</p>
        {toonToevoegen && medewerker_id && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#3fff8b" }}>
            <Pencil className="h-3 w-3" /> Bewerken
          </button>
        )}
      </div>

      {!hasAnyCerts ? (
        <div className="text-center py-6">
          <Award className="h-6 w-6 mx-auto mb-2" style={{ color: "#a0abc3" }} />
          <p className="text-xs" style={{ color: "#a0abc3" }}>📋 Nog geen certificaten</p>
          {toonToevoegen && medewerker_id && (
            <button onClick={() => setShowForm(true)} className="mt-2 px-4 py-2 rounded-xl text-xs font-semibold"
              style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)", color: "#3fff8b" }}>
              + Certificaten toevoegen
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {CERT_CONFIG.map(cfg => {
            const items = grouped[cfg.type];
            if (!items || items.length === 0) return null;

            const hasFile = items.some(c => c.bestand_url);

            return (
              <div key={cfg.type} className="p-3 rounded-xl" style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)" }}>
                <p className="text-sm font-semibold mb-1" style={{ color: "#dae6ff" }}>
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
                    <span className="flex items-center gap-1 text-[11px]" style={{ color: "#a0abc3" }}>
                      <Paperclip className="h-3 w-3" /> Geen bewijs
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

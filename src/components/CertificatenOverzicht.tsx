import { useState } from "react";
import { CERT_CONFIG } from "@/lib/certificaten";
import { differenceInDays, parseISO, format } from "date-fns";
import { nl } from "date-fns/locale";
import { Pencil, Award } from "lucide-react";
import CertificatenForm from "./CertificatenForm";

interface Certificaat {
  id: string;
  type: string;
  naam: string;
  subtype?: string | null;
  vervaldatum: string | null;
  ggi_gebieden?: string[] | null;
}

interface Props {
  certificaten: Certificaat[];
  toonToevoegen?: boolean;
  medewerker_id?: string;
  onRefresh?: () => void;
}

function vervaldatumStatus(verval: string | null) {
  if (!verval) return { label: "Geen vervaldatum", color: "var(--text-muted)" };
  const diff = differenceInDays(parseISO(verval), new Date());
  if (diff < 0) return { label: "✕ Verlopen", color: "var(--danger)" };
  if (diff <= 30) return { label: "⚠ Verloopt binnenkort", color: "var(--warn-dot)" };
  return { label: "Geldig", color: "var(--success)" };
}

export default function CertificatenOverzicht({ certificaten, toonToevoegen, medewerker_id, onRefresh }: Props) {
  const [showForm, setShowForm] = useState(false);

  if (showForm && medewerker_id) {
    return (
      <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Certificaten beheren</p>
        <CertificatenForm
          medewerker_id={medewerker_id}
          onSaved={() => { setShowForm(false); onRefresh?.(); }}
          onCancel={() => setShowForm(false)}
        />
      </div>
    );
  }

  // Group by type
  const grouped: Record<string, Certificaat[]> = {};
  for (const c of certificaten) {
    if (!grouped[c.type]) grouped[c.type] = [];
    grouped[c.type].push(c);
  }

  const hasAnyCerts = certificaten.length > 0;

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Certificaten</p>
        {toonToevoegen && medewerker_id && (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--accent)" }}>
            <Pencil className="h-3 w-3" /> Bewerken
          </button>
        )}
      </div>

      {!hasAnyCerts ? (
        <div className="text-center py-6">
          <Award className="h-6 w-6 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>📋 Nog geen certificaten</p>
          {toonToevoegen && medewerker_id && (
            <button onClick={() => setShowForm(true)} className="mt-2 px-4 py-2 rounded-xl text-xs font-semibold"
              style={{ background: "var(--accent-light)", border: "1px solid var(--accent-border)", color: "var(--accent)" }}>
              + Certificaten toevoegen
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {CERT_CONFIG.map(cfg => {
            const items = grouped[cfg.type];
            if (!items || items.length === 0) return null;

            return (
              <div key={cfg.type} className="p-3 rounded-xl" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                  {cfg.kortLabel || cfg.label}
                </p>

                {/* BEI niveaus as badges */}
                {cfg.heeftNiveau && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {items.map(c => c.subtype && (
                      <span key={c.id} className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}>
                        {c.subtype}
                      </span>
                    ))}
                  </div>
                )}

                {/* GGI gebieden as pills */}
                {cfg.heeftGebieden && items[0]?.ggi_gebieden && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {items[0].ggi_gebieden.map(g => (
                      <span key={g} className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}>
                        {cfg.gebieden?.find(gb => gb.code === g)?.label || g}
                      </span>
                    ))}
                  </div>
                )}

                {/* POORT badge */}
                {cfg.type === "POORT" && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ background: "var(--success-light)", color: "var(--success)" }}>
                    ✓ Behaald
                  </span>
                )}

                {/* Vervaldatum */}
                {cfg.heeftVervaldatum && items[0]?.vervaldatum && (() => {
                  const status = vervaldatumStatus(items[0].vervaldatum);
                  return (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        Geldig tot: {format(parseISO(items[0].vervaldatum!), "d MMM yyyy", { locale: nl })}
                      </span>
                      <span className="text-[10px] font-bold" style={{ color: status.color }}>{status.label}</span>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

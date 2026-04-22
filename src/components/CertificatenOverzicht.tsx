import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CERT_CONFIG } from "@/lib/certificaten";
import { differenceInDays, parseISO, format } from "date-fns";
import { nl } from "date-fns/locale";
import { Pencil, Paperclip, ExternalLink, ChevronRight } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
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
  const [detailType, setDetailType] = useState<string | null>(null);

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
          <button onClick={() => openForm()} className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#3fff8b" }}>
            <Pencil className="h-3 w-3" /> Bewerken
          </button>
        )}
      </div>

      <div className="space-y-2">
        {CERT_CONFIG.map(cfg => {
          const items = grouped[cfg.type] ?? [];
          const isLeeg = items.length === 0;
          const hasFile = items.some(c => c.bestand_url);
          const canEdit = toonToevoegen && !!medewerker_id;

          // ── ONTBREKEND CERTIFICAAT ──
          if (isLeeg) {
            const Tag: any = canEdit ? "button" : "div";
            return (
              <Tag
                key={cfg.type}
                {...(canEdit ? {
                  type: "button",
                  onClick: () => openForm(cfg.type),
                  "aria-label": `${cfg.kortLabel || cfg.label} toevoegen`,
                } : {})}
                className={`w-full text-left p-3 rounded-xl flex items-start justify-between gap-3 transition-colors ${canEdit ? "hover:brightness-110 active:scale-[0.99]" : ""}`}
                style={{
                  background: "rgba(254,179,0,0.05)",
                  border: "1px dashed rgba(254,179,0,0.35)",
                  cursor: canEdit ? "pointer" : "default",
                }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold mb-0.5 flex items-center gap-1.5" style={{ color: "#dae6ff" }}>
                    <span style={{ color: "#feb300", fontSize: 14, lineHeight: 1 }}>○</span>
                    {cfg.kortLabel || cfg.label}
                  </p>
                  <p className="text-[11px]" style={{ color: "#feb300", fontWeight: 600 }}>
                    Ontbreekt — tik om toe te voegen
                  </p>
                </div>
                {canEdit && (
                  <span
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap shrink-0"
                    style={{
                      background: "rgba(63,255,139,0.1)",
                      border: "1px solid rgba(63,255,139,0.3)",
                      color: "#3fff8b",
                    }}
                  >
                    + Toevoegen
                  </span>
                )}
              </Tag>
            );
          }

          // ── AANWEZIG CERTIFICAAT ──
          // Sorteer op vervaldatum oplopend (verlopen/eerst-vervallend bovenaan)
          // zodat we de meest urgente status tonen.
          const sortedItems = [...items].sort((a, b) => {
            if (!a.vervaldatum && !b.vervaldatum) return 0;
            if (!a.vervaldatum) return 1;
            if (!b.vervaldatum) return -1;
            return parseISO(a.vervaldatum).getTime() - parseISO(b.vervaldatum).getTime();
          });
          const primaryItem = sortedItems[0];
          const meerdereUploads = items.filter(c => c.bestand_url).length > 1;
          const meerdereVervaldata = items.filter(c => c.vervaldatum).length > 1;

          return (
            <button
              key={cfg.type}
              type="button"
              onClick={() => setDetailType(cfg.type)}
              className="w-full text-left p-3 rounded-xl transition-colors hover:brightness-110 active:scale-[0.99]"
              style={{ background: "var(--app-navy)", border: "1px solid rgba(106,118,140,0.15)" }}
              aria-label={`${cfg.kortLabel || cfg.label} — details bekijken`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "#dae6ff" }}>
                  <span style={{ color: "#3fff8b", fontSize: 14, lineHeight: 1 }}>●</span>
                  {cfg.kortLabel || cfg.label}
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                  {items.length > 1 && (
                    <span
                      className="px-1.5 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
                      style={{
                        background: "rgba(63,255,139,0.1)",
                        color: "#3fff8b",
                        border: "1px solid rgba(63,255,139,0.3)",
                      }}
                      title={`${items.length} registraties`}
                    >
                      {items.length}×
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4" style={{ color: "#a0abc3" }} />
                </div>
              </div>

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

              {cfg.heeftGebieden && primaryItem?.ggi_gebieden && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {primaryItem.ggi_gebieden.map(g => (
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

              {cfg.heeftVervaldatum && primaryItem?.vervaldatum && (() => {
                const status = vervaldatumStatus(primaryItem.vervaldatum);
                return (
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[11px]" style={{ color: "#a0abc3" }}>
                      {meerdereVervaldata ? "Eerst verlopen: " : "Geldig tot: "}
                      {format(parseISO(primaryItem.vervaldatum!), "d MMM yyyy", { locale: nl })}
                    </span>
                    <span className="text-[10px] font-bold" style={{ color: status.color }}>{status.label}</span>
                  </div>
                );
              })()}

              {/* File indicator */}
              <div className="mt-1.5">
                {hasFile ? (
                  <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: "#3fff8b" }}>
                    <Paperclip className="h-3 w-3" />
                    {meerdereUploads ? `${items.filter(c => c.bestand_url).length} bewijzen` : "Bewijs aanwezig"}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px]" style={{ color: "#feb300" }}>
                    <Paperclip className="h-3 w-3" /> Geen bewijs geüpload
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail sheet */}
      {(() => {
        const cfg = detailType ? CERT_CONFIG.find(c => c.type === detailType) : null;
        const items = cfg ? (grouped[cfg.type] ?? []) : [];
        const sortedItems = [...items].sort((a, b) => {
          if (!a.vervaldatum && !b.vervaldatum) return 0;
          if (!a.vervaldatum) return 1;
          if (!b.vervaldatum) return -1;
          return parseISO(a.vervaldatum).getTime() - parseISO(b.vervaldatum).getTime();
        });
        return (
          <BottomSheet
            open={!!cfg}
            onClose={() => setDetailType(null)}
            title={cfg ? (cfg.kortLabel || cfg.label) : ""}
            ariaLabel="Certificaat details"
          >
            {cfg && (
              <div className="space-y-3 pb-2">
                <p className="text-xs" style={{ color: "#a0abc3" }}>
                  {items.length} {items.length === 1 ? "registratie" : "registraties"} —
                  {" "}{items.filter(i => i.bestand_url).length} met bewijs
                </p>

                {sortedItems.map((item, idx) => {
                  const status = vervaldatumStatus(item.vervaldatum);
                  const gebiedLabels = item.ggi_gebieden?.map(g =>
                    cfg.gebieden?.find(gb => gb.code === g)?.label || g
                  );
                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl"
                      style={{
                        background: "rgba(10,26,48,0.7)",
                        border: `1px solid ${idx === 0 && item.vervaldatum ? `${status.color}55` : "rgba(106,118,140,0.15)"}`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold" style={{ color: "#dae6ff" }}>
                            {item.subtype || item.naam || (cfg.kortLabel || cfg.label)}
                          </p>
                          {gebiedLabels && gebiedLabels.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {gebiedLabels.map((g, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                                  style={{ background: "rgba(63,255,139,0.1)", color: "#3fff8b", border: "1px solid rgba(63,255,139,0.3)" }}>
                                  {g}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap"
                          style={{
                            background: `${status.color}1f`,
                            color: status.color,
                            border: `1px solid ${status.color}55`,
                          }}
                        >
                          {status.label}
                        </span>
                      </div>

                      {item.vervaldatum && (
                        <p className="text-[11px]" style={{ color: "#a0abc3" }}>
                          Geldig tot: <span style={{ color: "#dae6ff", fontWeight: 600 }}>
                            {format(parseISO(item.vervaldatum), "d MMMM yyyy", { locale: nl })}
                          </span>
                        </p>
                      )}

                      <div className="mt-2">
                        {item.bestand_url ? (
                          <button
                            onClick={() => openFile(item.bestand_url!)}
                            className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg"
                            style={{
                              background: "rgba(63,255,139,0.1)",
                              color: "#3fff8b",
                              border: "1px solid rgba(63,255,139,0.3)",
                            }}
                          >
                            <ExternalLink className="h-3 w-3" /> Bewijs openen
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

                {toonToevoegen && medewerker_id && (
                  <button
                    onClick={() => { setDetailType(null); openForm(cfg.type); }}
                    className="w-full mt-2 py-2.5 rounded-xl text-sm font-semibold"
                    style={{
                      background: "rgba(63,255,139,0.1)",
                      color: "#3fff8b",
                      border: "1px solid rgba(63,255,139,0.3)",
                    }}
                  >
                    Bewerken / nieuwe upload toevoegen
                  </button>
                )}
              </div>
            )}
          </BottomSheet>
        );
      })()}
    </div>
  );
}

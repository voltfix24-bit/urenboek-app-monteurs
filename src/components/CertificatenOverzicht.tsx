import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CERT_CONFIG } from "@/lib/certificaten";
import { differenceInDays, parseISO, format } from "date-fns";
import { nl } from "date-fns/locale";
import { Pencil, Paperclip, ExternalLink, ChevronRight, AlertTriangle } from "lucide-react";
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
  const [detailSort, setDetailSort] = useState<"datum" | "status">("datum");

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

  // ── WAARSCHUWING: certificaten verlopen of binnen 60 dagen ──
  // Per type alleen de meest urgente registratie (laagste resterende dagen) meenemen.
  const WAARSCHUWING_DAGEN = 60;
  const nu = new Date();
  type Waarschuwing = { type: string; label: string; dagen: number; vervaldatum: string };
  const waarschuwingen: Waarschuwing[] = CERT_CONFIG
    .map(cfg => {
      const items = (grouped[cfg.type] ?? []).filter(c => c.vervaldatum);
      if (items.length === 0) return null;
      const meestUrgent = items.reduce((min, c) =>
        parseISO(c.vervaldatum!).getTime() < parseISO(min.vervaldatum!).getTime() ? c : min
      );
      const dagen = differenceInDays(parseISO(meestUrgent.vervaldatum!), nu);
      if (dagen > WAARSCHUWING_DAGEN) return null;
      return {
        type: cfg.type,
        label: cfg.kortLabel || cfg.label,
        dagen,
        vervaldatum: meestUrgent.vervaldatum!,
      } as Waarschuwing;
    })
    .filter((w): w is Waarschuwing => w !== null)
    .sort((a, b) => a.dagen - b.dagen);

  const heeftVerlopen = waarschuwingen.some(w => w.dagen < 0);
  const stripBg = heeftVerlopen ? "rgba(255,113,108,0.08)" : "rgba(254,179,0,0.08)";
  const stripBorder = heeftVerlopen ? "rgba(255,113,108,0.4)" : "rgba(254,179,0,0.4)";
  const stripColor = heeftVerlopen ? "#ff716c" : "#feb300";

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

      {/* Waarschuwingsstrook — verlopen of binnen 60 dagen */}
      {waarschuwingen.length > 0 && (
        <div
          role="alert"
          className="rounded-xl p-3 flex items-start gap-2.5"
          style={{ background: stripBg, border: `1px solid ${stripBorder}` }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: stripColor }} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-xs font-bold" style={{ color: stripColor }}>
              {heeftVerlopen
                ? `${waarschuwingen.filter(w => w.dagen < 0).length} verlopen${waarschuwingen.some(w => w.dagen >= 0) ? ` · ${waarschuwingen.filter(w => w.dagen >= 0).length} binnenkort` : ""}`
                : `${waarschuwingen.length} ${waarschuwingen.length === 1 ? "certificaat verloopt" : "certificaten verlopen"} binnen 60 dagen`}
            </p>
            <ul className="space-y-1">
              {waarschuwingen.slice(0, 4).map(w => {
                const Tag: any = toonToevoegen && medewerker_id ? "button" : "div";
                return (
                  <Tag
                    key={w.type}
                    {...(toonToevoegen && medewerker_id ? {
                      type: "button",
                      onClick: () => openForm(w.type),
                      "aria-label": `${w.label} verlengen`,
                    } : {})}
                    className={`w-full flex items-center justify-between gap-2 text-[11px] ${toonToevoegen && medewerker_id ? "hover:brightness-125 active:scale-[0.99] transition" : ""}`}
                    style={{ color: "#dae6ff", textAlign: "left" }}
                  >
                    <span className="font-semibold truncate">{w.label}</span>
                    <span className="shrink-0 font-bold" style={{ color: w.dagen < 0 ? "#ff716c" : "#feb300" }}>
                      {w.dagen < 0
                        ? `${Math.abs(w.dagen)} dgn verlopen`
                        : w.dagen === 0
                          ? "vandaag"
                          : `nog ${w.dagen} dgn`}
                    </span>
                  </Tag>
                );
              })}
              {waarschuwingen.length > 4 && (
                <li className="text-[11px]" style={{ color: "#a0abc3" }}>
                  +{waarschuwingen.length - 4} meer…
                </li>
              )}
            </ul>
            {toonToevoegen && medewerker_id && (
              <button
                onClick={() => openForm()}
                className="mt-1 px-2.5 py-1 rounded-lg text-[10px] font-bold"
                style={{
                  background: "rgba(63,255,139,0.1)",
                  border: "1px solid rgba(63,255,139,0.3)",
                  color: "#3fff8b",
                }}
              >
                Verlengen / nieuwe upload
              </button>
            )}
          </div>
        </div>
      )}

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

        // Datum-sortering: eerst-vervallend bovenaan; ontbrekende vervaldata onderaan.
        const datumSorted = [...items].sort((a, b) => {
          if (!a.vervaldatum && !b.vervaldatum) return 0;
          if (!a.vervaldatum) return 1;
          if (!b.vervaldatum) return -1;
          return parseISO(a.vervaldatum).getTime() - parseISO(b.vervaldatum).getTime();
        });

        // Status-sortering: 0 = verlopen (met bewijs), 1 = actueel (geldig + bewijs),
        // 2 = geldig zonder bewijs / geen vervaldatum / overig.
        const statusRank = (c: Certificaat): number => {
          if (!c.vervaldatum) return 2;
          const dagen = differenceInDays(parseISO(c.vervaldatum), new Date());
          if (dagen < 0 && c.bestand_url) return 0;
          if (dagen >= 0 && c.bestand_url) return 1;
          return 2;
        };
        const statusSorted = [...datumSorted].sort((a, b) => statusRank(a) - statusRank(b));

        const sortedItems = detailSort === "status" ? statusSorted : datumSorted;

        return (
          <BottomSheet
            open={!!cfg}
            onClose={() => setDetailType(null)}
            title={cfg ? (cfg.kortLabel || cfg.label) : ""}
            ariaLabel="Certificaat details"
          >
            {cfg && (
              <div className="space-y-3 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs" style={{ color: "#a0abc3" }}>
                    {items.length} {items.length === 1 ? "registratie" : "registraties"} —
                    {" "}{items.filter(i => i.bestand_url).length} met bewijs
                  </p>
                  {items.length > 1 && (
                    <div
                      role="tablist"
                      aria-label="Sorteren"
                      className="flex p-0.5 rounded-lg"
                      style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.2)" }}
                    >
                      {([
                        { key: "datum", label: "Datum" },
                        { key: "status", label: "Status" },
                      ] as const).map(opt => {
                        const active = detailSort === opt.key;
                        return (
                          <button
                            key={opt.key}
                            role="tab"
                            aria-selected={active}
                            onClick={() => setDetailSort(opt.key)}
                            className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition"
                            style={{
                              background: active ? "#3fff8b" : "transparent",
                              color: active ? "#003d1f" : "#a0abc3",
                              letterSpacing: "0.08em",
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {(() => {
                  const itemsMetBewijs = sortedItems.filter(i => i.bestand_url);
                  const meerdere = itemsMetBewijs.length > 1;
                  // Meest recent geldige upload = laagste index in sortedItems (oplopend op vervaldatum)
                  // die NIET verlopen is en wél een bestand heeft.
                  // sortedItems is oplopend op vervaldatum (eerst-vervallend bovenaan), dus voor
                  // "meest recent geldig" pakken we het item met de hoogste vervaldatum dat geldig is.
                  const geldigeMetBewijs = itemsMetBewijs.filter(i => {
                    if (!i.vervaldatum) return false;
                    return differenceInDays(parseISO(i.vervaldatum), new Date()) >= 0;
                  });
                  const meestRecentGeldigId = geldigeMetBewijs.length > 0
                    ? geldigeMetBewijs.reduce((max, c) =>
                        parseISO(c.vervaldatum!).getTime() > parseISO(max.vervaldatum!).getTime() ? c : max
                      ).id
                    : null;

                  return sortedItems.map((item, idx) => {
                    const status = vervaldatumStatus(item.vervaldatum);
                    const gebiedLabels = item.ggi_gebieden?.map(g =>
                      cfg.gebieden?.find(gb => gb.code === g)?.label || g
                    );
                    const isVerlopen = item.vervaldatum
                      ? differenceInDays(parseISO(item.vervaldatum), new Date()) < 0
                      : false;
                    const isActueel = meerdere && item.id === meestRecentGeldigId;

                    return (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl"
                        style={{
                          background: isVerlopen ? "rgba(255,113,108,0.06)" : "rgba(10,26,48,0.7)",
                          border: `1px solid ${
                            isVerlopen
                              ? "rgba(255,113,108,0.45)"
                              : isActueel
                                ? "rgba(63,255,139,0.45)"
                                : idx === 0 && item.vervaldatum
                                  ? `${status.color}55`
                                  : "rgba(106,118,140,0.15)"
                          }`,
                        }}
                      >
                        {/* Markering-badges voor meerdere uploads */}
                        {meerdere && item.bestand_url && (isVerlopen || isActueel) && (
                          <div className="mb-2">
                            {isVerlopen && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider"
                                style={{
                                  background: "#ff716c",
                                  color: "#3a0805",
                                  letterSpacing: "0.08em",
                                }}
                              >
                                ⛔ Verlopen bewijs
                              </span>
                            )}
                            {isActueel && (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider"
                                style={{
                                  background: "#3fff8b",
                                  color: "#003d1f",
                                  letterSpacing: "0.08em",
                                }}
                              >
                                ✓ Actueel bewijs
                              </span>
                            )}
                          </div>
                        )}

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
                                background: isVerlopen ? "rgba(255,113,108,0.1)" : "rgba(63,255,139,0.1)",
                                color: isVerlopen ? "#ff716c" : "#3fff8b",
                                border: `1px solid ${isVerlopen ? "rgba(255,113,108,0.3)" : "rgba(63,255,139,0.3)"}`,
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
                  });
                })()}

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

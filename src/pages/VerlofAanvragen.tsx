import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DayPicker, DateRange } from "react-day-picker";
import { format, differenceInCalendarDays, addDays, isWeekend } from "date-fns";
import { nl } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { BottomNav } from "@/components/BottomNav";
import { useNavBadges } from "@/hooks/useNavBadges";

const NAVY = "var(--app-navy)";
const SURFACE = "#172129";
const SURFACE_2 = "#0c141b";
const GREEN = "#3fff8b";
const GREEN_DARK = "#13ea79";
const TEXT = "#dae6ff";
const MUTED = "#a0abc3";
const SUBTLE = "#424950";

type VerlofType = "vakantie" | "verlof" | "anders";

const MAX_DAGEN = 90;            // Max aantal dagen per aanvraag
const MAX_MAANDEN_VOORUIT = 12;  // Max ver in de toekomst

export default function VerlofAanvragen() {
  const navigate = useNavigate();
  const { profile, profileId } = useProfile();
  const { badges } = useNavBadges();
  const [success, setSuccess] = useState(false);
  const [type, setType] = useState<VerlofType>("vakantie");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [reden, setReden] = useState("");
  const [sending, setSending] = useState(false);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const maxDate = useMemo(() => {
    const d = new Date(today);
    d.setMonth(d.getMonth() + MAX_MAANDEN_VOORUIT);
    return d;
  }, [today]);

  const aantalDagen = useMemo(() => {
    if (!range?.from || !range?.to) return 0;
    return differenceInCalendarDays(range.to, range.from) + 1;
  }, [range]);

  const aantalWerkdagen = useMemo(() => {
    if (!range?.from || !range?.to) return 0;
    let count = 0;
    let d = range.from;
    while (d <= range.to) {
      if (!isWeekend(d)) count++;
      d = addDays(d, 1);
    }
    return count;
  }, [range]);

  // ── HARDE VALIDATIE ──
  const validatieFout = useMemo<string | null>(() => {
    if (!range?.from) return null;
    if (range.from < today) return "Startdatum mag niet in het verleden liggen.";
    if (range.from > maxDate) return `Startdatum mag niet meer dan ${MAX_MAANDEN_VOORUIT} maanden in de toekomst liggen.`;
    if (range.to) {
      if (range.to < range.from) return "Einddatum kan niet vóór de startdatum liggen.";
      if (range.to > maxDate) return `Einddatum mag niet meer dan ${MAX_MAANDEN_VOORUIT} maanden in de toekomst liggen.`;
      if (aantalDagen > MAX_DAGEN) return `Maximaal ${MAX_DAGEN} dagen per aanvraag (nu ${aantalDagen}).`;
    }
    return null;
  }, [range, today, maxDate, aantalDagen]);

  const isValid = !!(range?.from && range?.to) && !validatieFout;

  const handleVerstuur = async () => {
    if (!profileId || !range?.from || !range?.to) return;
    if (validatieFout) {
      toast.error(validatieFout);
      return;
    }
    setSending(true);
    const ok = await mutate(
      supabase.from("beschikbaarheid").insert({
        medewerker_id: profileId,
        type,
        datum_van: format(range.from, "yyyy-MM-dd"),
        datum_tot: format(range.to, "yyyy-MM-dd"),
        reden: reden || null,
        status: "aangevraagd",
      } as any)
    );
    setSending(false);
    if (ok) setSuccess(true);
    else toast.error("Dat ging niet goed. Probeer het nog een keer.");
  };

  /* ── SUCCESS SCREEN ── */
  if (success) {
    return (
      <div style={{
        minHeight: "100dvh",
        background: NAVY,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px calc(env(safe-area-inset-bottom, 0px) + 96px)",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)",
          width: 400, height: 400, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(63,255,139,0.15), transparent 70%)",
          pointerEvents: "none",
        }} />

        <div style={{
          width: 96, height: 96, borderRadius: "50%",
          background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DARK})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 28, boxShadow: "0 20px 60px rgba(63,255,139,0.4)",
          position: "relative", zIndex: 1,
        }}>
          <span className="material-symbols-outlined" style={{
            fontSize: 56, color: "#005d2c", fontVariationSettings: "'FILL' 1",
          }}>check_circle</span>
        </div>

        <h1 style={{
          fontFamily: "Manrope", fontWeight: 800, fontSize: 32, color: TEXT,
          marginBottom: 12, textAlign: "center", position: "relative", zIndex: 1,
        }}>
          Aanvraag verstuurd!
        </h1>
        <p style={{
          fontFamily: "Inter", fontSize: 14, color: MUTED, textAlign: "center",
          maxWidth: 320, lineHeight: 1.5, marginBottom: 32, position: "relative", zIndex: 1,
        }}>
          Je verlofaanvraag is binnen. Je krijgt bericht zodra hij goedgekeurd is.
        </p>

        <div style={{
          width: "100%", maxWidth: 360, display: "flex", flexDirection: "column",
          gap: 10, marginBottom: 28, position: "relative", zIndex: 1,
        }}>
          <button
            onClick={() => navigate("/profiel")}
            style={{
              width: "100%", padding: "18px 0", borderRadius: 16,
              background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DARK})`,
              border: "none", color: "#005d2c", fontFamily: "Manrope",
              fontWeight: 800, fontSize: 16, cursor: "pointer",
              boxShadow: "0 12px 40px rgba(63,255,139,0.2)",
            }}>
            Terug naar overzicht
          </button>
        </div>

        <div style={{
          width: "100%", maxWidth: 360, display: "grid",
          gridTemplateColumns: "1fr 1fr", gap: 10, position: "relative", zIndex: 1,
        }}>
          <div style={{ background: SURFACE_2, borderRadius: 14, padding: "14px 16px" }}>
            <p style={{
              fontSize: 9, fontWeight: 700, color: SUBTLE, fontFamily: "Inter",
              textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 6,
            }}>STATUS</p>
            <p style={{
              fontFamily: "Manrope", fontWeight: 800, fontSize: 14,
              color: GREEN, letterSpacing: "0.05em",
            }}>AANGEVRAAGD</p>
          </div>
          <div style={{ background: SURFACE_2, borderRadius: 14, padding: "14px 16px" }}>
            <p style={{
              fontSize: 9, fontWeight: 700, color: SUBTLE, fontFamily: "Inter",
              textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 6,
            }}>PERIODE</p>
            <p style={{
              fontFamily: "Manrope", fontWeight: 800, fontSize: 14,
              color: TEXT, letterSpacing: "0.05em",
            }}>
              {aantalDagen} {aantalDagen === 1 ? "DAG" : "DAGEN"}
            </p>
          </div>
        </div>

        <BottomNav badges={badges} />
      </div>
    );
  }

  /* ── FORM SCREEN ── */
  return (
    <div style={{
      minHeight: "100dvh",
      background: NAVY,
      paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 180px)",
    }}>
      {/* Calendar styling override — duidelijke range, grotere cellen, betere hiërarchie */}
      <style>{`
        .verlof-cal {
          --rdp-cell-size: 44px;
          --rdp-accent-color: ${GREEN};
          --rdp-background-color: rgba(63,255,139,0.14);
          margin: 0;
        }
        .verlof-cal .rdp-months { justify-content: center; }
        .verlof-cal .rdp-month { width: 100%; }
        .verlof-cal .rdp-table { width: 100%; max-width: 100%; border-collapse: separate; border-spacing: 0; }
        .verlof-cal .rdp-caption {
          padding: 4px 6px 14px;
        }
        .verlof-cal .rdp-caption_label {
          font-family: 'Manrope', sans-serif; font-weight: 800; font-size: 17px;
          color: ${TEXT}; text-transform: capitalize; letter-spacing: 0.01em;
        }
        .verlof-cal .rdp-nav_button {
          color: ${GREEN}; background: ${SURFACE_2}; border: none;
          width: 38px; height: 38px; border-radius: 12px;
          transition: background 0.15s, transform 0.1s;
        }
        .verlof-cal .rdp-nav_button:hover { background: rgba(63,255,139,0.18); }
        .verlof-cal .rdp-nav_button:active { transform: scale(0.94); }
        .verlof-cal .rdp-head_cell {
          color: ${MUTED}; font-family: 'Inter', sans-serif;
          font-weight: 700; font-size: 11px; text-transform: uppercase;
          letter-spacing: 0.12em; padding: 4px 0 10px;
        }
        .verlof-cal .rdp-cell {
          padding: 2px 0;
          position: relative;
        }
        .verlof-cal .rdp-day {
          color: ${TEXT}; font-family: 'Inter', sans-serif; font-weight: 600;
          font-size: 14px; border-radius: 12px;
          width: 40px; height: 40px;
          transition: background 0.15s, color 0.15s;
        }
        .verlof-cal .rdp-day:hover:not([disabled]):not(.rdp-day_selected) {
          background: rgba(255,255,255,0.07);
        }
        /* Vandaag — duidelijke groene ring */
        .verlof-cal .rdp-day_today:not(.rdp-day_selected) {
          color: ${GREEN}; font-weight: 800;
          box-shadow: inset 0 0 0 2px ${GREEN};
        }
        /* Disabled (verleden / te ver vooruit) — visueel gedempt, niet doorgestreept */
        .verlof-cal .rdp-day_disabled {
          color: ${SUBTLE} !important; opacity: 0.5;
          font-weight: 500;
        }
        .verlof-cal .rdp-day_outside {
          color: ${SUBTLE}; opacity: 0.45; font-weight: 500;
        }

        /* ── RANGE: doorlopende balk over de hele cel ── */
        /* Middle days: volle balk, geen ronde hoeken, sterk contrast */
        .verlof-cal .rdp-day_range_middle {
          background: rgba(63,255,139,0.22) !important;
          color: ${TEXT} !important;
          border-radius: 0 !important;
          font-weight: 700 !important;
          width: 100% !important;
          box-shadow: none !important;
        }
        .verlof-cal .rdp-cell:has(.rdp-day_range_middle) {
          background: rgba(63,255,139,0.22);
        }
        /* Start: pill links, balk vult de cel rechts */
        .verlof-cal .rdp-cell:has(.rdp-day_range_start):not(:has(.rdp-day_range_end)) {
          background: linear-gradient(to right, transparent 50%, rgba(63,255,139,0.22) 50%);
        }
        /* End: balk vult de cel links, pill rechts */
        .verlof-cal .rdp-cell:has(.rdp-day_range_end):not(:has(.rdp-day_range_start)) {
          background: linear-gradient(to right, rgba(63,255,139,0.22) 50%, transparent 50%);
        }
        /* Start & end pills — sterke groene knop met schaduw */
        .verlof-cal .rdp-day_range_start,
        .verlof-cal .rdp-day_range_end {
          background: ${GREEN} !important;
          color: #003d1f !important;
          font-weight: 800 !important;
          border-radius: 50% !important;
          width: 40px !important;
          height: 40px !important;
          box-shadow: 0 6px 18px rgba(63,255,139,0.35), inset 0 0 0 2px rgba(255,255,255,0.15) !important;
          z-index: 1;
          position: relative;
        }
        /* Single day (start === end) */
        .verlof-cal .rdp-day_range_start.rdp-day_range_end {
          border-radius: 50% !important;
        }
        .verlof-cal .rdp-cell:has(.rdp-day_range_start.rdp-day_range_end) {
          background: transparent !important;
        }
        /* Eerste klik (alleen 'from' gekozen, nog geen 'to') */
        .verlof-cal .rdp-day_selected:not(.rdp-day_range_middle):not(.rdp-day_range_start):not(.rdp-day_range_end) {
          background: ${GREEN} !important;
          color: #003d1f !important;
          border-radius: 50% !important;
          font-weight: 800 !important;
          box-shadow: 0 6px 18px rgba(63,255,139,0.35), inset 0 0 0 2px rgba(255,255,255,0.15) !important;
        }
        /* Weekenden subtiel afgewisseld zodat ma-vr werkdagen visueel pop'en */
        .verlof-cal .rdp-head_cell:nth-child(6),
        .verlof-cal .rdp-head_cell:nth-child(7) {
          color: ${SUBTLE};
        }
      `}</style>

      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", gap: 14, padding: "20px 20px 16px",
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            width: 40, height: 40, borderRadius: "50%", background: "#1d2730",
            border: "none", color: GREEN, display: "flex",
            alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
        </button>
        <h1 style={{
          fontFamily: "Manrope", fontWeight: 800, fontSize: 22, color: TEXT,
        }}>
          Verlof aanvragen
        </h1>
      </header>

      <main style={{
        padding: "0 20px", display: "flex", flexDirection: "column", gap: 16,
      }}>
        {/* Type verlof */}
        <section style={{ background: SURFACE, borderRadius: 20, padding: 20 }}>
          <p style={{
            fontSize: 10, fontWeight: 700, color: SUBTLE, fontFamily: "Inter",
            textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12,
          }}>Type verlof</p>
          <div style={{ display: "flex", padding: 4, background: SURFACE_2, borderRadius: 14, gap: 4 }}>
            {(["vakantie", "verlof", "anders"] as const).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                style={{
                  flex: 1, padding: "12px 8px", borderRadius: 10, border: "none",
                  background: type === t ? `linear-gradient(135deg, ${GREEN}, ${GREEN_DARK})` : "transparent",
                  color: type === t ? "#003d1f" : MUTED,
                  fontFamily: "Inter", fontWeight: 700, fontSize: 13,
                  cursor: "pointer", textTransform: "capitalize",
                  boxShadow: type === t ? "0 4px 12px rgba(63,255,139,0.2)" : "none",
                  transition: "all 0.15s",
                }}>{t}</button>
            ))}
          </div>
        </section>

        {/* Kalender */}
        <section style={{ background: SURFACE, borderRadius: 20, padding: "20px 12px 16px" }}>
          <div style={{ padding: "0 8px 12px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <h2 style={{
                fontFamily: "Manrope", fontWeight: 700, fontSize: 15,
                color: TEXT, marginBottom: 4,
              }}>
                Kies je periode
              </h2>
              <p style={{
                fontFamily: "Inter", fontSize: 12, color: MUTED, lineHeight: 1.4,
              }}>
                Tik op je eerste dag, daarna op je laatste dag.
              </p>
            </div>
            {(range?.from || range?.to) && (
              <button
                onClick={() => { setRange(undefined); toast.success("Selectie gewist"); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 12,
                  background: "rgba(255,113,108,0.1)",
                  border: "1px solid rgba(255,113,108,0.35)",
                  color: "#ff716c", fontFamily: "Inter",
                  fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>restart_alt</span>
                Reset selectie
              </button>
            )}
          </div>

          <DayPicker
            mode="range"
            selected={range}
            onSelect={(r) => {
              if (!r?.from || !r?.to) { setRange(r); return; }
              // Hard guard: einddatum altijd >= startdatum (DayPicker doet dit normaal,
              // maar deze guard maakt het expliciet en vangt edge cases af)
              if (r.to < r.from) {
                toast.error("Einddatum kan niet vóór de startdatum liggen.");
                setRange({ from: r.from, to: undefined });
                return;
              }
              const dagen = differenceInCalendarDays(r.to, r.from) + 1;
              if (dagen > MAX_DAGEN) {
                toast.error(`Maximaal ${MAX_DAGEN} dagen per aanvraag.`);
                return;
              }
              setRange(r);
            }}
            disabled={[{ before: today }, { after: maxDate }]}
            locale={nl}
            weekStartsOn={1}
            showOutsideDays
            className="verlof-cal pointer-events-auto"
            components={{
              IconLeft: () => <ChevronLeft className="h-4 w-4" />,
              IconRight: () => <ChevronRight className="h-4 w-4" />,
            }}
          />

          {/* Validatiefout */}
          {validatieFout && (
            <div style={{
              marginTop: 12, padding: "12px 14px", borderRadius: 12,
              background: "rgba(255,113,108,0.1)", border: "1px solid rgba(255,113,108,0.35)",
              display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#ff716c", flexShrink: 0, marginTop: 1 }}>error</span>
              <p style={{ fontFamily: "Inter", fontSize: 12, color: "#ff716c", fontWeight: 600, lineHeight: 1.4 }}>
                {validatieFout}
              </p>
            </div>
          )}

          {/* Summary */}
          {isValid && range?.from && range?.to && (
            <div style={{
              marginTop: 12, padding: "14px 16px", borderRadius: 14,
              background: SURFACE_2, display: "flex", justifyContent: "space-between",
              alignItems: "center", gap: 12,
            }}>
              <div style={{ minWidth: 0 }}>
                <p style={{
                  fontSize: 9, fontWeight: 700, color: SUBTLE,
                  fontFamily: "Inter", textTransform: "uppercase",
                  letterSpacing: "0.15em", marginBottom: 4,
                }}>
                  PERIODE
                </p>
                <p style={{
                  fontFamily: "Inter", fontSize: 13, color: TEXT, fontWeight: 600,
                }}>
                  {format(range.from, "d MMM", { locale: nl })}
                  {" – "}
                  {format(range.to, "d MMM yyyy", { locale: nl })}
                </p>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{
                  fontFamily: "Manrope", fontWeight: 800, fontSize: 20, color: GREEN,
                  lineHeight: 1, marginBottom: 2,
                }}>
                  {aantalDagen}
                </p>
                <p style={{
                  fontFamily: "Inter", fontSize: 10, color: MUTED, fontWeight: 600,
                }}>
                  {aantalDagen === 1 ? "dag" : "dagen"}
                  {aantalWerkdagen !== aantalDagen && ` · ${aantalWerkdagen} werkd.`}
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Reden */}
        <section style={{ background: SURFACE, borderRadius: 20, padding: 20 }}>
          <p style={{
            fontSize: 10, fontWeight: 700, color: SUBTLE, fontFamily: "Inter",
            textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 8,
          }}>
            Reden (optioneel)
          </p>
          <textarea
            value={reden}
            onChange={e => setReden(e.target.value)}
            placeholder="Bijv. familiebezoek, vakantie naar het buitenland..."
            rows={3}
            style={{
              width: "100%", background: SURFACE_2, border: "none", borderRadius: 12,
              padding: "14px", color: TEXT, fontFamily: "Inter", fontSize: 13,
              resize: "none", outline: "none", boxSizing: "border-box",
            }} />
        </section>
      </main>

      {/* Sticky footer */}
      <div style={{
        position: "fixed",
        bottom: 0, left: 0, right: 0,
        zIndex: 40,
        background: `linear-gradient(180deg, transparent, ${NAVY} 30%)`,
        padding: "20px 20px calc(env(safe-area-inset-bottom, 0px) + 90px)",
        pointerEvents: "none",
      }}>
        <button
          onClick={handleVerstuur}
          disabled={!isValid || sending}
          style={{
            pointerEvents: "auto",
            width: "100%", padding: "18px 0", borderRadius: 16,
            background: isValid ? `linear-gradient(135deg, ${GREEN}, ${GREEN_DARK})` : SURFACE,
            border: "none", color: isValid ? "#003d1f" : SUBTLE,
            fontFamily: "Manrope", fontWeight: 800, fontSize: 16,
            textTransform: "uppercase", letterSpacing: "0.1em",
            cursor: isValid && !sending ? "pointer" : "not-allowed",
            opacity: sending ? 0.6 : 1,
            boxShadow: isValid ? "0 12px 40px rgba(63,255,139,0.25)" : "none",
            transition: "all 0.2s",
          }}>
          {sending ? "Versturen..." : "Aanvraag versturen"}
        </button>
      </div>

      <BottomNav badges={badges} />
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { BottomNav } from "@/components/BottomNav";
import { useNavBadges } from "@/hooks/useNavBadges";

const TERREVOLT_TEL = "0624469136";

export default function ZiekMelden() {
  const navigate = useNavigate();
  const { profile, profileId } = useProfile();
  const { badges } = useNavBadges();
  const [success, setSuccess] = useState(false);
  const [datumTerug, setDatumTerug] = useState("");
  const [opmerking, setOpmerking] = useState("");
  const [sending, setSending] = useState(false);

  const now = new Date();
  const vandaag = now.toISOString().split("T")[0];
  const tijdstip = now.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  const vandaagLabel = now.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

  const handleVerstuur = async () => {
    if (!profileId) return;
    setSending(true);
    const ok = await mutate(
      supabase.from("beschikbaarheid").insert({
        medewerker_id: profileId,
        type: "ziek",
        datum_van: vandaag,
        datum_tot: datumTerug || vandaag,
        reden: opmerking || null,
        status: "goedgekeurd",
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
        minHeight: "100vh",
        background: "#f9fafb",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 24px calc(env(safe-area-inset-bottom, 0px) + 96px)",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Ambient glow */}
        <div style={{
          position: "absolute",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, #ecfdf5, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Icon */}
        <div style={{
          width: 96,
          height: 96,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #10b981, #34d399)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 28,
          boxShadow: "0 20px 60px #6ee7b7",
          position: "relative",
          zIndex: 1,
        }}>
          <span className="material-symbols-outlined" style={{
            fontSize: 56,
            color: "#047857",
            fontVariationSettings: "'FILL' 1",
          }}>
            check_circle
          </span>
        </div>

        {/* Text */}
        <h1 style={{
          fontFamily: "Manrope",
          fontWeight: 800,
          fontSize: 32,
          color: "#1f2937",
          marginBottom: 12,
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}>
          Beterschap!
        </h1>
        <p style={{
          fontFamily: "Inter",
          fontSize: 14,
          color: "#6b7280",
          textAlign: "center",
          maxWidth: 320,
          lineHeight: 1.5,
          marginBottom: 32,
          position: "relative",
          zIndex: 1,
        }}>
          Je ziekmelding is verstuurd. De planning en je leidinggevende zijn nu op de hoogte.
        </p>

        {/* Buttons */}
        <div style={{
          width: "100%",
          maxWidth: 360,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 28,
          position: "relative",
          zIndex: 1,
        }}>
          <button
            onClick={() => navigate("/profiel")}
            style={{
              width: "100%",
              padding: "18px 0",
              borderRadius: 16,
              background: "linear-gradient(135deg, #10b981, #34d399)",
              border: "none",
              color: "#047857",
              fontFamily: "Manrope",
              fontWeight: 800,
              fontSize: 16,
              cursor: "pointer",
              boxShadow: "0 12px 40px #d1fae5",
            }}>
            Terug naar overzicht
          </button>
          <button
            onClick={() => navigate("/planning")}
            style={{
              width: "100%",
              padding: "18px 0",
              borderRadius: 16,
              background: "#ffffff",
              border: "1px solid rgba(66,73,80,0.15)",
              color: "#10b981",
              fontFamily: "Manrope",
              fontWeight: 800,
              fontSize: 16,
              cursor: "pointer",
            }}>
            Bekijk planning
          </button>
        </div>

        {/* Status grid */}
        <div style={{
          width: "100%",
          maxWidth: 360,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          position: "relative",
          zIndex: 1,
        }}>
          <div style={{
            background: "#f9fafb",
            borderRadius: 14,
            padding: "14px 16px",
          }}>
            <p style={{
              fontSize: 9,
              fontWeight: 700,
              color: "#424950",
              fontFamily: "Inter",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              marginBottom: 6,
            }}>
              STATUS
            </p>
            <p style={{
              fontFamily: "Manrope",
              fontWeight: 800,
              fontSize: 14,
              color: "#10b981",
              letterSpacing: "0.05em",
            }}>
              AFGEMELD
            </p>
          </div>
          <div style={{
            background: "#f9fafb",
            borderRadius: 14,
            padding: "14px 16px",
          }}>
            <p style={{
              fontSize: 9,
              fontWeight: 700,
              color: "#424950",
              fontFamily: "Inter",
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              marginBottom: 6,
            }}>
              TIJDSTIP
            </p>
            <p style={{
              fontFamily: "Manrope",
              fontWeight: 800,
              fontSize: 14,
              color: "#1f2937",
              letterSpacing: "0.05em",
            }}>
              VANDAAG, {tijdstip}
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
      minHeight: "100vh",
      background: "#f9fafb",
      paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)",
    }}>
      {/* Header with back button */}
      <header style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "20px 20px 16px",
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            background: "#1d2730",
            border: "none",
            color: "#10b981",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
            arrow_back
          </span>
        </button>
        <h1 style={{
          fontFamily: "Manrope",
          fontWeight: 800,
          fontSize: 22,
          color: "#1f2937",
        }}>
          Ziek melden
        </h1>
      </header>

      <main style={{
        padding: "0 20px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}>
        {/* Stap 1 — Bel */}
        <section style={{
          background: "#ffffff",
          borderRadius: 20,
          padding: 20,
          border: "1px solid rgba(255,113,108,0.2)",
        }}>
          <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "rgba(255,113,108,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              <span className="material-symbols-outlined" style={{
                fontSize: 22,
                color: "#dc2626",
                fontVariationSettings: "'FILL' 1",
              }}>
                error
              </span>
            </div>
            <div>
              <h2 style={{
                fontFamily: "Manrope",
                fontWeight: 700,
                fontSize: 15,
                color: "#1f2937",
                marginBottom: 4,
              }}>
                Stap 1: Bel je leidinggevende
              </h2>
              <p style={{
                fontFamily: "Inter",
                fontSize: 12,
                color: "#6b7280",
                lineHeight: 1.5,
              }}>
                Volgens de afspraak bel je eerst. Heb je al gebeld? Dan kun je hieronder je ziekmelding invullen.
              </p>
            </div>
          </div>
          <a
            href={`tel:${TERREVOLT_TEL}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              width: "100%",
              padding: "14px 0",
              borderRadius: 14,
              background: "linear-gradient(135deg, #dc2626, #e8463f)",
              color: "#fff",
              fontFamily: "Manrope",
              fontWeight: 800,
              fontSize: 14,
              textDecoration: "none",
              boxShadow: "0 12px 32px rgba(255,113,108,0.25)",
            }}>
            <span className="material-symbols-outlined" style={{
              fontSize: 20,
              fontVariationSettings: "'FILL' 1",
            }}>
              call
            </span>
            Bel TerreVolt — 06 244 69 136
          </a>
        </section>

        {/* Stap 2 — Formulier */}
        <section style={{
          background: "#ffffff",
          borderRadius: 20,
          padding: 20,
        }}>
          <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#ecfdf5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              <span className="material-symbols-outlined" style={{
                fontSize: 22,
                color: "#10b981",
                fontVariationSettings: "'FILL' 1",
              }}>
                medical_services
              </span>
            </div>
            <div>
              <h2 style={{
                fontFamily: "Manrope",
                fontWeight: 700,
                fontSize: 15,
                color: "#1f2937",
                marginBottom: 4,
              }}>
                Stap 2: Vul je ziekmelding in
              </h2>
              <p style={{
                fontFamily: "Inter",
                fontSize: 12,
                color: "#6b7280",
                lineHeight: 1.5,
              }}>
                Deze melding gaat direct naar de planning en je leidinggevende.
              </p>
            </div>
          </div>

          {/* Eerste ziektedag */}
          <p style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#424950",
            fontFamily: "Inter",
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            marginBottom: 8,
          }}>
            Eerste ziektedag
          </p>
          <div style={{
            position: "relative",
            background: "#f9fafb",
            borderRadius: 12,
            padding: "14px 44px 14px 16px",
            marginBottom: 18,
          }}>
            <span style={{
              fontFamily: "Inter",
              fontSize: 13,
              color: "#10b981",
              fontWeight: 700,
            }}>
              Vandaag, {vandaagLabel}
            </span>
            <span className="material-symbols-outlined" style={{
              position: "absolute",
              right: 14,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 18,
              color: "#10b981",
            }}>
              calendar_month
            </span>
          </div>

          {/* Wanneer terug */}
          <p style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#424950",
            fontFamily: "Inter",
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            marginBottom: 8,
          }}>
            Wanneer denk je weer te kunnen werken?
          </p>
          <div style={{ position: "relative", marginBottom: 18 }}>
            <input
              type="date"
              value={datumTerug}
              min={vandaag}
              onChange={(e) => setDatumTerug(e.target.value)}
              style={{
                width: "100%",
                background: "#f9fafb",
                border: "none",
                borderRadius: 12,
                padding: "14px 44px 14px 16px",
                color: datumTerug ? "#1f2937" : "#424950",
                fontFamily: "Inter",
                fontSize: 13,
                outline: "none",
                colorScheme: "dark",
                boxSizing: "border-box",
                WebkitAppearance: "none",
              }} />
            <span className="material-symbols-outlined" style={{
              position: "absolute",
              right: 14,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 18,
              color: "#10b981",
              pointerEvents: "none",
            }}>
              event_upcoming
            </span>
          </div>

          {/* Opmerking */}
          <p style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#424950",
            fontFamily: "Inter",
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            marginBottom: 8,
          }}>
            Opmerking (optioneel)
          </p>
          <textarea
            value={opmerking}
            onChange={(e) => setOpmerking(e.target.value)}
            placeholder="Bijv. huisartsafspraak, telefonisch bereikbaar of andere belangrijke info"
            rows={4}
            style={{
              width: "100%",
              background: "#f9fafb",
              border: "none",
              borderRadius: 12,
              padding: "14px",
              color: "#1f2937",
              fontFamily: "Inter",
              fontSize: 13,
              resize: "none",
              outline: "none",
              boxSizing: "border-box",
              lineHeight: 1.5,
            }} />
        </section>

        {/* Divider */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "4px 0",
        }}>
          <div style={{
            flex: 1,
            height: 1,
            background: "linear-gradient(to right, transparent, rgba(66,73,80,0.3), transparent)",
          }} />
          <div style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#a7f3d0",
          }} />
          <div style={{
            flex: 1,
            height: 1,
            background: "linear-gradient(to left, transparent, rgba(66,73,80,0.3), transparent)",
          }} />
        </div>

        {/* Submit */}
        <button
          onClick={handleVerstuur}
          disabled={sending}
          style={{
            width: "100%",
            padding: "20px 0",
            borderRadius: 20,
            background: "linear-gradient(135deg, #10b981, #34d399)",
            border: "none",
            color: "#047857",
            fontFamily: "Manrope",
            fontWeight: 800,
            fontSize: 17,
            cursor: sending ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            boxShadow: "0 12px 40px #d1fae5",
            opacity: sending ? 0.7 : 1,
          }}>
          <span className="material-symbols-outlined" style={{
            fontSize: 22,
            fontVariationSettings: "'FILL' 1",
          }}>
            {sending ? "hourglass_empty" : "check_circle"}
          </span>
          {sending ? "Versturen..." : "Ziekmelding versturen"}
        </button>

        <p style={{
          textAlign: "center",
          fontSize: 9,
          fontWeight: 700,
          color: "#424950",
          fontFamily: "Inter",
          textTransform: "uppercase",
          letterSpacing: "0.2em",
          marginTop: 4,
        }}>
          Systeem ID: TRV-ZM-{profileId?.slice(0, 6).toUpperCase() ?? "------"}
        </p>
      </main>

      <BottomNav badges={badges} />
    </div>
  );
}

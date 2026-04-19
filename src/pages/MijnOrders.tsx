import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { getBedrijfsgegevens } from "@/hooks/useBedrijfsgegevens";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Download, FileText, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { euroDecimals as euro } from "@/lib/formatting";
import { downloadInkooporderPdf } from "@/components/InkooporderPdf";
import { Spinner } from "@/components/ui/Spinner";
import { INKOOPORDER_STATUS_CONFIG } from "@/lib/inkooporderStatus";
import { EmptyState } from "@/components/ui/EmptyState";
import { useNavigate } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";
import { useNavBadges } from "@/hooks/useNavBadges";
import { WeekDownloadList } from "@/components/WeekDownloadList";

export default function MijnOrders() {
  const { user } = useAuth();
  const { badges } = useNavBadges();
  const { profileId } = useProfile();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderRegels, setOrderRegels] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    const { data } = await supabase.from("inkooporders").select("*").eq("medewerker_id", profileId).order("aangemaakt_op", { ascending: false });
    setOrders(data || []);
    const { data: prof } = await supabase.from("profiles").select("id, full_name, uurtarief, kvk_nummer, btw_nummer, iban, bedrijfsnaam, factuuradres, adres, betalingstermijn, telefoon").eq("id", profileId).single();
    setProfile(prof);
    setLoading(false);
  }, [profileId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const loadDetail = async (order: any) => {
    setSelectedOrder(order);
    const { data } = await supabase.from("inkooporder_regels").select("*, uren_boekingen(beschrijving, type)").eq("inkooporder_id", order.id).order("datum");
    const verrijkt = (data || []).map((r: any) => ({
      ...r,
      activiteit: r.activiteit || (r.uren_boekingen as any)?.beschrijving || (r.uren_boekingen as any)?.type || "",
    }));
    const projIds = [...new Set(verrijkt.map((r: any) => r.project_id).filter(Boolean))];
    if (projIds.length > 0) {
      const { data: projs } = await supabase.from("projects").select("id, nummer").in("id", projIds);
      const nummerMap = new Map((projs || []).map((p: any) => [p.id, p.nummer]));
      verrijkt.forEach((r: any) => { r._project_nummer = nummerMap.get(r.project_id) || ""; });
    }
    setOrderRegels(verrijkt);
  };

  const downloadPdf = async () => {
    if (!selectedOrder) return;
    try {
      let gkNaam: string | undefined;
      if (selectedOrder.aangemaakt_door) {
        const { data: gk } = await supabase.from("profiles").select("full_name").eq("id", selectedOrder.aangemaakt_door).maybeSingle();
        gkNaam = gk?.full_name || undefined;
      }
      const bedrijf = await getBedrijfsgegevens();
      await downloadInkooporderPdf(selectedOrder, orderRegels, profile, bedrijf, gkNaam);
      toast.success("PDF wordt gedownload");
    } catch (err) {
      console.error("PDF download failed:", err);
      toast.error("PDF kon niet worden gegenereerd");
    }
  };

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#030e20' }}><Spinner /></div>;

  return (
    <PageShell>
      <div style={{
        background: '#030e20',
        minHeight: '100dvh',
        paddingBottom: 120,
      }}>
        {/* ── HEADER ── */}
        <header style={{
          position: 'sticky',
          top: 0, zIndex: 50,
          background: 'rgba(3,14,32,0.9)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#3fff8b',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>
              arrow_back
            </span>
          </button>
          <span style={{
            fontFamily: 'Manrope',
            fontWeight: 800,
            fontSize: 20,
            color: '#dae6ff',
            flex: 1,
          }}>
            Mijn Orders
          </span>
          <div style={{
            width: 36, height: 36,
            borderRadius: '50%',
            background: '#142640',
            border: '1px solid rgba(63,255,139,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Manrope',
            fontWeight: 700,
            fontSize: 13,
            color: '#3fff8b',
          }}>
            {profile?.full_name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
        </header>

        <main style={{ padding: '24px 20px' }}>
          {/* ── SUMMARY CARD ── */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(10,26,48,0.7), rgba(6,19,39,0.8))',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(106,118,140,0.15)',
            borderRadius: 24,
            padding: 24,
            marginBottom: 24,
            textAlign: 'center',
          }}>
            <p style={{
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'Inter',
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              color: '#a0abc3',
              marginBottom: 8,
            }}>
              DIT KWARTAAL
            </p>
            <div style={{
              fontFamily: 'Manrope',
              fontWeight: 800,
              fontSize: 40,
              color: '#3fff8b',
              marginBottom: 16,
            }}>
              {euro(orders.reduce((sum, o) => sum + (Number(o.totaal_excl_btw) || 0), 0))}
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 20,
              flexWrap: 'wrap',
            }}>
              {[
                { color: '#3fff8b', label: 'Betaald', count: orders.filter(o => o.status === 'betaald').length },
                { color: '#feb300', label: 'In behandeling', count: orders.filter(o => o.status === 'verzonden').length },
                { color: '#a0abc3', label: 'Nieuw', count: orders.filter(o => o.status === 'nieuw' || o.status === 'concept').length },
              ].map((s) => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                  <span style={{ fontSize: 12, color: '#a0abc3', fontFamily: 'Inter' }}>
                    {s.count} {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── PER WEEK DOWNLOAD ── */}
          {orders.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <WeekDownloadList orders={orders} />
            </div>
          )}

          {/* ── SECTION LABEL ── */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}>
            <span style={{
              fontFamily: 'Manrope',
              fontWeight: 700,
              fontSize: 16,
              color: '#dae6ff',
            }}>
              Recent overzicht
            </span>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#a0abc3' }}>
              filter_list
            </span>
          </div>

          {/* ── ORDER CARDS ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {orders.map((order) => {
              const isBetaald = order.status === 'betaald';
              const isVerzonden = order.status === 'verzonden';
              const isNieuw = order.status === 'nieuw' || order.status === 'concept';
              const si = INKOOPORDER_STATUS_CONFIG[order.status] || INKOOPORDER_STATUS_CONFIG.concept;
              const isSelected = selectedOrder?.id === order.id;

              const borderColor = isBetaald ? '#3fff8b' : isVerzonden ? '#feb300' : isNieuw ? '#feb300' : '#6e9bff';
              const badgeBg = isBetaald ? 'rgba(63,255,139,0.1)' : isNieuw ? 'rgba(254,179,0,0.1)' : isVerzonden ? 'rgba(254,179,0,0.1)' : 'rgba(110,155,255,0.1)';
              const badgeBorder = isBetaald ? 'rgba(63,255,139,0.3)' : isNieuw ? 'rgba(254,179,0,0.3)' : isVerzonden ? 'rgba(254,179,0,0.3)' : 'rgba(110,155,255,0.3)';
              const badgeColor = isBetaald ? '#3fff8b' : isNieuw ? '#feb300' : isVerzonden ? '#feb300' : '#6e9bff';
              const badgeLabel = si.label;

              return (
                <button
                  key={order.id}
                  onClick={() => loadDetail(order)}
                  style={{
                    width: '100%',
                    textAlign: 'left' as const,
                    background: 'linear-gradient(135deg, rgba(10,26,48,0.7), rgba(6,19,39,0.8))',
                    backdropFilter: 'blur(12px)',
                    borderRadius: 20,
                    border: isSelected
                      ? '1px solid rgba(63,255,139,0.4)'
                      : '1px solid rgba(106,118,140,0.15)',
                    borderLeft: `4px solid ${borderColor}`,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    boxShadow: isSelected
                      ? '0 0 20px rgba(63,255,139,0.1)'
                      : isNieuw
                      ? '0 0 20px rgba(254,179,0,0.1)'
                      : isBetaald
                      ? '0 0 12px rgba(63,255,139,0.08)'
                      : 'none',
                    padding: 0,
                  }}
                >
                  <div style={{ padding: '20px 20px 0' }}>
                    {/* Order header row */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: 12,
                    }}>
                      <div>
                        <p style={{
                          fontSize: 10,
                          fontWeight: 700,
                          fontFamily: 'Inter',
                          textTransform: 'uppercase',
                          letterSpacing: '0.15em',
                          color: '#a0abc3',
                          marginBottom: 4,
                        }}>
                          Order
                        </p>
                        <p style={{
                          fontFamily: 'Manrope',
                          fontWeight: 800,
                          fontSize: 18,
                          color: '#dae6ff',
                        }}>
                          {order.order_nummer || `IO-${order.id.slice(0, 8).toUpperCase()}`}
                        </p>
                      </div>
                      {/* Status badge */}
                      <div style={{
                        padding: '4px 12px',
                        borderRadius: 9999,
                        background: badgeBg,
                        border: `1px solid ${badgeBorder}`,
                        whiteSpace: 'nowrap',
                      }}>
                        <span style={{
                          fontSize: 9,
                          fontWeight: 800,
                          fontFamily: 'Inter',
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          color: badgeColor,
                        }}>
                          {badgeLabel}
                        </span>
                      </div>
                    </div>

                    {/* Period */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      marginBottom: 16,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#a0abc3' }}>
                          calendar_today
                        </span>
                        <span style={{ fontSize: 13, color: '#a0abc3', fontFamily: 'Inter' }}>
                          {order.periode_van} → {order.periode_tot}
                        </span>
                      </div>
                      {isBetaald && order.betaald_op && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#3fff8b' }}>
                            check_circle
                          </span>
                          <span style={{ fontSize: 12, color: '#3fff8b', fontFamily: 'Inter', fontWeight: 600 }}>
                            Betaald op {format(new Date(order.betaald_op), "d MMM yyyy", { locale: nl })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Amount bar */}
                  <div style={{
                    margin: '0 20px 20px',
                    background: 'rgba(0,0,0,0.25)',
                    borderRadius: 12,
                    padding: 16,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                  }}>
                    <div>
                      <p style={{ fontSize: 10, color: '#a0abc3', fontFamily: 'Inter', marginBottom: 4 }}>
                        Factuurbedrag
                      </p>
                      <p style={{
                        fontFamily: 'Manrope',
                        fontWeight: 800,
                        fontSize: 24,
                        color: isBetaald ? '#3fff8b' : '#dae6ff',
                        lineHeight: 1,
                      }}>
                        {euro(Number(order.totaal_excl_btw) || 0)}
                      </p>
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '10px 16px',
                      borderRadius: 9999,
                      background: 'transparent',
                      border: '1px solid rgba(106,118,140,0.4)',
                      color: '#dae6ff',
                      fontFamily: 'Inter',
                      fontWeight: 700,
                      fontSize: 11,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.08em',
                      whiteSpace: 'nowrap',
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        {isSelected ? 'expand_less' : 'expand_more'}
                      </span>
                      DETAILS
                    </div>
                  </div>

                  {/* Download button */}
                  <div style={{ padding: '0 20px 20px' }}>
                    <div
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const { data } = await supabase.from("inkooporder_regels").select("*, uren_boekingen(beschrijving, type)").eq("inkooporder_id", order.id).order("datum");
                          const regels = (data || []).map((r: any) => ({ ...r, activiteit: r.activiteit || (r.uren_boekingen as any)?.beschrijving || (r.uren_boekingen as any)?.type || "" }));
                          let gkNaam: string | undefined;
                          if (order.aangemaakt_door) {
                            const { data: gk } = await supabase.from("profiles").select("full_name").eq("id", order.aangemaakt_door).maybeSingle();
                            gkNaam = gk?.full_name || undefined;
                          }
                          const bedrijf = await getBedrijfsgegevens();
                          await downloadInkooporderPdf(order, regels, profile, bedrijf, gkNaam);
                          toast.success("PDF wordt gedownload");
                        } catch (err) {
                          console.error("PDF download failed:", err);
                          toast.error("PDF kon niet worden gegenereerd");
                        }
                      }}
                      style={{
                        width: '100%',
                        height: 52,
                        borderRadius: 16,
                        background: 'transparent',
                        border: `1px solid ${
                          isBetaald
                            ? 'rgba(63,255,139,0.3)'
                            : isNieuw
                            ? 'rgba(254,179,0,0.3)'
                            : 'rgba(110,155,255,0.3)'
                        }`,
                        color: isBetaald
                          ? '#3fff8b'
                          : isNieuw
                          ? '#feb300'
                          : '#6e9bff',
                        fontFamily: 'Inter',
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.05em',
                      }}>
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 18 }}>
                        download
                      </span>
                      PDF Downloaden
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Empty state */}
            {orders.length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: '#a0abc3',
                fontFamily: 'Inter',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48, marginBottom: 16, display: 'block' }}>
                  receipt_long
                </span>
                <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Nog geen inkooporders</p>
                <p style={{ fontSize: 12 }}>Je manager maakt een inkooporder aan zodra je uren zijn goedgekeurd.</p>
              </div>
            )}
          </div>

          {/* ── DETAIL PANEL ── */}
          {selectedOrder && (
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Verzonden hint */}
              {selectedOrder.status === "verzonden" && (
                <div style={{
                  padding: '16px 20px',
                  borderRadius: 16,
                  background: 'rgba(63,255,139,0.05)',
                  border: '1px solid rgba(63,255,139,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#3fff8b' }}>check_circle</span>
                  <span style={{ fontSize: 13, color: '#3fff8b', fontFamily: 'Inter', fontWeight: 600 }}>
                    {INKOOPORDER_STATUS_CONFIG.verzonden.hint}
                  </span>
                </div>
              )}

              {/* Regels tabel */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(10,26,48,0.7), rgba(6,19,39,0.8))',
                borderRadius: 20,
                border: '1px solid rgba(106,118,140,0.15)',
                overflow: 'hidden',
              }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(61,72,93,0.3)' }}>
                        {["Datum", "Project", "Activiteit", "Uren", "Bedrag"].map(h => (
                          <th key={h} style={{
                            textAlign: 'left',
                            padding: '12px 14px',
                            fontSize: 10,
                            fontWeight: 700,
                            fontFamily: 'Inter',
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em',
                            color: '#a0abc3',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orderRegels.map(r => (
                        <tr key={r.id} style={{ borderBottom: '1px solid rgba(61,72,93,0.15)' }}>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: '#dae6ff', fontFamily: 'Inter' }}>{r.datum}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ fontSize: 12, color: '#dae6ff', fontFamily: 'Inter' }}>{r.project_naam}</span>
                            {r._project_nummer && <span style={{ display: 'block', fontSize: 10, color: '#a0abc3', fontFamily: 'DM Mono, monospace' }}>{r._project_nummer}</span>}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: '#a0abc3', fontFamily: 'Inter' }}>{r.activiteit || "—"}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, fontFamily: 'DM Mono, monospace', color: '#dae6ff' }}>{r.uren}u</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, fontFamily: 'DM Mono, monospace', color: '#dae6ff' }}>{euro(r.bedrag)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid rgba(63,255,139,0.3)' }}>
                        <td colSpan={3} />
                        <td style={{ padding: '12px 14px', fontWeight: 700, fontFamily: 'DM Mono, monospace', color: '#dae6ff' }}>{selectedOrder.totaal_uren}u</td>
                        <td style={{ padding: '12px 14px', fontWeight: 800, fontSize: 16, fontFamily: 'DM Mono, monospace', color: '#3fff8b' }}>{euro(Number(selectedOrder.totaal_excl_btw))}</td>
                      </tr>
                      <tr>
                        <td colSpan={5} style={{
                          padding: '8px 14px',
                          fontSize: 11,
                          color: '#feb300',
                          fontStyle: 'italic',
                          borderTop: '1px solid rgba(106,118,140,0.15)',
                        }}>
                          ⚠ BTW verlegd op basis van artikel 12 Wet OB — vermeld dit op uw factuur aan TerreVolt BV.
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Download button */}
              <button
                onClick={downloadPdf}
                style={{
                  width: '100%',
                  height: 56,
                  borderRadius: 16,
                  background: 'transparent',
                  border: '1px solid rgba(63,255,139,0.3)',
                  color: '#3fff8b',
                  fontFamily: 'Inter',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
                PDF downloaden
              </button>
            </div>
          )}
        </main>
      </div>
      <BottomNav badges={badges} />
    </PageShell>
  );
}

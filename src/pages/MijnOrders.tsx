import { useState, useEffect, useCallback } from "react";
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

export default function MijnOrders() {
  const { user } = useAuth();
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
    let gkNaam: string | undefined;
    if (selectedOrder.aangemaakt_door) {
      const { data: gk } = await supabase.from("profiles").select("full_name").eq("id", selectedOrder.aangemaakt_door).maybeSingle();
      gkNaam = gk?.full_name || undefined;
    }
    const bedrijf = await getBedrijfsgegevens();
    await downloadInkooporderPdf(selectedOrder, orderRegels, profile, bedrijf, gkNaam);
  };

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#030e20' }}><Spinner /></div>;

  return (
    <PageShell>
      <div style={{
        background: '#030e20',
        minHeight: '100dvh',
        paddingBottom: 120,
      }}>
        {/* HEADER */}
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
          }}>
            Mijn Orders
          </span>
        </header>

        <main style={{ padding: '24px 20px' }}>
          {/* SUMMARY CARD */}
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
              TOTAAL
            </p>
            <div style={{
              fontFamily: 'Manrope',
              fontWeight: 800,
              fontSize: 40,
              color: '#3fff8b',
              marginBottom: 16,
            }}>
              {euro(orders.reduce((sum, o) => sum + (Number(o.totaal_incl_btw) || 0), 0))}
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 20,
            }}>
              {[
                { color: '#3fff8b', label: 'Betaald', count: orders.filter(o => o.status === 'betaald').length },
                { color: '#feb300', label: 'Verzonden', count: orders.filter(o => o.status === 'verzonden').length },
                { color: '#a0abc3', label: 'Concept', count: orders.filter(o => o.status === 'concept').length },
              ].map((s) => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                  <span style={{ fontSize: 11, color: '#a0abc3', fontFamily: 'Inter' }}>
                    {s.count} {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ORDER LIST */}
          {orders.length === 0 ? (
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
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {orders.map(o => {
                const si = INKOOPORDER_STATUS_CONFIG[o.status] || INKOOPORDER_STATUS_CONFIG.concept;
                const isSelected = selectedOrder?.id === o.id;
                const isBetaald = o.status === 'betaald';
                const isVerzonden = o.status === 'verzonden';
                const statusColor = isBetaald ? '#3fff8b' : isVerzonden ? '#feb300' : '#a0abc3';

                return (
                  <button
                    key={o.id}
                    onClick={() => loadDetail(o)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'linear-gradient(135deg, rgba(10,26,48,0.7), rgba(6,19,39,0.8))',
                      backdropFilter: 'blur(12px)',
                      borderRadius: 20,
                      border: isSelected
                        ? '1px solid rgba(63,255,139,0.4)'
                        : '1px solid rgba(106,118,140,0.15)',
                      borderLeft: `4px solid ${statusColor}`,
                      padding: '20px',
                      cursor: 'pointer',
                      boxShadow: isSelected ? '0 0 20px rgba(63,255,139,0.1)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '3px 10px',
                          borderRadius: 9999,
                          background: `${statusColor}15`,
                          border: `1px solid ${statusColor}40`,
                          marginBottom: 8,
                        }}>
                          <span style={{
                            fontSize: 9,
                            fontWeight: 700,
                            fontFamily: 'Inter',
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em',
                            color: statusColor,
                          }}>
                            {si.label}
                          </span>
                        </div>
                        <div style={{
                          fontFamily: 'DM Mono, monospace',
                          fontWeight: 700,
                          fontSize: 15,
                          color: '#dae6ff',
                        }}>
                          {o.order_nummer}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{
                          fontFamily: 'Manrope',
                          fontWeight: 800,
                          fontSize: 22,
                          color: isBetaald ? '#3fff8b' : '#dae6ff',
                        }}>
                          {euro(Number(o.totaal_incl_btw) || 0)}
                        </div>
                      </div>
                    </div>
                    <p style={{ fontSize: 11, color: '#a0abc3', fontFamily: 'Inter' }}>
                      {o.periode_van} → {o.periode_tot}
                    </p>
                    {isBetaald && o.betaald_op && (
                      <p style={{ fontSize: 10, color: '#3fff8b', fontFamily: 'Inter', marginTop: 4 }}>
                        Betaald op {format(new Date(o.betaald_op), "d MMM yyyy", { locale: nl })}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* DETAIL PANEL */}
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
                        <td style={{ padding: '12px 14px', fontWeight: 800, fontSize: 16, fontFamily: 'DM Mono, monospace', color: '#3fff8b' }}>{euro(Number(selectedOrder.totaal_incl_btw))}</td>
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
    </PageShell>
  );
}

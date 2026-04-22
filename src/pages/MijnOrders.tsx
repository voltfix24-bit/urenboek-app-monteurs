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
        paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 100px)",
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
        </main>
      </div>
    </PageShell>
  );
}

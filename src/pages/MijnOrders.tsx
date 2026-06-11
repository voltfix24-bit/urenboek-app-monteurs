import { useState, useEffect, useCallback, useRef } from "react";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { euroDecimals as euro } from "@/lib/formatting";
import { Spinner } from "@/components/ui/Spinner";
import { useNavigate } from "react-router-dom";
import { WeekDownloadList } from "@/components/WeekDownloadList";
import { useFocusParam } from "@/hooks/useFocusParam";
import { toast } from "sonner";

export default function MijnOrders() {
  const { profileId } = useProfile();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    const { data } = await supabase.from("inkooporders").select("*").eq("medewerker_id", profileId).order("aangemaakt_op", { ascending: false });
    setOrders(data || []);
    const { data: prof } = await supabase.from("profiles").select("id, full_name").eq("id", profileId).single();
    setProfile(prof);
    setLoading(false);
  }, [profileId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // MijnOrders heeft geen per-order detailpaneel — we valideren alleen of de focus
  // bestaat (RLS dekt zichtbaarheid) en wissen anders de parameter zodat hij niet
  // achterblijft in de URL.
  const { focus, clear: clearFocus } = useFocusParam();
  const focusHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || loading) return;
    if (focusHandledRef.current === focus) return;
    focusHandledRef.current = focus;
    const exists = orders.find(o => o.id === focus);
    if (!exists) {
      toast.error("Order niet gevonden of geen toegang");
    }
    clearFocus();
  }, [focus, orders, loading, clearFocus]);


  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--app-navy)' }}><Spinner /></div>;

  const totaalBedrag = orders.reduce((sum, o) => sum + (Number(o.totaal_excl_btw) || 0), 0);

  return (
    <PageShell>
      <div style={{
        background: 'var(--app-navy)',
        minHeight: '100dvh',
        paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 100px)",
      }}>
        {/* ── HEADER ── */}
        <header style={{
          position: 'sticky',
          top: 0, zIndex: 50,
          background: 'color-mix(in srgb, var(--bg-surface) 94%, transparent)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--planning-border-soft)',
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
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>
              arrow_back
            </span>
          </button>
          <span style={{
            fontFamily: 'Hanken Grotesk',
            fontWeight: 800,
            fontSize: 20,
            color: 'var(--text-primary)',
            flex: 1,
          }}>
            Mijn Orders
          </span>
          <div style={{
            width: 36, height: 36,
            borderRadius: '50%',
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--accent-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Hanken Grotesk',
            fontWeight: 700,
            fontSize: 13,
            color: 'var(--accent)',
          }}>
            {profile?.full_name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
        </header>

        <main style={{ padding: '24px 20px' }}>
          {/* ── SUMMARY CARD ── */}
          <div style={{
            background: 'var(--bg-surface)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--planning-border-soft)',
            borderRadius: 24,
            padding: 24,
            marginBottom: 24,
            textAlign: 'center',
          }}>
            <p style={{
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'Hanken Grotesk',
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              color: 'var(--text-muted)',
              marginBottom: 8,
            }}>
              DIT KWARTAAL
            </p>
            <div style={{
              fontFamily: 'Hanken Grotesk',
              fontWeight: 800,
              fontSize: 40,
              color: 'var(--accent)',
              marginBottom: 16,
            }}>
              {euro(totaalBedrag)}
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 20,
              flexWrap: 'wrap',
            }}>
              {[
                { color: 'var(--accent)', label: 'Betaald', count: orders.filter(o => o.status === 'betaald').length },
                { color: 'var(--warn-text)', label: 'In behandeling', count: orders.filter(o => o.status === 'verzonden').length },
                { color: 'var(--text-muted)', label: 'Nieuw', count: orders.filter(o => o.status === 'nieuw' || o.status === 'concept').length },
              ].map((s) => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Hanken Grotesk' }}>
                    {s.count} {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── PER WEEK DOWNLOAD ── */}
          {orders.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <WeekDownloadList orders={orders} toonBedrag />
            </div>
          )}

          {/* Empty state */}
          {orders.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: 'var(--text-muted)',
              fontFamily: 'Hanken Grotesk',
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

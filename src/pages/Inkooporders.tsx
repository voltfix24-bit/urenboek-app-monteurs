import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mutate } from "@/lib/supabaseHelpers";
import { getBedrijfsgegevens } from "@/hooks/useBedrijfsgegevens";
import { PageShell } from "@/components/PageShell";
import { HeaderLogo } from "@/components/HeaderLogo";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { useNavBadges } from "@/hooks/useNavBadges";
import { Plus, Download, FileText, Trash2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { euroDecimals as euro } from "@/lib/formatting";
import { downloadInkooporderPdf } from "@/components/InkooporderPdf";
import { Spinner } from "@/components/ui/Spinner";
import { WeekDownloadList } from "@/components/WeekDownloadList";
import { InkooporderWizard } from "@/components/inkooporders/InkooporderWizard";
import { T } from "@/lib/inkooporderTheme";

import { INKOOPORDER_STATUS_CONFIG } from "@/lib/inkooporderStatus";

function OrderStatusBadge({ status }: { status: string }) {
  const c = INKOOPORDER_STATUS_CONFIG[status] || INKOOPORDER_STATUS_CONFIG.concept;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>{c.label}</span>;
}

export default function Inkooporders() {
  const [searchParams] = useSearchParams();
  const { isManager, user } = useAuth();
  const { profileId } = useProfile();
  const { badges } = useNavBadges();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [medewerkerFilter, setMedewerkerFilter] = useState<string>("");
  const [medewerkers, setMedewerkers] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderRegels, setOrderRegels] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [wizardInitial, setWizardInitial] = useState<{ medewerkerId?: string; van?: string; tot?: string } | undefined>(undefined);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("inkooporders").select("*").order("aangemaakt_op", { ascending: false });
    if (data) {
      const medIds = [...new Set(data.map((o: any) => o.medewerker_id))];
      const { data: profs } = medIds.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", medIds) : { data: [] };
      const nameMap = new Map((profs || []).map((p: any) => [p.id, p.full_name]));
      setOrders(data.map((o: any) => ({ ...o, medewerker_naam: nameMap.get(o.medewerker_id) || "Onbekend" })));
    }
    // Load medewerkers for filter + wizard (incl. onderaannemer-info)
    const { data: meds } = await supabase
      .from("profiles")
      .select("id, full_name, is_onderaannemer, onderaannemer_id")
      .order("full_name");
    // Tel monteurs per onderaannemer
    const counts = new Map<string, number>();
    (meds || []).forEach((m: any) => {
      if (m.onderaannemer_id) counts.set(m.onderaannemer_id, (counts.get(m.onderaannemer_id) || 0) + 1);
    });
    const verrijkt = (meds || []).map((m: any) => ({
      ...m,
      monteur_count: m.is_onderaannemer ? (counts.get(m.id) || 0) : 0,
    }));
    // Onderaannemers eerst, dan rest
    verrijkt.sort((a: any, b: any) => {
      if (a.is_onderaannemer && !b.is_onderaannemer) return -1;
      if (!a.is_onderaannemer && b.is_onderaannemer) return 1;
      return (a.full_name || "").localeCompare(b.full_name || "");
    });
    setMedewerkers(verrijkt);
    setLoading(false);
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Auto-open wizard from URL params (e.g. after goedkeuring)
  const didAutoOpen = useRef(false);
  useEffect(() => {
    if (didAutoOpen.current) return;
    const medId = searchParams.get("medewerker");
    const van = searchParams.get("van");
    const tot = searchParams.get("tot");
    if (medId && van && tot && medewerkers.length > 0) {
      didAutoOpen.current = true;
      setWizardInitial({ medewerkerId: medId, van, tot });
      setShowCreate(true);
    }
  }, [searchParams, medewerkers]);

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (statusFilter !== "alle") result = result.filter(o => o.status === statusFilter);
    if (medewerkerFilter) result = result.filter(o => o.medewerker_id === medewerkerFilter);
    return result;
  }, [orders, statusFilter, medewerkerFilter]);

  const loadOrderDetail = async (order: any) => {
    setSelectedOrder(order);
    const { data } = await supabase.from("inkooporder_regels").select("*, uren_boekingen(beschrijving, type)").eq("inkooporder_id", order.id).order("datum");
    const verrijkt = (data || []).map((r: any) => ({
      ...r,
      activiteit: r.activiteit || (r.uren_boekingen as any)?.beschrijving || (r.uren_boekingen as any)?.type || "",
    }));
    // Enrich with project nummer
    const projIds = [...new Set(verrijkt.map((r: any) => r.project_id).filter(Boolean))];
    if (projIds.length > 0) {
      const { data: projs } = await supabase.from("projects").select("id, nummer").in("id", projIds);
      const nummerMap = new Map((projs || []).map((p: any) => [p.id, p.nummer]));
      verrijkt.forEach((r: any) => { r._project_nummer = nummerMap.get(r.project_id) || ""; });
    }
    setOrderRegels(verrijkt);
  };

  const updateOrderStatus = async (orderId: string, newStatus: string, extra?: any) => {
    const update: any = { status: newStatus, ...extra };
    if (newStatus === "verzonden") update.verzonden_op = new Date().toISOString();
    if (newStatus === "betaald") update.betaald_op = extra?.betaald_op || new Date().toISOString();
    if (!await mutate(supabase.from("inkooporders").update(update).eq("id", orderId))) return;
    toast.success(`Status gewijzigd naar ${INKOOPORDER_STATUS_CONFIG[newStatus]?.label || newStatus}`);

    // Send mededeling when verzonden
    if (newStatus === "verzonden" && selectedOrder) {
      await supabase.from("mededelingen").insert({
        titel: `Inkooporder ${selectedOrder.order_nummer} klaar`,
        inhoud: `Je inkooporder voor de periode ${selectedOrder.periode_van} t/m ${selectedOrder.periode_tot} is klaar. Te factureren: ${euro(selectedOrder.totaal_excl_btw)} (BTW verlegd).`,
        verzonden_door: profileId,
        ontvanger_type: "persoon",
        ontvanger_id: selectedOrder.medewerker_id,
      } as any);
    }
    fetchOrders();
    if (selectedOrder) loadOrderDetail({ ...selectedOrder, status: newStatus });
  };

  // Status change helpers
  const [factuurNummer, setFactuurNummer] = useState("");
  const [factuurDatum, setFactuurDatum] = useState("");
  const [betaaldDatum, setBetaaldDatum] = useState("");
  const [showStatusDialog, setShowStatusDialog] = useState<string | null>(null);

  const generatePdf = downloadInkooporderPdf;

  if (!isManager) return <div className="min-h-screen flex items-center justify-center" style={{ background: T.navy }}><p style={{ color: T.textMuted }}>Alleen managers.</p></div>;

  return (
    <>
      <DesktopSidebar badges={badges} />
      <PageShell>
        <header className="sticky top-0 z-30" style={{ background: T.surfaceBlur, backdropFilter: "blur(12px)", borderBottom: `1px solid ${T.border}` }}>
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <HeaderLogo />
              <span className="text-base font-bold tracking-tight" style={{ color: T.text }}>Inkooporders</span>
            </div>
            <button onClick={() => { setWizardInitial(undefined); setShowCreate(true); }} className="px-3 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1.5" style={{ background: T.primaryGradient }}>
              <Plus className="h-3.5 w-3.5" /> Nieuwe order
            </button>
          </div>
        </header>

        <main className="px-4 py-4 space-y-4">
          {/* Filters */}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {["alle", "concept", "verzonden", "factuur_ontvangen", "betaald"].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} className="px-3 py-1.5 rounded-full text-[11px] font-semibold" style={{
                  background: statusFilter === s ? T.primarySoft : T.surface,
                  border: `1px solid ${statusFilter === s ? T.borderActive : T.border}`,
                  color: statusFilter === s ? T.primary : T.textMuted,
                }}>
                  {s === "alle" ? "Alle" : INKOOPORDER_STATUS_CONFIG[s]?.label || s}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Monteur</label>
              <select
                value={medewerkerFilter}
                onChange={e => setMedewerkerFilter(e.target.value)}
                className="flex-1 max-w-xs px-3 py-2 rounded-xl text-xs"
                style={{ background: T.navy, border: `1px solid ${medewerkerFilter ? T.borderActive : T.border}`, color: T.text }}
              >
                <option value="">Alle monteurs</option>
                {medewerkers.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}{m.is_onderaannemer ? ` — onderaannemer${m.monteur_count ? ` (+${m.monteur_count})` : ""}` : ""}
                  </option>
                ))}
              </select>
              {medewerkerFilter && (
                <button
                  onClick={() => setMedewerkerFilter("")}
                  className="px-2.5 py-2 rounded-xl text-[11px] font-semibold"
                  style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textMuted }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Per week downloaden */}
          {!loading && filteredOrders.length > 0 && (
            <WeekDownloadList orders={filteredOrders} toonNaam />
          )}

          {loading ? (
            <Spinner padding="py-8" />
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 rounded-2xl" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
              <FileText className="h-8 w-8 mx-auto mb-2" style={{ color: T.textMuted }} />
              <p className="text-sm font-medium" style={{ color: T.text }}>Geen inkooporders</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredOrders.map(o => (
                <button key={o.id} onClick={() => loadOrderDetail(o)} className="w-full text-left rounded-2xl p-4" style={{ background: T.surface, border: `1px solid ${selectedOrder?.id === o.id ? T.primary : T.border}` }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[13px] font-bold" style={{ fontFamily: T.mono, color: T.text }}>{o.order_nummer}</span>
                      <span className="text-xs ml-2" style={{ color: T.textMuted }}>· {o.medewerker_naam}</span>
                    </div>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: T.textMuted }}>{o.periode_van} → {o.periode_tot}</p>
                  <p className="text-lg font-bold mt-1" style={{ fontFamily: T.mono, color: T.primary }}>{euro(Number(o.totaal_excl_btw) || 0)}</p>
                </button>
              ))}
            </div>
          )}

          {/* Order Detail */}
          {selectedOrder && (
            <div className="rounded-2xl p-5 space-y-4" style={{ background: T.surface, border: `1px solid ${T.borderActive}` }}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold" style={{ fontFamily: T.mono, color: T.text }}>{selectedOrder.order_nummer}</h3>
                  <p className="text-xs" style={{ color: T.textMuted }}>{selectedOrder.medewerker_naam} · {selectedOrder.periode_van} → {selectedOrder.periode_tot}</p>
                </div>
                <div className="flex items-center gap-2">
                  <OrderStatusBadge status={selectedOrder.status} />
                  <button onClick={async () => {
                    const { data: prof } = await supabase.from("profiles").select("id, full_name, uurtarief, kvk_nummer, btw_nummer, iban, bedrijfsnaam, factuuradres, adres, betalingstermijn, telefoon").eq("id", selectedOrder.medewerker_id).single();
                    let gkNaam: string | undefined;
                    if (selectedOrder.aangemaakt_door) {
                      const { data: gk } = await supabase.from("profiles").select("full_name").eq("id", selectedOrder.aangemaakt_door).maybeSingle();
                      gkNaam = gk?.full_name || undefined;
                    }
                    const bedrijf = await getBedrijfsgegevens();
                    generatePdf(selectedOrder, orderRegels, prof, bedrijf, gkNaam);
                  }} className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1" style={{ border: `1px solid ${T.border}`, color: T.textMuted }}>
                    <Download className="h-3.5 w-3.5" /> PDF
                  </button>
                </div>
              </div>

              {/* Regels */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                      {["Datum", "Project", "Activiteit", "Uren", "Tarief", "Bedrag"].map(h => (
                        <th key={h} className="text-left pb-2 px-2 font-semibold" style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orderRegels.map(r => (
                      <tr key={r.id} style={{ borderBottom: `1px solid ${T.step}` }}>
                        <td className="py-2 px-2" style={{ color: T.text }}>{r.datum}</td>
                        <td className="py-2 px-2">
                          <span style={{ color: T.text }}>{r.project_naam}</span>
                          {r._project_nummer && <span className="block text-[10px]" style={{ color: T.textMuted, fontFamily: T.mono }}>{r._project_nummer}</span>}
                        </td>
                        <td className="py-2 px-2" style={{ color: T.textMuted }}>{r.activiteit || "—"}</td>
                        <td className="py-2 px-2" style={{ fontFamily: T.mono, color: T.text }}>{r.uren}</td>
                        <td className="py-2 px-2" style={{ fontFamily: T.mono, color: T.text }}>{euro(r.uurtarief)}</td>
                        <td className="py-2 px-2 font-semibold" style={{ fontFamily: T.mono, color: T.text }}>{euro(r.bedrag)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${T.borderActive}` }}>
                      <td colSpan={3} />
                      <td className="py-2 px-2 font-bold" style={{ fontFamily: T.mono, color: T.text }}>{selectedOrder.totaal_uren}u</td>
                      <td className="py-2 px-2 text-right font-semibold" style={{ color: T.textMuted }}>Subtotaal:</td>
                      <td className="py-2 px-2 font-bold" style={{ fontFamily: T.mono, color: T.text }}>{euro(Number(selectedOrder.totaal_excl_btw))}</td>
                    </tr>
                    <tr>
                      <td colSpan={4} />
                      <td className="py-1 px-2 text-right" style={{ color: T.textMuted }}>BTW:</td>
                      <td className="py-1 px-2" style={{ fontFamily: T.mono, color: T.warn }}>Verlegd (art. 12 Wet OB)</td>
                    </tr>
                    <tr>
                      <td colSpan={4} />
                      <td className="py-1 px-2 text-right font-bold" style={{ color: T.primary }}>Te factureren:</td>
                      <td className="py-1 px-2 font-bold text-base" style={{ fontFamily: T.mono, color: T.primary }}>{euro(Number(selectedOrder.totaal_excl_btw))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Status actions */}
              <div className="flex flex-wrap items-center gap-2 pt-2" style={{ borderTop: `1px solid ${T.border}` }}>
                {selectedOrder.status === "concept" && (
                  <button onClick={() => updateOrderStatus(selectedOrder.id, "verzonden")} className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: T.primaryGradient }}>
                    Verzenden naar monteur
                  </button>
                )}
                {selectedOrder.status === "verzonden" && (
                  <div className="flex items-center gap-2">
                    <input value={factuurNummer} onChange={e => setFactuurNummer(e.target.value)} placeholder="Factuurnummer" className="px-3 py-2 rounded-xl text-xs" style={{ background: T.navy, border: `1px solid ${T.border}`, color: T.text }} />
                    <input type="date" value={factuurDatum} onChange={e => setFactuurDatum(e.target.value)} className="px-3 py-2 rounded-xl text-xs" style={{ background: T.navy, border: `1px solid ${T.border}`, color: T.text }} />
                    <button onClick={() => { if (!factuurNummer) { toast.error("Vul factuurnummer in"); return; } updateOrderStatus(selectedOrder.id, "factuur_ontvangen", { factuur_nummer: factuurNummer, factuur_datum: factuurDatum || new Date().toISOString() }); }} className="px-4 py-2 rounded-xl text-xs font-semibold" style={{ background: T.infoSoft, border: `1px solid ${T.infoBorder}`, color: T.info }}>
                      Factuur registreren
                    </button>
                  </div>
                )}
                {selectedOrder.status === "factuur_ontvangen" && (
                  <div className="flex items-center gap-2">
                    <input type="date" value={betaaldDatum} onChange={e => setBetaaldDatum(e.target.value)} className="px-3 py-2 rounded-xl text-xs" style={{ background: T.navy, border: `1px solid ${T.border}`, color: T.text }} />
                    <button onClick={() => updateOrderStatus(selectedOrder.id, "betaald", { betaald_op: betaaldDatum || new Date().toISOString() })} className="px-4 py-2 rounded-xl text-xs font-semibold" style={{ background: T.primarySoft, border: `1px solid ${T.borderActive}`, color: T.primary }}>
                      Betaling registreren
                    </button>
                  </div>
                )}
                {/* Verwijderen */}
                <button onClick={async () => {
                  if (!confirm(`Weet je zeker dat je ${selectedOrder.order_nummer} wilt verwijderen?`)) return;
                  await supabase.from("inkooporder_regels").delete().eq("inkooporder_id", selectedOrder.id);
                  const { error } = await supabase.from("inkooporders").delete().eq("id", selectedOrder.id);
                  if (error) { toast.error("Verwijderen mislukt"); return; }
                  toast.success(`${selectedOrder.order_nummer} verwijderd`);
                  setSelectedOrder(null);
                  fetchOrders();
                }} className="ml-auto px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                  style={{ background: T.dangerSoft, border: `1px solid ${T.dangerBorder}`, color: T.danger }}>
                  <Trash2 className="h-3.5 w-3.5" /> Verwijderen
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Create wizard modal */}
        <InkooporderWizard
          open={showCreate}
          medewerkers={medewerkers}
          profileId={profileId}
          initial={wizardInitial}
          onClose={() => { setShowCreate(false); setWizardInitial(undefined); }}
          onCreated={() => {
            setShowCreate(false);
            setWizardInitial(undefined);
            fetchOrders();
          }}
        />
      </PageShell>
    </>
  );
}

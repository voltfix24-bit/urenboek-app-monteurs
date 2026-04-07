import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Download, FileText, CheckCircle, Plus, ArrowLeft, X } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { nl } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { euroDecimals as euro } from "@/lib/formatting";
import { Spinner } from "@/components/ui/Spinner";
import { getBedrijfsgegevens } from "@/hooks/useBedrijfsgegevens";
import { toast } from "sonner";
import { INKOOPORDER_STATUS_CONFIG } from "@/lib/inkooporderStatus";

export default function MijnOrders() {
  const { user } = useAuth();
  const { profileId } = useProfile();
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderRegels, setOrderRegels] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Wizard state
  const [showCreate, setShowCreate] = useState(false);
  const [wizStep, setWizStep] = useState(1);
  const [wizVan, setWizVan] = useState("");
  const [wizTot, setWizTot] = useState("");
  const [wizBoekingen, setWizBoekingen] = useState<any[]>([]);
  const [wizSelected, setWizSelected] = useState<Set<string>>(new Set());
  const [wizLoading, setWizLoading] = useState(false);

  const fetchOrders = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    const { data } = await supabase.from("inkooporders").select("*").eq("medewerker_id", profileId).order("aangemaakt_op", { ascending: false });
    setOrders(data || []);
    const { data: prof } = await supabase.from("profiles").select("*").eq("id", profileId).single();
    setProfile(prof);
    setLoading(false);
  }, [profileId]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const loadDetail = async (order: any) => {
    setSelectedOrder(order);
    const { data } = await supabase.from("inkooporder_regels").select("*").eq("inkooporder_id", order.id).order("datum");
    setOrderRegels(data || []);
  };

  // Wizard: set default period to current month
  const openWizard = () => {
    const now = new Date();
    setWizVan(format(startOfMonth(now), "yyyy-MM-dd"));
    setWizTot(format(endOfMonth(now), "yyyy-MM-dd"));
    setWizStep(1);
    setWizBoekingen([]);
    setWizSelected(new Set());
    setShowCreate(true);
  };

  const loadBoekingen = async () => {
    if (!profileId || !wizVan || !wizTot) return;
    setWizLoading(true);
    const { data } = await supabase
      .from("uren_boekingen")
      .select("id, datum, project_id, uren, beschrijving, type")
      .eq("medewerker_id", profileId)
      .eq("status", "goedgekeurd")
      .gte("datum", wizVan)
      .lte("datum", wizTot)
      .order("datum");

    // Filter out already-used boekingen
    const { data: existingRegels } = await supabase.from("inkooporder_regels").select("uren_boeking_id");
    const usedIds = new Set((existingRegels || []).map((r: any) => r.uren_boeking_id).filter(Boolean));
    const available = (data || []).filter((b: any) => !usedIds.has(b.id));

    // Get project names
    const projIds = [...new Set(available.map((b: any) => b.project_id))];
    const { data: projs } = projIds.length > 0
      ? await supabase.from("projects").select("id, naam, nummer").in("id", projIds)
      : { data: [] };
    const projMap = new Map((projs || []).map((p: any) => [p.id, p]));

    // Get planning activiteit
    const { data: planData } = await supabase
      .from("planning")
      .select("datum, project_id, activiteit")
      .eq("medewerker_id", profileId)
      .gte("datum", wizVan)
      .lte("datum", wizTot);
    const planMap = new Map((planData || []).map((p: any) => [`${p.datum}-${p.project_id}`, p.activiteit]));

    const enriched = available.map((b: any) => {
      const proj = projMap.get(b.project_id) || { naam: "", nummer: "" };
      return {
        ...b,
        project_naam: (proj as any).naam,
        project_nummer: (proj as any).nummer,
        activiteit: planMap.get(`${b.datum}-${b.project_id}`) || null,
      };
    });
    setWizBoekingen(enriched);
    setWizSelected(new Set(enriched.map((b: any) => b.id)));
    setWizLoading(false);
    setWizStep(2);
  };

  const tarief = Number(profile?.uurtarief) || 0;
  const wizTotaalUren = useMemo(() => wizBoekingen.filter(b => wizSelected.has(b.id)).reduce((s, b) => s + Number(b.uren), 0), [wizBoekingen, wizSelected]);
  const wizSubtotaal = wizTotaalUren * tarief;
  const wizBtw = wizSubtotaal * 0.21;
  const wizTotaalIncl = wizSubtotaal + wizBtw;

  const generateOrderNummer = async () => {
    const year = new Date().getFullYear();
    const { data } = await supabase.from("inkooporders").select("order_nummer").like("order_nummer", `TV-${year}-%`).order("order_nummer", { ascending: false }).limit(1);
    if (data && data.length > 0) {
      const last = data[0].order_nummer;
      const num = parseInt(last.split("-")[2]) + 1;
      return `TV-${year}-${String(num).padStart(4, "0")}`;
    }
    return `TV-${year}-0001`;
  };

  const createOrder = async () => {
    if (!profileId) return;
    const selectedBoekingen = wizBoekingen.filter(b => wizSelected.has(b.id));
    if (selectedBoekingen.length === 0) { toast.error("Selecteer minimaal 1 boeking"); return; }

    const orderNummer = await generateOrderNummer();
    const { data: order, error } = await supabase.from("inkooporders").insert({
      order_nummer: orderNummer,
      medewerker_id: profileId,
      periode_van: wizVan,
      periode_tot: wizTot,
      status: "concept",
      totaal_uren: wizTotaalUren,
      totaal_excl_btw: wizSubtotaal,
      btw_bedrag: wizBtw,
      totaal_incl_btw: wizTotaalIncl,
      aangemaakt_door: profileId,
    } as any).select("id").single();

    if (error || !order) { toast.error("Fout bij aanmaken inkooporder"); return; }

    const regels = selectedBoekingen.map((b: any) => ({
      inkooporder_id: order.id,
      uren_boeking_id: b.id,
      datum: b.datum,
      project_id: b.project_id,
      project_naam: b.project_naam,
      activiteit: b.activiteit || null,
      uren: Number(b.uren),
      uurtarief: tarief,
      bedrag: Number(b.uren) * tarief,
    }));
    await supabase.from("inkooporder_regels").insert(regels as any);

    toast.success(`Inkooporder ${orderNummer} aangemaakt`);
    setShowCreate(false);
    fetchOrders();
  };

  const downloadPdf = async () => {
    if (!selectedOrder) return;
    const bedrijf = await getBedrijfsgegevens();
    const bNaam = bedrijf?.bedrijfsnaam || "TerreVolt BV";
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(74, 124, 47);
    doc.text(bNaam, 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("Inkooporder", 14, 28);

    let yLeft = 36;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    if (bedrijf?.straat) { doc.text(bedrijf.straat, 14, yLeft); yLeft += 5; }
    if (bedrijf?.postcode || bedrijf?.stad) { doc.text([bedrijf.postcode, bedrijf.stad].filter(Boolean).join(" "), 14, yLeft); yLeft += 5; }
    if (bedrijf?.kvk_nummer) { doc.text(`KVK: ${bedrijf.kvk_nummer}`, 14, yLeft); yLeft += 5; }

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text(selectedOrder.order_nummer, 14, yLeft + 6);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Periode: ${selectedOrder.periode_van} t/m ${selectedOrder.periode_tot}`, 14, yLeft + 13);

    if (profile) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Opdrachtnemer:", 120, 40);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(profile.bedrijfsnaam || profile.full_name, 120, 47);
      if (profile.factuuradres || profile.adres) doc.text(profile.factuuradres || profile.adres, 120, 53);
      if (profile.kvk_nummer) doc.text(`KVK: ${profile.kvk_nummer}`, 120, 59);
      if (profile.btw_nummer) doc.text(`BTW: ${profile.btw_nummer}`, 120, 65);
      if (profile.iban) doc.text(`IBAN: ${profile.iban}`, 120, 71);
    }

    autoTable(doc, {
      startY: 80,
      head: [["Datum", "Project", "Activiteit", "Uren", "Tarief", "Bedrag"]],
      body: orderRegels.map(r => [r.datum, r.project_naam || "", r.activiteit || "", `${r.uren}`, euro(r.uurtarief), euro(r.bedrag)]),
      foot: [
        ["", "", "", "", "Subtotaal:", euro(Number(selectedOrder.totaal_excl_btw))],
        ["", "", "", "", "BTW 21%:", euro(Number(selectedOrder.btw_bedrag))],
        ["", "", "", "", "Totaal:", euro(Number(selectedOrder.totaal_incl_btw))],
      ],
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [74, 124, 47], textColor: 255 },
      footStyles: { fillColor: [245, 247, 240], textColor: [0, 0, 0], fontStyle: "bold" },
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 200;
    doc.setFontSize(8);
    doc.setTextColor(130);
    if (bedrijf?.iban) doc.text(`IBAN: ${bedrijf.iban}${bedrijf.iban_naam ? ` t.n.v. ${bedrijf.iban_naam}` : ""}`, 14, finalY + 15);
    doc.text(`${bNaam}`, 14, finalY + 22);

    doc.save(`Inkooporder_${selectedOrder.order_nummer}.pdf`);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}><Spinner /></div>;

  // Create wizard overlay
  if (showCreate) {
    return (
      <PageShell>
        <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg" style={{ color: "var(--text-muted)" }}><ArrowLeft className="h-5 w-5" /></button>
              <span className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Inkooporder aanvragen</span>
            </div>
            <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg" style={{ color: "var(--text-muted)" }}><X className="h-5 w-5" /></button>
          </div>
        </header>

        <main className="px-4 py-4 space-y-4">
          {wizStep === 1 && (
            <div className="space-y-4">
              <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Kies de periode</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Selecteer de periode waarvoor je goedgekeurde uren wilt indienen.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Van</label>
                    <input type="date" value={wizVan} onChange={e => setWizVan(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Tot</label>
                    <input type="date" value={wizTot} onChange={e => setWizTot(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
                  </div>
                </div>
              </div>
              <button onClick={loadBoekingen} disabled={!wizVan || !wizTot || wizLoading}
                className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
                {wizLoading ? "Laden…" : "Goedgekeurde uren ophalen"}
              </button>
            </div>
          )}

          {wizStep === 2 && (
            <div className="space-y-4">
              {wizBoekingen.length === 0 ? (
                <div className="text-center py-12 rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <FileText className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Geen beschikbare goedgekeurde uren</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Alle uren zijn al op een inkooporder geplaatst, of er zijn geen goedgekeurde uren in deze periode.</p>
                  <button onClick={() => setWizStep(1)} className="mt-4 px-4 py-2 rounded-lg text-xs font-semibold" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                    Andere periode kiezen
                  </button>
                </div>
              ) : (
                <>
                  <div className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Selecteer uren</p>
                      <button onClick={() => {
                        if (wizSelected.size === wizBoekingen.length) setWizSelected(new Set());
                        else setWizSelected(new Set(wizBoekingen.map(b => b.id)));
                      }} className="text-[11px] font-semibold" style={{ color: "var(--accent)" }}>
                        {wizSelected.size === wizBoekingen.length ? "Deselecteer alles" : "Selecteer alles"}
                      </button>
                    </div>
                    <div className="space-y-1">
                      {wizBoekingen.map(b => (
                        <label key={b.id} className="flex items-center gap-3 py-2 px-2 rounded-lg cursor-pointer" style={{ background: wizSelected.has(b.id) ? "var(--accent-light)" : "transparent" }}>
                          <input type="checkbox" checked={wizSelected.has(b.id)} onChange={() => {
                            const next = new Set(wizSelected);
                            next.has(b.id) ? next.delete(b.id) : next.add(b.id);
                            setWizSelected(next);
                          }} className="accent-[var(--accent)]" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                                {format(new Date(b.datum), "EEE d MMM", { locale: nl })}
                              </span>
                              <span className="text-xs font-bold" style={{ fontFamily: "DM Mono, monospace", color: "var(--accent)" }}>{b.uren}u</span>
                            </div>
                            <span className="text-[11px] truncate block" style={{ color: "var(--text-muted)" }}>
                              {b.project_naam || b.project_nummer}{b.activiteit ? ` · ${b.activiteit}` : ""}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Samenvatting */}
                  <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--bg-surface)", border: "1px solid var(--accent-border)" }}>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Samenvatting</p>
                    <div className="flex justify-between text-xs" style={{ color: "var(--text-muted)" }}>
                      <span>Uren</span>
                      <span style={{ fontFamily: "DM Mono, monospace" }}>{wizTotaalUren}u × {euro(tarief)}</span>
                    </div>
                    <div className="flex justify-between text-xs" style={{ color: "var(--text-muted)" }}>
                      <span>Subtotaal</span>
                      <span style={{ fontFamily: "DM Mono, monospace" }}>{euro(wizSubtotaal)}</span>
                    </div>
                    <div className="flex justify-between text-xs" style={{ color: "var(--text-muted)" }}>
                      <span>BTW 21%</span>
                      <span style={{ fontFamily: "DM Mono, monospace" }}>{euro(wizBtw)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold pt-1" style={{ borderTop: "1px solid var(--border)", color: "var(--accent)" }}>
                      <span>Totaal incl. BTW</span>
                      <span style={{ fontFamily: "DM Mono, monospace" }}>{euro(wizTotaalIncl)}</span>
                    </div>
                    {tarief === 0 && (
                      <p className="text-[11px] mt-1" style={{ color: "var(--warning, #f59e0b)" }}>⚠️ Je uurtarief staat op €0. Neem contact op met je manager.</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setWizStep(1)} className="flex-1 py-3 rounded-xl text-sm font-semibold" style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                      Terug
                    </button>
                    <button onClick={createOrder} disabled={wizSelected.size === 0 || tarief === 0}
                      className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
                      Aanvragen
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <HeaderLogo />
            <span className="text-base font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Mijn inkooporders</span>
          </div>
          <button onClick={openWizard} className="px-3 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1.5" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
            <Plus className="h-3.5 w-3.5" /> Aanvragen
          </button>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {orders.length === 0 ? (
          <div className="text-center py-12 rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <FileText className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Nog geen inkooporders</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Vraag een inkooporder aan op basis van je goedgekeurde uren.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map(o => {
              const si = INKOOPORDER_STATUS_CONFIG[o.status] || INKOOPORDER_STATUS_CONFIG.concept;
              return (
                <button key={o.id} onClick={() => loadDetail(o)} className="w-full text-left rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: `1px solid ${selectedOrder?.id === o.id ? "var(--accent)" : "var(--border)"}` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-primary)" }}>{o.order_nummer}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: si.bg, color: si.color, border: `1px solid ${si.border}` }}>{si.label}</span>
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{o.periode_van} → {o.periode_tot}</p>
                  <p className="text-lg font-bold mt-1" style={{ fontFamily: "DM Mono, monospace", color: "var(--accent)" }}>{euro(Number(o.totaal_incl_btw) || 0)}</p>
                  {o.status === "betaald" && o.betaald_op && (
                    <p className="text-[10px] mt-1" style={{ color: "var(--success)" }}>Betaald op {format(new Date(o.betaald_op), "d MMM yyyy", { locale: nl })}</p>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Detail */}
        {selectedOrder && (
          <div className="space-y-3">
            {selectedOrder.status === "verzonden" && (
              <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: "var(--success-light)", border: "1px solid var(--success-border)" }}>
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--success)" }} />
                  <span className="text-[13px] font-medium" style={{ color: "var(--success)" }}>{INKOOPORDER_STATUS_CONFIG.verzonden.hint}</span>
                </div>
                <button onClick={downloadPdf} className="w-full py-2.5 rounded-xl text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))" }}>
                  <Download className="h-3.5 w-3.5 inline mr-1" /> Download PDF
                </button>
              </div>
            )}

            <div className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Datum", "Project", "Uren", "Bedrag"].map(h => (
                        <th key={h} className="text-left pb-2 px-2 font-semibold" style={{ color: "var(--text-muted)", fontSize: 10, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orderRegels.map(r => (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--bg-surface-2)" }}>
                        <td className="py-2 px-2" style={{ color: "var(--text-primary)" }}>{r.datum}</td>
                        <td className="py-2 px-2" style={{ color: "var(--text-primary)" }}>{r.project_naam}</td>
                        <td className="py-2 px-2" style={{ fontFamily: "DM Mono, monospace" }}>{r.uren}u</td>
                        <td className="py-2 px-2 font-semibold" style={{ fontFamily: "DM Mono, monospace" }}>{euro(r.bedrag)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid var(--accent-border)" }}>
                      <td colSpan={2} />
                      <td className="py-2 px-2 font-bold" style={{ fontFamily: "DM Mono, monospace" }}>{selectedOrder.totaal_uren}u</td>
                      <td className="py-2 px-2 font-bold text-base" style={{ fontFamily: "DM Mono, monospace", color: "var(--accent)" }}>{euro(Number(selectedOrder.totaal_incl_btw))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {selectedOrder.status !== "verzonden" && (
              <button onClick={downloadPdf} className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                <Download className="h-3.5 w-3.5" /> Download PDF
              </button>
            )}
          </div>
        )}
      </main>
    </PageShell>
  );
}
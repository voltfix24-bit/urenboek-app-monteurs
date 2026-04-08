import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Download, FileText, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { euroDecimals as euro } from "@/lib/formatting";
import { Spinner } from "@/components/ui/Spinner";
import { getBedrijfsgegevens } from "@/hooks/useBedrijfsgegevens";
import { INKOOPORDER_STATUS_CONFIG } from "@/lib/inkooporderStatus";
import { EmptyState } from "@/components/ui/EmptyState";

export default function MijnOrders() {
  const { user } = useAuth();
  const { profileId } = useProfile();
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

  return (
    <PageShell>
      <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
        <div className="px-4 py-3 flex items-center gap-2.5">
          <HeaderLogo />
          <span className="text-base font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Mijn inkooporders</span>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4">
        {orders.length === 0 ? (
          <EmptyState
            icoon="📄"
            titel="Nog geen inkooporders"
            subtitel="Je manager maakt een inkooporder aan zodra je uren zijn goedgekeurd. Je ontvangt dan een bericht."
          />
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

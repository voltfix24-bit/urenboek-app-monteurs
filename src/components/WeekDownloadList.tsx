import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { groepeerOrdersPerWeek, downloadWeekPdfs, laadRegelsVoorOrders } from "@/lib/inkooporderWeekDownload";
import { euroDecimals as euro } from "@/lib/formatting";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";


interface Props {
  orders: any[];
  /** Toon naam van monteur per order (alleen handig voor manager-view). */
  toonNaam?: boolean;
}

export function WeekDownloadList({ orders, toonNaam = false }: Props) {
  const [ordersMetRegels, setOrdersMetRegels] = useState<Array<{ order: any; regels: any[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    laadRegelsVoorOrders(orders)
      .then(res => { if (!cancelled) setOrdersMetRegels(res); })
      .catch(err => { console.error("laadRegelsVoorOrders", err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orders]);

  const groepen = useMemo(() => groepeerOrdersPerWeek(ordersMetRegels), [ordersMetRegels]);

  if (loading) {
    return (
      <div className="rounded-2xl p-3.5 text-center text-xs"
        style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)", color: "#a0abc3" }}>
        Weken laden…
      </div>
    );
  }
  if (groepen.length === 0) return null;

  const handleDownload = async (key: string, weekItems: Array<{ order: any; regels: any[] }>) => {
    setBusyKey(key);
    try {
      await downloadWeekPdfs(weekItems);
      toast.success(`${weekItems.length} PDF${weekItems.length === 1 ? "" : "'s"} gedownload`);
    } catch (e) {
      console.error(e);
      toast.error("Download mislukt");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider px-1" style={{ color: "#a0abc3" }}>
        Per week downloaden
      </p>
      {groepen.map(g => (
        <div key={g.key} className="rounded-2xl p-3.5 flex items-center justify-between gap-3"
          style={{ background: "rgba(10,26,48,0.7)", border: "1px solid rgba(106,118,140,0.15)" }}>
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: "#dae6ff", fontFamily: "Manrope" }}>
              Week {g.week} · {g.jaar}
            </p>
            <p className="text-[11px]" style={{ color: "#a0abc3" }}>
              {format(parseISO(g.van), "d MMM", { locale: nl })} – {format(parseISO(g.tot), "d MMM", { locale: nl })}
              {" · "}
              {g.totaalUren.toFixed(1).replace(".", ",")} uur
              {" · "}
              <span style={{ fontFamily: "DM Mono, monospace", color: "#3fff8b" }}>{euro(g.totaalBedrag)}</span>
            </p>
            {toonNaam && (
              <p className="text-[10px] mt-0.5 truncate" style={{ color: "#a0abc3" }}>
                {[...new Set(g.orderRegels.map(o => o.order.medewerker_naam || o.order.medewerker_full_name).filter(Boolean))].join(", ")}
              </p>
            )}
          </div>
          <button
            onClick={() => handleDownload(g.key, g.orderRegels)}
            disabled={busyKey === g.key}
            className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)", color: "#3fff8b" }}
          >
            {busyKey === g.key ? (
              <span className="inline-block rounded-full animate-spin" style={{ width: 14, height: 14, border: "2px solid #3fff8b", borderTopColor: "transparent" }} />
            ) : <Download className="h-3.5 w-3.5" />}
            PDF{g.orderRegels.length > 1 ? "'s" : ""}
          </button>
        </div>
      ))}
    </div>
  );
}

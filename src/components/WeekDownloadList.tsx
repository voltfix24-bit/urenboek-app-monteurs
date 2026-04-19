import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { groepeerOrdersPerWeek, downloadWeekPdfs } from "@/lib/inkooporderWeekDownload";
import { euroDecimals as euro } from "@/lib/formatting";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { Spinner } from "@/components/ui/Spinner";

interface Props {
  orders: any[];
  /** Toon naam van monteur per order (alleen handig voor manager-view). */
  toonNaam?: boolean;
}

export function WeekDownloadList({ orders, toonNaam = false }: Props) {
  const groepen = useMemo(() => groepeerOrdersPerWeek(orders), [orders]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  if (groepen.length === 0) return null;

  const handleDownload = async (key: string, weekOrders: any[]) => {
    setBusyKey(key);
    try {
      await downloadWeekPdfs(weekOrders);
      toast.success(`${weekOrders.length} PDF${weekOrders.length === 1 ? "" : "'s"} gedownload`);
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
              {g.orders.length} order{g.orders.length === 1 ? "" : "s"}
              {" · "}
              <span style={{ fontFamily: "DM Mono, monospace", color: "#3fff8b" }}>{euro(g.totaalBedrag)}</span>
            </p>
            {toonNaam && (
              <p className="text-[10px] mt-0.5 truncate" style={{ color: "#a0abc3" }}>
                {[...new Set(g.orders.map((o: any) => o.medewerker_naam).filter(Boolean))].join(", ")}
              </p>
            )}
          </div>
          <button
            onClick={() => handleDownload(g.key, g.orders)}
            disabled={busyKey === g.key}
            className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: "rgba(63,255,139,0.1)", border: "1px solid rgba(63,255,139,0.3)", color: "#3fff8b" }}
          >
            {busyKey === g.key ? <Spinner size="sm" /> : <Download className="h-3.5 w-3.5" />}
            PDF{g.orders.length > 1 ? "'s" : ""}
          </button>
        </div>
      ))}
    </div>
  );
}

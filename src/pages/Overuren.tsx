import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { PageShell } from "@/components/PageShell";
import { HeaderLogo } from "@/components/HeaderLogo";
import { PullToRefresh } from "@/components/PullToRefresh";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { ListSkeleton, OverurenCardSkeleton } from "@/components/ui/Skeletons";
import { EmptyState } from "@/components/ui/EmptyState";

interface Melding {
  id: string;
  medewerker_id: string;
  datum: string;
  type: string;
  geboekte_uren: number;
  limiet_uren: number;
  ingeplande_uren: number | null;
  toelichting: string | null;
  status: string;
  behandeld_door: string | null;
  behandeld_op: string | null;
  created_at: string;
  full_name: string;
  behandeld_naam: string | null;
}

const TYPE_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  dag_overschrijding: { label: "Dag > 8u", bg: "var(--warn-light)", color: "var(--warn-text)" },
  week_overschrijding: { label: "Week > 40u", bg: "rgba(110,155,255,0.1)", color: "var(--info)" },
  meer_dan_ingepland: { label: "Meer dan ingepland", bg: "var(--danger-light)", color: "var(--danger)" },
};

export default function Overuren() {
  const { isManager } = useAuth();
  const { profileId } = useProfile();
  const [meldingen, setMeldingen] = useState<Melding[]>([]);
  const [filter, setFilter] = useState("open");
  const [loading, setLoading] = useState(true);

  const fetchMeldingen = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("overuren_meldingen").select("*").order("created_at", { ascending: false });
    if (filter !== "alle") q = q.eq("status", filter);
    const { data } = await q;
    if (!data) { setLoading(false); return; }

    const medIds = [...new Set(data.map((m: any) => m.medewerker_id))];
    const behIds = [...new Set(data.filter((m: any) => m.behandeld_door).map((m: any) => m.behandeld_door))];
    const allIds = [...new Set([...medIds, ...behIds])];

    const { data: profiles } = allIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", allIds)
      : { data: [] };
    const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));

    setMeldingen(data.map((m: any) => ({
      ...m,
      geboekte_uren: Number(m.geboekte_uren),
      limiet_uren: Number(m.limiet_uren),
      ingeplande_uren: m.ingeplande_uren != null ? Number(m.ingeplande_uren) : null,
      full_name: nameMap.get(m.medewerker_id) || "Onbekend",
      behandeld_naam: m.behandeld_door ? nameMap.get(m.behandeld_door) || null : null,
    })));
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchMeldingen(); }, [fetchMeldingen]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel('overuren-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'overuren_meldingen' }, fetchMeldingen).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMeldingen]);

  const handleAction = async (id: string, status: string) => {
    const { error } = await supabase.from("overuren_meldingen").update({
      status,
      behandeld_door: profileId,
      behandeld_op: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error("Fout bij opslaan"); return; }
    toast.success(status === "goedgekeurd" ? "Overuren goedgekeurd ✓" : "Overuren afgekeurd");
    fetchMeldingen();
  };

  if (!isManager) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-navy)" }}><p style={{ color: "var(--text-muted)" }}>Alleen managers hebben toegang.</p></div>;
  }

  const openCount = meldingen.filter(m => m.status === "open").length;

  const mainContent = (
    <main className="px-4 py-4 space-y-4">
      <div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {filter === "open" ? `${meldingen.length} open meldingen` : `${meldingen.length} meldingen`}
        </p>
      </div>

      <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {([["open", "Open"], ["goedgekeurd", "Goedgekeurd"], ["afgekeurd", "Afgekeurd"], ["alle", "Alle"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors" style={{
            background: filter === k ? "var(--accent-light)" : "var(--bg-surface)",
            border: filter === k ? "1px solid var(--accent-border)" : "1px solid var(--planning-border-soft)",
            color: filter === k ? "var(--accent)" : "var(--text-muted)",
          }}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <ListSkeleton count={3} ItemSkeleton={OverurenCardSkeleton} />
      ) : meldingen.length === 0 ? (
        <EmptyState icoon="✓" titel="Geen overuren meldingen" subtitel="Geen meldingen voor dit filter." />
      ) : (
        <div className="space-y-3">
          {meldingen.map(m => {
            const tc = TYPE_CONFIG[m.type] || TYPE_CONFIG.dag_overschrijding;
            const isDone = m.status !== "open";
            return (
              <div key={m.id} className="rounded-2xl p-4 space-y-3 transition-opacity" style={{
                background: "var(--bg-surface)", border: "1px solid var(--planning-border-soft)",
                opacity: isDone ? 0.7 : 1,
              }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
                    {m.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{m.full_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {format(new Date(m.datum), "d MMMM yyyy", { locale: nl })}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: tc.bg, color: tc.color }}>
                        {tc.label}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div>
                    <span className="text-[10px] block" style={{ color: "var(--text-muted)" }}>Geboekt</span>
                    <span className="text-sm font-bold" style={{
                      fontFamily: "DM Mono, monospace",
                      color: m.geboekte_uren > m.limiet_uren ? "var(--danger)" : "var(--text-primary)",
                    }}>{m.geboekte_uren}u</span>
                  </div>
                  <div>
                    <span className="text-[10px] block" style={{ color: "var(--text-muted)" }}>Limiet</span>
                    <span className="text-sm font-bold" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-muted)" }}>{m.limiet_uren}u</span>
                  </div>
                  {m.type === "meer_dan_ingepland" && m.ingeplande_uren != null && (
                    <div>
                      <span className="text-[10px] block" style={{ color: "var(--text-muted)" }}>Ingepland</span>
                      <span className="text-sm font-bold" style={{ fontFamily: "DM Mono, monospace", color: "var(--text-muted)" }}>{m.ingeplande_uren}u</span>
                    </div>
                  )}
                </div>

                <div>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Toelichting monteur:</span>
                  {m.toelichting ? (
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-primary)" }}>"{m.toelichting}"</p>
                  ) : (
                    <p className="text-xs italic mt-0.5" style={{ color: "var(--text-muted)" }}>Geen toelichting ontvangen</p>
                  )}
                </div>

                {isDone ? (
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{
                      background: m.status === "goedgekeurd" ? "var(--accent-light)" : "var(--danger-light)",
                      color: m.status === "goedgekeurd" ? "var(--accent)" : "var(--danger)",
                    }}>
                      {m.status === "goedgekeurd" ? "✓ Goedgekeurd" : "✕ Afgekeurd"}
                    </span>
                    {m.behandeld_op && (
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        Behandeld op {format(new Date(m.behandeld_op), "d MMM yyyy", { locale: nl })}
                        {m.behandeld_naam && ` door ${m.behandeld_naam}`}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => handleAction(m.id, "goedgekeurd")} className="flex-1 py-2 rounded-xl text-xs font-semibold transition-colors" style={{
                      background: "var(--accent-light)", border: "1px solid var(--accent-border)", color: "var(--accent)",
                    }}>
                      ✓ Goedkeuren
                    </button>
                    <button onClick={() => handleAction(m.id, "afgekeurd")} className="flex-1 py-2 rounded-xl text-xs font-semibold transition-colors" style={{
                      background: "var(--danger-light)", border: "1px solid var(--danger-border)", color: "var(--danger)",
                    }}>
                      ✕ Afwijzen
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );

  return (
    <PageShell>
      <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--planning-border-soft)" }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <HeaderLogo />
            <span className="text-base font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Overuren meldingen</span>
          </div>
          {filter === "open" && meldingen.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: "var(--warn-light)", border: "1px solid var(--warn-border)" }}>
              <span className="text-lg font-extrabold" style={{ color: "var(--warn-text)" }}>{meldingen.length}</span>
              <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>open</span>
            </div>
          )}
        </div>
      </header>
      <div className="lg:hidden">
        <PullToRefresh onRefresh={fetchMeldingen}>{mainContent}</PullToRefresh>
      </div>
      <div className="hidden lg:block">{mainContent}</div>
    </PageShell>
  );
}

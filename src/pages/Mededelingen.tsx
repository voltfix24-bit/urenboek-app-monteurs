import { useState, useEffect, useCallback } from "react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { PullToRefresh } from "@/components/PullToRefresh";
import { toast } from "sonner";
import { Send, ArrowLeft, AlertTriangle, Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

interface Mededeling { id: string; titel: string; inhoud: string; urgentie: string; created_at: string; verzender_naam: string; gelezen: boolean; }

export default function Mededelingen() {
  const { user, isManager } = useAuth();
  const [items, setItems] = useState<Mededeling[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Mededeling | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [titel, setTitel] = useState("");
  const [inhoud, setInhoud] = useState("");
  const [urgentie, setUrgentie] = useState("normaal");
  const [ontvangerType, setOntvangerType] = useState("iedereen");

  const fetchProfileId = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("id").eq("user_id", user.id).single();
    if (data) setProfileId(data.id);
  }, [user]);

  const fetchMededelingen = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("mededelingen").select("*").order("created_at", { ascending: false });
    if (data && profileId) {
      const { data: readData } = await supabase.from("mededeling_leesstatus").select("mededeling_id, gelezen_op").eq("medewerker_id", profileId);
      const readMap = new Map(readData?.map((r: any) => [r.mededeling_id, !!r.gelezen_op]) ?? []);
      const senderIds = [...new Set(data.map((d: any) => d.verzonden_door))];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", senderIds);
      const nameMap = new Map(profiles?.map((p: any) => [p.id, p.full_name]) ?? []);
      setItems(data.map((d: any) => ({ id: d.id, titel: d.titel, inhoud: d.inhoud, urgentie: d.urgentie, created_at: d.created_at, verzender_naam: nameMap.get(d.verzonden_door) || "Onbekend", gelezen: readMap.get(d.id) || false })));
    }
    setLoading(false);
  }, [user, profileId]);

  useEffect(() => { fetchProfileId(); }, [fetchProfileId]);
  useEffect(() => { if (profileId) fetchMededelingen(); }, [fetchMededelingen, profileId]);

  useEffect(() => {
    const channel = supabase.channel("mededelingen-realtime").on("postgres_changes", { event: "INSERT", schema: "public", table: "mededelingen" }, () => { fetchMededelingen(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMededelingen]);

  const markAsRead = async (mededelingId: string) => {
    if (!profileId) return;
    await supabase.from("mededeling_leesstatus").upsert({ mededeling_id: mededelingId, medewerker_id: profileId, gelezen_op: new Date().toISOString() }, { onConflict: "mededeling_id,medewerker_id" });
  };

  const openDetail = (item: Mededeling) => {
    setSelected(item);
    if (!item.gelezen) { markAsRead(item.id); setItems(prev => prev.map(i => i.id === item.id ? { ...i, gelezen: true } : i)); }
  };

  const sendMededeling = async () => {
    if (!profileId || !titel.trim()) return;
    const { error } = await supabase.from("mededelingen").insert({ titel: titel.trim(), inhoud: inhoud.trim(), urgentie, ontvanger_type: ontvangerType, verzonden_door: profileId });
    if (error) toast.error("Fout bij verzenden");
    else { toast.success("Mededeling verzonden!"); setShowCompose(false); setTitel(""); setInhoud(""); setUrgentie("normaal"); setOntvangerType("iedereen"); fetchMededelingen(); }
  };

  const unreadCount = items.filter(i => !i.gelezen).length;

  if (selected) {
    return (
      <PageShell>
        <header className="sticky top-0 z-30 px-4 py-3" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
          <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            <ArrowLeft className="h-4 w-4" /> Terug
          </button>
        </header>
        <div className="px-4 py-4 space-y-3">
          {selected.urgentie === "urgent" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "var(--danger-light)", border: "1px solid #E8A09A" }}>
              <AlertTriangle className="h-4 w-4" style={{ color: "var(--danger)" }} />
              <span className="text-xs font-semibold" style={{ color: "var(--danger)" }}>Urgent bericht</span>
            </div>
          )}
          <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{selected.titel}</h1>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{selected.verzender_naam} · {formatDistanceToNow(new Date(selected.created_at), { locale: nl, addSuffix: true })}</p>
          <div className="text-sm leading-relaxed whitespace-pre-wrap rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            {selected.inhoud || "Geen inhoud"}
          </div>
        </div>
      </PageShell>
    );
  }

  const listContent = (
    <main className="px-4 py-4 space-y-2">
      {loading ? (
        <div className="text-center py-10"><div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
          <Bell className="h-8 w-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Geen mededelingen</p>
        </div>
      ) : (
        items.map(item => (
          <button key={item.id} onClick={() => openDetail(item)} className="w-full text-left rounded-2xl p-4 transition-colors active:scale-[0.98]" style={{
            background: item.gelezen ? "var(--bg-base)" : "var(--bg-surface)",
            border: item.urgentie === "urgent" ? "1px solid #E8A09A" : "1px solid var(--border)",
          }}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {!item.gelezen && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--accent)" }} />}
                  {item.urgentie === "urgent" && <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--danger)" }} />}
                  <p className={`text-sm font-semibold truncate`} style={{ color: item.gelezen ? "var(--text-muted)" : "var(--text-primary)" }}>{item.titel}</p>
                </div>
                <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--text-muted)" }}>{item.inhoud || "Geen inhoud"}</p>
              </div>
              <span className="text-[10px] shrink-0 mt-1" style={{ color: "var(--text-muted)" }}>
                {formatDistanceToNow(new Date(item.created_at), { locale: nl, addSuffix: true })}
              </span>
            </div>
          </button>
        ))
      )}
    </main>
  );

  return (
    <PageShell>
      <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <HeaderLogo />
            <span className="text-base font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Mededelingen</span>
          </div>
          {unreadCount > 0 && (
            <div className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: "var(--danger-light)", color: "var(--danger)" }}>
              {unreadCount} nieuw
            </div>
          )}
        </div>
      </header>

      <div className="lg:hidden">
        <PullToRefresh onRefresh={async () => { await fetchMededelingen(); }}>
          {listContent}
        </PullToRefresh>
      </div>
      <div className="hidden lg:block">
        {listContent}
      </div>

      {isManager && (
        <button onClick={() => setShowCompose(true)} className="fixed z-40 flex items-center justify-center active:scale-93 transition-transform" style={{
          bottom: 90, right: "max(24px, calc(50% - 215px + 24px))",
          width: 56, height: 56, borderRadius: "50%",
          background: "linear-gradient(135deg, var(--accent), var(--accent-dark))",
          color: "#fff", boxShadow: "0 8px 28px color-mix(in srgb, var(--accent) 35%, transparent)",
        }}>
          <Send className="h-5 w-5" />
        </button>
      )}

      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowCompose(false)}>
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--text-primary) 35%, transparent)", backdropFilter: "blur(6px)" }} />
          <div className="relative w-full animate-sheet-up rounded-t-3xl p-5 space-y-4" style={{ maxWidth: 430, maxHeight: "85vh", overflowY: "auto", background: "var(--bg-surface)", border: "1px solid var(--border)", borderBottom: "none", paddingBottom: 40 }} onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto" style={{ background: "var(--border)" }} />
            <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Nieuwe mededeling</h2>

            <div className="space-y-3">
              <input value={titel} onChange={e => setTitel(e.target.value)} placeholder="Titel" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              <textarea value={inhoud} onChange={e => setInhoud(e.target.value)} placeholder="Inhoud..." rows={4} className="w-full px-3 py-2.5 rounded-xl text-sm resize-none" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />

              <div className="flex gap-2">
                {(["normaal", "urgent"] as const).map(u => (
                  <button key={u} onClick={() => setUrgentie(u)} className="flex-1 py-2 rounded-xl text-xs font-semibold capitalize" style={{
                    background: urgentie === u ? (u === "urgent" ? "var(--danger-light)" : "var(--success-light)") : "var(--bg-base)",
                    border: urgentie === u ? (u === "urgent" ? "1px solid #E8A09A" : "1px solid #8DC99A") : "1px solid var(--border)",
                    color: urgentie === u ? (u === "urgent" ? "var(--danger)" : "var(--success)") : "var(--text-muted)",
                  }}>{u}</button>
                ))}
              </div>

              <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {(["iedereen", "monteurs", "persoon"] as const).map(t => (
                  <button key={t} onClick={() => setOntvangerType(t)} className="shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-semibold capitalize" style={{
                    background: ontvangerType === t ? "var(--accent-light)" : "var(--bg-base)",
                    border: ontvangerType === t ? "1px solid #9DC87A" : "1px solid var(--border)",
                    color: ontvangerType === t ? "var(--accent)" : "var(--text-muted)",
                  }}>{t}</button>
                ))}
              </div>

              <button onClick={sendMededeling} disabled={!titel.trim()} className="w-full py-3 rounded-2xl text-sm font-bold transition-colors disabled:opacity-40" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", color: "#fff" }}>
                Verzenden
              </button>
            </div>
          </div>
        </div>
      )}

    </PageShell>
  );
}

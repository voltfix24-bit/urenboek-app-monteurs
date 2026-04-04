import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/BottomNav";
import { toast } from "sonner";
import { Send, ArrowLeft, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";

interface Mededeling {
  id: string;
  titel: string;
  inhoud: string;
  urgentie: string;
  created_at: string;
  verzender_naam: string;
  gelezen: boolean;
}

export default function Mededelingen() {
  const { user, isManager } = useAuth();
  const [items, setItems] = useState<Mededeling[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Mededeling | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  // Compose state
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

    const { data } = await supabase
      .from("mededelingen")
      .select("*")
      .order("created_at", { ascending: false });

    if (data && profileId) {
      // Get read status
      const { data: readData } = await supabase
        .from("mededeling_leesstatus")
        .select("mededeling_id, gelezen_op")
        .eq("medewerker_id", profileId);

      const readMap = new Map(readData?.map((r: any) => [r.mededeling_id, !!r.gelezen_op]) ?? []);

      // Get sender names
      const senderIds = [...new Set(data.map((d: any) => d.verzonden_door))];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", senderIds);
      const nameMap = new Map(profiles?.map((p: any) => [p.id, p.full_name]) ?? []);

      setItems(data.map((d: any) => ({
        id: d.id,
        titel: d.titel,
        inhoud: d.inhoud,
        urgentie: d.urgentie,
        created_at: d.created_at,
        verzender_naam: nameMap.get(d.verzonden_door) || "Onbekend",
        gelezen: readMap.get(d.id) || false,
      })));
    }
    setLoading(false);
  }, [user, profileId]);

  useEffect(() => { fetchProfileId(); }, [fetchProfileId]);
  useEffect(() => { if (profileId) fetchMededelingen(); }, [fetchMededelingen, profileId]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("mededelingen-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mededelingen" }, () => {
        fetchMededelingen();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMededelingen]);

  const markAsRead = async (mededelingId: string) => {
    if (!profileId) return;
    await supabase.from("mededeling_leesstatus").upsert({
      mededeling_id: mededelingId,
      medewerker_id: profileId,
      gelezen_op: new Date().toISOString(),
    }, { onConflict: "mededeling_id,medewerker_id" });
  };

  const openDetail = (item: Mededeling) => {
    setSelected(item);
    if (!item.gelezen) {
      markAsRead(item.id);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, gelezen: true } : i));
    }
  };

  const sendMededeling = async () => {
    if (!profileId || !titel.trim()) return;
    const { error } = await supabase.from("mededelingen").insert({
      titel: titel.trim(),
      inhoud: inhoud.trim(),
      urgentie,
      ontvanger_type: ontvangerType,
      verzonden_door: profileId,
    });
    if (error) {
      toast.error("Fout bij verzenden");
    } else {
      toast.success("Mededeling verzonden!");
      setShowCompose(false);
      setTitel(""); setInhoud(""); setUrgentie("normaal"); setOntvangerType("iedereen");
      fetchMededelingen();
    }
  };

  const unreadCount = items.filter(i => !i.gelezen).length;

  // Detail view
  if (selected) {
    return (
      <div className="min-h-screen bg-background" style={{ maxWidth: 430, margin: "0 auto", paddingBottom: 80 }}>
        <header className="sticky top-0 z-30 px-4 py-3" style={{ background: "rgba(10,10,15,0.95)", backdropFilter: "blur(12px)" }}>
          <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Terug
          </button>
        </header>
        <div className="px-4 py-4 space-y-3">
          {selected.urgentie === "urgent" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <AlertTriangle className="h-4 w-4" style={{ color: "#ef4444" }} />
              <span className="text-xs font-semibold" style={{ color: "#ef4444" }}>Urgent bericht</span>
            </div>
          )}
          <h1 className="text-lg font-bold text-foreground">{selected.titel}</h1>
          <p className="text-xs text-muted-foreground">{selected.verzender_naam} · {formatDistanceToNow(new Date(selected.created_at), { locale: nl, addSuffix: true })}</p>
          <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {selected.inhoud || "Geen inhoud"}
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden" style={{ maxWidth: 430, margin: "0 auto", paddingBottom: 80 }}>
      <header className="sticky top-0 z-30" style={{ background: "rgba(10,10,15,0.95)", backdropFilter: "blur(12px)" }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>⚡</div>
            <span className="text-base font-bold text-foreground tracking-tight">Mededelingen</span>
          </div>
          {unreadCount > 0 && (
            <div className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
              {unreadCount} nieuw
            </div>
          )}
        </div>
      </header>

      <main className="px-4 py-4 space-y-2">
        {loading ? (
          <div className="text-center py-10"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-3xl mb-2">🔔</p>
            <p className="text-sm font-medium text-foreground">Geen mededelingen</p>
          </div>
        ) : (
          items.map(item => (
            <button
              key={item.id}
              onClick={() => openDetail(item)}
              className="w-full text-left rounded-2xl p-4 transition-colors active:scale-[0.98]"
              style={{
                background: item.gelezen ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.05)",
                border: item.urgentie === "urgent" ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {!item.gelezen && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#22c55e" }} />}
                    {item.urgentie === "urgent" && <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: "#ef4444" }} />}
                    <p className={`text-sm font-semibold truncate ${item.gelezen ? "text-muted-foreground" : "text-foreground"}`}>{item.titel}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.inhoud || "Geen inhoud"}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 mt-1">
                  {formatDistanceToNow(new Date(item.created_at), { locale: nl, addSuffix: true })}
                </span>
              </div>
            </button>
          ))
        )}
      </main>

      {/* FAB for managers to compose */}
      {isManager && (
        <button
          onClick={() => setShowCompose(true)}
          className="fixed z-40 flex items-center justify-center active:scale-93 transition-transform"
          style={{
            bottom: 90, right: "max(24px, calc(50% - 215px + 24px))",
            width: 56, height: 56, borderRadius: "50%",
            background: "linear-gradient(135deg, #22c55e, #16a34a)",
            color: "#fff", boxShadow: "0 8px 32px rgba(34,197,94,0.4)",
          }}
        >
          <Send className="h-5 w-5" />
        </button>
      )}

      {/* Compose modal */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowCompose(false)}>
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.6)" }} />
          <div
            className="relative w-full animate-sheet-up rounded-t-3xl p-5 space-y-4"
            style={{ maxWidth: 430, maxHeight: "85vh", overflowY: "auto", background: "#111118", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", paddingBottom: 40 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full mx-auto" style={{ background: "rgba(255,255,255,0.15)" }} />
            <h2 className="text-base font-bold text-foreground">Nieuwe mededeling</h2>

            <div className="space-y-3">
              <input value={titel} onChange={e => setTitel(e.target.value)} placeholder="Titel" className="w-full px-3 py-2.5 rounded-xl text-sm text-foreground placeholder:text-muted-foreground" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />
              <textarea value={inhoud} onChange={e => setInhoud(e.target.value)} placeholder="Inhoud..." rows={4} className="w-full px-3 py-2.5 rounded-xl text-sm text-foreground placeholder:text-muted-foreground resize-none" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }} />

              <div className="flex gap-2">
                {(["normaal", "urgent"] as const).map(u => (
                  <button key={u} onClick={() => setUrgentie(u)} className="flex-1 py-2 rounded-xl text-xs font-semibold capitalize" style={{
                    background: urgentie === u ? (u === "urgent" ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)") : "rgba(255,255,255,0.04)",
                    border: urgentie === u ? (u === "urgent" ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(34,197,94,0.3)") : "1px solid rgba(255,255,255,0.06)",
                    color: urgentie === u ? (u === "urgent" ? "#ef4444" : "#22c55e") : "#64748b",
                  }}>{u}</button>
                ))}
              </div>

              <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {(["iedereen", "monteurs", "persoon"] as const).map(t => (
                  <button key={t} onClick={() => setOntvangerType(t)} className="shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-semibold capitalize" style={{
                    background: ontvangerType === t ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.04)",
                    border: ontvangerType === t ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.06)",
                    color: ontvangerType === t ? "#22c55e" : "#64748b",
                  }}>{t}</button>
                ))}
              </div>

              <button onClick={sendMededeling} disabled={!titel.trim()} className="w-full py-3 rounded-2xl text-sm font-bold transition-colors disabled:opacity-40" style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff" }}>
                Verzenden
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

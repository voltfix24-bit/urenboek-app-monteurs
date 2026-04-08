import { useState, useEffect, useCallback, useRef } from "react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { toast } from "sonner";
import { Send, ArrowLeft, Plus, MessageCircle, Check, CheckCheck } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDistanceToNow, format } from "date-fns";
import { nl } from "date-fns/locale";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";

/* ─── types ─── */
interface Gesprek {
  id: string;
  medewerker_id: string;
  onderwerp: string;
  laatste_bericht_op: string;
  laatste_bericht_preview: string;
  created_at: string;
  medewerker_naam: string;
  ongelezen: number;
}

interface ChatBericht {
  id: string;
  gesprek_id: string;
  afzender_id: string;
  inhoud: string;
  gelezen_op: string | null;
  created_at: string;
  afzender_naam: string;
  is_eigen: boolean;
}

/* ─── helpers ─── */
function initialen(naam: string) {
  return naam.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function datumLabel(dateStr: string) {
  const d = new Date(dateStr);
  const nu = new Date();
  const vandaag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  const gisteren = new Date(vandaag); gisteren.setDate(gisteren.getDate() - 1);
  if (d >= vandaag) return "Vandaag";
  if (d >= gisteren) return "Gisteren";
  return format(d, "d MMM yyyy", { locale: nl });
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function Mededelingen() {
  const { user, isManager } = useAuth();
  const { profileId } = useProfile();
  const [gesprekken, setGesprekken] = useState<Gesprek[]>([]);
  const [activeGesprek, setActiveGesprek] = useState<Gesprek | null>(null);
  const [berichten, setBerichten] = useState<ChatBericht[]>([]);
  const [nieuwBericht, setNieuwBericht] = useState("");
  const [loading, setLoading] = useState(true);
  const [chatLoading, setChatLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showNieuwGesprek, setShowNieuwGesprek] = useState(false);
  const [medewerkers, setMedewerkers] = useState<{ id: string; full_name: string }[]>([]);
  const [nieuwOnderwerp, setNieuwOnderwerp] = useState("");
  const [nieuwMedewerkerId, setNieuwMedewerkerId] = useState("");
  const [nieuwEersteBericht, setNieuwEersteBericht] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* ─── fetch gesprekken ─── */
  const fetchGesprekken = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);

    const { data: gData } = await supabase
      .from("gesprekken")
      .select("*")
      .order("laatste_bericht_op", { ascending: false });

    if (!gData) { setLoading(false); return; }

    const medIds = [...new Set(gData.map((g: any) => g.medewerker_id))];
    const { data: profiles } = await supabase
      .from("profiles_public" as any)
      .select("id, full_name")
      .in("id", medIds);
    const nameMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name]));

    // count unread per gesprek
    const { data: unreadData } = await supabase
      .from("chat_berichten")
      .select("gesprek_id")
      .is("gelezen_op", null)
      .neq("afzender_id", profileId);

    const unreadMap = new Map<string, number>();
    (unreadData || []).forEach((b: any) => {
      unreadMap.set(b.gesprek_id, (unreadMap.get(b.gesprek_id) || 0) + 1);
    });

    setGesprekken(gData.map((g: any) => ({
      id: g.id,
      medewerker_id: g.medewerker_id,
      onderwerp: g.onderwerp,
      laatste_bericht_op: g.laatste_bericht_op,
      laatste_bericht_preview: g.laatste_bericht_preview,
      created_at: g.created_at,
      medewerker_naam: nameMap.get(g.medewerker_id) || "Onbekend",
      ongelezen: unreadMap.get(g.id) || 0,
    })));
    setLoading(false);
  }, [profileId]);

  useEffect(() => { if (profileId) fetchGesprekken(); }, [fetchGesprekken, profileId]);

  /* ─── fetch berichten for active gesprek ─── */
  const fetchBerichten = useCallback(async (gesprekId: string) => {
    if (!profileId) return;
    setChatLoading(true);
    const { data } = await supabase
      .from("chat_berichten")
      .select("*")
      .eq("gesprek_id", gesprekId)
      .order("created_at", { ascending: true });

    if (!data) { setChatLoading(false); return; }

    const afzenderIds = [...new Set(data.map((b: any) => b.afzender_id))];
    const { data: profiles } = await supabase
      .from("profiles_public" as any)
      .select("id, full_name")
      .in("id", afzenderIds);
    const nameMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name]));

    setBerichten(data.map((b: any) => ({
      id: b.id,
      gesprek_id: b.gesprek_id,
      afzender_id: b.afzender_id,
      inhoud: b.inhoud,
      gelezen_op: b.gelezen_op,
      created_at: b.created_at,
      afzender_naam: nameMap.get(b.afzender_id) || "Onbekend",
      is_eigen: b.afzender_id === profileId,
    })));
    setChatLoading(false);

    // Mark unread messages as read
    const unread = data.filter((b: any) => !b.gelezen_op && b.afzender_id !== profileId);
    if (unread.length > 0) {
      await supabase
        .from("chat_berichten")
        .update({ gelezen_op: new Date().toISOString() })
        .in("id", unread.map((b: any) => b.id));
    }
  }, [profileId]);

  /* ─── auto scroll ─── */
  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 100);
  }, [berichten]);

  /* ─── realtime ─── */
  useEffect(() => {
    if (!activeGesprek) return;
    const ch = supabase.channel(`chat-${activeGesprek.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_berichten", filter: `gesprek_id=eq.${activeGesprek.id}` }, () => {
        fetchBerichten(activeGesprek.id);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeGesprek, fetchBerichten]);

  useEffect(() => {
    if (!profileId) return;
    const ch = supabase.channel("gesprekken-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "gesprekken" }, () => { fetchGesprekken(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_berichten" }, () => { fetchGesprekken(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profileId, fetchGesprekken]);

  /* ─── open gesprek ─── */
  const openGesprek = (g: Gesprek) => {
    setActiveGesprek(g);
    fetchBerichten(g.id);
  };

  /* ─── send message ─── */
  const sendBericht = async () => {
    if (!activeGesprek || !profileId || !nieuwBericht.trim() || sending) return;
    setSending(true);
    const tekst = nieuwBericht.trim();
    setNieuwBericht("");

    const { error } = await supabase.from("chat_berichten").insert({
      gesprek_id: activeGesprek.id,
      afzender_id: profileId,
      inhoud: tekst,
    });

    if (error) { toast.error("Bericht kon niet verstuurd worden"); setSending(false); return; }

    // Update gesprek preview
    await supabase.from("gesprekken").update({
      laatste_bericht_op: new Date().toISOString(),
      laatste_bericht_preview: tekst.slice(0, 100),
    }).eq("id", activeGesprek.id);

    setSending(false);
    inputRef.current?.focus();
  };

  /* ─── nieuw gesprek ─── */
  const startNieuwGesprek = async () => {
    if (!profileId) return;
    const medId = isManager ? nieuwMedewerkerId : profileId;
    if (!medId || !nieuwEersteBericht.trim()) return;

    const { data: gesprek, error } = await supabase.from("gesprekken").insert({
      medewerker_id: medId,
      onderwerp: nieuwOnderwerp.trim() || "Nieuw gesprek",
      laatste_bericht_preview: nieuwEersteBericht.trim().slice(0, 100),
      laatste_bericht_op: new Date().toISOString(),
    }).select("id").single();

    if (error || !gesprek) { toast.error("Gesprek kon niet gestart worden"); return; }

    await supabase.from("chat_berichten").insert({
      gesprek_id: gesprek.id,
      afzender_id: profileId,
      inhoud: nieuwEersteBericht.trim(),
    });

    setShowNieuwGesprek(false);
    setNieuwOnderwerp("");
    setNieuwMedewerkerId("");
    setNieuwEersteBericht("");
    await fetchGesprekken();
    const newG = gesprekken.find(g => g.id === gesprek.id);
    if (newG) openGesprek(newG);
    else {
      // fetch and open
      const { data: gData } = await supabase.from("gesprekken").select("*").eq("id", gesprek.id).single();
      if (gData) {
        const { data: pData } = await supabase.from("profiles_public" as any).select("id, full_name").eq("id", (gData as any).medewerker_id).single();
        openGesprek({
          ...(gData as any),
          medewerker_naam: (pData as any)?.full_name || "Onbekend",
          ongelezen: 0,
        });
      }
    }
  };

  /* ─── fetch medewerkers voor manager dropdown ─── */
  useEffect(() => {
    if (!isManager || !showNieuwGesprek) return;
    supabase.from("profiles").select("id, full_name").neq("id", profileId || "").then(({ data }) => {
      setMedewerkers((data || []).map((p: any) => ({ id: p.id, full_name: p.full_name })));
    });
  }, [isManager, showNieuwGesprek, profileId]);

  /* ━━━━━ CHAT VIEW ━━━━━ */
  if (activeGesprek) {
    const gesprekNaam = isManager ? activeGesprek.medewerker_naam : (activeGesprek.onderwerp || "Chat");

    // Group messages by date
    const grouped: { label: string; items: ChatBericht[] }[] = [];
    berichten.forEach(b => {
      const label = datumLabel(b.created_at);
      const last = grouped[grouped.length - 1];
      if (last && last.label === label) last.items.push(b);
      else grouped.push({ label, items: [b] });
    });

    return (
      <PageShell>
        {/* Header */}
        <header className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3"
          style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
          <button onClick={() => { setActiveGesprek(null); fetchGesprekken(); }} className="p-1" style={{ color: "var(--text-secondary)" }}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Avatar className="h-9 w-9">
            <AvatarFallback style={{ background: "var(--accent-light)", color: "var(--accent)", fontSize: 12, fontWeight: 700 }}>
              {initialen(activeGesprek.medewerker_naam)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{gesprekNaam}</p>
            {activeGesprek.onderwerp && isManager && (
              <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{activeGesprek.onderwerp}</p>
            )}
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1" style={{ paddingBottom: 90 }}>
          {chatLoading ? <Spinner /> : grouped.map((group, gi) => (
            <div key={gi}>
              <div className="flex justify-center my-3">
                <span className="text-[10px] font-semibold px-3 py-1 rounded-full"
                  style={{ background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                  {group.label}
                </span>
              </div>
              {group.items.map(b => (
                <div key={b.id} className={`flex mb-1.5 ${b.is_eigen ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[80%] px-3.5 py-2 rounded-2xl" style={{
                    background: b.is_eigen
                      ? "linear-gradient(135deg, var(--accent), var(--accent-dark))"
                      : "var(--bg-surface)",
                    color: b.is_eigen ? "#fff" : "var(--text-primary)",
                    borderBottomRightRadius: b.is_eigen ? 6 : 16,
                    borderBottomLeftRadius: b.is_eigen ? 16 : 6,
                    border: b.is_eigen ? "none" : "1px solid var(--border)",
                  }}>
                    {!b.is_eigen && (
                      <p className="text-[10px] font-bold mb-0.5" style={{ color: "var(--accent)" }}>{b.afzender_naam}</p>
                    )}
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{b.inhoud}</p>
                    <div className={`flex items-center gap-1 mt-0.5 ${b.is_eigen ? "justify-end" : ""}`}>
                      <span className="text-[9px]" style={{ opacity: 0.6 }}>
                        {format(new Date(b.created_at), "HH:mm")}
                      </span>
                      {b.is_eigen && (
                        b.gelezen_op
                          ? <CheckCheck className="h-3 w-3" style={{ opacity: 0.8, color: "#34d399" }} />
                          : <Check className="h-3 w-3" style={{ opacity: 0.5 }} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {berichten.length === 0 && !chatLoading && (
            <div className="flex justify-center pt-8">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Begin het gesprek...</p>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="fixed bottom-[72px] left-0 right-0 z-40 px-3 py-2 flex items-end gap-2"
          style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--border)", maxWidth: 430, margin: "0 auto" }}>
          <textarea
            ref={inputRef}
            value={nieuwBericht}
            onChange={e => setNieuwBericht(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendBericht(); } }}
            placeholder="Typ een bericht..."
            rows={1}
            className="flex-1 resize-none text-sm px-4 py-2.5 rounded-2xl"
            style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)", maxHeight: 120 }}
          />
          <button onClick={sendBericht} disabled={!nieuwBericht.trim() || sending}
            className="shrink-0 flex items-center justify-center rounded-full transition-transform active:scale-90 disabled:opacity-40"
            style={{ width: 40, height: 40, background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", color: "#fff" }}>
            <Send className="h-4 w-4" />
          </button>
        </div>
      </PageShell>
    );
  }

  /* ━━━━━ GESPREKKEN LIJST ━━━━━ */
  const totalOngelezen = gesprekken.reduce((s, g) => s + g.ongelezen, 0);

  return (
    <PageShell>
      <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, var(--bg-surface) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <HeaderLogo />
            <span className="text-base font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>Berichten</span>
          </div>
          {totalOngelezen > 0 && (
            <div className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: "var(--danger-light)", color: "var(--danger)" }}>
              {totalOngelezen} nieuw
            </div>
          )}
        </div>
      </header>

      <main className="px-4 py-3 space-y-1.5" style={{ paddingBottom: 100 }}>
        {loading ? <Spinner /> : gesprekken.length === 0 ? (
          <EmptyState icoon="💬" titel="Geen gesprekken" subtitel={isManager ? "Start een gesprek met een medewerker" : "Start een gesprek met je manager"} />
        ) : (
          gesprekken.map(g => (
            <button key={g.id} onClick={() => openGesprek(g)}
              className="w-full text-left flex items-center gap-3 p-3 rounded-2xl transition-colors active:scale-[0.98]"
              style={{ background: g.ongelezen > 0 ? "var(--bg-surface)" : "transparent", border: "1px solid var(--border)" }}>
              <Avatar className="h-11 w-11 shrink-0">
                <AvatarFallback style={{ background: "var(--accent-light)", color: "var(--accent)", fontSize: 13, fontWeight: 700 }}>
                  {initialen(g.medewerker_naam)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className={`text-sm truncate ${g.ongelezen > 0 ? "font-bold" : "font-medium"}`}
                    style={{ color: g.ongelezen > 0 ? "var(--text-primary)" : "var(--text-secondary)" }}>
                    {isManager ? g.medewerker_naam : (g.onderwerp || g.medewerker_naam)}
                  </p>
                  <span className="text-[10px] shrink-0 ml-2" style={{ color: g.ongelezen > 0 ? "var(--accent)" : "var(--text-muted)" }}>
                    {formatDistanceToNow(new Date(g.laatste_bericht_op), { locale: nl, addSuffix: true })}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                    {g.laatste_bericht_preview || "Geen berichten"}
                  </p>
                  {g.ongelezen > 0 && (
                    <span className="shrink-0 ml-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{ background: "var(--accent)", color: "#fff" }}>
                      {g.ongelezen}
                    </span>
                  )}
                </div>
                {isManager && g.onderwerp && (
                  <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>{g.onderwerp}</p>
                )}
              </div>
            </button>
          ))
        )}
      </main>

      {/* FAB nieuw gesprek */}
      <button onClick={() => setShowNieuwGesprek(true)}
        className="fixed z-40 flex items-center justify-center active:scale-90 transition-transform"
        style={{
          bottom: 90, right: "max(24px, calc(50% - 215px + 24px))",
          width: 56, height: 56, borderRadius: "50%",
          background: "linear-gradient(135deg, var(--accent), var(--accent-dark))",
          color: "#fff", boxShadow: "0 8px 28px color-mix(in srgb, var(--accent) 35%, transparent)",
        }}>
        <Plus className="h-6 w-6" />
      </button>

      {/* Nieuw gesprek sheet */}
      {showNieuwGesprek && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowNieuwGesprek(false)}>
          <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--text-primary) 35%, transparent)", backdropFilter: "blur(6px)" }} />
          <div className="relative w-full animate-sheet-up rounded-t-3xl p-5 space-y-4"
            style={{ maxWidth: 430, maxHeight: "85vh", overflowY: "auto", background: "var(--bg-surface)", border: "1px solid var(--border)", borderBottom: "none", paddingBottom: 40 }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto" style={{ background: "var(--border)" }} />
            <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Nieuw gesprek</h2>

            <div className="space-y-3">
              {isManager && (
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-secondary)" }}>Medewerker</label>
                  <select value={nieuwMedewerkerId} onChange={e => setNieuwMedewerkerId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-sm"
                    style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                    <option value="">Kies medewerker...</option>
                    {medewerkers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-secondary)" }}>Onderwerp</label>
                <input value={nieuwOnderwerp} onChange={e => setNieuwOnderwerp(e.target.value)}
                  placeholder="bijv. Verlofaanvraag, Vraag over project..."
                  className="w-full px-3 py-2.5 rounded-xl text-sm"
                  style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-secondary)" }}>Bericht</label>
                <textarea value={nieuwEersteBericht} onChange={e => setNieuwEersteBericht(e.target.value)}
                  placeholder="Typ je bericht..."
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl text-sm resize-none"
                  style={{ background: "var(--bg-base)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>

              <button onClick={startNieuwGesprek}
                disabled={(!isManager || !!nieuwMedewerkerId) && !nieuwEersteBericht.trim() || (isManager && !nieuwMedewerkerId)}
                className="w-full py-3 rounded-2xl text-sm font-bold transition-colors disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-dark))", color: "#fff" }}>
                Gesprek starten
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

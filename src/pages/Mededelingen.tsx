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
import { BottomNav } from "@/components/BottomNav";
import { useNavBadges } from "@/hooks/useNavBadges";

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
  const { badges } = useNavBadges();
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
        <div style={{
          background: '#030e20',
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* HEADER */}
          <header style={{
            position: 'sticky',
            top: 0, zIndex: 50,
            background: 'rgba(3,14,32,0.9)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <button
              onClick={() => { setActiveGesprek(null); fetchGesprekken(); }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#3fff8b',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>
                arrow_back
              </span>
            </button>
            <div style={{
              width: 40, height: 40,
              borderRadius: '50%',
              background: '#3fff8b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Manrope',
              fontWeight: 700,
              fontSize: 14,
              color: '#005d2c',
              position: 'relative',
              flexShrink: 0,
            }}>
              {initialen(activeGesprek.medewerker_naam)}
              <div style={{
                position: 'absolute',
                bottom: 0, right: 0,
                width: 10, height: 10,
                borderRadius: '50%',
                background: '#3fff8b',
                border: '2px solid #030e20',
              }} />
            </div>
            <div>
              <div style={{
                fontFamily: 'Manrope',
                fontWeight: 800,
                fontSize: 14,
                color: '#dae6ff',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                {gesprekNaam}
              </div>
              {activeGesprek.onderwerp && isManager && (
                <div style={{
                  fontSize: 10,
                  color: '#a0abc3',
                  fontFamily: 'Inter',
                }}>
                  {activeGesprek.onderwerp}
                </div>
              )}
            </div>
          </header>

          {/* Messages */}
          <div ref={scrollRef} style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 120px)",
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}>
            {chatLoading ? <Spinner /> : grouped.map((group, gi) => (
              <div key={gi}>
                <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: 'Inter',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: '#a0abc3',
                    background: '#142640',
                    padding: '4px 12px',
                    borderRadius: 9999,
                  }}>
                    {group.label}
                  </span>
                </div>
                {group.items.map(b => (
                  <div key={b.id} style={{
                    display: 'flex',
                    justifyContent: b.is_eigen ? 'flex-end' : 'flex-start',
                    marginBottom: 6,
                  }}>
                    <div style={{
                      maxWidth: '80%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: b.is_eigen ? 'flex-end' : 'flex-start',
                      gap: 4,
                    }}>
                      <div style={{
                        padding: '12px 16px',
                        borderRadius: b.is_eigen
                          ? '20px 20px 4px 20px'
                          : '20px 20px 20px 4px',
                        background: b.is_eigen
                          ? '#3fff8b'
                          : 'rgba(10,26,48,0.8)',
                        border: b.is_eigen
                          ? 'none'
                          : '1px solid rgba(106,118,140,0.2)',
                        boxShadow: b.is_eigen
                          ? '0 0 20px rgba(63,255,139,0.15)'
                          : 'none',
                      }}>
                        <p style={{
                          fontSize: 14,
                          fontFamily: 'Inter',
                          fontWeight: b.is_eigen ? 600 : 400,
                          color: b.is_eigen ? '#005d2c' : '#dae6ff',
                          lineHeight: 1.5,
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                        }}>
                          {b.inhoud}
                        </p>
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        paddingLeft: b.is_eigen ? 0 : 4,
                        paddingRight: b.is_eigen ? 4 : 0,
                      }}>
                        <span style={{
                          fontSize: 10,
                          color: '#a0abc3',
                          fontFamily: 'Inter',
                        }}>
                          {format(new Date(b.created_at), "HH:mm")}
                        </span>
                        {b.is_eigen && (
                          <span
                            className="material-symbols-outlined"
                            style={{
                              fontSize: 14,
                              color: b.gelezen_op ? '#3fff8b' : '#a0abc3',
                              fontVariationSettings: "'FILL' 1",
                            }}>
                            {b.gelezen_op ? 'done_all' : 'done'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {berichten.length === 0 && !chatLoading && (
              <div style={{ textAlign: 'center', paddingTop: 40, color: '#a0abc3', fontFamily: 'Inter', fontSize: 13 }}>
                Begin het gesprek...
              </div>
            )}
          </div>

          {/* MESSAGE INPUT */}
          <div style={{
            position: 'fixed',
            bottom: 72, left: 0, right: 0,
            padding: '12px 16px',
            background: 'rgba(3,14,32,0.95)',
            backdropFilter: 'blur(20px)',
            borderTop: '1px solid rgba(255,255,255,0.07)',
            zIndex: 49,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              maxWidth: 480,
              margin: '0 auto',
            }}>
              <div style={{
                flex: 1,
                background: '#142640',
                borderRadius: 9999,
                border: '1px solid rgba(61,72,93,0.5)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                height: 52,
                gap: 8,
              }}>
                <textarea
                  ref={inputRef}
                  value={nieuwBericht}
                  onChange={e => setNieuwBericht(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendBericht(); } }}
                  placeholder="Typ een bericht..."
                  rows={1}
                  style={{
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    outline: 'none',
                    color: '#dae6ff',
                    fontFamily: 'Inter',
                    fontSize: 14,
                    resize: 'none',
                    maxHeight: 80,
                  }}
                />
              </div>
              <button
                onClick={sendBericht}
                disabled={!nieuwBericht.trim() || sending}
                style={{
                  width: 52, height: 52,
                  borderRadius: '50%',
                  background: '#3fff8b',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(63,255,139,0.3)',
                  opacity: !nieuwBericht.trim() || sending ? 0.5 : 1,
                  flexShrink: 0,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 22,
                    color: '#005d2c',
                    fontVariationSettings: "'FILL' 1",
                  }}>
                  send
                </span>
              </button>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  /* ━━━━━ GESPREKKEN LIJST ━━━━━ */
  const totalOngelezen = gesprekken.reduce((s, g) => s + g.ongelezen, 0);

  return (
    <PageShell>
      <div style={{
        background: '#030e20',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* HEADER */}
        <header style={{
          position: 'sticky',
          top: 0, zIndex: 50,
          background: 'rgba(3,14,32,0.9)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{
            fontFamily: 'Manrope',
            fontWeight: 800,
            fontSize: 20,
            color: '#dae6ff',
          }}>
            Berichten
          </span>
          {totalOngelezen > 0 && (
            <div style={{
              padding: '4px 12px',
              borderRadius: 9999,
              background: 'rgba(63,255,139,0.15)',
              border: '1px solid rgba(63,255,139,0.3)',
            }}>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'Inter',
                color: '#3fff8b',
              }}>
                {totalOngelezen} nieuw
              </span>
            </div>
          )}
        </header>

        {/* CONVERSATION LIST */}
        <div style={{ padding: '16px 20px', flex: 1 }}>
          {loading ? <Spinner /> : gesprekken.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#a0abc3',
              fontFamily: 'Inter',
            }}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 48, marginBottom: 16, display: 'block' }}>
                chat_bubble_outline
              </span>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Geen gesprekken</p>
              <p style={{ fontSize: 12, color: '#a0abc3' }}>
                {isManager ? 'Start een gesprek met een medewerker' : 'Start een gesprek met je manager'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {gesprekken.map(g => (
                <button
                  key={g.id}
                  onClick={() => openGesprek(g)}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    borderRadius: 16,
                    background: 'linear-gradient(135deg, rgba(10,26,48,0.7), rgba(6,19,39,0.8))',
                    border: g.ongelezen > 0
                      ? '1px solid rgba(63,255,139,0.3)'
                      : '1px solid rgba(106,118,140,0.15)',
                    borderLeft: g.ongelezen > 0
                      ? '3px solid #3fff8b'
                      : '1px solid rgba(106,118,140,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 48, height: 48,
                    borderRadius: '50%',
                    background: g.ongelezen > 0 ? '#3fff8b' : '#142640',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'Manrope',
                    fontWeight: 700,
                    fontSize: 14,
                    color: g.ongelezen > 0 ? '#005d2c' : '#a0abc3',
                    flexShrink: 0,
                  }}>
                    {initialen(g.medewerker_naam)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{
                        fontSize: 14,
                        fontWeight: g.ongelezen > 0 ? 700 : 500,
                        color: g.ongelezen > 0 ? '#dae6ff' : '#a0abc3',
                        fontFamily: 'Inter',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {isManager ? g.medewerker_naam : (g.onderwerp || g.medewerker_naam)}
                      </span>
                      <span style={{
                        fontSize: 10,
                        color: g.ongelezen > 0 ? '#3fff8b' : '#a0abc3',
                        fontFamily: 'Inter',
                        flexShrink: 0,
                        marginLeft: 8,
                      }}>
                        {formatDistanceToNow(new Date(g.laatste_bericht_op), { locale: nl, addSuffix: true })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{
                        fontSize: 12,
                        color: '#a0abc3',
                        fontFamily: 'Inter',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 200,
                      }}>
                        {g.laatste_bericht_preview || "Geen berichten"}
                      </span>
                      {g.ongelezen > 0 && (
                        <div style={{
                          width: 20, height: 20,
                          borderRadius: '50%',
                          background: '#3fff8b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#005d2c',
                          fontFamily: 'Inter',
                          flexShrink: 0,
                          marginLeft: 8,
                        }}>
                          {g.ongelezen}
                        </div>
                      )}
                    </div>
                    {isManager && g.onderwerp && (
                      <span style={{ fontSize: 10, color: '#a0abc3', fontFamily: 'Inter', marginTop: 2, display: 'block' }}>
                        {g.onderwerp}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* FAB nieuw gesprek */}
        <button
          onClick={() => setShowNieuwGesprek(true)}
          style={{
            position: 'fixed',
            bottom: 100,
            right: 'max(24px, calc(50% - 215px + 24px))',
            zIndex: 40,
            width: 56, height: 56,
            borderRadius: '50%',
            background: '#3fff8b',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 8px 28px rgba(63,255,139,0.35)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#005d2c' }}>
            add
          </span>
        </button>

        {/* Nieuw gesprek sheet */}
        {showNieuwGesprek && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 50,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(6px)',
            }}
            onClick={() => setShowNieuwGesprek(false)}
          >
            <div
              onClick={e => e.stopPropagation()}
              className="animate-sheet-up"
              style={{
                width: '100%',
                maxWidth: 480,
                background: 'rgba(10,26,48,0.97)',
                backdropFilter: 'blur(24px)',
                borderRadius: '40px 40px 0 0',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                maxHeight: '85vh',
                overflowY: 'auto',
                paddingBottom: "calc(env(safe-area-inset-bottom, 34px) + 24px)",
              }}
            >
              {/* Handle */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 8px' }}>
                <div style={{ width: 48, height: 6, borderRadius: 9999, background: 'rgba(255,255,255,0.2)' }} />
              </div>

              <div style={{ padding: '16px 24px 24px' }}>
                <h2 style={{
                  fontFamily: 'Manrope',
                  fontWeight: 800,
                  fontSize: 22,
                  color: '#dae6ff',
                  marginBottom: 24,
                }}>
                  Nieuw gesprek
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {isManager && (
                    <div>
                      <label style={{
                        fontSize: 10,
                        fontWeight: 700,
                        fontFamily: 'Inter',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        color: '#a0abc3',
                        marginBottom: 8,
                        display: 'block',
                      }}>
                        Medewerker
                      </label>
                      <select
                        value={nieuwMedewerkerId}
                        onChange={e => setNieuwMedewerkerId(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          borderRadius: 16,
                          background: '#061327',
                          border: '1px solid rgba(255,255,255,0.07)',
                          color: '#dae6ff',
                          fontFamily: 'Inter',
                          fontSize: 14,
                          outline: 'none',
                        }}
                      >
                        <option value="">Kies medewerker...</option>
                        {medewerkers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                      </select>
                    </div>
                  )}

                  <div>
                    <label style={{
                      fontSize: 10,
                      fontWeight: 700,
                      fontFamily: 'Inter',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: '#a0abc3',
                      marginBottom: 8,
                      display: 'block',
                    }}>
                      Onderwerp
                    </label>
                    <input
                      value={nieuwOnderwerp}
                      onChange={e => setNieuwOnderwerp(e.target.value)}
                      placeholder="bijv. Verlofaanvraag, Vraag over project..."
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: 16,
                        background: '#061327',
                        border: '1px solid rgba(255,255,255,0.07)',
                        color: '#dae6ff',
                        fontFamily: 'Inter',
                        fontSize: 14,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{
                      fontSize: 10,
                      fontWeight: 700,
                      fontFamily: 'Inter',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: '#a0abc3',
                      marginBottom: 8,
                      display: 'block',
                    }}>
                      Bericht
                    </label>
                    <textarea
                      value={nieuwEersteBericht}
                      onChange={e => setNieuwEersteBericht(e.target.value)}
                      placeholder="Typ je bericht..."
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: 16,
                        background: '#061327',
                        border: '1px solid rgba(255,255,255,0.07)',
                        color: '#dae6ff',
                        fontFamily: 'Inter',
                        fontSize: 14,
                        outline: 'none',
                        resize: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <button
                    onClick={startNieuwGesprek}
                    disabled={(!isManager || !!nieuwMedewerkerId) && !nieuwEersteBericht.trim() || (isManager && !nieuwMedewerkerId)}
                    style={{
                      width: '100%',
                      height: 56,
                      borderRadius: 16,
                      background: '#3fff8b',
                      color: '#005d2c',
                      fontFamily: 'Manrope',
                      fontWeight: 800,
                      fontSize: 16,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxShadow: '0 8px 32px rgba(63,255,139,0.2)',
                      opacity: ((!isManager || !!nieuwMedewerkerId) && !nieuwEersteBericht.trim()) || (isManager && !nieuwMedewerkerId) ? 0.4 : 1,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>send</span>
                    Gesprek starten
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <BottomNav badges={badges} />
    </PageShell>
  );
}

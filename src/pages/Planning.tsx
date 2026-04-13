import { useState, useEffect, useCallback } from "react";
import { HeaderLogo } from "@/components/HeaderLogo";
import { MobileHeader } from "@/components/MobileHeader";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/PageShell";
import { PullToRefresh } from "@/components/PullToRefresh";
import { volledigAdres } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChevronLeft, ChevronRight, Lock, CalendarDays, ThermometerSun, Palmtree, MessageSquare, Clock, Check, MapPin, Navigation, Users, Info } from "lucide-react";
import { format, startOfISOWeek, addDays, addWeeks, getISOWeek } from "date-fns";
import { useNavigate } from "react-router-dom";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import { cachePlanning, getCachedPlanning } from "@/lib/offlineQueue";
import { mutate } from "@/lib/supabaseHelpers";
import { ListSkeleton, PlanningCardSkeleton } from "@/components/ui/Skeletons";
import { BottomNav } from "@/components/BottomNav";
import { useNavBadges } from "@/hooks/useNavBadges";

interface PlanningItem { id: string; datum: string; starttijd: string; eindtijd: string; notitie: string; project_naam: string; project_nummer: string; project_id: string; is_definitief: boolean; project_straat: string | null; project_postcode: string | null; project_stad: string | null; project_adres: string | null; activiteit: string | null; activiteit_kleur: string | null; collega_ids: string[] | null; week_opmerking: string | null; }
interface BeschikbaarheidItem { id: string; type: string; datum_van: string; datum_tot: string; status: string; }
interface ExistingBoeking { id: string; uren: number; status: string; }

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

export default function Planning() {
  const { user } = useAuth();
  const { badges } = useNavBadges();
  const { profileId, profile: profileData } = useProfile();
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => startOfISOWeek(new Date()));
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [beschikbaarheid, setBeschikbaarheid] = useState<BeschikbaarheidItem[]>([]);
  const [collegaMap, setCollegaMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [existingBoekingen, setExistingBoekingen] = useState<Map<string, ExistingBoeking>>(new Map());
  const [showUrenModal, setShowUrenModal] = useState(false);
  const [modalItem, setModalItem] = useState<PlanningItem | null>(null);
  const [urenForm, setUrenForm] = useState({ werkzaamheden: "monteren" as string, uren: 8 });
  const weekNumber = getISOWeek(weekStart);

  const fetchPlanning = useCallback(async () => {
    if (!user || !profileId) return;
    setLoading(true);
    const startStr = format(weekStart, "yyyy-MM-dd");
    const endStr = format(addDays(weekStart, 6), "yyyy-MM-dd");

    const [{ data }, { data: beschData }, { data: boekData }] = await Promise.all([
      supabase.from("planning").select("id, datum, starttijd, eindtijd, notitie, project_id, activiteit, activiteit_kleur, collega_ids, week_opmerking").eq("medewerker_id", profileId).gte("datum", startStr).lte("datum", endStr).order("datum"),
      supabase.from("beschikbaarheid").select("id, type, datum_van, datum_tot, status").eq("medewerker_id", profileId).eq("status", "goedgekeurd").lte("datum_van", endStr).gte("datum_tot", startStr),
      supabase.from("uren_boekingen").select("id, datum, project_id, uren, status").eq("medewerker_id", profileId).gte("datum", startStr).lte("datum", endStr),
    ]);
    setBeschikbaarheid((beschData ?? []) as any);

    // Map existing boekingen by datum+project_id
    const boekMap = new Map<string, ExistingBoeking>();
    (boekData ?? []).forEach((b: any) => {
      boekMap.set(`${b.datum}|${b.project_id}`, { id: b.id, uren: Number(b.uren), status: b.status });
    });
    setExistingBoekingen(boekMap);

    if (navigator.onLine) {
      if (data) {
        const projectIds = [...new Set(data.map((d: any) => d.project_id))];
        let projMap = new Map();
        let statusMap = new Map<string, boolean>();
        if (projectIds.length > 0) {
          const [{ data: projects }, { data: statuses }] = await Promise.all([
            supabase.from("projects_monteur" as any).select("id, naam, nummer, straat, postcode, stad, adres").in("id", projectIds),
            supabase.from("project_planning_status").select("project_id, is_definitief").in("project_id", projectIds),
          ]);
          projMap = new Map(projects?.map((p: any) => [p.id, p]) ?? []);
          (statuses || []).forEach((s: any) => statusMap.set(s.project_id, s.is_definitief));
        }

        // Load collega names
        const allCollegaIds = [...new Set(data.flatMap((d: any) => d.collega_ids || []))];
        if (allCollegaIds.length > 0) {
          const { data: collegaProfs } = await supabase.from("profiles_public" as any).select("id, full_name").in("id", allCollegaIds);
          setCollegaMap(new Map((collegaProfs ?? []).map((p: any) => [p.id, p.full_name])));
        } else {
          setCollegaMap(new Map());
        }

        setItems(data.map((d: any) => {
          const proj = projMap.get(d.project_id) || { naam: "Onbekend", nummer: "", straat: null, postcode: null, stad: null, adres: null };
          return { id: d.id, datum: d.datum, starttijd: d.starttijd?.slice(0, 5) || "07:00", eindtijd: d.eindtijd?.slice(0, 5) || "16:00", notitie: d.notitie || "", project_naam: (proj as any).naam, project_nummer: (proj as any).nummer, project_id: d.project_id, is_definitief: statusMap.get(d.project_id) ?? false, project_straat: (proj as any).straat, project_postcode: (proj as any).postcode, project_stad: (proj as any).stad, project_adres: (proj as any).adres, activiteit: d.activiteit || null, activiteit_kleur: d.activiteit_kleur || null, collega_ids: d.collega_ids || null, week_opmerking: d.week_opmerking || null };
        }));

        // Cache planning data for offline use
        await cachePlanning(profileId, startStr, data as any[]);
      }
    } else {
      // Offline: use cached data
      const cached = await getCachedPlanning(profileId, startStr);
      if (cached) {
        const projectIds = [...new Set(cached.map((d: any) => d.project_id))];
        let projMap = new Map();
        cached.forEach((d: any) => projMap.set(d.project_id, { naam: "Onbekend", nummer: "" }));

        setItems(cached.map((d: any) => {
          const proj = projMap.get(d.project_id) || { naam: "Onbekend", nummer: "" };
          return { id: d.id, datum: d.datum, starttijd: d.starttijd?.slice(0, 5) || "07:00", eindtijd: d.eindtijd?.slice(0, 5) || "16:00", notitie: d.notitie || "", project_naam: (proj as any).naam, project_nummer: (proj as any).nummer, project_id: d.project_id, is_definitief: false, project_straat: null, project_postcode: null, project_stad: null, project_adres: null, activiteit: d.activiteit || null, activiteit_kleur: d.activiteit_kleur || null, collega_ids: d.collega_ids || null, week_opmerking: d.week_opmerking || null };
        }));
        toast.info("📡 Offline — planning uit cache");
      }
    }
    setLoading(false);
  }, [user, weekStart]);

  useEffect(() => { fetchPlanning(); }, [fetchPlanning]);

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = format(new Date(), "yyyy-MM-dd");

  function openNavigatie(adres: string) {
    const encoded = encodeURIComponent(adres);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    if (isIOS) {
      window.location.href = `maps://maps.apple.com/?daddr=${encoded}`;
      setTimeout(() => { window.open(`https://maps.google.com/?daddr=${encoded}`, "_blank"); }, 500);
    } else if (isAndroid) {
      window.location.href = `google.navigation:q=${encoded}`;
      setTimeout(() => { window.open(`https://maps.google.com/?daddr=${encoded}`, "_blank"); }, 500);
    } else {
      window.open(`https://maps.google.com/?daddr=${encoded}`, "_blank");
    }
  }

  function getBeschikbaarheidForDate(dateStr: string): BeschikbaarheidItem | null {
    return beschikbaarheid.find(b => dateStr >= b.datum_van && dateStr <= b.datum_tot) || null;
  }

  function calcDefaultUren(starttijd: string, eindtijd: string): number {
    const [sh, sm] = starttijd.split(":").map(Number);
    const [eh, em] = eindtijd.split(":").map(Number);
    const diff = (eh * 60 + em - sh * 60 - sm) / 60;
    return Math.max(0.5, Math.round(diff * 2) / 2);
  }

  function openUrenModal(item: PlanningItem) {
    setModalItem(item);
    setUrenForm({ werkzaamheden: "monteren", uren: calcDefaultUren(item.starttijd, item.eindtijd) });
    setShowUrenModal(true);
  }

  const saveUren = async (submitDirect: boolean) => {
    if (!profileId || !modalItem) return;
    if (!await mutate(supabase.from("uren_boekingen").insert({
      medewerker_id: profileId,
      project_id: modalItem.project_id,
      datum: modalItem.datum,
      uren: urenForm.uren,
      type: urenForm.werkzaamheden,
      beschrijving: urenForm.werkzaamheden,
      status: submitDirect ? "ingediend" : "concept",
    }))) return;
    toast.success("Uren geboekt ✓");
    setShowUrenModal(false);
    fetchPlanning();
  };

  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    concept: { bg: "#102038", text: "#a0abc3", label: "Concept" },
    ingediend: { bg: "rgba(254,179,0,0.1)", text: "#feb300", label: "Ingediend" },
    goedgekeurd: { bg: "rgba(63,255,139,0.1)", text: "#3fff8b", label: "Goedgekeurd" },
    afgekeurd: { bg: "rgba(255,113,108,0.1)", text: "#ff716c", label: "Afgekeurd" },
  };

  const definitiefItems = items.filter(it => it.is_definitief);
  const allConcept = items.length > 0 && definitiefItems.length === 0;
  // Blokkade voor onboarding accounts
  if (profileData?.account_status === 'onboarding') {
    return (
      <PageShell>
        <header className="sticky top-0 z-30" style={{ background: "color-mix(in srgb, rgba(10,26,48,0.7) 97%, transparent)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(106,118,140,0.15)" }}>
          <div className="px-4 py-3 flex items-center gap-2.5">
            <HeaderLogo />
            <span className="text-base font-bold tracking-tight" style={{ color: "#dae6ff" }}>Planning</span>
          </div>
        </header>
        <div style={{ padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
          <h2 className="text-lg font-bold" style={{ color: "#dae6ff", marginBottom: 8 }}>Account nog niet actief</h2>
          <p className="text-sm" style={{ color: "#a0abc3", lineHeight: 1.6, marginBottom: 20 }}>
            Je kunt je planning bekijken zodra je account door een manager is geverifieerd.
          </p>
          <button
            onClick={() => navigate("/onboarding-welkom")}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: "#3fff8b", color: "#fff", border: "none", cursor: "pointer" }}
          >
            Naar onboarding →
          </button>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div style={{ background: '#030e20', minHeight: '100dvh', paddingBottom: 160 }}>
        <MobileHeader initials={profileData?.full_name?.charAt(0)?.toUpperCase() || 'U'} />

        <PullToRefresh onRefresh={async () => { await fetchPlanning(); }}>
          <main style={{ padding: '24px 20px' }}>
            {/* WEEK SELECTOR */}
            <section style={{ marginBottom: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.2em', color: '#3fff8b', marginBottom: 4 }}>JOUW PLANNING</p>
                <h2 style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 26, color: '#dae6ff', lineHeight: 1, marginBottom: 4 }}>Week {weekNumber}</h2>
                <p style={{ fontSize: 12, color: '#a0abc3', fontFamily: 'Inter' }}>
                  {format(weekStart, 'EEE d MMM', { locale: nl })} t/m {format(addDays(weekStart, 4), 'EEE d MMM', { locale: nl })}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setWeekStart(w => addWeeks(w, -1))} style={{
                  width: 44, height: 44, borderRadius: 12, background: '#102038',
                  border: '1px solid rgba(255,255,255,0.07)', color: '#dae6ff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_left</span>
                </button>
                <button onClick={() => setWeekStart(w => addWeeks(w, 1))} style={{
                  width: 44, height: 44, borderRadius: 12, background: '#102038',
                  border: '1px solid rgba(255,255,255,0.07)', color: '#dae6ff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>chevron_right</span>
                </button>
              </div>
            </section>

            {/* LOADING */}
            {loading && (
              <div style={{ textAlign: 'center', padding: 40, color: '#a0abc3', fontFamily: 'Inter' }}>Planning laden...</div>
            )}

            {/* PLANNING LIST */}
            {!loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)).map((day, i) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isToday = dateStr === today;
                  const dayItems = items.filter(item => item.datum === dateStr);
                  const beschItem = getBeschikbaarheidForDate(dateStr);
                  const DAGEN_LANG = ['MAANDAG', 'DINSDAG', 'WOENSDAG', 'DONDERDAG', 'VRIJDAG'];
                  const dayLabel = `${DAGEN_LANG[i]} ${format(day, 'd MMM', { locale: nl }).toUpperCase()}`;

                  return (
                    <div key={dateStr}>
                      {/* Day header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#a0abc3' }}>{dayLabel}</span>
                        {isToday && (
                          <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'Inter', textTransform: 'uppercase', color: '#3fff8b', background: 'rgba(63,255,139,0.2)', borderRadius: 9999, padding: '2px 8px' }}>VANDAAG</span>
                        )}
                      </div>

                      {/* Free day / absence */}
                      {beschItem && (
                        <div style={{ border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 16, padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: 0.5 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#a0abc3' }}>beach_access</span>
                          <span style={{ fontSize: 13, color: '#a0abc3', fontStyle: 'italic', fontFamily: 'Inter' }}>{beschItem.type === 'vakantie' ? 'Vakantie' : 'Afwezig'}</span>
                        </div>
                      )}

                      {/* No planning */}
                      {!beschItem && dayItems.length === 0 && (
                        <div style={{ border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 16, padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: 0.5 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#a0abc3' }}>beach_access</span>
                          <span style={{ fontSize: 13, color: '#a0abc3', fontStyle: 'italic', fontFamily: 'Inter' }}>Geen werk gepland</span>
                        </div>
                      )}

                      {/* Project cards */}
                      {!beschItem && dayItems.length > 0 && (
                        <div style={{
                          display: 'flex', flexDirection: 'column', borderRadius: 16, overflow: 'hidden',
                          border: `1px solid ${isToday ? '#feb300' : 'rgba(63,255,139,0.3)'}`,
                          borderLeft: `4px solid ${isToday ? '#feb300' : '#3fff8b'}`,
                        }}>
                          {dayItems.map((item, idx) => {
                            const boeking = existingBoekingen.get(`${dateStr}|${item.project_id}`);
                            const isGeboekt = !!boeking;
                            const isLast = idx === dayItems.length - 1;
                            const adres = volledigAdres({ straat: item.project_straat, postcode: item.project_postcode, stad: item.project_stad, adres: item.project_adres });

                            return (
                              <div key={item.id}>
                                <div
                                  onClick={() => { if (!isGeboekt && item.is_definitief) openUrenModal(item); }}
                                  style={{
                                    padding: 20,
                                    background: isToday ? 'rgba(254,179,0,0.04)' : 'rgba(10,26,48,0.7)',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    cursor: isGeboekt || !item.is_definitief ? 'default' : 'pointer',
                                    opacity: item.is_definitief ? 1 : 0.5,
                                  }}
                                >
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    {/* Activity badge */}
                                    {item.activiteit && (
                                      <div style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                        padding: '3px 10px', borderRadius: 20, marginBottom: 6,
                                        background: item.activiteit_kleur ? `${item.activiteit_kleur}22` : 'rgba(63,255,139,0.1)',
                                        border: `1px solid ${item.activiteit_kleur || '#3fff8b'}44`,
                                      }}>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.activiteit_kleur || '#3fff8b', flexShrink: 0 }} />
                                        <span style={{ fontSize: 11, fontWeight: 600, color: item.activiteit_kleur || '#3fff8b' }}>{item.activiteit}</span>
                                      </div>
                                    )}
                                    <div style={{ fontSize: 15, fontWeight: 700, color: '#dae6ff', fontFamily: 'Inter', marginBottom: 4 }}>{item.project_naam}</div>
                                    <div style={{ fontSize: 11, color: '#a0abc3', fontFamily: 'Inter', marginBottom: 2 }}>{item.project_nummer}</div>
                                    <div style={{ fontSize: 12, color: '#a0abc3', fontFamily: 'Inter' }}>{item.starttijd} – {item.eindtijd}</div>
                                    {item.project_stad && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#a0abc3' }}>location_on</span>
                                        <span style={{ fontSize: 12, color: '#a0abc3', fontFamily: 'Inter' }}>{item.project_stad}</span>
                                      </div>
                                    )}
                                    {item.notitie && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, padding: '6px 10px', borderRadius: 10, background: 'rgba(254,179,0,0.08)', border: '1px solid rgba(254,179,0,0.2)' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#feb300' }}>chat_bubble</span>
                                        <span style={{ fontSize: 11, color: '#feb300' }}>{item.notitie}</span>
                                      </div>
                                    )}
                                    {/* Colleagues */}
                                    {item.collega_ids && item.collega_ids.length > 0 && (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, padding: '6px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.03)' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#a0abc3' }}>group</span>
                                        <span style={{ fontSize: 11, color: '#a0abc3' }}>
                                          {item.collega_ids.map(id => (collegaMap.get(id) || 'Collega').split(' ')[0]).join(', ')}
                                        </span>
                                      </div>
                                    )}
                                    {/* Week remark */}
                                    {item.week_opmerking && (
                                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 6, padding: '8px 10px', borderRadius: 10, background: 'rgba(254,179,0,0.08)', border: '1px solid rgba(254,179,0,0.2)' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#feb300', flexShrink: 0, marginTop: 1 }}>info</span>
                                        <span style={{ fontSize: 11, color: '#feb300', lineHeight: 1.4 }}>{item.week_opmerking}</span>
                                      </div>
                                    )}
                                    {/* Navigate button */}
                                    {item.is_definitief && adres && (
                                      <button onClick={(e) => { e.stopPropagation(); openNavigatie(adres); }} style={{
                                        marginTop: 8, padding: '8px 12px', borderRadius: 10,
                                        background: 'rgba(63,255,139,0.08)', border: '1px solid rgba(63,255,139,0.2)',
                                        color: '#3fff8b', fontSize: 12, fontWeight: 600, fontFamily: 'Inter',
                                        display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', width: '100%', justifyContent: 'center',
                                      }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>navigation</span>
                                        Navigeer
                                      </button>
                                    )}
                                  </div>

                                  {/* Status chip */}
                                  <div style={{ flexShrink: 0, marginLeft: 12 }}>
                                    {isGeboekt ? (
                                      <div style={{ padding: '6px 12px', borderRadius: 9999, background: 'rgba(63,255,139,0.1)', border: '1px solid rgba(63,255,139,0.3)' }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Inter', color: '#3fff8b', textTransform: 'uppercase' }}>{boeking!.uren}U GEBOEKT</span>
                                      </div>
                                    ) : item.is_definitief ? (
                                      <div style={{
                                        padding: '6px 12px', borderRadius: 9999,
                                        background: isToday ? '#feb300' : 'rgba(254,179,0,0.1)',
                                        border: isToday ? 'none' : '1px solid rgba(254,179,0,0.3)',
                                        boxShadow: isToday ? '0 0 10px rgba(254,179,0,0.3)' : 'none',
                                      }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Inter', color: isToday ? '#523700' : '#feb300', textTransform: 'uppercase' }}>NOG BOEKEN</span>
                                      </div>
                                    ) : (
                                      <div style={{ padding: '6px 12px', borderRadius: 9999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Inter', color: '#a0abc3', textTransform: 'uppercase' }}>CONCEPT</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {!isLast && <div style={{ height: 1, background: 'rgba(61,72,93,0.5)', margin: '0 20px' }} />}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {items.length === 0 && beschikbaarheid.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#a0abc3', marginBottom: 12, display: 'block' }}>calendar_today</span>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#dae6ff', fontFamily: 'Inter', marginBottom: 6 }}>Geen bevestigde planning</p>
                    <p style={{ fontSize: 13, color: '#a0abc3', fontFamily: 'Inter' }}>Je manager heeft de planning nog niet gepubliceerd voor deze week.</p>
                  </div>
                )}
              </div>
            )}
          </main>
        </PullToRefresh>

        {/* AMBER STICKY BANNER */}
        {!loading && items.some(item => item.is_definitief && !existingBoekingen.get(`${item.datum}|${item.project_id}`)) && (
          <div style={{ position: 'fixed', bottom: 88, left: 20, right: 20, zIndex: 40 }}>
            <div style={{
              background: '#feb300', borderRadius: 16, padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              boxShadow: '0 8px 24px rgba(254,179,0,0.35)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(82,55,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#523700', fontVariationSettings: "'FILL' 1" }}>bolt</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'Inter', color: '#523700' }}>Dagen nog niet volledig geboekt</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#523700', fontWeight: 700, fontSize: 12, fontFamily: 'Inter' }}>
                Bekijk
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
              </div>
            </div>
          </div>
        )}

        <BottomNav badges={badges} />

        {/* UREN MODAL */}
        {showUrenModal && modalItem && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
            onClick={() => setShowUrenModal(false)}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 480, background: 'rgba(10,26,48,0.97)', backdropFilter: 'blur(24px)',
                borderRadius: '40px 40px 0 0', borderTop: '1px solid rgba(255,255,255,0.1)',
                maxHeight: '80vh', overflowY: 'auto', paddingBottom: 40,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 8px' }}>
                <div style={{ width: 48, height: 6, borderRadius: 9999, background: 'rgba(255,255,255,0.2)' }} />
              </div>
              <div style={{ padding: '0 24px' }}>
                <h2 style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 24, color: '#dae6ff', marginBottom: 20 }}>Uren boeken</h2>

                <div style={{ padding: 16, borderRadius: 16, background: '#061327', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 24 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#dae6ff', fontFamily: 'Inter' }}>{modalItem.project_naam}</p>
                  <p style={{ fontSize: 12, color: '#a0abc3', fontFamily: 'Inter', marginTop: 4 }}>
                    {format(new Date(modalItem.datum + 'T12:00:00'), 'EEEE d MMMM', { locale: nl })} · {modalItem.starttijd} – {modalItem.eindtijd}
                  </p>
                </div>

                <p style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a0abc3', marginBottom: 12 }}>Werkzaamheden</p>
                <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                  {['schakelen', 'monteren'].map(w => (
                    <button key={w} onClick={() => setUrenForm(f => ({ ...f, werkzaamheden: w }))} style={{
                      flex: 1, padding: '14px 0', borderRadius: 16,
                      border: urenForm.werkzaamheden === w ? '2px solid #3fff8b' : '1px solid rgba(255,255,255,0.07)',
                      background: urenForm.werkzaamheden === w ? 'rgba(63,255,139,0.05)' : '#061327',
                      color: urenForm.werkzaamheden === w ? '#3fff8b' : '#a0abc3',
                      fontFamily: 'Inter', fontWeight: 700, fontSize: 14, textTransform: 'capitalize', cursor: 'pointer',
                    }}>{w}</button>
                  ))}
                </div>

                <p style={{ fontSize: 10, fontWeight: 700, fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a0abc3', marginBottom: 24, textAlign: 'center' }}>Aantal uren</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, marginBottom: 24 }}>
                  <button onClick={() => setUrenForm(f => ({ ...f, uren: Math.max(0.5, f.uren - 0.5) }))} style={{
                    width: 56, height: 56, borderRadius: '50%', background: '#142640', border: '2px solid rgba(255,113,108,0.3)',
                    color: '#dae6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 24 }}>remove</span>
                  </button>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: 'Manrope', fontWeight: 800, fontSize: 72, color: '#dae6ff', lineHeight: 1 }}>{urenForm.uren}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Inter', color: '#3fff8b', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: -4 }}>UUR</div>
                  </div>
                  <button onClick={() => setUrenForm(f => ({ ...f, uren: Math.min(24, f.uren + 0.5) }))} style={{
                    width: 56, height: 56, borderRadius: '50%', background: 'rgba(63,255,139,0.2)', border: '2px solid rgba(63,255,139,0.3)',
                    color: '#3fff8b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    boxShadow: '0 0 20px rgba(63,255,139,0.15)',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 24 }}>add</span>
                  </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 32 }}>
                  {[4, 6, 8, 9, 10].map(h => (
                    <button key={h} onClick={() => setUrenForm(f => ({ ...f, uren: h }))} style={{
                      padding: '10px 18px', borderRadius: 9999,
                      border: urenForm.uren === h ? '2px solid #3fff8b' : '1px solid rgba(255,255,255,0.07)',
                      background: urenForm.uren === h ? 'rgba(63,255,139,0.1)' : '#061327',
                      color: urenForm.uren === h ? '#3fff8b' : '#dae6ff',
                      fontFamily: 'Manrope', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                    }}>{h}u</button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => saveUren(false)} style={{
                    flex: 1, height: 56, borderRadius: 16, background: '#3fff8b', color: '#005d2c',
                    fontFamily: 'Manrope', fontWeight: 800, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.05em',
                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: '0 8px 32px rgba(63,255,139,0.2)',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>save</span>
                    CONCEPT
                  </button>
                  <button onClick={() => saveUren(true)} style={{
                    flex: 1, height: 56, borderRadius: 16, background: 'transparent',
                    border: '2px solid #3fff8b', color: '#3fff8b',
                    fontFamily: 'Manrope', fontWeight: 800, fontSize: 15, textTransform: 'uppercase', letterSpacing: '0.05em',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>send</span>
                    INDIENEN
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { PasskeyListItem } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { usePasskeyStatus } from "@/hooks/usePasskeyStatus";
import { classifyPasskeyError, PASSKEY_FOUTTEKST, PASSKEY_ORIGIN } from "@/lib/passkeys";
import { formatDatum } from "@/lib/formatting";

const kaart = { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 16, marginTop: 20 } as const;
const knop = { background: "var(--accent-light)", border: "1px solid var(--accent-border)", color: "var(--accent)" } as const;
const veld = { background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" } as const;
const muted = { fontSize: 12, color: "var(--text-muted)", marginTop: 10 } as const;

/** Is `userId` still the signed-in account according to the provider? */
async function isActiefAccount(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id === userId;
  } catch {
    return false;
  }
}

/**
 * Passkeys of the signed-in user, managed only through the auth provider API.
 * Render with `key={userId}` so an account switch remounts with empty state.
 */
export function PasskeyBeveiliging({ userId }: { userId: string | null | undefined }) {
  const status = usePasskeyStatus();
  const [lijst, setLijst] = useState<PasskeyListItem[] | null>(null);
  const [lijstFout, setLijstFout] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [bewerkId, setBewerkId] = useState<string | null>(null);
  const [naam, setNaam] = useState("");
  // Generation: bumped on account change/unmount; stale async results are dropped.
  const generatie = useRef(0);
  const bezigRef = useRef(false);

  const geldig = useCallback(async (gen: number) => {
    return gen === generatie.current && !!userId && (await isActiefAccount(userId)) && gen === generatie.current;
  }, [userId]);

  const laad = useCallback(async (gen: number) => {
    setLijstFout(false);
    try {
      if (!(await geldig(gen))) return;
      const { data, error } = await supabase.auth.passkey.list();
      if (!(await geldig(gen))) return;
      if (error || !data) { setLijst(null); setLijstFout(true); return; }
      setLijst(data);
    } catch {
      if (gen === generatie.current) { setLijst(null); setLijstFout(true); }
    }
  }, [geldig]);

  useEffect(() => {
    const gen = ++generatie.current;
    setLijst(null); setLijstFout(false); setBewerkId(null);
    if (userId && status === "beschikbaar") laad(gen);
    return () => { generatie.current++; };
  }, [userId, status, laad]);

  const metSlot = async (fn: (gen: number) => Promise<void>) => {
    if (bezigRef.current || !userId) return;
    const gen = generatie.current;
    bezigRef.current = true; setBezig(true);
    try {
      if (!(await geldig(gen))) return;
      await fn(gen);
    } catch (err) {
      if (gen === generatie.current) toast.error(PASSKEY_FOUTTEKST[classifyPasskeyError(err) === "geannuleerd" ? "geannuleerd" : "server"]);
    } finally {
      bezigRef.current = false;
      if (gen === generatie.current) setBezig(false);
    }
  };

  const toevoegen = () => metSlot(async gen => {
    const { data, error } = await supabase.auth.registerPasskey();
    if (!(await geldig(gen))) return;
    if (error || !data) {
      const soort = classifyPasskeyError(error);
      if (soort === "geannuleerd") toast(PASSKEY_FOUTTEKST.geannuleerd); else toast.error(PASSKEY_FOUTTEKST[soort]);
      return;
    }
    toast.success("Passkey toegevoegd.");
    await laad(gen);
  });

  const hernoem = (id: string) => metSlot(async gen => {
    const n = naam.trim().slice(0, 120);
    if (!n) return;
    const { error } = await supabase.auth.passkey.update({ passkeyId: id, friendlyName: n });
    if (!(await geldig(gen))) return;
    if (error) { toast.error("Naam wijzigen mislukt. De passkey zelf blijft werken."); return; }
    setBewerkId(null);
    await laad(gen);
  });

  const verwijder = (id: string) => metSlot(async gen => {
    if (!window.confirm("Deze passkey verwijderen?")) return;
    const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
    if (!(await geldig(gen))) return;
    if (error) { toast.error("Verwijderen mislukt."); return; }
    toast.success("Passkey verwijderd.");
    await laad(gen);
  });

  return (
    <section style={kaart} aria-label="Beveiliging">
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", margin: 0 }}>Beveiliging</p>
      <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "6px 0 2px" }}>Passkey</p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Met Face ID, vingerafdruk of toestelcode</p>

      {status === "laden" && <p style={muted}>Laden…</p>}
      {(status === "backend_uit" || status === "fout") && <p style={muted}>Nog niet beschikbaar.</p>}
      {status === "browser_niet" && <p style={muted}>Deze browser ondersteunt geen passkeys.</p>}
      {status === "verkeerde_omgeving" && (
        <p style={muted}>Passkeys beheer je in de <a href={PASSKEY_ORIGIN} target="_top" rel="noopener" style={{ color: "var(--accent)", fontWeight: 700 }}>officiële app</a>.</p>
      )}

      {status === "beschikbaar" && (
        <div className="space-y-2" style={{ marginTop: 12 }}>
          {lijstFout && (
            <div className="flex items-center justify-between gap-2">
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Passkeys laden mislukt.</p>
              <button disabled={bezig} onClick={() => laad(generatie.current)} className="text-xs font-semibold" style={{ color: "var(--accent)" }}>Opnieuw</button>
            </div>
          )}
          {lijst === null && !lijstFout && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Laden…</p>}
          {lijst?.length === 0 && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Nog geen passkeys.</p>}
          {lijst?.map(p => (
            <div key={p.id} className="rounded-xl px-3 py-2 min-w-0" style={{ background: "var(--bg-surface-2)" }}>
              {bewerkId === p.id ? (
                <div className="flex flex-wrap gap-2 min-w-0">
                  <input value={naam} maxLength={120} onChange={e => setNaam(e.target.value)} className="min-w-0 flex-1 basis-40 px-3 py-2 rounded-xl text-sm" style={veld} aria-label="Naam passkey" />
                  <div className="flex gap-2 shrink-0">
                    <button disabled={bezig || !naam.trim()} onClick={() => hernoem(p.id)} className="px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-40" style={knop}>Opslaan</button>
                    <button disabled={bezig} onClick={() => setBewerkId(null)} className="px-2 text-xs" style={{ color: "var(--text-muted)" }}>Annuleer</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{p.friendly_name || "Passkey"}</p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Toegevoegd {formatDatum(p.created_at)}{p.last_used_at ? ` · laatst gebruikt ${formatDatum(p.last_used_at)}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-3 text-xs font-semibold shrink-0">
                    <button disabled={bezig} onClick={() => { setBewerkId(p.id); setNaam(p.friendly_name ?? ""); }} style={{ color: "var(--accent)" }}>Hernoemen</button>
                    <button disabled={bezig} onClick={() => verwijder(p.id)} style={{ color: "var(--danger, var(--text-muted))" }}>Verwijderen</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <button onClick={toevoegen} disabled={bezig || !userId} className="w-full py-2.5 rounded-xl text-xs font-semibold disabled:opacity-40" style={knop}>
            {bezig ? "Bezig..." : "Passkey toevoegen"}
          </button>
        </div>
      )}
    </section>
  );
}

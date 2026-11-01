import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { PasskeyListItem } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { usePasskeyStatus } from "@/hooks/usePasskeyStatus";
import { classifyPasskeyError, PASSKEY_FOUTTEKST } from "@/lib/passkeys";
import { formatDatum } from "@/lib/formatting";

const kaart = { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 16, marginTop: 20 } as const;
const knop = { background: "var(--accent-light)", border: "1px solid var(--accent-border)", color: "var(--accent)" } as const;
const veld = { background: "var(--app-navy)", border: "1px solid var(--planning-border-soft)", color: "var(--text-primary)" } as const;

/** Passkeys of the signed-in user, managed only through the auth provider API. */
export function PasskeyBeveiliging({ userId }: { userId: string | null | undefined }) {
  const status = usePasskeyStatus();
  const [lijst, setLijst] = useState<PasskeyListItem[] | null>(null);
  const [bezig, setBezig] = useState(false);
  const [bewerkId, setBewerkId] = useState<string | null>(null);
  const [naam, setNaam] = useState("");
  const verzoek = useRef(0);
  const bezigRef = useRef(false);

  const laad = useCallback(async () => {
    const id = ++verzoek.current;
    const { data, error } = await supabase.auth.passkey.list();
    if (id !== verzoek.current) return; // stale (account switched)
    if (error) { setLijst([]); toast.error("Passkeys laden mislukt."); return; }
    setLijst(data ?? []);
  }, []);

  useEffect(() => {
    setLijst(null); setBewerkId(null);
    verzoek.current++;
    if (userId && status === "beschikbaar") laad();
  }, [userId, status, laad]);

  const metSlot = async (fn: () => Promise<void>) => {
    if (bezigRef.current) return;
    bezigRef.current = true; setBezig(true);
    try { await fn(); } finally { bezigRef.current = false; setBezig(false); }
  };

  const toevoegen = () => metSlot(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user || u.user.id !== userId) { toast.error("Log opnieuw in om een passkey toe te voegen."); return; }
    const { data, error } = await supabase.auth.registerPasskey();
    if (error || !data) {
      const soort = classifyPasskeyError(error);
      if (soort !== "geannuleerd") toast.error(PASSKEY_FOUTTEKST[soort]); else toast(PASSKEY_FOUTTEKST.geannuleerd);
      return;
    }
    toast.success("Passkey toegevoegd.");
    await laad();
  });

  const hernoem = (id: string) => metSlot(async () => {
    const n = naam.trim();
    if (!n) return;
    const { error } = await supabase.auth.passkey.update({ passkeyId: id, friendlyName: n.slice(0, 120) });
    if (error) { toast.error("Naam wijzigen mislukt. De passkey zelf blijft werken."); return; }
    setBewerkId(null);
    await laad();
  });

  const verwijder = (id: string) => metSlot(async () => {
    if (!window.confirm("Deze passkey verwijderen?")) return;
    const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
    if (error) { toast.error("Verwijderen mislukt."); return; }
    toast.success("Passkey verwijderd.");
    await laad();
  });

  return (
    <section style={kaart} aria-label="Beveiliging">
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", margin: 0 }}>Beveiliging</p>
      <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "6px 0 2px" }}>Passkey</p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Met Face ID, vingerafdruk of toestelcode</p>

      {status === "laden" && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>Laden…</p>}
      {(status === "backend_uit" || status === "fout") && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>Nog niet beschikbaar.</p>}
      {status === "browser_niet" && <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>Deze browser ondersteunt geen passkeys.</p>}

      {status === "beschikbaar" && (
        <div className="space-y-2" style={{ marginTop: 12 }}>
          {lijst === null && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Laden…</p>}
          {lijst?.length === 0 && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Nog geen passkeys.</p>}
          {lijst?.map(p => (
            <div key={p.id} className="rounded-xl px-3 py-2" style={{ background: "var(--bg-surface-2)" }}>
              {bewerkId === p.id ? (
                <div className="flex gap-2">
                  <input value={naam} maxLength={120} onChange={e => setNaam(e.target.value)} className="flex-1 px-3 py-2 rounded-xl text-sm" style={veld} aria-label="Naam passkey" />
                  <button disabled={bezig || !naam.trim()} onClick={() => hernoem(p.id)} className="px-3 rounded-xl text-xs font-semibold disabled:opacity-40" style={knop}>Opslaan</button>
                  <button disabled={bezig} onClick={() => setBewerkId(null)} className="px-2 text-xs" style={{ color: "var(--text-muted)" }}>Annuleer</button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{p.friendly_name || "Passkey"}</p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Toegevoegd {formatDatum(p.created_at)}{p.last_used_at ? ` · laatst gebruikt ${formatDatum(p.last_used_at)}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-3 text-xs font-semibold">
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

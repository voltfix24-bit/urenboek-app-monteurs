// Native passkey helpers. Availability is decided by the backend's public auth
// settings (`passkeys_enabled`) plus browser WebAuthn support — never by a
// hardcoded flag. Any settings error fails closed (passkeys hidden); password
// login is unaffected.
import type { Session, User } from "@supabase/supabase-js";

export type PasskeyStatus = "laden" | "beschikbaar" | "backend_uit" | "browser_niet" | "fout";

export function passkeysEnabledFromSettings(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  return (json as Record<string, unknown>).passkeys_enabled === true;
}

export function browserSupportsPasskeys(w: unknown = typeof window !== "undefined" ? window : undefined): boolean {
  const win = w as { PublicKeyCredential?: unknown; isSecureContext?: boolean; navigator?: { credentials?: unknown } } | undefined;
  return !!win && typeof win.PublicKeyCredential === "function" && win.isSecureContext !== false && !!win.navigator?.credentials;
}

export function bepaalPasskeyStatus(settings: { ok: boolean; enabled: boolean } | null, browserOk: boolean): PasskeyStatus {
  if (!settings) return "laden";
  if (!settings.ok) return "fout";
  if (!settings.enabled) return "backend_uit";
  if (!browserOk) return "browser_niet";
  return "beschikbaar";
}

export async function fetchPasskeysEnabled(
  url: string | undefined,
  key: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: boolean; enabled: boolean }> {
  if (!url || !key) return { ok: false, enabled: false };
  try {
    const res = await fetcher(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!res.ok) return { ok: false, enabled: false };
    return { ok: true, enabled: passkeysEnabledFromSettings(await res.json()) };
  } catch {
    return { ok: false, enabled: false };
  }
}

/** Login only counts as successful when the server returned a real session bound to a user. */
export function isEchteSessie(data: { session: Session | null; user: User | null } | null | undefined): boolean {
  const s = data?.session;
  const u = data?.user;
  return !!s && !!u && !!s.access_token && !!s.refresh_token && s.user?.id === u.id;
}

export type PasskeyFoutSoort = "geannuleerd" | "geen_passkey" | "al_geregistreerd" | "domein" | "server";

export function classifyPasskeyError(err: unknown): PasskeyFoutSoort {
  const e = err as { code?: string; name?: string; message?: string; cause?: { name?: string } } | null;
  const code = e?.code ?? "";
  const name = e?.cause?.name ?? e?.name ?? "";
  const msg = (e?.message ?? "").toLowerCase();
  if (code === "ERROR_CEREMONY_ABORTED" || name === "NotAllowedError" || name === "AbortError") return "geannuleerd";
  if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" || name === "InvalidStateError") return "al_geregistreerd";
  if (code === "ERROR_INVALID_DOMAIN" || code === "ERROR_INVALID_RP_ID" || name === "SecurityError") return "domein";
  if (msg.includes("not found") || msg.includes("no passkey") || msg.includes("credential")) return "geen_passkey";
  return "server";
}

export const PASSKEY_FOUTTEKST: Record<PasskeyFoutSoort, string> = {
  geannuleerd: "Geannuleerd.",
  geen_passkey: "Geen passkey gevonden voor dit account. Log in met je wachtwoord.",
  al_geregistreerd: "Dit toestel heeft al een passkey voor dit account.",
  domein: "Passkeys werken alleen op de officiële app-website.",
  server: "Passkey lukte niet. Probeer het later opnieuw of log in met je wachtwoord.",
};

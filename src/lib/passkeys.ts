// Native passkey helpers. Availability requires: backend public auth settings
// (`passkeys_enabled: true`), browser WebAuthn support in a secure context, and the
// app running top-level on the configured relying-party origin. Anything else
// fails closed (passkeys hidden); password login is unaffected.
import type { Session, User } from "@supabase/supabase-js";

/** Configured relying-party origin (rp_id = its hostname). */
export const PASSKEY_ORIGIN = "https://uren-terrevolt.lovable.app";

export type PasskeyStatus = "laden" | "beschikbaar" | "backend_uit" | "browser_niet" | "verkeerde_omgeving" | "fout";

type WinLike = {
  PublicKeyCredential?: unknown;
  isSecureContext?: boolean;
  navigator?: { credentials?: unknown };
  location?: { origin?: string };
  self?: unknown;
  top?: unknown;
};

const huidigeWindow = (): WinLike | undefined => (typeof window !== "undefined" ? (window as unknown as WinLike) : undefined);

export function passkeysEnabledFromSettings(json: unknown): boolean {
  if (!json || typeof json !== "object") return false;
  return (json as Record<string, unknown>).passkeys_enabled === true;
}

/** WebAuthn API present in a secure context (external/roaming passkeys count too). */
export function browserSupportsPasskeys(w: WinLike | undefined = huidigeWindow()): boolean {
  return !!w && typeof w.PublicKeyCredential === "function" && w.isSecureContext === true && !!w.navigator?.credentials;
}

/** Top-level window on exactly the configured RP origin (not an iframe/preview/other domain). */
export function isPasskeyOmgeving(w: WinLike | undefined = huidigeWindow(), origin = PASSKEY_ORIGIN): boolean {
  if (!w || w.isSecureContext !== true || w.location?.origin !== origin) return false;
  try {
    return w.top === w.self;
  } catch {
    return false; // cross-origin parent access throws → we are framed
  }
}

export function bepaalPasskeyStatus(
  settings: { ok: boolean; enabled: boolean } | null,
  browserOk: boolean,
  omgevingOk: boolean,
): PasskeyStatus {
  if (!settings) return "laden";
  if (!settings.ok) return "fout";
  if (!settings.enabled) return "backend_uit";
  if (!omgevingOk) return "verkeerde_omgeving";
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

/** Login only counts when the provider returned a session bound to the same, non-empty user id. */
export function isEchteSessie(data: { session: Session | null; user: User | null } | null | undefined): boolean {
  const s = data?.session;
  const u = data?.user;
  const uid = typeof u?.id === "string" ? u.id.trim() : "";
  if (!s || !uid) return false;
  return !!s.access_token && !!s.refresh_token && s.user?.id === uid;
}

export type PasskeyFoutSoort = "geannuleerd" | "geen_passkey" | "al_geregistreerd" | "domein" | "verificatie" | "server";

export function classifyPasskeyError(err: unknown): PasskeyFoutSoort {
  const e = err as { code?: unknown; name?: unknown; cause?: { name?: unknown } } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  const name = typeof e?.cause?.name === "string" ? e.cause.name : typeof e?.name === "string" ? e.name : "";
  if (code === "ERROR_CEREMONY_ABORTED" || name === "NotAllowedError" || name === "AbortError") return "geannuleerd";
  if (code === "webauthn_credential_exists" || code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" || name === "InvalidStateError") return "al_geregistreerd";
  if (code === "webauthn_credential_not_found") return "geen_passkey";
  if (code === "webauthn_verification_failed") return "verificatie";
  if (code === "ERROR_INVALID_DOMAIN" || code === "ERROR_INVALID_RP_ID" || name === "SecurityError") return "domein";
  return "server";
}

export const PASSKEY_FOUTTEKST: Record<PasskeyFoutSoort, string> = {
  geannuleerd: "Geannuleerd.",
  geen_passkey: "Geen passkey gevonden voor dit account. Log in met je wachtwoord.",
  al_geregistreerd: "Dit toestel heeft al een passkey voor dit account.",
  domein: "Passkeys werken alleen in de officiële app.",
  verificatie: "Passkey kon niet worden gecontroleerd. Probeer het opnieuw.",
  server: "Passkey lukte niet. Probeer het later opnieuw of log in met je wachtwoord.",
};

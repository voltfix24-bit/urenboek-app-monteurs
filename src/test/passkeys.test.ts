import { describe, it, expect, vi } from "vitest";
import {
  bepaalPasskeyStatus, browserSupportsPasskeys, classifyPasskeyError, fetchPasskeysEnabled,
  isEchteSessie, isPasskeyOmgeving, passkeysEnabledFromSettings,
} from "@/lib/passkeys";

const sessie = (uid: string) => ({ access_token: "a", refresh_token: "r", user: { id: uid } }) as any;

describe("passkey beschikbaarheid", () => {
  it("alleen aan bij passkeys_enabled === true", () => {
    expect(passkeysEnabledFromSettings({ passkeys_enabled: true })).toBe(true);
    expect(passkeysEnabledFromSettings({ passkeys_enabled: false })).toBe(false);
    expect(passkeysEnabledFromSettings({ passkeys_enabled: "true" })).toBe(false);
    expect(passkeysEnabledFromSettings(null)).toBe(false);
  });
  it("backend uit verbergt passkey ook als browser het kan", () => {
    expect(bepaalPasskeyStatus({ ok: true, enabled: false }, true, true)).toBe("backend_uit");
    expect(bepaalPasskeyStatus({ ok: false, enabled: false }, true, true)).toBe("fout");
    expect(bepaalPasskeyStatus({ ok: true, enabled: true }, true, false)).toBe("verkeerde_omgeving");
    expect(bepaalPasskeyStatus({ ok: true, enabled: true }, false, true)).toBe("browser_niet");
    expect(bepaalPasskeyStatus({ ok: true, enabled: true }, true, true)).toBe("beschikbaar");
  });
  it("settingsfout of netwerkfout faalt gesloten", async () => {
    expect(await fetchPasskeysEnabled("u", "k", vi.fn().mockResolvedValue({ ok: false }) as any)).toEqual({ ok: false, enabled: false });
    expect(await fetchPasskeysEnabled("u", "k", vi.fn().mockRejectedValue(new Error("x")) as any)).toEqual({ ok: false, enabled: false });
    expect(await fetchPasskeysEnabled(undefined, "k")).toEqual({ ok: false, enabled: false });
  });
  it("leest publieke settings met apikey, geen credentials", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ passkeys_enabled: true }) });
    expect(await fetchPasskeysEnabled("https://x", "anon", f as any)).toEqual({ ok: true, enabled: true });
    expect(f).toHaveBeenCalledWith("https://x/auth/v1/settings", { headers: { apikey: "anon" } });
  });
  it("browser zonder PublicKeyCredential of onveilig niet ondersteund", () => {
    expect(browserSupportsPasskeys({ navigator: { credentials: {} }, isSecureContext: true })).toBe(false);
    expect(browserSupportsPasskeys({ PublicKeyCredential: function () {}, navigator: { credentials: {} }, isSecureContext: false })).toBe(false);
    expect(browserSupportsPasskeys({ PublicKeyCredential: function () {}, navigator: { credentials: {} } })).toBe(false);
    expect(browserSupportsPasskeys({ PublicKeyCredential: function () {}, navigator: { credentials: {} }, isSecureContext: true })).toBe(true);
  });
  it("alleen top-level op https://uren-terrevolt.lovable.app", () => {
    const top = (origin: string, extra: Record<string, unknown> = {}) => { const w: any = { isSecureContext: true, location: { origin }, ...extra }; w.self = w; if (!("top" in extra)) w.top = w; return w; };
    expect(isPasskeyOmgeving(top("https://uren-terrevolt.lovable.app"))).toBe(true);
    expect(isPasskeyOmgeving(top("https://id-preview--c3253956.lovable.app"))).toBe(false);
    expect(isPasskeyOmgeving(top("http://localhost:8080"))).toBe(false);
    expect(isPasskeyOmgeving(top("https://uren-terrevolt.lovable.app", { isSecureContext: false }))).toBe(false);
    expect(isPasskeyOmgeving(top("https://uren-terrevolt.lovable.app", { top: {} }))).toBe(false); // iframe
    const crossFrame: any = { isSecureContext: true, location: { origin: "https://uren-terrevolt.lovable.app" } };
    Object.defineProperty(crossFrame, "top", { get() { throw new Error("SecurityError"); } });
    expect(isPasskeyOmgeving(crossFrame)).toBe(false);
  });
});

describe("echte sessie-eis en accountbinding", () => {
  it("succes alleen met sessie én user van hetzelfde account", () => {
    expect(isEchteSessie({ session: sessie("u1"), user: { id: "u1" } as any })).toBe(true);
    expect(isEchteSessie({ session: null, user: { id: "u1" } as any })).toBe(false);
    expect(isEchteSessie({ session: sessie("u1"), user: null })).toBe(false);
    expect(isEchteSessie({ session: sessie("u2"), user: { id: "u1" } as any })).toBe(false);
    expect(isEchteSessie({ session: { ...sessie("u1"), access_token: "" }, user: { id: "u1" } as any })).toBe(false);
    expect(isEchteSessie(null)).toBe(false);
    expect(isEchteSessie({ session: { access_token: "a", refresh_token: "r", user: {} } as any, user: {} as any })).toBe(false);
    expect(isEchteSessie({ session: { ...sessie(""), user: { id: "" } }, user: { id: "" } as any })).toBe(false);
  });
});

describe("foutpaden", () => {
  it("annuleren, dubbel geregistreerd, domein en server", () => {
    expect(classifyPasskeyError({ code: "ERROR_CEREMONY_ABORTED" })).toBe("geannuleerd");
    expect(classifyPasskeyError({ name: "NotAllowedError" })).toBe("geannuleerd");
    expect(classifyPasskeyError({ code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" })).toBe("al_geregistreerd");
    expect(classifyPasskeyError({ code: "ERROR_INVALID_RP_ID" })).toBe("domein");
    expect(classifyPasskeyError({ code: "webauthn_credential_not_found" })).toBe("geen_passkey");
    expect(classifyPasskeyError({ code: "webauthn_credential_exists" })).toBe("al_geregistreerd");
    expect(classifyPasskeyError({ code: "webauthn_verification_failed", message: "invalid credential signature" })).toBe("verificatie");
    expect(classifyPasskeyError({ message: "invalid credential" })).toBe("server");
    expect(classifyPasskeyError(Object.assign(new Error("x"), { name: "AbortError" }))).toBe("geannuleerd");
    expect(classifyPasskeyError({ message: "500 internal" })).toBe("server");
  });
});

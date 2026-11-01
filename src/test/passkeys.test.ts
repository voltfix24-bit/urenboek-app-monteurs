import { describe, it, expect, vi } from "vitest";
import {
  bepaalPasskeyStatus, browserSupportsPasskeys, classifyPasskeyError, fetchPasskeysEnabled,
  isEchteSessie, passkeysEnabledFromSettings,
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
    expect(bepaalPasskeyStatus({ ok: true, enabled: false }, true)).toBe("backend_uit");
    expect(bepaalPasskeyStatus({ ok: false, enabled: false }, true)).toBe("fout");
    expect(bepaalPasskeyStatus({ ok: true, enabled: true }, false)).toBe("browser_niet");
    expect(bepaalPasskeyStatus({ ok: true, enabled: true }, true)).toBe("beschikbaar");
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
    expect(browserSupportsPasskeys({ PublicKeyCredential: function () {}, navigator: { credentials: {} }, isSecureContext: true })).toBe(true);
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
  });
});

describe("foutpaden", () => {
  it("annuleren, dubbel geregistreerd, domein en server", () => {
    expect(classifyPasskeyError({ code: "ERROR_CEREMONY_ABORTED" })).toBe("geannuleerd");
    expect(classifyPasskeyError({ name: "NotAllowedError" })).toBe("geannuleerd");
    expect(classifyPasskeyError({ code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" })).toBe("al_geregistreerd");
    expect(classifyPasskeyError({ code: "ERROR_INVALID_RP_ID" })).toBe("domein");
    expect(classifyPasskeyError({ message: "Passkey not found" })).toBe("geen_passkey");
    expect(classifyPasskeyError({ message: "500 internal" })).toBe("server");
  });
});

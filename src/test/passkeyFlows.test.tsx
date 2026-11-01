import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

// ── Mocks: official provider client (no real accounts/credentials) ──
const h = vi.hoisted(() => {
  const chain: any = {};
  for (const m of ["select", "eq", "limit"]) chain[m] = () => chain;
  chain.maybeSingle = async () => ({ data: { setup_done: true } });
  chain.then = (r: any) => r({ data: [{ id: "x" }] });
  return {
    navigate: vi.fn(),
    status: { value: "beschikbaar" as string },
    toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
    auth: {
      signInWithPassword: vi.fn(),
      signInWithPasskey: vi.fn(),
      signOut: vi.fn(async () => ({ error: null })),
      registerPasskey: vi.fn(),
      getSession: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
      passkey: { list: vi.fn(), update: vi.fn(), delete: vi.fn() },
    },
    from: vi.fn(() => chain),
  };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: h.auth, from: h.from } }));
vi.mock("@/hooks/usePasskeyStatus", () => ({ usePasskeyStatus: () => h.status.value }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("react-router-dom", async (orig) => ({ ...(await orig<any>()), useNavigate: () => h.navigate }));

import { RealLoginForm } from "@/pages/Auth";
import { PasskeyBeveiliging } from "@/components/PasskeyBeveiliging";

const sessie = (uid: string) => ({ access_token: "a", refresh_token: "r", user: { id: uid } });
const deferred = <T,>() => { let resolve!: (v: T) => void; const p = new Promise<T>(r => (resolve = r)); return { p, resolve }; };
let actieveUser = "u1";

beforeEach(() => {
  vi.clearAllMocks();
  h.status.value = "beschikbaar";
  actieveUser = "u1";
  h.auth.getSession.mockImplementation(async () => ({ data: { session: actieveUser ? sessie(actieveUser) : null } }));
});

const passkeyKnop = () => screen.getByRole("button", { name: /Inloggen met passkey/i });
const inlogKnop = () => screen.getByRole("button", { name: /INLOGGEN|Bezig/ });

describe("Inlogscherm", () => {
  it("passkeyknop verborgen als backend uit staat, wachtwoordlogin blijft", () => {
    h.status.value = "backend_uit";
    render(<RealLoginForm />);
    expect(screen.queryByRole("button", { name: /passkey/i })).toBeNull();
    expect(screen.queryByText(/FaceID/i)).toBeNull();
    expect(inlogKnop()).toBeEnabled();
  });

  it("verkeerde omgeving: geen knop, alleen link naar officiële app", () => {
    h.status.value = "verkeerde_omgeving";
    render(<RealLoginForm />);
    expect(screen.queryByRole("button", { name: /passkey/i })).toBeNull();
    expect(screen.getByRole("link", { name: /officiële app/i })).toHaveAttribute("href", "https://uren-terrevolt.lovable.app");
  });

  it("navigeert bij geldige providersessie", async () => {
    h.auth.signInWithPasskey.mockResolvedValue({ data: { session: sessie("u1"), user: { id: "u1" } }, error: null });
    render(<RealLoginForm />);
    fireEvent.click(passkeyKnop());
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith("/"));
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it.each([
    ["ontbrekende sessie", { session: null, user: { id: "u1" } }],
    ["mismatch", { session: sessie("u2"), user: { id: "u1" } }],
    ["user zonder id", { session: { access_token: "a", refresh_token: "r", user: {} }, user: {} }],
  ])("geen navigatie bij %s", async (_n, data) => {
    h.auth.signInWithPasskey.mockResolvedValue({ data, error: null });
    render(<RealLoginForm />);
    fireEvent.click(passkeyKnop());
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(h.navigate).not.toHaveBeenCalled();
    expect(passkeyKnop()).toBeEnabled();
  });

  it("annuleren (ook gegooid) toont geen fout en laat opnieuw proberen toe", async () => {
    h.auth.signInWithPasskey
      .mockResolvedValueOnce({ data: null, error: { code: "ERROR_CEREMONY_ABORTED" } })
      .mockRejectedValueOnce(Object.assign(new Error("x"), { name: "NotAllowedError" }))
      .mockResolvedValueOnce({ data: { session: sessie("u1"), user: { id: "u1" } }, error: null });
    render(<RealLoginForm />);
    fireEvent.click(passkeyKnop());
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith("Geannuleerd."));
    await waitFor(() => expect(passkeyKnop()).toBeEnabled());
    fireEvent.click(passkeyKnop());
    await waitFor(() => expect(h.toast).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(passkeyKnop()).toBeEnabled());
    fireEvent.click(passkeyKnop());
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith("/"));
    expect(h.toast.error).not.toHaveBeenCalled();
  });

  it("serverfout en onverwachte throw geven fout zonder succes", async () => {
    h.auth.signInWithPasskey
      .mockResolvedValueOnce({ data: null, error: { code: "webauthn_verification_failed" } })
      .mockRejectedValueOnce(new Error("netwerk"));
    render(<RealLoginForm />);
    fireEvent.click(passkeyKnop());
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/niet worden gecontroleerd/)));
    await waitFor(() => expect(passkeyKnop()).toBeEnabled());
    fireEvent.click(passkeyKnop());
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledTimes(2));
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it("wachtwoord en passkey kunnen niet overlappen", async () => {
    const d = deferred<any>();
    h.auth.signInWithPasskey.mockReturnValue(d.p);
    const { container } = render(<RealLoginForm />);
    fireEvent.click(passkeyKnop());
    fireEvent.click(passkeyKnop());
    await waitFor(() => expect(inlogKnop()).toBeDisabled());
    fireEvent.submit(container.querySelector("form")!);
    expect(h.auth.signInWithPasskey).toHaveBeenCalledTimes(1);
    expect(h.auth.signInWithPassword).not.toHaveBeenCalled();
    await act(async () => d.resolve({ data: null, error: { code: "ERROR_CEREMONY_ABORTED" } }));
    await waitFor(() => expect(inlogKnop()).toBeEnabled());
  });

  it("wachtwoordlogin roept dezelfde provider aan en blokkeert passkey zolang", async () => {
    const d = deferred<any>();
    h.auth.signInWithPassword.mockReturnValue(d.p);
    const { container } = render(<RealLoginForm />);
    fireEvent.change(container.querySelector('input[type="email"]')!, { target: { value: "a@b.nl" } });
    fireEvent.change(container.querySelector('input[placeholder="••••••••••••"]')!, { target: { value: "geheim123" } });
    fireEvent.submit(container.querySelector("form")!);
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(passkeyKnop()).toBeDisabled());
    fireEvent.click(passkeyKnop());
    expect(h.auth.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(h.auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.nl", password: "geheim123" });
    expect(h.auth.signInWithPasskey).not.toHaveBeenCalled();
    await act(async () => d.resolve({ error: null }));
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith("/"));
  });

  it("wachtwoordfout laat opnieuw proberen toe", async () => {
    h.auth.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const { container } = render(<RealLoginForm />);
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Invalid login credentials"));
    expect(inlogKnop()).toBeEnabled();
    expect(h.navigate).not.toHaveBeenCalled();
  });
});

describe("Profiel → Beveiliging", () => {
  const item = (id: string, naam: string) => ({ id, friendly_name: naam, created_at: "2026-11-01T10:00:00Z" });

  it("lijst van eigen account; registratie alleen bij juiste user", async () => {
    h.auth.passkey.list.mockResolvedValue({ data: [item("p1", "iPhone")], error: null });
    h.auth.registerPasskey.mockResolvedValue({ data: { id: "p2" }, error: null });
    render(<PasskeyBeveiliging userId="u1" />);
    expect(await screen.findByText("iPhone")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Passkey toevoegen" }));
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith("Passkey toegevoegd."));
    expect(h.auth.registerPasskey).toHaveBeenCalledTimes(1);
  });

  it("geen registratie als actieve sessie een andere user is", async () => {
    h.auth.passkey.list.mockResolvedValue({ data: [], error: null });
    render(<PasskeyBeveiliging userId="u1" />);
    await screen.findByText("Nog geen passkeys.");
    actieveUser = "u2";
    fireEvent.click(screen.getByRole("button", { name: "Passkey toevoegen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Passkey toevoegen" })).toBeEnabled());
    expect(h.auth.registerPasskey).not.toHaveBeenCalled();
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it("mislukte lijst is geen lege lijst; opnieuw proberen werkt", async () => {
    h.auth.passkey.list.mockResolvedValueOnce({ data: null, error: { message: "500" } })
      .mockResolvedValueOnce({ data: [item("p1", "YubiKey")], error: null });
    render(<PasskeyBeveiliging userId="u1" />);
    expect(await screen.findByText("Passkeys laden mislukt.")).toBeInTheDocument();
    expect(screen.queryByText("Nog geen passkeys.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Opnieuw" }));
    expect(await screen.findByText("YubiKey")).toBeInTheDocument();
  });

  it("onverwachte throw in lijst en registratie zet status terug", async () => {
    h.auth.passkey.list.mockRejectedValueOnce(new Error("netwerk")).mockResolvedValue({ data: [], error: null });
    h.auth.registerPasskey.mockRejectedValue(new Error("boem"));
    render(<PasskeyBeveiliging userId="u1" />);
    expect(await screen.findByText("Passkeys laden mislukt.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Opnieuw" }));
    await screen.findByText("Nog geen passkeys.");
    fireEvent.click(screen.getByRole("button", { name: "Passkey toevoegen" }));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Passkey toevoegen" })).toBeEnabled();
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it("stale lijst van vorige user verschijnt niet na accountwissel", async () => {
    const oud = deferred<any>();
    h.auth.passkey.list.mockReturnValueOnce(oud.p).mockResolvedValueOnce({ data: [item("p9", "Van U2")], error: null });
    const { rerender } = render(<PasskeyBeveiliging key="u1" userId="u1" />);
    await waitFor(() => expect(h.auth.passkey.list).toHaveBeenCalledTimes(1));
    actieveUser = "u2";
    rerender(<PasskeyBeveiliging key="u2" userId="u2" />);
    expect(await screen.findByText("Van U2")).toBeInTheDocument();
    await act(async () => oud.resolve({ data: [item("p1", "Van U1")], error: null }));
    expect(screen.queryByText("Van U1")).toBeNull();
  });

  it("lopende registratie na accountwissel geeft geen succesmelding", async () => {
    h.auth.passkey.list.mockResolvedValue({ data: [], error: null });
    const reg = deferred<any>();
    h.auth.registerPasskey.mockReturnValue(reg.p);
    const { rerender } = render(<PasskeyBeveiliging key="u1" userId="u1" />);
    await screen.findByText("Nog geen passkeys.");
    fireEvent.click(screen.getByRole("button", { name: "Passkey toevoegen" }));
    fireEvent.click(screen.getByRole("button", { name: /Bezig|Passkey toevoegen/ }));
    await waitFor(() => expect(h.auth.registerPasskey).toHaveBeenCalledTimes(1));
    actieveUser = "u2";
    rerender(<PasskeyBeveiliging key="u2" userId="u2" />);
    await screen.findByText("Nog geen passkeys.");
    await waitFor(() => expect(h.auth.passkey.list).toHaveBeenCalledTimes(2));
    const lijstCalls = h.auth.passkey.list.mock.calls.length;
    await act(async () => reg.resolve({ data: { id: "p1" }, error: null }));
    expect(h.toast.success).not.toHaveBeenCalled();
    expect(h.auth.passkey.list.mock.calls.length).toBe(lijstCalls);
  });

  it("mislukte naamwijziging zegt niet dat de passkey ontbreekt", async () => {
    h.auth.passkey.list.mockResolvedValue({ data: [item("p1", "iPhone")], error: null });
    h.auth.passkey.update.mockResolvedValue({ data: null, error: { message: "500" } });
    render(<PasskeyBeveiliging userId="u1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Hernoemen" }));
    fireEvent.change(screen.getByLabelText("Naam passkey"), { target: { value: "Werk-iPhone" } });
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Naam wijzigen mislukt. De passkey zelf blijft werken."));
  });

  it("backend uit: geen providerbeheer", () => {
    h.status.value = "backend_uit";
    render(<PasskeyBeveiliging userId="u1" />);
    expect(screen.getByText("Nog niet beschikbaar.")).toBeInTheDocument();
    expect(h.auth.passkey.list).not.toHaveBeenCalled();
  });
});

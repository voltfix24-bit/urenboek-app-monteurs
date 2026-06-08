import { useEffect, useState } from "react";
import { X, Share, Plus, Download } from "lucide-react";

const STORAGE_KEY = "terrevolt_install_prompt_dismissed";
const SHOW_DELAY_MS = 8000;
export const TRIGGER_INSTALL_EVENT = "terrevolt:open-install-prompt";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Module-level cache so the deferred event survives even if the component
// hasn't re-rendered yet when the user opens the manual prompt.
let cachedDeferred: BeforeInstallPromptEvent | null = null;

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
}

function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

function isInStandaloneMode(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

function isPreviewOrIframe(): boolean {
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const h = window.location.hostname;
  return h.includes("id-preview--") || h.includes("lovableproject.com");
}

/**
 * Trigger the install prompt manually (e.g. from a button in the profile menu).
 * Shows the prompt even if it was previously dismissed.
 */
export function triggerInstallPrompt() {
  window.dispatchEvent(new CustomEvent(TRIGGER_INSTALL_EVENT));
}

/**
 * Check if installation is possible / relevant in the current context.
 * Returns false when already installed or running inside the Lovable preview iframe.
 */
export function canShowInstallPrompt(): boolean {
  if (typeof window === "undefined") return false;
  if (isInStandaloneMode()) return false;
  if (isPreviewOrIframe()) return false;
  return true;
}

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop" | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  // Capture the beforeinstallprompt event as early as possible (Android Chromium)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      cachedDeferred = e as BeforeInstallPromptEvent;
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Auto-show after delay (only once per user)
  useEffect(() => {
    if (!canShowInstallPrompt()) return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    const ios = isIOS();
    if (ios) {
      const t = setTimeout(() => {
        setPlatform("ios");
        setShow(true);
      }, SHOW_DELAY_MS);
      return () => clearTimeout(t);
    }

    // Android: wait for beforeinstallprompt before auto-showing
    const handler = () => {
      setTimeout(() => {
        setPlatform("android");
        setShow(true);
      }, SHOW_DELAY_MS);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Manual trigger via event (from profile button)
  useEffect(() => {
    const open = () => {
      if (isInStandaloneMode()) return;
      let p: "ios" | "android" | "desktop" = "desktop";
      if (isIOS()) p = "ios";
      else if (isAndroid() || cachedDeferred) p = "android";
      setPlatform(p);
      setShow(true);
    };
    window.addEventListener(TRIGGER_INSTALL_EVENT, open);
    return () => window.removeEventListener(TRIGGER_INSTALL_EVENT, open);
  }, []);

  const dismiss = (permanent = true) => {
    if (permanent) localStorage.setItem(STORAGE_KEY, "1");
    setShow(false);
  };

  const installAndroid = async () => {
    const evt = deferred || cachedDeferred;
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    cachedDeferred = null;
    setDeferred(null);
    dismiss(true);
  };

  if (!show || !platform) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={() => dismiss(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl p-5 pb-7"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--planning-border-soft)",
          borderBottom: "none",
        }}
      >
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--border-strong)" }} />
        </div>

        <div className="flex items-start gap-3 mb-4">
          <img
            src="/app-icon-192.png"
            alt="TerreVolt"
            width={56}
            height={56}
            className="rounded-2xl shrink-0"
            style={{ width: 56, height: 56 }}
          />
          <div className="flex-1">
            <h2 className="text-base font-bold" style={{ color: "#f5f7fa" }}>
              Installeer TerreVolt
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Werkt sneller en voelt als een echte app op je beginscherm.
            </p>
          </div>
          <button
            onClick={() => dismiss(true)}
            aria-label="Sluiten"
            className="p-1 rounded-full"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="rounded-2xl p-3 mb-4 space-y-2"
          style={{ background: "var(--accent-light)", border: "1px solid var(--accent-light)" }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
            Wat krijg je?
          </p>
          <Benefit icon="🚀" title="Sneller opstarten" text="Direct vanaf je beginscherm, zonder eerst een browser te openen." />
          <Benefit icon="📱" title="Voelt als een echte app" text="Geen adres‑ of menubalk meer — volledig schermgebruik." />
          <Benefit icon="🔔" title="Altijd binnen handbereik" text="Eigen app‑icoon naast je andere apps, één tik en je bent in TerreVolt." />
        </div>

        {platform === "ios" ? (
          <div className="space-y-3">
            <div
              className="rounded-2xl p-4 space-y-3"
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)" }}
            >
              <Step
                num={1}
                icon={<Share size={18} style={{ color: "var(--accent)" }} />}
                text={
                  <>
                    Tik op de <span style={{ color: "var(--accent)", fontWeight: 600 }}>Deel</span>‑knop onderin Safari
                  </>
                }
              />
              <Step
                num={2}
                icon={<Plus size={18} style={{ color: "var(--accent)" }} />}
                text={
                  <>
                    Kies <span style={{ color: "var(--accent)", fontWeight: 600 }}>Zet op beginscherm</span>
                  </>
                }
              />
              <Step
                num={3}
                icon={<span style={{ fontSize: 18 }}>✓</span>}
                text="Tik op Voeg toe — klaar!"
              />
            </div>
            <button
              onClick={() => dismiss(true)}
              className="w-full text-xs font-medium py-2"
              style={{ color: "var(--text-muted)" }}
            >
              Niet meer tonen
            </button>
          </div>
        ) : platform === "android" ? (
          <div className="space-y-3">
            {(deferred || cachedDeferred) ? (
              <button
                onClick={installAndroid}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm"
                style={{ background: "#22c55e", color: "#03200f" }}
              >
                <Download size={18} />
                Installeer app
              </button>
            ) : (
              <div
                className="rounded-2xl p-4 space-y-3"
                style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)" }}
              >
                <Step
                  num={1}
                  icon={<span style={{ fontSize: 18, color: "var(--accent)" }}>⋮</span>}
                  text={
                    <>
                      Tik op het <span style={{ color: "var(--accent)", fontWeight: 600 }}>menu (⋮)</span> rechtsboven in Chrome
                    </>
                  }
                />
                <Step
                  num={2}
                  icon={<Plus size={18} style={{ color: "var(--accent)" }} />}
                  text={
                    <>
                      Kies <span style={{ color: "var(--accent)", fontWeight: 600 }}>App installeren</span> of <span style={{ color: "var(--accent)", fontWeight: 600 }}>Toevoegen aan startscherm</span>
                    </>
                  }
                />
                <Step
                  num={3}
                  icon={<span style={{ fontSize: 18 }}>✓</span>}
                  text="Bevestig met Installeren — klaar!"
                />
              </div>
            )}
            <button
              onClick={() => dismiss(true)}
              className="w-full text-xs font-medium py-2"
              style={{ color: "var(--text-muted)" }}
            >
              Niet meer tonen
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div
              className="rounded-2xl p-4 space-y-3"
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--planning-border-soft)" }}
            >
              <Step
                num={1}
                icon={<Download size={18} style={{ color: "var(--accent)" }} />}
                text={
                  <>
                    Klik in Chrome of Edge op het <span style={{ color: "var(--accent)", fontWeight: 600 }}>installeer‑icoon</span> in de adresbalk
                  </>
                }
              />
              <Step
                num={2}
                icon={<span style={{ fontSize: 18 }}>✓</span>}
                text="Bevestig met Installeren"
              />
            </div>
            <button
              onClick={() => dismiss(true)}
              className="w-full text-xs font-medium py-2"
              style={{ color: "var(--text-muted)" }}
            >
              Sluiten
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ num, icon, text }: { num: number; icon: React.ReactNode; text: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
        style={{ background: "var(--accent-light)", color: "var(--accent)" }}
      >
        {num}
      </div>
      <div className="shrink-0">{icon}</div>
      <div className="text-sm" style={{ color: "#e6ebf5" }}>
        {text}
      </div>
    </div>
  );
}

function Benefit({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span style={{ fontSize: 16, lineHeight: "20px" }}>{icon}</span>
      <div className="flex-1">
        <p className="text-xs font-semibold" style={{ color: "#e6ebf5" }}>{title}</p>
        <p className="text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>{text}</p>
      </div>
    </div>
  );
}

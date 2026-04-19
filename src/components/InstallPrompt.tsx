import { useEffect, useState } from "react";
import { X, Share, Plus, Download } from "lucide-react";

const STORAGE_KEY = "terrevolt_install_prompt_dismissed";
const SHOW_DELAY_MS = 8000;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
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

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isInStandaloneMode() || isPreviewOrIframe()) return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    const ios = isIOS();

    if (ios) {
      const t = setTimeout(() => {
        setPlatform("ios");
        setShow(true);
      }, SHOW_DELAY_MS);
      return () => clearTimeout(t);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setTimeout(() => {
        setPlatform("android");
        setShow(true);
      }, SHOW_DELAY_MS);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = (permanent = true) => {
    if (permanent) localStorage.setItem(STORAGE_KEY, "1");
    setShow(false);
  };

  const installAndroid = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
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
          background: "#0a1a30",
          border: "1px solid rgba(106,118,140,0.18)",
          borderBottom: "none",
        }}
      >
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.18)" }} />
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
            <p className="text-xs mt-0.5" style={{ color: "#a0abc3" }}>
              Werkt sneller en voelt als een echte app op je beginscherm.
            </p>
          </div>
          <button
            onClick={() => dismiss(true)}
            aria-label="Sluiten"
            className="p-1 rounded-full"
            style={{ color: "#a0abc3" }}
          >
            <X size={18} />
          </button>
        </div>

        {platform === "ios" ? (
          <div className="space-y-3">
            <div
              className="rounded-2xl p-4 space-y-3"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(106,118,140,0.15)" }}
            >
              <Step
                num={1}
                icon={<Share size={18} style={{ color: "#3fff8b" }} />}
                text={
                  <>
                    Tik op de <span style={{ color: "#3fff8b", fontWeight: 600 }}>Deel</span>‑knop onderin Safari
                  </>
                }
              />
              <Step
                num={2}
                icon={<Plus size={18} style={{ color: "#3fff8b" }} />}
                text={
                  <>
                    Kies <span style={{ color: "#3fff8b", fontWeight: 600 }}>Zet op beginscherm</span>
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
              style={{ color: "#a0abc3" }}
            >
              Niet meer tonen
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={installAndroid}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-sm"
              style={{ background: "#22c55e", color: "#03200f" }}
            >
              <Download size={18} />
              Installeer app
            </button>
            <button
              onClick={() => dismiss(true)}
              className="w-full text-xs font-medium py-2"
              style={{ color: "#a0abc3" }}
            >
              Niet meer tonen
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
        style={{ background: "rgba(63,255,139,0.12)", color: "#3fff8b" }}
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

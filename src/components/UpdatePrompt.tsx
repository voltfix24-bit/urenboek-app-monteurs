import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { toast } from "sonner";

/**
 * Toont een melding zodra er een nieuwe versie van de app klaar staat.
 * Bij één tik wordt de service worker bijgewerkt en de pagina ververst,
 * zodat monteurs altijd de laatste versie hebben — ook bij de PWA op
 * hun beginscherm.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      // Elke 30 minuten checken op een nieuwe versie
      if (registration) {
        setHanken Groteskval(
          () => {
            registration.update().catch(() => {});
          },
          30 * 60 * 1000
        );
      }
    },
  });

  useEffect(() => {
    if (!needRefresh) return;

    toast("Nieuwe versie beschikbaar", {
      description: "Tik om de app bij te werken.",
      duration: Infinity,
      action: {
        label: "Bijwerken",
        onClick: () => {
          updateServiceWorker(true);
        },
      },
      onDismiss: () => setNeedRefresh(false),
      onAutoClose: () => setNeedRefresh(false),
    });
  }, [needRefresh, setNeedRefresh, updateServiceWorker]);

  return null;
}

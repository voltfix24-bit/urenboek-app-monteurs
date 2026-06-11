import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Lees + wis de `?focus=<id>` queryparameter zonder andere parameters te raken.
 * Gebruikt `replace: true` zodat de back/forward-knoppen niet door tussenstanden hoeven.
 */
export function useFocusParam(): { focus: string | null; clear: () => void } {
  const [params, setParams] = useSearchParams();
  const focus = params.get("focus");
  const clear = useCallback(() => {
    const next = new URLSearchParams(params);
    if (!next.has("focus")) return;
    next.delete("focus");
    setParams(next, { replace: true });
  }, [params, setParams]);
  return { focus, clear };
}

/**
 * Verwijdert de `focus`-parameter zodra het bijbehorende detailpaneel sluit.
 * Voorkomt dat een achtergebleven parameter het paneel opnieuw opent.
 */
export function useClearFocusOnClose(opened: boolean) {
  const [params, setParams] = useSearchParams();
  const wasOpen = useRef(false);
  useEffect(() => {
    if (opened) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      if (params.get("focus")) {
        const next = new URLSearchParams(params);
        next.delete("focus");
        setParams(next, { replace: true });
      }
    }
  }, [opened, params, setParams]);
}

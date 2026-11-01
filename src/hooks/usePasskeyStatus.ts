import { useEffect, useState } from "react";
import {
  bepaalPasskeyStatus, browserSupportsPasskeys, fetchPasskeysEnabled, isPasskeyOmgeving, type PasskeyStatus,
} from "@/lib/passkeys";

/** Reads the public auth settings once; never opens a WebAuthn ceremony. */
export function usePasskeyStatus(): PasskeyStatus {
  const [settings, setSettings] = useState<{ ok: boolean; enabled: boolean } | null>(null);
  useEffect(() => {
    let actief = true;
    fetchPasskeysEnabled(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY).then(r => {
      if (actief) setSettings(r);
    });
    return () => { actief = false; };
  }, []);
  return bepaalPasskeyStatus(settings, browserSupportsPasskeys(), isPasskeyOmgeving());
}

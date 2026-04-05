import { openDB, DBSchema } from "idb";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OfflineEntry {
  id: string;
  medewerker_id: string;
  datum: string;
  project_id: string;
  beschrijving: string;
  type: string;
  uren: number;
  status: string;
  created_at: string;
}

interface OfflineDB extends DBSchema {
  pending_boekingen: {
    key: string;
    value: OfflineEntry;
  };
}

const DB_NAME = "terrevolt_offline";
const STORE = "pending_boekingen";

function getDB() {
  return openDB<OfflineDB>(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    },
  });
}

export async function queueOfflineEntry(entry: OfflineEntry) {
  const db = await getDB();
  await db.put(STORE, entry);
}

export async function getPendingCount(): Promise<number> {
  const db = await getDB();
  return db.count(STORE);
}

export async function syncOfflineEntries() {
  const db = await getDB();
  const entries = await db.getAll(STORE);
  if (entries.length === 0) return;

  let synced = 0;
  for (const entry of entries) {
    const { id, created_at, ...rest } = entry;
    const { error } = await supabase.from("uren_boekingen").insert(rest);
    if (!error) {
      await db.delete(STORE, id);
      synced++;
    }
  }

  if (synced > 0) {
    toast.success(`${synced} offline boeking${synced > 1 ? "en" : ""} gesynchroniseerd`);
  }
}

// Auto-sync when coming back online
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    syncOfflineEntries();
  });
}

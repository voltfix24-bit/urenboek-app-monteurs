import { openDB, DBSchema } from "idb";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OfflineDB extends DBSchema {
  pending_boekingen: {
    key: string;
    value: {
      id: string;
      medewerker_id: string;
      datum: string;
      project_id: string;
      beschrijving: string;
      type: string;
      uren: number;
      status: string;
      created_at: string;
    };
  };
  planning_cache: {
    key: string;
    value: {
      key: string;
      data: any[];
      cachedAt: number;
    };
  };
  project_cache: {
    key: string;
    value: {
      key: string;
      data: any;
      cachedAt: number;
    };
  };
}

const DB_NAME = "terrevolt_offline";
const DB_VERSION = 2;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getDB() {
  return openDB<OfflineDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("pending_boekingen")) {
        db.createObjectStore("pending_boekingen", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("planning_cache")) {
        db.createObjectStore("planning_cache", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("project_cache")) {
        db.createObjectStore("project_cache", { keyPath: "key" });
      }
    },
  });
}

// ─── OFFLINE BOEKINGEN ────────────────

export async function queueOfflineEntry(
  entry: OfflineDB["pending_boekingen"]["value"]
) {
  const db = await getDB();
  await db.put("pending_boekingen", entry);
}

export async function getPendingCount(): Promise<number> {
  const db = await getDB();
  return db.count("pending_boekingen");
}

export async function syncOfflineEntries() {
  const db = await getDB();
  const entries = await db.getAll("pending_boekingen");
  if (entries.length === 0) return;

  let synced = 0;
  let failed = 0;

  for (const entry of entries) {
    const { id, created_at, ...rest } = entry;
    const { error } = await supabase.from("uren_boekingen").insert(rest);
    if (!error) {
      await db.delete("pending_boekingen", id);
      synced++;
    } else {
      failed++;
      console.error("Sync failed for entry:", id, error);
    }
  }

  if (synced > 0) {
    toast.success(
      `${synced} offline boeking${synced > 1 ? "en" : ""} gesynchroniseerd ✓`
    );
  }
  if (failed > 0) {
    toast.error(
      `${failed} boeking${failed > 1 ? "en" : ""} kon niet worden gesynchroniseerd`
    );
  }
}

// ─── PLANNING CACHE ───────────────────

export async function cachePlanning(
  medewerkerId: string,
  weekStart: string,
  data: any[]
) {
  const db = await getDB();
  await db.put("planning_cache", {
    key: `${medewerkerId}-${weekStart}`,
    data,
    cachedAt: Date.now(),
  });
}

export async function getCachedPlanning(
  medewerkerId: string,
  weekStart: string
): Promise<any[] | null> {
  const db = await getDB();
  const cached = await db.get(
    "planning_cache",
    `${medewerkerId}-${weekStart}`
  );
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > CACHE_TTL) {
    await db.delete("planning_cache", `${medewerkerId}-${weekStart}`);
    return null;
  }
  return cached.data;
}

// ─── PROJECT CACHE ────────────────────

export async function cacheProjecten(data: any[]) {
  const db = await getDB();
  await db.put("project_cache", {
    key: "projecten-lijst",
    data,
    cachedAt: Date.now(),
  });
}

export async function getCachedProjecten(): Promise<any[] | null> {
  const db = await getDB();
  const cached = await db.get("project_cache", "projecten-lijst");
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > CACHE_TTL) return null;
  return cached.data;
}

// ─── AUTO SYNC ────────────────────────
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    syncOfflineEntries();
  });
}

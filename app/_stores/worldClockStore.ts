import { proxy, useSnapshot, type Snapshot } from "valtio";
import { subscribe } from "valtio/vanilla";
import log from "@/lib/logger";
import { WORLD_CLOCK_STORAGE_KEY } from "@/lib/persistKeys";

const STORAGE_KEY = WORLD_CLOCK_STORAGE_KEY;

const worldClockStore = proxy({
  clocks: [] as WorldClockEntry[],
  /**
   * Client-only: subscribe must not write to localStorage until loadFromStorage() finishes —
   * defaults in memory would overwrite the user’s saved data before load completes.
   */
  hydrated: false,
});

export type WorldClockEntry = {
  id: string;
  timeZone: string;
  label: string;
};

/** Persisted payload: ordered list of clocks (same shape as `WorldClockEntry`). */
export type WorldClocksPersistedV1 = WorldClockEntry[];

/** Versioned slice inside the app-wide export JSON (`lib/dataExport.ts`). */
export const WORLD_CLOCK_EXPORT_VERSION = 1 as const;
export type WorldClockExportV1 = {
  version: typeof WORLD_CLOCK_EXPORT_VERSION;
  clocks: WorldClockEntry[];
};

export function useWorldClocks(): readonly Snapshot<WorldClockEntry>[] {
  return useSnapshot(worldClockStore).clocks;
}

export const worldClockActions = {
  init: function init(): () => void {
    loadFromStorage();
    return subscribe(worldClockStore, () => {
      if (!worldClockStore.hydrated) return;
      persistIfChanged();
    });
  },
  addWorldClock: function addWorldClock(timeZone: string, label = ""): void {
    worldClockStore.clocks.push({
      id: crypto.randomUUID(),
      timeZone,
      label,
    });
  },
  removeWorldClock: function removeWorldClock(id: string): void {
    worldClockStore.clocks = worldClockStore.clocks.filter((c) => c.id !== id);
  },

  exportData: function exportData(): WorldClockExportV1 {
    return {
      version: WORLD_CLOCK_EXPORT_VERSION,
      clocks: pickPersistedClocks(),
    };
  },

  /**
   * Accepts this store’s export slice (`{ version, clocks }`) or a legacy bare array (same as `localStorage` payload).
   * Add `version` branches here when the slice shape changes.
   */
  importData: function importData(data: unknown): void {
    const slice = migrateWorldClockSliceToLatest(data);
    worldClockStore.clocks = slice.clocks;
    if (typeof window === "undefined") return;
    lastClocksJson = JSON.stringify(slice.clocks);
    storageSetItem(STORAGE_KEY, lastClocksJson);
  },
};

// --- storage ---

let lastClocksJson = "";

function loadFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        worldClockStore.clocks = parsed.filter(isWorldClockEntry);
      }
    }
  } catch (e: unknown) {
    log.error("worldClock: failed to load clocks from localStorage", e);
  }
  lastClocksJson = JSON.stringify(pickPersistedClocks());
  worldClockStore.hydrated = true;
}

function pickPersistedClocks(): WorldClocksPersistedV1 {
  return worldClockStore.clocks.map((c) => ({
    id: c.id,
    timeZone: c.timeZone,
    label: c.label,
  }));
}

function storageSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e: unknown) {
    log.warn("worldClock: localStorage setItem failed", key, e);
  }
}

function persistIfChanged(): void {
  if (typeof window === "undefined") return;
  const s = JSON.stringify(pickPersistedClocks());
  if (s === lastClocksJson) return;
  lastClocksJson = s;
  storageSetItem(STORAGE_KEY, s);
}

function isWorldClockEntry(x: unknown): x is WorldClockEntry {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.timeZone === "string" &&
    typeof o.label === "string"
  );
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/** Normalize any supported world-clock import slice to {@link WorldClockExportV1} (pure; safe in Jest without `localStorage`). */
export function migrateWorldClockSliceToLatest(data: unknown): WorldClockExportV1 {
  if (Array.isArray(data)) {
    return {
      version: WORLD_CLOCK_EXPORT_VERSION,
      clocks: data.filter(isWorldClockEntry),
    };
  }
  if (!isRecord(data)) {
    throw new Error("worldClock: import slice is not an object or array.");
  }
  const v = data.version;
  if (v === WORLD_CLOCK_EXPORT_VERSION && Array.isArray(data.clocks)) {
    return {
      version: WORLD_CLOCK_EXPORT_VERSION,
      clocks: data.clocks.filter(isWorldClockEntry),
    };
  }
  throw new Error(
    `worldClock: unsupported export slice version ${String(v)}. Update the app or re-export your data.`,
  );
}

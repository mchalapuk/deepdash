import { proxy, useSnapshot, type Snapshot } from "valtio";
import { subscribe } from "valtio/vanilla";
import log from "@/lib/logger";

const STORAGE_KEY = "worktools.worldClocks.v1";

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

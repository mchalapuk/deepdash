import { proxy } from "valtio";
import { subscribe } from "valtio/vanilla";

export type WorldClockEntry = {
  id: string;
  timeZone: string;
  label: string;
};

const STORAGE_KEY = "worktools.worldClocks.v1";

function isWorldClockEntry(x: unknown): x is WorldClockEntry {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.timeZone === "string" &&
    typeof o.label === "string"
  );
}

export const worldClockStore = proxy({
  clocks: [] as WorldClockEntry[],
  /** client-only: true after hydrating from localStorage */
  hydrated: false,
});

export function loadWorldClocksFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        worldClockStore.clocks = parsed.filter(isWorldClockEntry);
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  worldClockStore.hydrated = true;
}

export function persistWorldClocksToStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(worldClockStore.clocks));
  } catch {
    /* quota / private mode */
  }
}

/** Subscribe so every store mutation writes to localStorage immediately (after hydration). */
export function subscribeWorldClockPersistence(): () => void {
  return subscribe(worldClockStore, () => {
    if (!worldClockStore.hydrated) return;
    persistWorldClocksToStorage();
  });
}

export function addWorldClock(timeZone: string, label = ""): void {
  worldClockStore.clocks.push({
    id: crypto.randomUUID(),
    timeZone,
    label,
  });
}

export function removeWorldClock(id: string): void {
  worldClockStore.clocks = worldClockStore.clocks.filter((c) => c.id !== id);
}

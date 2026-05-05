/**
 * IndexedDB storage for pomodoro work log: one object per completed phase block, indexed by calendar `day`
 * (`YYYY-MM-DD`).
 */

import {
  POMODORO_IDB_LEGACY_MIGRATED_KEY,
  POMODORO_LOGS_KEY,
} from "@/lib/persistKeys";
import type { PomodoroPhase } from "@/lib/layout";
import log from "@/lib/logger";

// --- exported constants (importance) ---

export const POMODORO_IDB_NAME = "deepdash.pomodoro.v1";
export const POMODORO_IDB_VERSION = 1;
export const POMODORO_IDB_STORE = "workLogEntries";

/** Index on calendar `day` string. */
export const POMODORO_IDB_INDEX_DAY = "day";

// --- private constants ---

const CALENDAR_DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// --- module state ---

let dbPromise: Promise<IDBDatabase> | null = null;

// --- exported types ---

export type PomodoroPauseSpan = {
  startMs: number;
  endMs: number;
};

/** One persisted row (completed phase block). */
export type PomodoroLogRecord = {
  id: string;
  day: string;
  phase: PomodoroPhase;
  startedAtMs: number;
  endedAtMs: number;
  pauses: PomodoroPauseSpan[];
  /** Soft-delete marker; null means active. */
  deletedAtMs?: number | null;
};

/** JSON export shape: per-day ordered list (no row ids). */
export type PomodoroLoggedPhaseExport = {
  phase: PomodoroPhase;
  startedAtMs: number;
  endedAtMs: number;
  pauses: PomodoroPauseSpan[];
  deletedAtMs: number | null;
};

export type PomodoroDayLogExport = {
  entries: PomodoroLoggedPhaseExport[];
};

export type PomodoroLogsExport = {
  days: Record<string, PomodoroDayLogExport>;
};

export type PomodoroLogWriteBatch = {
  deleteIds?: string[];
  putRecords?: PomodoroLogRecord[];
};

// --- exported functions ---

export async function getSortedPomodoroLogRecordsForDay(day: string): Promise<PomodoroLogRecord[]> {
  const db = await openPomodoroDatabase();
  const tx = db.transaction(POMODORO_IDB_STORE, "readonly");
  const store = tx.objectStore(POMODORO_IDB_STORE);
  const idx = store.index(POMODORO_IDB_INDEX_DAY);
  const rows = await requestToPromise(idx.getAll(day) as IDBRequest<PomodoroLogRecord[]>);
  await txDone(tx);
  rows.sort((a, b) => a.startedAtMs - b.startedAtMs);
  return rows;
}

export async function applyPomodoroLogWrites(batch: PomodoroLogWriteBatch): Promise<void> {
  const deleteIds = batch.deleteIds ?? [];
  const putRecords = batch.putRecords ?? [];
  if (deleteIds.length === 0 && putRecords.length === 0) return;
  const db = await openPomodoroDatabase();
  const tx = db.transaction(POMODORO_IDB_STORE, "readwrite");
  const store = tx.objectStore(POMODORO_IDB_STORE);
  for (const delId of deleteIds) {
    store.delete(delId);
  }
  for (const rec of putRecords) {
    store.put(rec);
  }
  await txDone(tx);
}

/**
 * Reads every log row and groups into the JSON export shape (entries sorted by `startedAtMs` per day).
 */
export async function collectPomodoroLogsForExport(): Promise<PomodoroLogsExport> {
  const db = await openPomodoroDatabase();
  const tx = db.transaction(POMODORO_IDB_STORE, "readonly");
  const store = tx.objectStore(POMODORO_IDB_STORE);
  const all = await requestToPromise(store.getAll() as IDBRequest<PomodoroLogRecord[]>);
  await txDone(tx);

  const byDay: Record<string, PomodoroLogRecord[]> = {};
  for (const r of all) {
    if (!CALENDAR_DAY_KEY_RE.test(r.day)) continue;
    (byDay[r.day] ??= []).push(r);
  }

  const days: Record<string, PomodoroDayLogExport> = {};
  for (const [day, rows] of Object.entries(byDay)) {
    rows.sort((a, b) => a.startedAtMs - b.startedAtMs);
    days[day] = {
      entries: rows.map((r) => ({
        phase: r.phase,
        startedAtMs: r.startedAtMs,
        endedAtMs: r.endedAtMs,
        pauses: r.pauses.map((p) => ({ startMs: p.startMs, endMs: p.endMs })),
        deletedAtMs: typeof r.deletedAtMs === "number" ? r.deletedAtMs : null,
      })),
    };
  }
  return { days };
}

/** Replaces all log rows (JSON import path). */
export async function replaceAllPomodoroLogsFromImport(logs: PomodoroLogsExport): Promise<void> {
  const db = await openPomodoroDatabase();
  const tx = db.transaction(POMODORO_IDB_STORE, "readwrite");
  const store = tx.objectStore(POMODORO_IDB_STORE);
  store.clear();
  for (const [day, doc] of Object.entries(logs.days)) {
    if (!CALENDAR_DAY_KEY_RE.test(day)) continue;
    for (const e of doc.entries) {
      store.put({
        id: crypto.randomUUID(),
        day,
        phase: e.phase,
        startedAtMs: e.startedAtMs,
        endedAtMs: e.endedAtMs,
        pauses: e.pauses.map((p) => ({ startMs: p.startMs, endMs: p.endMs })),
        deletedAtMs: typeof e.deletedAtMs === "number" ? e.deletedAtMs : null,
      });
    }
  }
  await txDone(tx);
}

/**
 * One-time migration: legacy `{ days: … }` JSON in `localStorage` → IndexedDB rows, then removes
 * the legacy key.
 */
export async function migrateLegacyPomodoroLocalStorageToIndexedDb(): Promise<void> {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  if (localStorage.getItem(POMODORO_IDB_LEGACY_MIGRATED_KEY) === "1") return;

  let raw: string | null;
  try {
    raw = localStorage.getItem(POMODORO_LOGS_KEY);
  } catch {
    raw = null;
  }

  const db = await openPomodoroDatabase();
  const tx = db.transaction(POMODORO_IDB_STORE, "readwrite");
  const store = tx.objectStore(POMODORO_IDB_STORE);

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        const daysRaw = (parsed as Record<string, unknown>).days;
        if (daysRaw && typeof daysRaw === "object") {
          for (const [day, logVal] of Object.entries(daysRaw)) {
            if (!CALENDAR_DAY_KEY_RE.test(day)) continue;
            if (!logVal || typeof logVal !== "object") continue;
            const entries = (logVal as Record<string, unknown>).entries;
            if (!Array.isArray(entries)) continue;
            for (const e of entries) {
              const rec = parseLegacyExportEntry(e);
              if (!rec) continue;
              store.put({
                id: crypto.randomUUID(),
                day,
                phase: rec.phase,
                startedAtMs: rec.startedAtMs,
                endedAtMs: rec.endedAtMs,
                pauses: rec.pauses,
                deletedAtMs: null,
              });
            }
          }
        }
      }
    } catch (e: unknown) {
      log.warn("pomodoro idb migration: parse legacy logs failed", e);
    }
  }

  await txDone(tx);

  try {
    localStorage.removeItem(POMODORO_LOGS_KEY);
  } catch (e: unknown) {
    log.warn("pomodoro idb migration: remove legacy logs key failed", e);
  }

  try {
    localStorage.setItem(POMODORO_IDB_LEGACY_MIGRATED_KEY, "1");
  } catch {
    /* best effort */
  }
}

/** Clears the open handle and deletes the database (tests only). */
export async function __resetPomodoroDatabaseForTests(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch {
      /* ignore */
    }
  }
  dbPromise = null;
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(POMODORO_IDB_NAME);
    req.onsuccess = (): void => resolve();
    req.onerror = (): void => reject(req.error ?? new Error("IndexedDB deleteDatabase failed"));
  });
}

// --- private functions ---

function openPomodoroDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available."));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(POMODORO_IDB_NAME, POMODORO_IDB_VERSION);
      req.onupgradeneeded = (): void => {
        const db = req.result;
        if (!db.objectStoreNames.contains(POMODORO_IDB_STORE)) {
          const store = db.createObjectStore(POMODORO_IDB_STORE, { keyPath: "id" });
          store.createIndex(POMODORO_IDB_INDEX_DAY, "day", { unique: false });
        }
      };
      req.onsuccess = (): void => resolve(req.result);
      req.onerror = (): void => {
        dbPromise = null;
        reject(req.error ?? new Error("IndexedDB open failed"));
      };
    });
  }
  return dbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = (): void => resolve();
    tx.onerror = (): void => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = (): void => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function isPomodoroPhase(x: unknown): x is PomodoroPhase {
  return x === "work" || x === "shortBreak" || x === "longBreak";
}

function parseLegacyExportEntry(x: unknown): Omit<PomodoroLogRecord, "id" | "day"> | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!isPomodoroPhase(o.phase)) return null;
  if (typeof o.startedAtMs !== "number" || typeof o.endedAtMs !== "number") return null;
  if (!Array.isArray(o.pauses)) return null;
  const pauses: PomodoroPauseSpan[] = [];
  for (const p of o.pauses) {
    if (!p || typeof p !== "object") return null;
    const q = p as Record<string, unknown>;
    if (typeof q.startMs !== "number" || typeof q.endMs !== "number") return null;
    pauses.push({ startMs: q.startMs, endMs: q.endMs });
  }
  return {
    phase: o.phase,
    startedAtMs: o.startedAtMs,
    endedAtMs: o.endedAtMs,
    pauses,
  };
}

import { useLayoutEffect, useState } from "react";
import { proxy, useSnapshot, type Snapshot } from "valtio";
import { subscribe } from "valtio/vanilla";
import type { PomodoroPhase } from "@/lib/layout";
import log from "@/lib/logger";
import {
  migrateLegacyPersistKeysOnce,
  POMODORO_ACTIVE_SESSION_KEY,
  POMODORO_CONFIG_KEY,
} from "@/lib/persistKeys";
import {
  applyPomodoroLogWrites,
  collectPomodoroLogsForExport,
  getSortedPomodoroLogRecordsForDay,
  migrateLegacyPomodoroLocalStorageToIndexedDb,
  replaceAllPomodoroLogsFromImport,
  type PomodoroLogRecord,
  type PomodoroLogsExport,
} from "@/lib/pomodoroIndexedDb";

export type { PomodoroPhase };

const CONFIG_KEY = POMODORO_CONFIG_KEY;
const ACTIVE_SESSION_KEY = POMODORO_ACTIVE_SESSION_KEY;

/** Chains IndexedDB writes so `flushPomodoroPersistToStorage` can await completion. */
let persistTail: Promise<void> = Promise.resolve();

/** Latest `loadFromStorageAsync` invocation (for tests). */
let lastPomodoroLoadPromise: Promise<void> = Promise.resolve();

const DEFAULT_WORK_MS = 25 * 60 * 1000;
const DEFAULT_SHORT_MS = 5 * 60 * 1000;
const DEFAULT_LONG_MS = 15 * 60 * 1000;

/** After this many completed work blocks on the same calendar day, the next break is long. */
const WORK_BLOCKS_BEFORE_LONG_BREAK = 4;

const MIN_PHASE_MINUTES = 1;
const MAX_WORK_MINUTES = 120;
const MAX_BREAK_MINUTES = 60;

const POMODORO_TIMER_INTERVAL_MS = 100;

/** Flip digit animation lags real time; display leads by this much so flips line up with wall seconds. */
const FLIP_DISPLAY_LEAD_MS = 300;

/** Same cadence as {@link todoStore} day rollover checks. */
const DAY_CHECK_INTERVAL_MS = 1000;

/** JSON export slice / migration version. */
export const POMODORO_EXPORT_VERSION = 1 as const;

/** localStorage active-session file format version. */
export const POMODORO_ACTIVE_SESSION_FILE_VERSION = 1 as const;

const pomodoroStore = proxy({
  phase: "work" as PomodoroPhase,
  config: {
    workDurationMs: DEFAULT_WORK_MS,
    shortBreakDurationMs: DEFAULT_SHORT_MS,
    longBreakDurationMs: DEFAULT_LONG_MS,
  },
  /**
   * When false, subscribe must not write to localStorage: defaults are still in memory and would
   * overwrite the user’s saved config/logs before loadFromStorage() finishes.
   */
  hydrated: false,
  /**
   * Local calendar-day key for {@link dayLog} (same idea as `todoStore.dayKey`). Other days stay
   * in IndexedDB only until/unless they become “today”.
   */
  dayKey: "" as string,
  /**
   * Completed phase blocks for {@link dayKey} only. Each entry has an IndexedDB row id.
   */
  dayLog: { entries: [] } as PomodoroDayLogStored,
  /**
   * In-memory phase run after Start: logs pauses and supplies countdown via intendedDurationMs +
   * phaseStartedAtMs + pauses. Idle (no run) uses config durations for display.
   */
  activePhaseRun: null as ActivePhaseRun | null,
});

/** Persisted: phase length settings only */
export type PomodoroConfigV1 = {
  workDurationMs: number;
  shortBreakDurationMs: number;
  longBreakDurationMs: number;
};

/** One pause interval inside a phase run */
export type PomodoroPauseSpan = {
  startMs: number;
  endMs: number;
};

/** One completed pomodoro or break block for a calendar day */
export type PomodoroLoggedPhase = {
  phase: PomodoroPhase;
  startedAtMs: number;
  endedAtMs: number;
  pauses: PomodoroPauseSpan[];
  /** Soft-delete marker; null means visible/active. */
  deletedAtMs: number | null;
};

/** JSON / export: ordered history for a single local day (no per-entry ids). */
export type PomodoroDayLogV1 = {
  entries: PomodoroLoggedPhase[];
};

/** In-memory day bucket: each completed block is addressable by {@link id} in IndexedDB. */
export type PomodoroLogEntryStored = PomodoroLoggedPhase & { id: string };

export type PomodoroDayLogStored = {
  entries: PomodoroLogEntryStored[];
};

/** Persisted: map of YYYY-MM-DD → day log */
export type PomodoroLogsV1 = {
  days: Record<string, PomodoroDayLogV1>;
};

export type PomodoroExportV1 = {
  version: typeof POMODORO_EXPORT_VERSION;
  config: PomodoroConfigV1;
  logs: PomodoroLogsV1;
};

export type ActivePhaseRun = {
  phase: PomodoroPhase;
  /** Wall time when the user started this phase run (Start). */
  phaseStartedAtMs: number;
  /** Countdown length for this run; fixed when the run is created. */
  readonly intendedDurationMs: number;
  pauses: PomodoroPauseSpan[];
  openPauseStartMs: number | null;
  /** After the wall-clock deadline passes, `init`’s `onPhaseDeadlineCrossed` runs once per run. */
  deadlineCrossedNotified: boolean;
  /**
   * True when this run continues an in-flight phase that was split at local midnight. UI may skip
   * “brand new run” cues.
   */
  midnightSplitContinuation?: boolean;
};

/** localStorage snapshot for the active-session key (in-flight session only). */
export type PomodoroActiveSessionFileV1 = {
  version: typeof POMODORO_ACTIVE_SESSION_FILE_VERSION;
  phase: PomodoroPhase;
  activePhaseRun: ActivePhaseRun;
};

export type DurationSlice = {
  workDurationMs: number;
  shortBreakDurationMs: number;
  longBreakDurationMs: number;
};

export function localDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function useCurrentPhase(): PomodoroPhase {
  return useSnapshot(pomodoroStore).phase;
}

export function usePhaseDurationMs(phase: PomodoroPhase): number {
  return durationForPhase(phase, useSnapshot(pomodoroStore).config);
}

export function useIsRunning(): boolean {
  return isRunning(useSnapshot(pomodoroStore).activePhaseRun);
}

export function useIsPaused(): boolean {
  return isPaused(useSnapshot(pomodoroStore).activePhaseRun);
}

export function useCurrentPhaseExpired(): boolean {
  const snap = useSnapshot(pomodoroStore);
  const needsWallClock = phaseRunNeedsWallClock(snap.activePhaseRun);
  const nowMs = useWallNowMs(needsWallClock);
  const r = snap.activePhaseRun;
  if (r?.openPauseStartMs != null) {
    return remainingCountdownMs(r, r.openPauseStartMs) <= 0;
  }
  return nowMs >= flipClockEndsAtMsAt(snap, nowMs);
}

/** Seconds until the deadline; negative after the wall-clock deadline while the phase stays active. */
export function useSecondsRemaining(): number {
  const snap = useSnapshot(pomodoroStore);
  const needsWallClock = phaseRunNeedsWallClock(snap.activePhaseRun);
  const nowMs = useWallNowMs(needsWallClock);
  const r = snap.activePhaseRun;
  if (r?.openPauseStartMs != null) {
    return Math.ceil(remainingCountdownMs(r, r.openPauseStartMs) / 1000);
  }
  const endsAt = flipClockEndsAtMsAt(snap, nowMs);
  return Math.ceil((endsAt - nowMs) / 1000);
}

/**
 * Same source as {@link useSecondsRemaining}: wall clock while running, frozen remaining while
 * paused. When running, flips lead by ~{@link FLIP_DISPLAY_LEAD_MS} so the animation finishes
 * closer to the real second boundary.
 */
export function useFlipSecondsRemaining(): number {
  const snap = useSnapshot(pomodoroStore);
  const needsWallClock = phaseRunNeedsWallClock(snap.activePhaseRun);
  const nowMs = useWallNowMs(needsWallClock);
  const r = snap.activePhaseRun;
  if (r?.openPauseStartMs != null) {
    const remMs = remainingCountdownMs(r, r.openPauseStartMs);
    return Math.ceil((remMs - FLIP_DISPLAY_LEAD_MS) / 1000);
  }
  const endsAt = flipClockEndsAtMsAt(snap, nowMs);
  const remMs = endsAt - nowMs;
  return Math.ceil((remMs - FLIP_DISPLAY_LEAD_MS) / 1000);
}

/** Wall-clock start of the active run; null when idle. Used to key one-shot cues (e.g. intro chime) per run. */
export function useActivePhaseRunStartedAt(): number | null {
  return useSnapshot(pomodoroStore).activePhaseRun?.phaseStartedAtMs ?? null;
}

/** True after the countdown hits zero until `nextPhase` / skip / tab change clears the run. */
export function useActivePhaseDeadlineCrossed(): boolean {
  return useSnapshot(pomodoroStore).activePhaseRun?.deadlineCrossedNotified ?? false;
}

/** True when the active run is the post-midnight segment of a calendar-day split. */
export function useActivePhaseMidnightContinuation(): boolean {
  return useSnapshot(pomodoroStore).activePhaseRun?.midnightSplitContinuation === true;
}

type PomodoroSnap = {
  phase: PomodoroPhase;
  config: DurationSlice | Snapshot<DurationSlice>;
  activePhaseRun: ActivePhaseRun | Snapshot<ActivePhaseRun> | null;
};

/** Same as {@link flipClockEndsAtMs} but uses a fixed `nowMs` so hooks can stay render-pure. */
function flipClockEndsAtMsAt(snap: PomodoroSnap, nowMs: number): number {
  const r = snap.activePhaseRun;
  if (!r) {
    return nowMs + durationForPhase(snap.phase, snap.config);
  }
  if (r.openPauseStartMs != null) {
    const anchor = r.openPauseStartMs;
    return anchor + remainingCountdownMs(r, anchor);
  }
  return runEndWallMs(r);
}

export function useTodayWorkMsDisplay(): number {
  const snap = useSnapshot(pomodoroStore);
  let sum = 0;
  for (const e of snap.dayLog.entries) {
    sum += workMsFromEntry(e);
  }
  const r = pomodoroStore.activePhaseRun;
  if (r?.phase === "work") {
    sum += workMsFromActiveRun(r);
  }
  return sum;
}

/**
 * Loaded work-log bucket (see {@link pomodoroStore.dayKey}) plus the active phase run, for session
 * summaries. If the calendar day rolled over and sync has not run yet, entries may still be the
 * previous day’s — avoids an empty flash until {@link syncPomodoroCalendarDayIfNeededAsync} runs.
 * Single snapshot subscription — prefer this over reading the store proxy from components.
 */
export function useTodayPomodoroDaySlice(): {
  todayEntries: Snapshot<PomodoroDayLogStored>["entries"];
  activePhaseRun: Snapshot<ActivePhaseRun> | null;
} {
  const snap = useSnapshot(pomodoroStore);
  return {
    todayEntries: snap.dayLog.entries,
    activePhaseRun: snap.activePhaseRun,
  };
}

export function usePomodoroHydrated(): boolean {
  return useSnapshot(pomodoroStore).hydrated;
}

export type PomodoroInitOptions = {
  /** Called once per run when the wall-clock deadline is crossed (phase stays active until `nextPhase`). */
  onPhaseDeadlineCrossed?: (completedPhase: PomodoroPhase) => void;
};

export const pomodoroActions = {
  init: function init(options?: PomodoroInitOptions): () => void {
    lastPomodoroLoadPromise = loadFromStorageAsync();
    void lastPomodoroLoadPromise;

    const unsubPersist = subscribe(pomodoroStore, () => {
      if (!pomodoroStore.hydrated) return;
      persistConfigIfChanged();
      persistActiveSessionIfChanged();
    });

    /** Pause if counting down, then persist active session synchronously (best-effort before teardown). */
    const flushLeavePage = (): void => {
      pauseActiveSessionForUnload();
      writeActiveSessionFileToLocalStorage();
      void flushPomodoroPersistToStorage();
    };

    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") {
        writeActiveSessionFileToLocalStorage();
        void flushPomodoroPersistToStorage();
      } else {
        void syncPomodoroCalendarDayIfNeededAsync();
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", flushLeavePage);
      window.addEventListener("pagehide", flushLeavePage);
      document.addEventListener("visibilitychange", onVisibility);
    }

    const dayTimer =
      typeof window !== "undefined"
        ? window.setInterval(() => {
            void syncPomodoroCalendarDayIfNeededAsync();
          }, DAY_CHECK_INTERVAL_MS)
        : null;

    const stopEngine =
      typeof window !== "undefined"
        ? startPomodoroTimerEngine(options?.onPhaseDeadlineCrossed)
        : () => {};

    return () => {
      stopEngine();
      unsubPersist();
      if (typeof window !== "undefined") {
        window.removeEventListener("beforeunload", flushLeavePage);
        window.removeEventListener("pagehide", flushLeavePage);
        document.removeEventListener("visibilitychange", onVisibility);
      }
      if (dayTimer != null) window.clearInterval(dayTimer);
      flushLeavePage();
    };
  },
  selectPhase: function selectPhase(next: PomodoroPhase): void {
    if (pomodoroStore.activePhaseRun) {
      finalizeActivePhase();
    }
    pomodoroStore.activePhaseRun = null;
    pomodoroStore.phase = next;
  },
  startOrResume: function startOrResume(): void {
    if (isRunning(pomodoroStore.activePhaseRun)) return;

    if (isPaused(pomodoroStore.activePhaseRun)) {
      const r = pomodoroStore.activePhaseRun;
      if (r?.openPauseStartMs != null) {
        r.pauses.push({
          startMs: r.openPauseStartMs,
          endMs: Date.now(),
        });
        r.openPauseStartMs = null;
      }
      return;
    }

    beginRunningPhaseFromConfig();
  },
  pause: function pause(): void {
    if (!isRunning(pomodoroStore.activePhaseRun)) return;
    const r = pomodoroStore.activePhaseRun;
    if (r && r.openPauseStartMs === null) {
      r.openPauseStartMs = Date.now();
    }
  },
  stopAndReset: function stopAndReset(): void {
    pomodoroStore.activePhaseRun = null;
  },
  stepPhaseDurationMinutes: function stepPhaseDurationMinutes(delta: 1 | -1): void {
    const p = pomodoroStore.phase;

    const curMin = Math.round(durationForPhase(p, pomodoroStore.config) / 60000);
    const maxM = p === "work" ? MAX_WORK_MINUTES : MAX_BREAK_MINUTES;
    const nextMin = Math.min(maxM, Math.max(MIN_PHASE_MINUTES, curMin + delta));
    const mss = nextMin * 60000;

    if (pomodoroStore.activePhaseRun?.phase === p) {
      finalizeActivePhase();
    }

    switch (p) {
      case "work":
        pomodoroStore.config.workDurationMs = clampPositiveMs(mss, DEFAULT_WORK_MS);
        break;
      case "shortBreak":
        pomodoroStore.config.shortBreakDurationMs = clampPositiveMs(mss, DEFAULT_SHORT_MS);
        break;
      case "longBreak":
        pomodoroStore.config.longBreakDurationMs = clampPositiveMs(mss, DEFAULT_LONG_MS);
        break;
    }
  },
  nextPhase: function nextPhase(): void {
    const current = pomodoroStore.phase;
    finalizeActivePhase();

    void persistTail.then(() => {
      const day = localDayKey();
      const next = current === "work" ? nextBreakType(day) : "work"; // always go to work after a break
      applyPhaseWithFullDuration(next);
      beginRunningPhaseFromConfig();
    });
  },
  deleteTodayLogEntry: function deleteTodayLogEntry(entryId: string): void {
    if (!entryId) return;
    const entry = pomodoroStore.dayLog.entries.find((item) => item.id === entryId);
    if (!entry || entry.deletedAtMs != null) return;
    entry.deletedAtMs = Date.now();
    enqueuePomodoroLogPersistSingle(entryId, pomodoroStore.dayKey, entry);
  },

  exportData: async function exportData(): Promise<PomodoroExportV1> {
    await flushPomodoroPersistToStorage();
    const logs = await collectPomodoroLogsForExport();
    return {
      version: POMODORO_EXPORT_VERSION,
      config: pickPersistedConfig(),
      logs: { days: logs.days },
    };
  },

  /**
   * Accepts `{ version, config, logs }` or a legacy `{ config, logs }` object (no `version` field).
   */
  importData: async function importData(data: unknown): Promise<void> {
    const slice = migratePomodoroSliceToLatest(data);
    pomodoroStore.config.workDurationMs = slice.config.workDurationMs;
    pomodoroStore.config.shortBreakDurationMs = slice.config.shortBreakDurationMs;
    pomodoroStore.config.longBreakDurationMs = slice.config.longBreakDurationMs;
    pomodoroStore.activePhaseRun = null;
    if (typeof window === "undefined") return;
    clearActiveSessionStorage();
    lastConfigJson = JSON.stringify(slice.config);
    storageSetItemStrict(CONFIG_KEY, lastConfigJson);
    const logsExport: PomodoroLogsExport = {
      days: {},
    };
    for (const [day, log] of Object.entries(slice.logs.days)) {
      logsExport.days[day] = { entries: [...log.entries] };
    }
    await flushPomodoroPersistToStorage();
    await replaceAllPomodoroLogsFromImport(logsExport);
    await hydrateTodayLogFromIndexedDb();
  },
};

function startPomodoroTimerEngine(
  onPhaseDeadlineCrossed?: (completedPhase: PomodoroPhase) => void,
): () => void {
  const id = window.setInterval(() => {
    const nowMs = Date.now();
    maybeSplitActivePhaseAtLocalMidnight(nowMs);

    const r = pomodoroStore.activePhaseRun;
    const running = isRunning(r);

    if (running && r && nowMs >= flipClockEndsAtMs(pomodoroStore)) {
      if (!r.deadlineCrossedNotified) {
        r.deadlineCrossedNotified = true;
        onPhaseDeadlineCrossed?.(pomodoroStore.phase);
      }
    }
  }, POMODORO_TIMER_INTERVAL_MS);

  return () => window.clearInterval(id);
}

/** Countdown is actively ticking (run exists and not in a pause). */
function isRunning(activePhase: Snapshot<ActivePhaseRun> | null): boolean {
  return activePhase != null && activePhase.openPauseStartMs === null;
}

/** Countdown frozen mid-phase (Resume vs Start in the UI). */
function isPaused(activePhase: Snapshot<ActivePhaseRun> | null): boolean {
  return activePhase != null && activePhase.openPauseStartMs != null;
}

/** Wall time when the current countdown reaches zero: running → run end; paused → frozen at pause; idle → now + phase duration. */
function flipClockEndsAtMs(snap: PomodoroSnap): number {
  return flipClockEndsAtMsAt(snap, Date.now());
}

function phaseRunNeedsWallClock(
  run: ActivePhaseRun | Snapshot<ActivePhaseRun> | null,
): boolean {
  return run != null && run.openPauseStartMs === null;
}

/** Advances while a phase run is actively counting down (not idle, not paused). */
function useWallNowMs(needsWallClock: boolean): number {
  const [nowMs, setNowMs] = useState(0);
  useLayoutEffect(() => {
    /* Wall clock for countdown math; must not use Date.now() during render (react-hooks/purity). */
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync `nowMs` when subscription mode changes
    setNowMs(Date.now());
    if (!needsWallClock) return;
    const id = window.setInterval(
      () => setNowMs(Date.now()),
      POMODORO_TIMER_INTERVAL_MS,
    );
    return () => window.clearInterval(id);
  }, [needsWallClock]);
  return nowMs;
}

function logRecordToStored(r: PomodoroLogRecord): PomodoroLogEntryStored {
  return {
    id: r.id,
    phase: r.phase,
    startedAtMs: r.startedAtMs,
    endedAtMs: r.endedAtMs,
    pauses: r.pauses.map((p) => ({ startMs: p.startMs, endMs: p.endMs })),
    deletedAtMs: typeof r.deletedAtMs === "number" ? r.deletedAtMs : null,
  };
}

function finalizeActivePhase(): boolean {
  return finalizeActivePhaseWithEndedAt(Date.now());
}

/**
 * Completes the active phase as of `endedAtMs` (wall clock), appends a day-log entry, clears
 * `activePhaseRun`. When `pausesForEntry` is set, it must already include any synthetic close for an
 * open pause (midnight split supplies fully-built pause lists).
 */
function finalizeActivePhaseWithEndedAt(
  endedAtMs: number,
  opts?: { pausesForEntry?: PomodoroPauseSpan[] },
): boolean {
  const r = pomodoroStore.activePhaseRun;
  if (!r) return false;

  const day = localDayKey(new Date(endedAtMs));
  const pauses =
    opts?.pausesForEntry ??
    (() => {
      const out = [...r.pauses];
      if (r.openPauseStartMs != null) {
        out.push({ startMs: r.openPauseStartMs, endMs: endedAtMs });
      }
      return out;
    })();

  const id = crypto.randomUUID();
  const entry: PomodoroLogEntryStored = {
    id,
    phase: r.phase,
    startedAtMs: r.phaseStartedAtMs,
    endedAtMs,
    pauses,
    deletedAtMs: null,
  };
  pomodoroStore.activePhaseRun = null;

  if (day === pomodoroStore.dayKey) {
    pomodoroStore.dayLog.entries.push(entry);
    enqueuePomodoroLogPersistSingle(id, day, entry);
  } else {
    persistTail = persistTail
      .then(async () => {
        const rows = await getSortedPomodoroLogRecordsForDay(day);
        pomodoroStore.dayKey = day;
        pomodoroStore.dayLog = {
          entries: [...rows.map(logRecordToStored), entry],
        };
        await applyPomodoroLogWrites({
          putRecords: [
            {
              id,
              day,
              phase: entry.phase,
              startedAtMs: entry.startedAtMs,
              endedAtMs: entry.endedAtMs,
              pauses: entry.pauses.map((p) => ({ startMs: p.startMs, endMs: p.endMs })),
              deletedAtMs: entry.deletedAtMs,
            },
          ],
        });
      })
      .catch((err: unknown) => {
        log.warn("pomodoro: IndexedDB persist failed", err);
      });
  }
  return true;
}

function enqueuePomodoroLogPersistSingle(
  id: string,
  day: string,
  e: PomodoroLogEntryStored,
): void {
  persistTail = persistTail
    .then(() =>
      applyPomodoroLogWrites({
        putRecords: [
          {
            id,
            day,
            phase: e.phase,
            startedAtMs: e.startedAtMs,
            endedAtMs: e.endedAtMs,
            pauses: e.pauses.map((p) => ({ startMs: p.startMs, endMs: p.endMs })),
            deletedAtMs: e.deletedAtMs,
          },
        ],
      }),
    )
    .catch((err: unknown) => {
      log.warn("pomodoro: IndexedDB persist failed", err);
    });
}

async function hydrateTodayLogFromIndexedDb(): Promise<void> {
  const today = localDayKey();
  const rows = await getSortedPomodoroLogRecordsForDay(today);
  pomodoroStore.dayKey = today;
  pomodoroStore.dayLog = {
    entries: rows.map(logRecordToStored),
  };
}

async function syncPomodoroCalendarDayIfNeededAsync(): Promise<void> {
  if (!pomodoroStore.hydrated) return;
  const today = localDayKey();
  if (pomodoroStore.dayKey === today) return;
  await flushPomodoroPersistToStorage();
  try {
    await hydrateTodayLogFromIndexedDb();
  } catch (e: unknown) {
    log.error("pomodoro: calendar day sync failed", e);
  }
}

function applyPhaseWithFullDuration(next: PomodoroPhase): void {
  pomodoroStore.phase = next;
  pomodoroStore.activePhaseRun = null;
}

/** Starts a running countdown for the current phase (idle Start, or after `pomodoroActions.nextPhase`). */
function beginRunningPhaseFromConfig(): void {
  const intended = durationForPhase(pomodoroStore.phase, pomodoroStore.config);
  pomodoroStore.activePhaseRun = {
    phase: pomodoroStore.phase,
    phaseStartedAtMs: Date.now(),
    intendedDurationMs: intended,
    pauses: [],
    openPauseStartMs: null,
    deadlineCrossedNotified: false,
  };
}

/** After a work entry was just appended for `day`, choose short vs long break. */
function nextBreakType(day: string): PomodoroPhase {
  const n = countPomodoroSessions(day);
  if (n > 0 && n % WORK_BLOCKS_BEFORE_LONG_BREAK === 0) {
    return "longBreak";
  }
  return "shortBreak";
}

function countPomodoroSessions(day: string): number {
  if (day !== pomodoroStore.dayKey) return 0;
  return pomodoroStore.dayLog.entries.filter((e) => e.phase === "work" && e.deletedAtMs == null).length;
}

// --- time-related helpers ---

function durationForPhase(phase: PomodoroPhase, s: Snapshot<DurationSlice>): number {
  if (phase === "work") return s.workDurationMs;
  if (phase === "shortBreak") return s.shortBreakDurationMs;
  return s.longBreakDurationMs;
}

function closedPauseWallMs(r: Snapshot<ActivePhaseRun>): number {
  return r.pauses.reduce((s, p) => s + (p.endMs - p.startMs), 0);
}

/** Time elapsed on the countdown (excludes pause wall time). */
function elapsedCountdownMs(r: Snapshot<ActivePhaseRun>, now: number): number {
  const pauseWall =
    closedPauseWallMs(r) +
    (r.openPauseStartMs != null ? now - r.openPauseStartMs : 0);
  return Math.max(0, now - r.phaseStartedAtMs - pauseWall);
}

function remainingCountdownMs(r: Snapshot<ActivePhaseRun>, now: number): number {
  return Math.max(0, r.intendedDurationMs - elapsedCountdownMs(r, now));
}

/** Wall-clock instant when the countdown hits zero while running (no open pause). */
function runEndWallMs(r: Snapshot<ActivePhaseRun>): number {
  return r.phaseStartedAtMs + r.intendedDurationMs + closedPauseWallMs(r);
}

/** Last local wall-clock millisecond of the calendar day containing `forWallMs` (23:59:59.999). */
function endOfLocalDayMs(forWallMs: number): number {
  const d = new Date(forWallMs);
  const nextMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
  return nextMidnight.getTime() - 1;
}

function startOfNextLocalDayMs(forWallMs: number): number {
  return endOfLocalDayMs(forWallMs) + 1;
}

function buildFirstSegmentPausesForMidnightSplit(r: ActivePhaseRun, endedAtMs: number): PomodoroPauseSpan[] {
  const phaseStart = r.phaseStartedAtMs;
  const first: PomodoroPauseSpan[] = [];

  for (const p of r.pauses) {
    const fs = Math.max(p.startMs, phaseStart);
    const fe = Math.min(p.endMs, endedAtMs);
    if (fe > fs) first.push({ startMs: fs, endMs: fe });
  }

  if (r.openPauseStartMs != null) {
    const o = r.openPauseStartMs;
    const fs = Math.max(o, phaseStart);
    const fe = endedAtMs;
    if (fe > fs) first.push({ startMs: fs, endMs: fe });
  }

  return first;
}

function buildContinuationPausesForMidnightSplit(r: ActivePhaseRun, startNextMs: number): PomodoroPauseSpan[] {
  const cont: PomodoroPauseSpan[] = [];
  for (const p of r.pauses) {
    const cs = Math.max(p.startMs, startNextMs);
    const ce = p.endMs;
    if (ce > cs) cont.push({ startMs: cs, endMs: ce });
  }
  return cont;
}

/**
 * If the active phase started on a prior local calendar day, close that segment at 23:59:59.999 and
 * continue with a new run beginning at 00:00:00.000 whose intended length preserves the original
 * deadline.
 */
function maybeSplitActivePhaseAtLocalMidnight(nowMs: number): void {
  if (!pomodoroStore.hydrated) return;
  const r = pomodoroStore.activePhaseRun;
  if (!r || r.deadlineCrossedNotified) return;

  const runStartDay = localDayKey(new Date(r.phaseStartedAtMs));
  const nowDay = localDayKey(new Date(nowMs));
  if (runStartDay >= nowDay) return;

  const deadline = flipClockEndsAtMsAt(pomodoroStore, nowMs);
  const endedAtMs = endOfLocalDayMs(r.phaseStartedAtMs);
  const startNextMs = startOfNextLocalDayMs(r.phaseStartedAtMs);
  const firstPauses = buildFirstSegmentPausesForMidnightSplit(r, endedAtMs);
  const contPauses = buildContinuationPausesForMidnightSplit(r, startNextMs);
  const wasPaused = r.openPauseStartMs != null;
  const phase = r.phase;

  finalizeActivePhaseWithEndedAt(endedAtMs, { pausesForEntry: firstPauses });

  const remainingMs = Math.max(0, Math.round(deadline - startNextMs));

  pomodoroStore.activePhaseRun = {
    phase,
    phaseStartedAtMs: startNextMs,
    intendedDurationMs: remainingMs,
    pauses: contPauses,
    openPauseStartMs: wasPaused ? startNextMs : null,
    deadlineCrossedNotified: false,
    midnightSplitContinuation: true,
  };
}

function workMsFromEntry(e: Snapshot<PomodoroLoggedPhase>): number {
  if (e.phase !== "work" || e.deletedAtMs != null) return 0;
  const gross = e.endedAtMs - e.startedAtMs;
  const paused = e.pauses.reduce((s, p) => s + (p.endMs - p.startMs), 0);
  return Math.max(0, gross - paused);
}

function workMsFromActiveRun(r: ActivePhaseRun): number {
  if (r.phase !== "work") return 0;
  const now = Date.now();
  const gross = now - r.phaseStartedAtMs;
  let paused = r.pauses.reduce((s, p) => s + (p.endMs - p.startMs), 0);
  if (r.openPauseStartMs != null) {
    paused += now - r.openPauseStartMs;
  }
  return Math.max(0, gross - paused);
}

// --- storage ---

let lastConfigJson = "";
let lastActiveJson = "";

function cloneActivePhaseRunForPersist(r: ActivePhaseRun): ActivePhaseRun {
  const out: ActivePhaseRun = {
    phase: r.phase,
    phaseStartedAtMs: r.phaseStartedAtMs,
    intendedDurationMs: r.intendedDurationMs,
    pauses: r.pauses.map((p) => ({ startMs: p.startMs, endMs: p.endMs })),
    openPauseStartMs: r.openPauseStartMs,
    deadlineCrossedNotified: r.deadlineCrossedNotified,
  };
  if (r.midnightSplitContinuation === true) {
    out.midnightSplitContinuation = true;
  }
  return out;
}

function buildActiveSessionFilePayload(): PomodoroActiveSessionFileV1 | null {
  const r = pomodoroStore.activePhaseRun;
  if (!r) return null;
  return {
    version: POMODORO_ACTIVE_SESSION_FILE_VERSION,
    phase: r.phase,
    activePhaseRun: cloneActivePhaseRunForPersist(r),
  };
}

/**
 * If the session was left “running” (unload save missed), we cannot trust wall time: either enter a
 * pause now when there was prior pause history, or drop the session when there was none.
 */
function reconcileActiveSessionAfterLoad(run: ActivePhaseRun): ActivePhaseRun | null {
  if (run.openPauseStartMs != null) {
    return run;
  }
  if (run.pauses.length > 0) {
    return {
      phase: run.phase,
      phaseStartedAtMs: run.phaseStartedAtMs,
      intendedDurationMs: run.intendedDurationMs,
      pauses: run.pauses.map((p) => ({ startMs: p.startMs, endMs: p.endMs })),
      openPauseStartMs: Date.now(),
      deadlineCrossedNotified: run.deadlineCrossedNotified,
    };
  }
  return null;
}

/** @internal */
export function __reconcileActiveSessionAfterLoadForTests(run: ActivePhaseRun): ActivePhaseRun | null {
  return reconcileActiveSessionAfterLoad(run);
}

export function __midnightSplitBoundsForTests(forWallMs: number): { endOfDayMs: number; startNextMs: number } {
  return { endOfDayMs: endOfLocalDayMs(forWallMs), startNextMs: startOfNextLocalDayMs(forWallMs) };
}

export function __partitionPausesForMidnightSplitForTests(
  r: ActivePhaseRun,
  endedAtMs: number,
  startNextMs: number,
): { firstSegment: PomodoroPauseSpan[]; continuation: PomodoroPauseSpan[] } {
  return {
    firstSegment: buildFirstSegmentPausesForMidnightSplit(r, endedAtMs),
    continuation: buildContinuationPausesForMidnightSplit(r, startNextMs),
  };
}

export function __injectPomodoroMinimalStateForTests(patch: {
  hydrated?: boolean;
  dayKey?: string;
  activePhaseRun?: ActivePhaseRun | null;
  dayLog?: PomodoroDayLogStored;
}): void {
  if (patch.hydrated !== undefined) pomodoroStore.hydrated = patch.hydrated;
  if (patch.dayKey !== undefined) pomodoroStore.dayKey = patch.dayKey;
  if (patch.activePhaseRun !== undefined) pomodoroStore.activePhaseRun = patch.activePhaseRun;
  if (patch.dayLog !== undefined) pomodoroStore.dayLog = patch.dayLog;
}

export function __getPomodoroActivePhaseRunForTests(): ActivePhaseRun | null {
  return pomodoroStore.activePhaseRun;
}

export function __getPomodoroDayLogEntriesForTests(): PomodoroLogEntryStored[] {
  return [...pomodoroStore.dayLog.entries];
}

export function __runMidnightSplitForTests(nowMs: number): void {
  maybeSplitActivePhaseAtLocalMidnight(nowMs);
}

function parsePauseSpan(x: unknown): PomodoroPauseSpan | null {
  if (!isRecord(x)) return null;
  if (typeof x.startMs !== "number" || typeof x.endMs !== "number") return null;
  return { startMs: x.startMs, endMs: x.endMs };
}

function parseActivePhaseRun(x: unknown): ActivePhaseRun | null {
  if (!isRecord(x)) return null;
  if (!isPomodoroPhase(x.phase)) return null;
  if (typeof x.phaseStartedAtMs !== "number" || typeof x.intendedDurationMs !== "number") return null;
  if (!Array.isArray(x.pauses)) return null;
  const pauses: PomodoroPauseSpan[] = [];
  for (const p of x.pauses) {
    const span = parsePauseSpan(p);
    if (!span) return null;
    pauses.push(span);
  }
  let openPauseStartMs: number | null;
  if (x.openPauseStartMs === null || x.openPauseStartMs === undefined) {
    openPauseStartMs = null;
  } else if (typeof x.openPauseStartMs === "number") {
    openPauseStartMs = x.openPauseStartMs;
  } else {
    return null;
  }
  if (typeof x.deadlineCrossedNotified !== "boolean") return null;
  const run: ActivePhaseRun = {
    phase: x.phase,
    phaseStartedAtMs: x.phaseStartedAtMs,
    intendedDurationMs: x.intendedDurationMs,
    pauses,
    openPauseStartMs,
    deadlineCrossedNotified: x.deadlineCrossedNotified,
  };
  if (x.midnightSplitContinuation === true) {
    run.midnightSplitContinuation = true;
  }
  return run;
}

function parseActiveSessionFileV1(data: unknown): PomodoroActiveSessionFileV1 | null {
  if (!isRecord(data)) return null;
  if (data.version !== POMODORO_ACTIVE_SESSION_FILE_VERSION) return null;
  if (!isPomodoroPhase(data.phase)) return null;
  const run = parseActivePhaseRun(data.activePhaseRun);
  if (!run) return null;
  if (run.phase !== data.phase) return null;
  return {
    version: POMODORO_ACTIVE_SESSION_FILE_VERSION,
    phase: data.phase,
    activePhaseRun: run,
  };
}

function clearActiveSessionStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch (e: unknown) {
    log.warn("pomodoro: remove active session key failed", e);
  }
  lastActiveJson = "";
}

function pauseActiveSessionForUnload(): void {
  const r = pomodoroStore.activePhaseRun;
  if (r && r.openPauseStartMs === null) {
    r.openPauseStartMs = Date.now();
  }
}

function writeActiveSessionFileToLocalStorage(): void {
  if (typeof window === "undefined" || !pomodoroStore.hydrated) return;
  const payload = buildActiveSessionFilePayload();
  if (!payload) {
    clearActiveSessionStorage();
    return;
  }
  const s = JSON.stringify(payload);
  lastActiveJson = s;
  storageSetItem(ACTIVE_SESSION_KEY, s);
}

function persistActiveSessionIfChanged(): void {
  if (typeof window === "undefined" || !pomodoroStore.hydrated) return;
  const payload = buildActiveSessionFilePayload();
  if (!payload) {
    if (lastActiveJson !== "") {
      clearActiveSessionStorage();
    }
    lastActiveJson = "";
    return;
  }
  const s = JSON.stringify(payload);
  if (s === lastActiveJson) return;
  lastActiveJson = s;
  storageSetItem(ACTIVE_SESSION_KEY, s);
}

function loadActiveSessionFromStorage(): void {
  if (typeof window === "undefined") return;
  let raw: string | null;
  try {
    raw = localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    raw = null;
  }
  if (!raw) {
    lastActiveJson = "";
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    clearActiveSessionStorage();
    lastActiveJson = "";
    return;
  }
  const file = parseActiveSessionFileV1(parsed);
  if (!file) {
    clearActiveSessionStorage();
    lastActiveJson = "";
    return;
  }
  const run = reconcileActiveSessionAfterLoad(file.activePhaseRun);
  pomodoroStore.phase = file.phase;
  if (!run) {
    pomodoroStore.activePhaseRun = null;
    clearActiveSessionStorage();
    lastActiveJson = "";
    return;
  }
  pomodoroStore.activePhaseRun = run;
  const canonical = buildActiveSessionFilePayload();
  lastActiveJson = canonical ? JSON.stringify(canonical) : "";
}

async function loadFromStorageAsync(): Promise<void> {
  if (typeof window === "undefined") return;
  migrateLegacyPersistKeysOnce();
  try {
    const configRaw = localStorage.getItem(CONFIG_KEY);
    if (configRaw) {
      const parsed = JSON.parse(configRaw) as unknown;
      if (isRecord(parsed)) applyConfigRecord(parsed);
    }

    await migrateLegacyPomodoroLocalStorageToIndexedDb();
    await hydrateTodayLogFromIndexedDb();
  } catch (e: unknown) {
    log.error("pomodoro: failed to load config or work log from storage", e);
    pomodoroStore.dayKey = localDayKey();
    pomodoroStore.dayLog = { entries: [] };
  }

  try {
    loadActiveSessionFromStorage();
  } catch (e: unknown) {
    log.warn("pomodoro: failed to load active session from storage", e);
    pomodoroStore.activePhaseRun = null;
    clearActiveSessionStorage();
    lastActiveJson = "";
  }

  lastConfigJson = JSON.stringify(pickPersistedConfig());
  pomodoroStore.hydrated = true;
}

/** Await pending IndexedDB log writes. Use before export/download. */
export async function flushPomodoroPersistToStorage(): Promise<void> {
  await persistTail;
}

/** @internal Wait for the initial IndexedDB load started by {@link pomodoroActions.init}. */
export async function __awaitPomodoroStoreHydrationForTests(): Promise<void> {
  await lastPomodoroLoadPromise;
}

function pickPersistedConfig(): PomodoroConfigV1 {
  return { ...pomodoroStore.config };
}

function storageSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e: unknown) {
    log.warn("pomodoro: localStorage setItem failed", key, e);
  }
}

function storageSetItemStrict(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`pomodoro: could not write ${key} (${detail})`);
  }
}

function persistConfigIfChanged(): void {
  if (typeof window === "undefined") return;
  const s = JSON.stringify(pickPersistedConfig());
  if (s === lastConfigJson) return;
  lastConfigJson = s;
  storageSetItem(CONFIG_KEY, s);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function clampPositiveMs(n: unknown, fallback: number): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 60_000) return fallback;
  return Math.min(n, 24 * 60 * 60 * 1000);
}

function isPomodoroPhase(x: unknown): x is PomodoroPhase {
  return x === "work" || x === "shortBreak" || x === "longBreak";
}

function parseDayLogEntry(x: unknown): PomodoroLoggedPhase | null {
  if (!isRecord(x)) return null;
  if (!isPomodoroPhase(x.phase)) return null;
  if (typeof x.startedAtMs !== "number" || typeof x.endedAtMs !== "number") return null;
  if (!Array.isArray(x.pauses)) return null;
  const pauses: PomodoroPauseSpan[] = [];
  for (const p of x.pauses) {
    if (!isRecord(p)) return null;
    if (typeof p.startMs !== "number" || typeof p.endMs !== "number") return null;
    pauses.push({ startMs: p.startMs, endMs: p.endMs });
  }
  return {
    phase: x.phase,
    startedAtMs: x.startedAtMs,
    endedAtMs: x.endedAtMs,
    pauses,
    deletedAtMs: null,
  };
}

function parseLogsPayload(parsed: Record<string, unknown>): Record<string, PomodoroDayLogV1> {
  const daysRaw = parsed.days;
  if (!isRecord(daysRaw)) return {};
  const out: Record<string, PomodoroDayLogV1> = {};
  for (const [dayKey, log] of Object.entries(daysRaw)) {
    if (!isRecord(log) || !Array.isArray(log.entries)) continue;
    const entries: PomodoroLoggedPhase[] = [];
    for (const e of log.entries) {
      const ent = parseDayLogEntry(e);
      if (ent) entries.push(ent);
    }
    out[dayKey] = { entries };
  }
  return out;
}

function applyConfigRecord(parsed: Record<string, unknown>): void {
  pomodoroStore.config.workDurationMs = clampPositiveMs(
    parsed.workDurationMs,
    DEFAULT_WORK_MS,
  );
  pomodoroStore.config.shortBreakDurationMs = clampPositiveMs(
    parsed.shortBreakDurationMs,
    DEFAULT_SHORT_MS,
  );
  pomodoroStore.config.longBreakDurationMs = clampPositiveMs(
    parsed.longBreakDurationMs,
    DEFAULT_LONG_MS,
  );
}

function configFromUnknownRecord(parsed: Record<string, unknown>): PomodoroConfigV1 {
  return {
    workDurationMs: clampPositiveMs(parsed.workDurationMs, DEFAULT_WORK_MS),
    shortBreakDurationMs: clampPositiveMs(parsed.shortBreakDurationMs, DEFAULT_SHORT_MS),
    longBreakDurationMs: clampPositiveMs(parsed.longBreakDurationMs, DEFAULT_LONG_MS),
  };
}

/** Normalize any supported pomodoro import slice to {@link PomodoroExportV1}. */
export function migratePomodoroSliceToLatest(data: unknown): PomodoroExportV1 {
  log.debug("pomodoro migration: start");
  if (!isRecord(data)) {
    log.error("pomodoro migration: not an object");
    throw new Error("pomodoro: import slice is not an object.");
  }
  const v = data.version;
  log.debug("pomodoro migration: shape", {
    version: v,
    hasConfig: isRecord(data.config),
    hasLogs: isRecord(data.logs),
  });
  if (v !== undefined && v !== POMODORO_EXPORT_VERSION) {
    log.error("pomodoro migration: unsupported version", { version: v });
    throw new Error(
      `pomodoro: unsupported export slice version ${String(v)}. Update the app or re-export your data.`,
    );
  }
  const cfgSource = isRecord(data.config) ? data.config : {};
  const logsRoot = isRecord(data.logs) ? data.logs : { days: {} };
  const config = configFromUnknownRecord(cfgSource);
  const dayMap = parseLogsPayload(logsRoot);
  const dayCount = Object.keys(dayMap).length;
  let entryCount = 0;
  for (const dayLog of Object.values(dayMap)) {
    entryCount += dayLog.entries.length;
  }
  log.debug("pomodoro migration: ok", {
    dayCount,
    entryCount,
    workMs: config.workDurationMs,
  });
  return {
    version: POMODORO_EXPORT_VERSION,
    config,
    logs: { days: dayMap },
  };
}

import { useLayoutEffect, useState } from "react";
import { proxy, useSnapshot, type Snapshot } from "valtio";
import { subscribe } from "valtio/vanilla";
import type { PomodoroPhase } from "@/lib/layout";
import log from "@/lib/logger";
import { POMODORO_CONFIG_KEY, POMODORO_LOGS_KEY } from "@/lib/persistKeys";

export type { PomodoroPhase };

const CONFIG_KEY = POMODORO_CONFIG_KEY;
const LOGS_KEY = POMODORO_LOGS_KEY;

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
  /** Per local-day completed runs (durations + pauses). Used for totals and long-break cadence. */
  dayLogs: {} as Record<string, PomodoroDayLogV1>,
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
};

/** Persisted: ordered history for a single local day */
export type PomodoroDayLogV1 = {
  entries: PomodoroLoggedPhase[];
};

/** Persisted: map of YYYY-MM-DD → day log */
export type PomodoroLogsV1 = {
  days: Record<string, PomodoroDayLogV1>;
};

export const POMODORO_EXPORT_VERSION = 1 as const;
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
  const nowMs = useWallNowMs(phaseRunNeedsWallClock(snap.activePhaseRun));
  return nowMs >= flipClockEndsAtMsAt(snap, nowMs);
}

/** Seconds until the deadline; negative after the wall-clock deadline while the phase stays active. */
export function useSecondsRemaining(): number {
  const snap = useSnapshot(pomodoroStore);
  const nowMs = useWallNowMs(phaseRunNeedsWallClock(snap.activePhaseRun));
  const endsAt = flipClockEndsAtMsAt(snap, nowMs);
  return Math.ceil((endsAt - nowMs) / 1000);
}

/**
 * Same wall-clock source as {@link useSecondsRemaining}, but flips run ~{@link FLIP_DISPLAY_LEAD_MS}
 * early so the ~0.7s animation finishes closer to the real second boundary.
 */
export function useFlipSecondsRemaining(): number {
  const snap = useSnapshot(pomodoroStore);
  const nowMs = useWallNowMs(phaseRunNeedsWallClock(snap.activePhaseRun));
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
  const day = localDayKey();
  const log = useSnapshot(pomodoroStore).dayLogs[day];
  let sum = 0;
  if (log) {
    for (const e of log.entries) {
      sum += workMsFromEntry(e);
    }
  }
  const r = pomodoroStore.activePhaseRun;
  if (r?.phase === "work") {
    sum += workMsFromActiveRun(r);
  }
  return sum;
}

/**
 * Today’s calendar-day log entries (all phases) plus the active phase run, for session summaries.
 * Single snapshot subscription — prefer this over reading the store proxy from components.
 */
export function useTodayPomodoroDaySlice(): {
  todayEntries: Snapshot<PomodoroDayLogV1>["entries"];
  activePhaseRun: Snapshot<ActivePhaseRun> | null;
} {
  const day = localDayKey();
  const snap = useSnapshot(pomodoroStore);
  return {
    todayEntries: snap.dayLogs[day]?.entries ?? [],
    activePhaseRun: snap.activePhaseRun,
  };
}

export type PomodoroInitOptions = {
  /** Called once per run when the wall-clock deadline is crossed (phase stays active until `nextPhase`). */
  onPhaseDeadlineCrossed?: (completedPhase: PomodoroPhase) => void;
};

export const pomodoroActions = {
  init: function init(options?: PomodoroInitOptions): () => void {
    loadFromStorage();

    const unsubPersist = subscribe(pomodoroStore, () => {
      if (!pomodoroStore.hydrated) return;
      persistConfigIfChanged();
      persistLogsIfChanged();
    });

    const stopEngine =
      typeof window !== "undefined"
        ? startPomodoroTimerEngine(options?.onPhaseDeadlineCrossed)
        : () => {};

    return () => {
      stopEngine();
      unsubPersist();
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

    const day = localDayKey();
    const next = current === "work" ? nextBreakType(day) : "work"; // always go to work after a break
    applyPhaseWithFullDuration(next);
    beginRunningPhaseFromConfig();
  },

  exportData: function exportData(): PomodoroExportV1 {
    return {
      version: POMODORO_EXPORT_VERSION,
      config: pickPersistedConfig(),
      logs: pickPersistedLogs(),
    };
  },

  /**
   * Accepts `{ version, config, logs }` or a legacy `{ config, logs }` object (no `version` field).
   */
  importData: function importData(data: unknown): void {
    const slice = migratePomodoroSliceToLatest(data);
    pomodoroStore.config.workDurationMs = slice.config.workDurationMs;
    pomodoroStore.config.shortBreakDurationMs = slice.config.shortBreakDurationMs;
    pomodoroStore.config.longBreakDurationMs = slice.config.longBreakDurationMs;
    pomodoroStore.dayLogs = { ...slice.logs.days };
    pomodoroStore.activePhaseRun = null;
    if (typeof window === "undefined") return;
    lastConfigJson = JSON.stringify(slice.config);
    lastLogsJson = JSON.stringify(slice.logs);
    storageSetItemStrict(CONFIG_KEY, lastConfigJson);
    storageSetItemStrict(LOGS_KEY, lastLogsJson);
  },
};

function startPomodoroTimerEngine(
  onPhaseDeadlineCrossed?: (completedPhase: PomodoroPhase) => void,
): () => void {
  const id = window.setInterval(() => {
    const r = pomodoroStore.activePhaseRun;
    const running = isRunning(r);

    if (running && r && Date.now() >= flipClockEndsAtMs(pomodoroStore)) {
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

/** Append completed phase to today’s log and clear activePhaseRun when it matches. */
function finalizeActivePhase(): boolean {
  const r = pomodoroStore.activePhaseRun;
  if (!r) return false;

  const endedAtMs = Date.now();
  const day = localDayKey(new Date(endedAtMs));
  const pauses = [...r.pauses];
  if (r.openPauseStartMs != null) {
    pauses.push({ startMs: r.openPauseStartMs, endMs: endedAtMs });
  }

  ensureDayLog(day).entries.push({
    phase: r.phase,
    startedAtMs: r.phaseStartedAtMs,
    endedAtMs,
    pauses,
  });
  pomodoroStore.activePhaseRun = null;
  return true;
}

function ensureDayLog(day: string): PomodoroDayLogV1 {
  if (!pomodoroStore.dayLogs[day]) {
    pomodoroStore.dayLogs[day] = { entries: [] };
  }
  return pomodoroStore.dayLogs[day];
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
  const log = pomodoroStore.dayLogs[day];
  if (!log) return 0;
  return log.entries.filter((e) => e.phase === "work").length;
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

function workMsFromEntry(e: Snapshot<PomodoroLoggedPhase>): number {
  if (e.phase !== "work") return 0;
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
let lastLogsJson = "";

function loadFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const configRaw = localStorage.getItem(CONFIG_KEY);
    if (configRaw) {
      const parsed = JSON.parse(configRaw) as unknown;
      if (isRecord(parsed)) applyConfigRecord(parsed);
    }

    const logsRaw = localStorage.getItem(LOGS_KEY);
    if (logsRaw) {
      const parsed = JSON.parse(logsRaw) as unknown;
      if (isRecord(parsed)) {
        pomodoroStore.dayLogs = parseLogsPayload(parsed);
      }
    }
  } catch (e: unknown) {
    log.error("pomodoro: failed to load config or logs from localStorage", e);
  }

  pomodoroStore.activePhaseRun = null;
  lastConfigJson = JSON.stringify(pickPersistedConfig());
  lastLogsJson = JSON.stringify(pickPersistedLogs());
  pomodoroStore.hydrated = true;
}

function pickPersistedConfig(): PomodoroConfigV1 {
  return { ...pomodoroStore.config };
}

function pickPersistedLogs(): PomodoroLogsV1 {
  const days: Record<string, PomodoroDayLogV1> = {};
  for (const [k, v] of Object.entries(pomodoroStore.dayLogs)) {
    days[k] = {
      entries: v.entries.map((e) => ({
        phase: e.phase,
        startedAtMs: e.startedAtMs,
        endedAtMs: e.endedAtMs,
        pauses: e.pauses.map((p) => ({ startMs: p.startMs, endMs: p.endMs })),
      })),
    };
  }
  return { days };
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

function persistLogsIfChanged(): void {
  if (typeof window === "undefined") return;
  const s = JSON.stringify(pickPersistedLogs());
  if (s === lastLogsJson) return;
  lastLogsJson = s;
  storageSetItem(LOGS_KEY, s);
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

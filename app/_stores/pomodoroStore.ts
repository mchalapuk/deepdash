import { proxy, useSnapshot, type Snapshot } from "valtio";
import { subscribe } from "valtio/vanilla";
import type { PomodoroPhase } from "@/lib/layout";
import log from "@/lib/logger";

export type { PomodoroPhase };

const CONFIG_KEY = "worktools.pomodoro.config.v1";
const LOGS_KEY = "worktools.pomodoro.logs.v1";

const DEFAULT_WORK_MS = 25 * 60 * 1000;
const DEFAULT_SHORT_MS = 5 * 60 * 1000;
const DEFAULT_LONG_MS = 15 * 60 * 1000;

/** After this many completed work blocks on the same calendar day, the next break is long. */
const WORK_BLOCKS_BEFORE_LONG_BREAK = 4;

const MIN_PHASE_MINUTES = 1;
const MAX_WORK_MINUTES = 120;
const MAX_BREAK_MINUTES = 60;

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

export type ActivePhaseRun = {
  phase: PomodoroPhase;
  /** Wall time when the user started this phase run (Start). */
  phaseStartedAtMs: number;
  /** Countdown length for this run; fixed when the run is created. */
  readonly intendedDurationMs: number;
  pauses: PomodoroPauseSpan[];
  openPauseStartMs: number | null;
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
  return Date.now() >= useFlipClockEndsAt();
}

/**
 * Stable wall target for flip-clock: running → run end; paused → freeze at pause start;
 * no run → caller should use idle baseline (see PomodoroPanel useMemo).
 */
export function useFlipClockEndsAt(): number {
  const snap = useSnapshot(pomodoroStore);
  const r = snap.activePhaseRun;
  if (!r) {
    return Date.now() + durationForPhase(snap.phase, snap.config);
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

export const pomodoroActions = {
  init: function init(): () => void {
    loadFromStorage();

    return subscribe(pomodoroStore, () => {
      if (!pomodoroStore.hydrated) return;
      persistConfigIfChanged();
      persistLogsIfChanged();
    });
  },
  selectPhase: function selectPhase(next: PomodoroPhase): void {
    if (isRunning(pomodoroStore.activePhaseRun)) return;
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

    const intended = durationForPhase(pomodoroStore.phase, pomodoroStore.config);
    pomodoroStore.activePhaseRun = {
      phase: pomodoroStore.phase,
      phaseStartedAtMs: Date.now(),
      intendedDurationMs: intended,
      pauses: [],
      openPauseStartMs: null,
    };
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

    switch (p) {
      case "work":
        setWorkDurationMs(mss);
        break;
      case "shortBreak":
        setShortBreakDurationMs(mss);
        break;
      case "longBreak":
        setLongBreakDurationMs(mss);
        break;
    }
  },
  onDeadlineReached: function onDeadlineReached(): void {
    const completed = pomodoroStore.phase;
    const logged = finalizeActivePhase(completed);
    const day = localDayKey();
    const next =
      completed === "work"
        ? logged
          ? nextBreakType(day)
          : "shortBreak"
        : "work";
    applyPhaseWithFullDuration(next);
  },
  skip: function skip(): void {
    const current = pomodoroStore.phase;
    const logged = finalizeActivePhase(current);
    const day = localDayKey();
    const next =
      current === "work"
        ? logged
          ? nextBreakType(day)
          : "shortBreak"
        : "work";
    applyPhaseWithFullDuration(next);
  },
};

/** Countdown is actively ticking (run exists and not in a pause). */
function isRunning(activePhase: Snapshot<ActivePhaseRun> | null): boolean {
  return activePhase != null && activePhase.openPauseStartMs === null;
}

/** Countdown frozen mid-phase (Resume vs Start in the UI). */
function isPaused(activePhase: Snapshot<ActivePhaseRun> | null): boolean {
  return activePhase != null && activePhase.openPauseStartMs != null;
}

function setWorkDurationMs(ms: number): void {
  pomodoroStore.config.workDurationMs = clampPositiveMs(ms, DEFAULT_WORK_MS);
}

function setShortBreakDurationMs(ms: number): void {
  pomodoroStore.config.shortBreakDurationMs = clampPositiveMs(ms, DEFAULT_SHORT_MS);
}

function setLongBreakDurationMs(ms: number): void {
  pomodoroStore.config.longBreakDurationMs = clampPositiveMs(ms, DEFAULT_LONG_MS);
}

/** Append completed phase to today’s log and clear activePhaseRun when it matches. */
function finalizeActivePhase(completedPhase: PomodoroPhase): boolean {
  const r = pomodoroStore.activePhaseRun;
  if (!r || r.phase !== completedPhase) return false;

  const endedAtMs = Date.now();
  const day = localDayKey(new Date(endedAtMs));
  const pauses = [...r.pauses];
  if (r.openPauseStartMs != null) {
    pauses.push({ startMs: r.openPauseStartMs, endMs: endedAtMs });
  }

  ensureDayLog(day).entries.push({
    phase: completedPhase,
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

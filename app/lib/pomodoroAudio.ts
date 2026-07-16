/**
 * Web Audio scheduling for the pomodoro break-end chime, plus an audio-clock drift reader used to
 * detect system sleep/suspend (replaces the old silent-`<audio>`-loop trick). The audio thread's
 * clock is independent of main-thread timer throttling, so a source scheduled here still fires on
 * time in a hidden/throttled tab, and `AudioContext.currentTime` freezes across a real system sleep
 * while `Date.now()` keeps advancing.
 */

import log from "@/app/lib/logger";

// --- constants ---

const CHIME_MP3_URL = "/chime.mp3";
const CHIME_GAIN = 0.8;

/** A source that already fired (or is due) within this long of "now" counts as handled by `finalizeScheduledBreakEndChime`. */
const FINALIZE_GRACE_MS = 2000;

// --- module state ---

let audioCtx: AudioContext | null = null;

let chimeBuffer: AudioBuffer | null = null;
let chimeBufferPromise: Promise<void> | null = null;

let scheduledSource: AudioBufferSourceNode | null = null;
let scheduledAtWallMs: number | null = null;
let pendingBreakEndWallMs: number | null = null;

let driftBaselineCtxSec: number | null = null;
let driftBaselineWallMs: number | null = null;

// --- exported functions ---

/** Resumes/creates the AudioContext from a user gesture and schedules any pending break-end chime. */
export function unlockPomodoroAudio(): void {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().catch((err: unknown) => {
      log.warn("pomodoroAudio: failed to resume AudioContext", err);
    });
  }
  void loadChimeBuffer(ctx).then(() => {
    trySchedulePendingChime();
  });
}

/** Schedules the chime to start at the given wall-clock time; stores it as pending if the context isn't ready yet. */
export function scheduleBreakEndChimeAt(wallMs: number): void {
  cancelScheduledBreakEndChime();
  pendingBreakEndWallMs = wallMs;
  trySchedulePendingChime();
}

/** Cancels any scheduled or pending break-end chime (e.g. on pause, skip, or end-break). */
export function cancelScheduledBreakEndChime(): void {
  pendingBreakEndWallMs = null;
  if (scheduledSource) {
    scheduledSource.onended = null;
    try {
      scheduledSource.stop();
    } catch (err) {
      log.warn("pomodoroAudio: failed to stop scheduled chime", err);
    }
    scheduledSource.disconnect();
  }
  scheduledSource = null;
  scheduledAtWallMs = null;
}

/**
 * Called when the engine detects a break's deadline has been crossed. Returns `true` when the
 * scheduled chime already fired (or is due within {@link FINALIZE_GRACE_MS}) so the caller should
 * not also play a fallback chime; otherwise clears any stale schedule and returns `false`.
 */
export function finalizeScheduledBreakEndChime(): boolean {
  const wallMs = scheduledAtWallMs;
  const handled = wallMs != null && Date.now() - wallMs <= FINALIZE_GRACE_MS;
  if (handled) {
    scheduledSource = null;
    scheduledAtWallMs = null;
  } else {
    cancelScheduledBreakEndChime();
  }
  return handled;
}

/**
 * Drift (ms) between wall-clock time and the audio-clock since the last call, clamped to >= 0.
 * The audio clock only advances while the context is actually rendering, so a real system
 * sleep/suspend shows up as a large positive drift; normal throttled-but-alive ticking does not,
 * since both clocks keep pace with each other. Returns 0 before the context has ever been unlocked.
 */
export function readAudioClockSleepDriftMs(): number {
  const ctx = audioCtx;
  const wallNowMs = Date.now();
  if (!ctx) {
    driftBaselineCtxSec = null;
    driftBaselineWallMs = null;
    return 0;
  }

  const ctxNowSec = ctx.currentTime;
  if (driftBaselineCtxSec == null || driftBaselineWallMs == null) {
    driftBaselineCtxSec = ctxNowSec;
    driftBaselineWallMs = wallNowMs;
    return 0;
  }

  const wallDeltaMs = wallNowMs - driftBaselineWallMs;
  const ctxDeltaMs = (ctxNowSec - driftBaselineCtxSec) * 1000;
  driftBaselineCtxSec = ctxNowSec;
  driftBaselineWallMs = wallNowMs;
  return Math.max(0, wallDeltaMs - ctxDeltaMs);
}

// --- private helpers ---

function ensureAudioContext(): AudioContext | null {
  if (audioCtx) return audioCtx;
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  try {
    audioCtx = new Ctor();
  } catch (err) {
    log.error("pomodoroAudio: failed to construct AudioContext", err);
    return null;
  }
  return audioCtx;
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function loadChimeBuffer(ctx: AudioContext): Promise<void> {
  if (chimeBuffer) return Promise.resolve();
  if (chimeBufferPromise) return chimeBufferPromise;
  chimeBufferPromise = fetch(CHIME_MP3_URL)
    .then((res) => res.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data))
    .then((buffer) => {
      chimeBuffer = buffer;
    })
    .catch((err: unknown) => {
      log.error("pomodoroAudio: failed to load/decode chime", err);
    });
  return chimeBufferPromise;
}

function trySchedulePendingChime(): void {
  const ctx = audioCtx;
  if (!ctx || ctx.state !== "running" || !chimeBuffer) return;
  if (pendingBreakEndWallMs == null) return;

  const wallMs = pendingBreakEndWallMs;
  pendingBreakEndWallMs = null;

  const delaySec = (wallMs - Date.now()) / 1000;
  if (delaySec < -FINALIZE_GRACE_MS / 1000) return; // too late to matter; caller's fallback chime handles it

  const source = ctx.createBufferSource();
  source.buffer = chimeBuffer;
  const gain = ctx.createGain();
  gain.gain.value = CHIME_GAIN;
  source.connect(gain).connect(ctx.destination);
  source.start(ctx.currentTime + Math.max(0, delaySec));
  source.onended = () => {
    if (scheduledSource === source) {
      scheduledSource = null;
      scheduledAtWallMs = null;
    }
  };

  scheduledSource = source;
  scheduledAtWallMs = wallMs;
}

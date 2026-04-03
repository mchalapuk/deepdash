"use client";

import { ScrollArea, Stack, Text, Group, Paper } from "@mantine/core";
import { useLayoutEffect, useState } from "react";
import { type Snapshot } from "valtio";
import {
  type ActivePhaseRun,
  type PomodoroLoggedPhase,
  type PomodoroPauseSpan,
  useTodayPomodoroDaySlice,
  useTodayWorkMsDisplay,
} from "@/app/_stores/pomodoroStore";

export function TodaysWork() {
  const totalMs = useTodayWorkMsDisplay();
  const { todayEntries, activePhaseRun } = useTodayPomodoroDaySlice();
  const live = activePhaseRun?.phase === "work";
  const nowMs = useLiveNowMs(live);
  const rows = buildTodayWorkRows(todayEntries, activePhaseRun, nowMs);

  return (
    <Stack gap="md" h="352px" py="xs" style={{ flexGrow: 1, overflow: "hidden" }}>
      <Stack gap={4} pl={6}>
        <Text size="xs" c="dimmed">
          Today&apos;s work
        </Text>
        <Text size="xl" fw={500}>
          {formatDurationMs(totalMs)}
        </Text>
      </Stack>
      {rows.length === 0 ? (
        <Text c="dimmed" size="sm">
          No pomodoro sessions logged today.
        </Text>
      ) : (
        <Stack gap="xs" style={{ overflow: "hidden" }}>
          <Group w="100%" wrap="nowrap" pl={12} pr={30}>
            <Text size="xs" c="dimmed" w="20%" miw="60px">
              Session
            </Text>
            <Text size="xs" c="dimmed" style={{ flexGrow: 1, whiteSpace: "nowrap" }}>
              Start - Stop
            </Text>
            <Text size="xs" c="dimmed" w="20%" miw="60px">
              Duration
            </Text>
          </Group>
          <ScrollArea pr={18}>
            <Stack component="ul" gap="xs" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {rows.reverse().map((row, i) => (
                <SessionBlock key={row.key} index={rows.length - i} row={row} />
              ))}
            </Stack>
          </ScrollArea>
        </Stack>
      )}
    </Stack>
  );
}

/** Snapshot-safe shape from {@link useTodayPomodoroDaySlice} day entries */
type WorkLogEntry = {
  readonly phase: PomodoroLoggedPhase["phase"];
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly pauses: readonly PomodoroPauseSpan[];
};

type TodayRow =
  | { key: string; kind: "completed"; entry: WorkLogEntry }
  | { key: string; kind: "active"; run: Snapshot<ActivePhaseRun>; nowMs: number };

function SessionBlock({ index, row }: { index: number; row: TodayRow }) {
  if (row.kind === "completed") {
    const e = row.entry;
    const focusMs = workFocusMsFromEntry(e);
    return (
      <Paper bg="black" w="100%" px={12} py={12} opacity={0.3}>
        <Stack component="li" gap="xs" w="100%">
          <SessionRow
            session={`# ${index}`}
            span={formatTimeRange(e.startedAtMs, e.endedAtMs)}
            duration={formatDurationMs(focusMs)}
          />
          <PauseSublist pauses={e.pauses} />
        </Stack>
      </Paper>
    );
  }

  const { run, nowMs } = row;
  const pauses = pausesForActiveRun(run, nowMs);
  const focusMs = workFocusMsActive(run, nowMs);

  return (
    <Paper bg="black" w="100%" px={12} py={12} opacity={0.7}>
      <Stack component="li" gap="xs" w="100%">
        <SessionRow
          session={`# ${index}`}
          span={`${formatTime(run.phaseStartedAtMs)}–...`}
          duration={formatDurationMs(focusMs)}
        />
        <PauseSublist pauses={pauses} openEnded={run.openPauseStartMs != null} />
      </Stack>
    </Paper>
  );
}

function PauseSublist({
  pauses,
  openEnded,
}: {
  pauses: readonly PomodoroPauseSpan[];
  openEnded?: boolean;
}) {
  if (pauses.length === 0) {
    return null;
  }

  return (
    <Stack
      component="ul"
      gap={4}
      style={{ listStyle: "disc", margin: 0 }}
    >
      {[...pauses].reverse().map((p, i) => (
        <SessionRow
          key={pauses.length - i}
          session={`Pause # ${pauses.length - i}`}
          span={`${formatTime(p.startMs)}–${openEnded && i === 0 ? "..." : formatTime(p.endMs)}`}
          duration={formatDurationMs(Math.max(0, p.endMs - p.startMs))}
          fontSize="xs"
          color="dimmed"
          component="li"
        />
      ))}
    </Stack>
  );
}

function SessionRow({ session, span, duration, fontSize = "sm", color = "foreground", component = "span" }: { session: string; span: string; duration: string; fontSize?: string; color?: string; component?: string }) {
  return (
    <Group w="100%" wrap="nowrap" component={component}>
      <Text size={fontSize} fw={500} w="20%" miw="60px" c={color}>
        {session}
      </Text>
      <Text size={fontSize} fw={500} style={{ flexGrow: 1, whiteSpace: "nowrap" }} c={color}>
        {span}
      </Text>
      <Text size={fontSize} fw={500} w="20%" miw="60px" c={color}>
        {duration}
      </Text>
    </Group>
  )
}

function useLiveNowMs(enabled: boolean): number {
  const [now, setNow] = useState(() =>
    typeof window !== "undefined" ? Date.now() : 0,
  );
  useLayoutEffect(() => {
    setNow(Date.now());
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

function buildTodayWorkRows(
  entries: readonly WorkLogEntry[],
  active: Snapshot<ActivePhaseRun> | null,
  nowMs: number,
): TodayRow[] {
  const completed = entries
    .filter((e) => e.phase === "work")
    .map(
      (entry, i): TodayRow => ({
        key: `done-${entry.startedAtMs}-${i}`,
        kind: "completed",
        entry,
      }),
    );

  if (active?.phase === "work") {
    completed.push({
      key: `active-${active.phaseStartedAtMs}`,
      kind: "active",
      run: active,
      nowMs,
    });
  }

  return completed;
}

function workFocusMsFromEntry(e: WorkLogEntry): number {
  const gross = e.endedAtMs - e.startedAtMs;
  const paused = e.pauses.reduce((s, p) => s + (p.endMs - p.startMs), 0);
  return Math.max(0, gross - paused);
}

function workFocusMsActive(run: Snapshot<ActivePhaseRun>, now: number): number {
  const gross = now - run.phaseStartedAtMs;
  let paused = run.pauses.reduce((s, p) => s + (p.endMs - p.startMs), 0);
  if (run.openPauseStartMs != null) {
    paused += now - run.openPauseStartMs;
  }
  return Math.max(0, gross - paused);
}

function pausesForActiveRun(
  run: Snapshot<ActivePhaseRun>,
  nowMs: number,
): readonly PomodoroPauseSpan[] {
  const out = run.pauses.map((p) => ({ startMs: p.startMs, endMs: p.endMs }));
  if (run.openPauseStartMs != null) {
    out.push({ startMs: run.openPauseStartMs, endMs: nowMs });
  }
  return out;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeRange(startMs: number, endMs: number): string {
  return `${formatTime(startMs)}–${formatTime(endMs)}`;
}

function formatDurationMs(ms: number): string {
  if (ms < 60_000) {
    return `${Math.max(0, Math.round(ms / 1000))}s`;
  }
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    if (rm === 0 && s === 0) return `${h}h`;
    if (s === 0) return `${h}h ${rm}m`;
    return `${h}h ${rm}m ${s}s`;
  }
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

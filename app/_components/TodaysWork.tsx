"use client";

import {
  Box,
  Group,
  Paper,
  ScrollArea,
  Skeleton,
  Space,
  Stack,
  Text,
  VisuallyHidden,
} from "@mantine/core";
import { useLayoutEffect, useRef, useState } from "react";
import { type Snapshot } from "valtio";
import {
  type ActivePhaseRun,
  type PomodoroLoggedPhase,
  type PomodoroPauseSpan,
  usePomodoroHydrated,
  useTodayPomodoroDaySlice,
  useTodayWorkMsDisplay,
} from "@/app/_stores/pomodoroStore";
import { usePhaseBackgroundColor } from "@/lib/layout";

export function TodaysWork() {
  const hydrated = usePomodoroHydrated();
  const totalMs = useTodayWorkMsDisplay();
  const { todayEntries, activePhaseRun } = useTodayPomodoroDaySlice();
  const live = activePhaseRun?.phase === "work";
  const nowMs = useLiveNowMs(live);
  const rows = buildTodayWorkRows(todayEntries, activePhaseRun, nowMs);
  const backgroundColor = usePhaseBackgroundColor();
  const workLogViewportRef = useRef<HTMLDivElement | null>(null);
  const prevWorkPhaseStartRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const startMs =
      activePhaseRun?.phase === "work" ? activePhaseRun.phaseStartedAtMs : null;
    const prev = prevWorkPhaseStartRef.current;
    prevWorkPhaseStartRef.current = startMs;
    if (startMs == null || startMs === prev) return;
    workLogViewportRef.current?.scrollTo({ top: 0 });
  }, [activePhaseRun?.phase, activePhaseRun?.phaseStartedAtMs]);

  return (
    <Stack gap={0} h="100%" style={{ minHeight: 0, overflow: "hidden" }}>
      <Stack gap={12} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Group w="100%" wrap="nowrap" pl={12} pr={30} style={{ flexShrink: 0 }}>
          <Text size="xs" c="dimmed" w="20%" miw="60px">
            Session
          </Text>
          <Text size="xs" c="dimmed" style={{ flexGrow: 1, whiteSpace: "nowrap" }}>
            Start - Stop
          </Text>
          <Text size="xs" c="dimmed" w="25%" miw="60px">
            Duration
          </Text>
        </Group>
        <ScrollArea
          viewportRef={workLogViewportRef}
          pr={18}
          pos="relative"
          style={{ flex: 1, minHeight: 0 }}
          styles={{ thumb: { backgroundColor: "green.8", opacity: 0.5 } }}
        >
          {!hydrated ? (
            <TodaysWorkSessionListSkeleton />
          ) : rows.length === 0 ? (
            <Paper w="100%" px={12} py={12} style={{ backgroundColor: "rgba(0, 0, 0, 0.6)", opacity: 0.5 }}>
              <Stack component="li" gap="xs" w="100%">
                <SessionRow
                  session={`# 1`}
                  span="No started yet"
                  duration="0s"
                />
              </Stack>
            </Paper>
          ) : (
            <Stack component="ul" gap="xs" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {rows.reverse().map((row, i) => (
                <SessionBlock key={row.key} index={rows.length - i} row={row} />
              ))}
            </Stack>
          )}
          <Space h={10} />
          <div className="absolute bottom-0 left-0 w-full h-[40px]" style={{
            background: `linear-gradient(to top, ${backgroundColor}, transparent)`,
          }} />
        </ScrollArea>
      </Stack>
      <Box pr={18}>
        <Paper w="100%" px={12} py={9} style={{ backgroundColor: "rgba(0, 0, 0, 0.9)", opacity: 0.78 }}>
          <Group gap={4} style={{ flexShrink: 0 }} wrap="nowrap" align="end" pb={2}>
            <Text size="sm" c="dimmed" w="73.5%" pb={1}>
              Today&apos;s work time:
            </Text>
            <Text size="md">{hydrated ? formatDurationMs(totalMs): " "}</Text>
          </Group>
        </Paper>
      </Box>
    </Stack>
  );
}

/** Mimics {@link SessionBlock} / {@link SessionRow} layout while pomodoro storage hydrates. */
function TodaysWorkSessionListSkeleton() {
  const midWidths = ["62%", "78%", "55%"] as const;

  return (
    <Box role="status" aria-live="polite" aria-busy="true">
      <VisuallyHidden>Loading work sessions</VisuallyHidden>
      <Stack
        component="ul"
        gap="xs"
        aria-hidden
        style={{ listStyle: "none", margin: 0, padding: 0 }}
      >
        {midWidths.map((mw, i) => (
          <Paper
            key={i}
            component="li"
            w="100%"
            px={13}
            py={13}
            style={{ backgroundColor: "rgba(0, 0, 0, 0.6)", opacity: 0.5 }}
          >
            <Group w="100%" wrap="nowrap" align="center">
              <Skeleton height={16} w="20%" miw={60} radius="sm" opacity={0.5} />
              <Box flex={1} miw={0} style={{ minWidth: 0 }}>
                <Skeleton height={16} width={mw} radius="sm" opacity={0.5} />
              </Box>
              <Skeleton height={16} w="25%" miw={60} radius="sm" opacity={0.5} />
            </Group>
          </Paper>
        ))}
      </Stack>
    </Box>
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
      <Paper w="100%" px={12} py={12} style={{ backgroundColor: "rgba(0, 0, 0, 0.6)", opacity: 0.5 }}>
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
    <Paper w="100%" px={12} py={12} style={{ backgroundColor: "rgba(0, 0, 0, 0.6)", opacity: 0.5 }}>
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
      <Text size={fontSize} fw={500} w="25%" miw="60px" c={color}>
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

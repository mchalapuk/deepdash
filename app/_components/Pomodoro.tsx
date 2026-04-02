"use client";

import {
  ActionIcon,
  Box,
  Button,
  Group,
  Stack,
  Tabs,
  Text,
  Paper,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronUp,
  IconPlayerSkipForward,
} from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { getColorFromPhase, type PomodoroPhase } from "@/lib/layout";
import {
  localDayKey,
  pomodoroActions,
  useCurrentPhase,
  useCurrentPhaseExpired,
  useIsRunning,
  useIsPaused,
  useSecondsRemaining,
  useTodayWorkMsDisplay,
} from "@/app/_stores/pomodoroStore";

const FlipTimer = dynamic(
  () => import("./FlipTimer").then((mod) => mod.FlipTimer),
  { ssr: false },
);

export function Pomodoro() {
  const [phase, running, paused] = usePomodoroMechanics();
  const todayWork = useTodayWorkMsDisplay();

  return (
    <Paper
      py={34}
      w="494px"
      radius="lg"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.2)",
        boxShadow: "inset 0 0 10px 0 rgba(10, 0, 0, 0.4), inset 0 0 2px 0 rgba(0, 0, 0, 0.8)",
      }}
    >
      <Stack gap={32} align="center">
        <TabPanel {...{ phase, running }}/>
        <Countdown {...{ running }}/>
        <PrimaryButton {...{ phase, running, paused }}/>

        <Text size="sm" c="dimmed" ta="center">
          Today&apos;s work: {formatWorkTotal(todayWork)} ({localDayKey()})
        </Text>
      </Stack>
    </Paper>
  );
}

function TabPanel({ phase, running }: { phase: PomodoroPhase, running: boolean }) {
  const handleTabChange = (v: string | null) => {
    if (!v || running) return;
    pomodoroActions.selectPhase(v as PomodoroPhase);
  };

  return (
    <Tabs value={phase} onChange={handleTabChange} variant="pills" w="350px">
      <Tabs.List grow>
        <Tabs.Tab value="work" style={{ backgroundColor: phase === "work" ? "rgba(100, 100, 100, 0.1)" : "transparent" }}>
          Pomodoro
        </Tabs.Tab>
        <Tabs.Tab value="shortBreak" style={{ backgroundColor: phase === "shortBreak" ? "rgba(100, 100, 100, 0.1)" : "transparent" }}>
          Short break
        </Tabs.Tab>
        <Tabs.Tab value="longBreak" style={{ backgroundColor: phase === "longBreak" ? "rgba(100, 100, 100, 0.1)" : "transparent" }}>
          Long break
        </Tabs.Tab>
      </Tabs.List>
    </Tabs>
  );
}

function Countdown({ running }: { running: boolean }) {
  const secondsRemaining = useSecondsRemaining();

  /** Steppers visible only when no active phase */
  const showSteppers = !running;

  const sideControlSlotPx = 42;

  return (
    <Group
      wrap="nowrap"
      align="center"
      justify="center"
      gap="xs"
      pb={2}
    >
      <Box
        style={{ width: sideControlSlotPx, flexShrink: 0 }}
        aria-hidden
        className="invisible pointer-events-none"
      >
      </Box>

      <Box
        className="flex justify-center min-w-0 opacity-80"
        style={{ flex: "0 1 auto", fontSize: "clamp(5rem, 8vw, 3.25rem)" }}
      >
        <div role="timer" aria-live="polite" aria-atomic="true">
          <FlipTimer secondsRemaining={secondsRemaining} fontSize="4.2rem"/>
        </div>
      </Box>

      <Box
        style={{ width: sideControlSlotPx, flexShrink: 0 }}
        className="flex justify-center"
      >
        {showSteppers ? (
          <Stack gap={2} align="center" ml="-4rem">
            <ActionIcon
              variant="transparent"
              size="lg"
              radius="md"
              c="gray.3"
              onClick={() => pomodoroActions.stepPhaseDurationMinutes(1)}
              aria-label="Add one minute to this phase"
            >
              <IconChevronUp size={22} stroke={2} />
            </ActionIcon>
            <ActionIcon
              variant="transparent"
              size="lg"
              radius="md"
              c="gray.3"
              onClick={() => pomodoroActions.stepPhaseDurationMinutes(-1)}
              aria-label="Remove one minute from this phase"
            >
              <IconChevronDown size={22} stroke={2} />
            </ActionIcon>
          </Stack>
        ) : null}
      </Box>
    </Group>
  );
}

function PrimaryButton({ phase, running, paused }: { phase: PomodoroPhase, running: boolean, paused: boolean }) {
  const expired = useCurrentPhaseExpired();
  const primaryButtonText = running
    ? expired
      ? phase === "work"
        ? "Take a Break"
        : "Start Working"
      : "Pause"
    : paused
      ? "Resume"
      : "Start";

  const handlePrimaryClick = () => {
    if (running) {
      if (expired) {
        pomodoroActions.nextPhase();
      } else {
        pomodoroActions.pause();
      }
    } else {
      pomodoroActions.startOrResume();
    }
  };

  /** Skip visible only while a run exists and the deadline has not been crossed. */
  const showSkip = (running || paused) && !expired;

  const sideControlSlotPx = 42;

  return (
    <Group
      wrap="nowrap"
      align="center"
      justify="center"
      gap="xs"
      className="w-full"
    >
      <Box
        style={{ width: sideControlSlotPx, flexShrink: 0 }}
        aria-hidden
        className="invisible pointer-events-none"
      >
      </Box>

      <Button
        size="xl"
        radius="md"
        px="xl"
        variant="filled"
        onClick={handlePrimaryClick}
        style={{ flexShrink: 0, width: "220px", opacity: 0.92 }}
        color={getColorFromPhase(phase)}
      >
        {primaryButtonText}
      </Button>

      <Box
        style={{ width: sideControlSlotPx, flexShrink: 0 }}
        className="flex justify-center"
      >
        <ActionIcon
          variant="transparent"
          size="xl"
          radius="md"
          c="gray.3"
          onClick={pomodoroActions.nextPhase}
          aria-label="Skip to next phase"
          className={showSkip ? "" : "invisible pointer-events-none"}
        >
          <IconPlayerSkipForward size={26} stroke={2} title="Skip to next phase" />
        </ActionIcon>
      </Box>
    </Group>
  )
}

function usePomodoroMechanics(): [PomodoroPhase, boolean, boolean] {
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return pomodoroActions.init({
      onPhaseDeadlineCrossed: (completed) => {
        const ctx = audioRef.current;
        if (ctx) playPhaseChime(ctx);
        phaseCompleteNotification(completed);
      },
    });
  }, []);

  const phase = useCurrentPhase();
  const running = useIsRunning();
  const paused = useIsPaused();

  useEffect(() => {
    if (typeof window === "undefined") return;
    audioRef.current = new AudioContext();

    return () => {
      audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    void Notification.requestPermission?.();
  }, []);

  return [phase, running, paused];
}

function formatWorkTotal(ms: number): string {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h}h ${min}m`;
  if (m > 0) return `${m} min`;
  return "< 1 min";
}

function phaseTitle(p: PomodoroPhase): string {
  if (p === "work") return "Work session";
  if (p === "shortBreak") return "Short break";
  return "Long break";
}

function phaseCompleteNotification(completed: PomodoroPhase): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  const title = `${phaseTitle(completed)} finished`;
  const body =
    completed === "work"
      ? "Time for a break."
      : "Ready to focus again.";
  try {
    new Notification(title, { body });
  } catch {
    /* ignore */
  }
}

function playPhaseChime(ctx: AudioContext): void {
  try {
    void ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    o.type = "sine";
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.36);
  } catch {
    /* ignore */
  }
}


"use client";

import {
  ActionIcon,
  Box,
  Button,
  Group,
  Stack,
  Tabs,
  Paper,
} from "@mantine/core";
import {
  IconChevronDown,
  IconChevronUp,
  IconPlayerSkipForward,
} from "@tabler/icons-react";
import { useEffect, useRef } from "react";
import { usePhaseColor, type PomodoroPhase } from "@/lib/layout";
import log from "@/lib/logger";
import {
  pomodoroActions,
  useActivePhaseDeadlineCrossed,
  useActivePhaseRunStartedAt,
  useCurrentPhase,
  useCurrentPhaseExpired,
  useFlipSecondsRemaining,
  useIsRunning,
  useIsPaused,
  useSecondsRemaining,
} from "@/app/_stores/pomodoroStore";

import { FlipTimer } from "./FlipTimer";

const POMODORO_INTRO_WAV = "/PomodoroChime_intro.wav";
const POMODORO_MAIN_WAV = "/PomodoroChime_main.wav";

export function Pomodoro() {
  const [phase, running, paused] = usePomodoroMechanics();

  return (
    <Paper
      pb={30}
      w="100%"
      radius="lg"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.3)",
        overflow: "hidden",
      }}
    >
      <Stack gap={23} align="center">
        <TabPanel {...{ phase, running }}/>
        <Countdown {...{ running }}/>
        <PrimaryButton {...{ phase, running, paused }}/>
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
    <Tabs value={phase} onChange={handleTabChange} variant="unstyled" w="100%">
      <Tabs.List grow>
        {[
          { value: "work", label: "Pomodoro" },
          { value: "shortBreak", label: "Short break" },
          { value: "longBreak", label: "Long break" },
        ].map(({ value, label }) => (
          <Tabs.Tab
            key={value}
            value={value}
            h={64}
            styles={phase === value ? {
              tab: {
                backgroundColor: "transparent",
              },
            } : {
              tab: {
                backgroundColor: "black",
                opacity: 0.7,
              },
            }}
          >
            {label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
    </Tabs>
  );
}

function Countdown({ running }: { running: boolean }) {
  const secondsRemaining = useFlipSecondsRemaining();

  /** Steppers visible only when no active phase */
  const showSteppers = !running;

  return (
    <Group
      wrap="nowrap"
      align="center"
      justify="center"
      gap="xs"
      pb={2}
      w="100%"
    >
      <Box
        style={{ flexGrow: 1 }}
        aria-hidden
        className="invisible pointer-events-none"
      >
      </Box>

      <Box
        className="flex justify-center min-w-0 opacity-75"
        style={{ flex: "0 1 auto", fontSize: "5.36rem" }}
      >
        <div role="timer" aria-live="polite" aria-atomic="true" className="w-[5.6em] h-[1.4em]">
          <FlipTimer secondsRemaining={secondsRemaining} />
        </div>
      </Box>

      <Box
        style={{ flexGrow: 1 }}
        className="flex justify-center"
      >
        {showSteppers ? (
          <Stack gap={2} align="center" ml="-3.5rem">
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

  const color = usePhaseColor();

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
        style={{ flexShrink: 0, width: "220px", opacity: .92 }}
        color={color}
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
  const introAudioRef = useRef<HTMLAudioElement | null>(null);
  const mainAudioRef = useRef<HTMLAudioElement | null>(null);
  const introPlayedForRunStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const intro = new Audio(POMODORO_INTRO_WAV);
    const main = new Audio(POMODORO_MAIN_WAV);
    intro.volume = 0.3;
    main.volume = 0.2;
    intro.preload = "auto";
    main.preload = "auto";
    main.loop = true;
    intro.load();
    main.load();
    introAudioRef.current = intro;
    mainAudioRef.current = main;

    return () => {
      intro.pause();
      main.pause();
      intro.src = "";
      main.src = "";
      introAudioRef.current = null;
      mainAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    return pomodoroActions.init({
      onPhaseDeadlineCrossed: (completed) => {
        const introEl = introAudioRef.current;
        const mainEl = mainAudioRef.current;
        if (introEl) {
          introEl.pause();
          introEl.currentTime = 0;
        }
        if (mainEl) {
          mainEl.currentTime = 0;
          void mainEl.play().catch((err: unknown) => {
            log.error("pomodoro: failed to play main chime loop", err);
          });
        }
        phaseCompleteNotification(completed);
      },
    });
  }, []);

  const phase = useCurrentPhase();
  const running = useIsRunning();
  const paused = useIsPaused();
  const secondsRemaining = useSecondsRemaining();
  const runStartedAt = useActivePhaseRunStartedAt();
  const deadlineCrossed = useActivePhaseDeadlineCrossed();

  useEffect(() => {
    if (runStartedAt == null) {
      introPlayedForRunStartedAtRef.current = null;
    }
  }, [runStartedAt]);

  useEffect(() => {
    if (!running || paused || runStartedAt == null) return;
    if (secondsRemaining > 4 || secondsRemaining < 1) return;
    if (introPlayedForRunStartedAtRef.current === runStartedAt) return;

    introPlayedForRunStartedAtRef.current = runStartedAt;
    const introEl = introAudioRef.current;
    if (!introEl) return;
    introEl.currentTime = 0;
    void introEl.play().catch((err: unknown) => {
      log.error("pomodoro: failed to play intro chime", err);
    });
  }, [running, paused, runStartedAt, secondsRemaining]);

  useEffect(() => {
    if (deadlineCrossed) return;
    const mainEl = mainAudioRef.current;
    if (!mainEl) return;
    mainEl.pause();
    mainEl.currentTime = 0;
  }, [deadlineCrossed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    void Notification.requestPermission?.();
  }, []);

  return [phase, running, paused];
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

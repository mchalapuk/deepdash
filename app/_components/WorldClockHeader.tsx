"use client";

import {
  ActionIcon,
  Autocomplete,
  Box,
  Group,
  Stack,
  Text,
} from "@mantine/core";
import { IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useSnapshot } from "valtio/react";
import {
  addWorldClock,
  loadWorldClocksFromStorage,
  removeWorldClock,
  subscribeWorldClockPersistence,
  worldClockStore,
} from "@/app/_stores/worldClockStore";
import {
  formatGmtOffsetLabel,
  formatZonedDayPeriod,
  getLocalTimeZone,
  getSupportedTimeZones,
  getSystemTimeZone,
  wallClockDateForTimeZone,
} from "@/lib/timezones";
import "react-clock/dist/Clock.css";

const Clock = dynamic(() => import("react-clock"), { ssr: false });

const allowedZones = new Set(getSupportedTimeZones());

const CLOCK_SIZE = 110;

function subscribeReducedMotion(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getReducedMotionSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
}

function WorldClockAnalog({
  wall,
  dayPeriod,
  reduceMotion,
}: {
  wall: Date;
  dayPeriod: string;
  reduceMotion: boolean;
}) {
  return (
    <Group justify="center" wrap="nowrap">
      <Box
        style={{
          position: "relative",
          width: CLOCK_SIZE,
          height: CLOCK_SIZE,
          flexShrink: 0,
        }}
      >
        <Clock
          value={wall}
          size={CLOCK_SIZE}
          renderSecondHand={!reduceMotion}
          renderNumbers={false}
        />
        {dayPeriod ? (
          <Text
            component="span"
            size="xs"
            c="gray.9"
            fw={700}
            style={{
              position: "absolute",
              left: "50%",
              top: "75%",
              transform: "translateX(-50%) scale(0.75)",
              pointerEvents: "none",
              lineHeight: 1,
              letterSpacing: "0.02em",
              userSelect: "none",
            }}
          >
            {dayPeriod}
          </Text>
        ) : null}
      </Box>
    </Group>
  );
}

function additionalLabelLines(
  additionalLabel: string | readonly string[] | undefined,
): string[] {
  if (additionalLabel === undefined) return [];
  return typeof additionalLabel === "string"
    ? [additionalLabel]
    : [...additionalLabel];
}

function WorldClockCard({
  timeZone,
  now,
  reduceMotion,
  additionalLabel,
  onRemove,
}: {
  timeZone: string;
  now: Date;
  reduceMotion: boolean;
  /** Shown below the IANA id and GMT, each wrapped in parentheses, e.g. `(Local Time)`. */
  additionalLabel?: string | readonly string[];
  onRemove?: () => void;
}) {
  const wall = wallClockDateForTimeZone(now, timeZone);
  const gmt = formatGmtOffsetLabel(now, timeZone);
  const dayPeriod = formatZonedDayPeriod(now, timeZone);
  const extras = additionalLabelLines(additionalLabel);

  return (
    <Box py="xs" pr="xl">
      <Stack gap="ms">
        <WorldClockAnalog
          wall={wall}
          dayPeriod={dayPeriod}
          reduceMotion={reduceMotion}
        />
        <Stack gap={3}>
          <Group
            gap={6}
            wrap="nowrap"
            justify="center"
            align="center"
            style={{ width: "100%" }}
          >
            <Text
              size="xs"
              c="dimmed"
              ta="center"
              lineClamp={3}
              style={{
                lineHeight: 1.3,
                minWidth: 0,
                wordBreak: "break-word",
              }}
            >
              {timeZone}
            </Text>
            {onRemove ? (
              <div className="w-0 h-0 overflow-visible">
                <ActionIcon
                  variant="subtle"
                  color="gray.7"
                  size="xs"
                  onClick={onRemove}
                  aria-label={`Remove clock ${timeZone}`}
                  className="relative translate-y-[-60%] translate-x-[-4px]"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </div>
            ) : null}
          </Group>
          <Text size="xs" c="dimmed" ta="center" style={{ lineHeight: 1.3 }}>
            {gmt}
          </Text>
          {extras.map((line, i) => (
            <Text
              key={`${line}-${i}`}
              size="xs"
              c="gray.8"
              ta="center"
              fw={500}
              style={{ lineHeight: 1.3 }}
            >
              ({line})
            </Text>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}

export function WorldClockHeader() {
  const snap = useSnapshot(worldClockStore);
  const reduceMotion = useReducedMotion();
  const [now, setNow] = useState(() => new Date());
  /** Set after first client read of host time zones (null avoids a flash of pinned UTC before `Intl` resolves). */
  const [envZones, setEnvZones] = useState<{
    local: string;
    system: string;
  } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [tzQuery, setTzQuery] = useState("");
  const autocompleteRef = useRef<HTMLInputElement>(null);
  const addWrapRef = useRef<HTMLDivElement>(null);
  const addOpenRef = useRef(addOpen);
  const dropdownOpenRef = useRef(false);
  const commitSelectionRef = useRef(false);
  const envReadGen = useRef(0);

  useEffect(() => {
    const read = () => {
      const gen = ++envReadGen.current;
      void (async () => {
        const system = getSystemTimeZone();
        const local = await getLocalTimeZone();
        if (gen !== envReadGen.current) return;
        setEnvZones({ local, system });
      })();
    };
    read();
    window.addEventListener("timezonechange", read);
    return () => {
      envReadGen.current += 1;
      window.removeEventListener("timezonechange", read);
    };
  }, []);

  const envTzReady = envZones !== null;
  const localTz = envZones?.local ?? "UTC";
  const systemTz = envZones?.system ?? "UTC";

  const implicitZoneSet = useMemo(() => {
    if (localTz === systemTz) return new Set([localTz]);
    return new Set([localTz, systemTz]);
  }, [localTz, systemTz]);

  const visibleUserClocks = useMemo(
    () => snap.clocks.filter((c) => !implicitZoneSet.has(c.timeZone)),
    [snap.clocks, implicitZoneSet],
  );

  const tzData = useMemo(() => {
    const taken = new Set<string>();
    for (const c of snap.clocks) taken.add(c.timeZone);
    implicitZoneSet.forEach((z) => taken.add(z));
    return getSupportedTimeZones().filter((z) => !taken.has(z));
  }, [snap.clocks, implicitZoneSet]);

  useLayoutEffect(() => {
    addOpenRef.current = addOpen;
  }, [addOpen]);

  const cancelAdd = useCallback(() => {
    setAddOpen(false);
    setTzQuery("");
  }, []);

  useEffect(() => {
    const unsub = subscribeWorldClockPersistence();
    loadWorldClocksFromStorage();
    return unsub;
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const onSubmitZone = useCallback((value: string) => {
    if (!allowedZones.has(value)) return;
    if (implicitZoneSet.has(value)) return;
    if (worldClockStore.clocks.some((c) => c.timeZone === value)) return;
    commitSelectionRef.current = true;
    addWorldClock(value);
    setTzQuery("");
    setAddOpen(false);
    queueMicrotask(() => {
      commitSelectionRef.current = false;
    });
  }, [implicitZoneSet]);

  useEffect(() => {
    if (!addOpen) return;
    const id = requestAnimationFrame(() => autocompleteRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [addOpen]);

  const onAutocompleteBlur = useCallback(() => {
    window.setTimeout(() => {
      if (commitSelectionRef.current) return;
      if (dropdownOpenRef.current) return;
      if (!addOpenRef.current) return;
      const ae = document.activeElement;
      if (addWrapRef.current?.contains(ae)) return;
      cancelAdd();
    }, 0);
  }, [cancelAdd]);

  return (
    <Box
      component="header"
      style={{
        overflowX: "auto",
        overflowY: "hidden",
        width: "100%",
      }}
      py="md"
    >
      <Group
        wrap="nowrap"
        align="flex-start"
        gap="md"
        style={{ width: "max-content", paddingBottom: 4 }}
      >
        {envTzReady ? (
          <>
            {localTz === systemTz ? (
              <WorldClockCard
                key={`pinned-merged-${localTz}`}
                timeZone={localTz}
                now={now}
                reduceMotion={reduceMotion}
                additionalLabel="Local Time"
              />
            ) : (
              <>
                <WorldClockCard
                  key={`pinned-local-${localTz}`}
                  timeZone={localTz}
                  now={now}
                  reduceMotion={reduceMotion}
                  additionalLabel="Local Time"
                />
                <WorldClockCard
                  key={`pinned-system-${systemTz}`}
                  timeZone={systemTz}
                  now={now}
                  reduceMotion={reduceMotion}
                  additionalLabel="System Time"
                />
              </>
            )}
            {visibleUserClocks.map((c) => (
              <WorldClockCard
                key={c.id}
                timeZone={c.timeZone}
                now={now}
                reduceMotion={reduceMotion}
                onRemove={() => removeWorldClock(c.id)}
              />
            ))}
            <Box
              style={{
                flex: "0 0 auto",
                width: addOpen ? 200 : 48,
                minHeight: 120,
                display: "flex",
                alignItems: "flex-start",
              }}
              py="xs"
            >
              {addOpen ? (
                <Box ref={addWrapRef} style={{ width: "100%" }}>
                  <Autocomplete
                    ref={autocompleteRef}
                    placeholder="Search IANA time zone"
                    data={tzData}
                    value={tzQuery}
                    onChange={setTzQuery}
                    onOptionSubmit={onSubmitZone}
                    onDropdownOpen={() => {
                      dropdownOpenRef.current = true;
                    }}
                    onDropdownClose={() => {
                      dropdownOpenRef.current = false;
                    }}
                    onBlur={onAutocompleteBlur}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        (e.currentTarget as HTMLInputElement).blur();
                      }
                    }}
                    limit={40}
                    comboboxProps={{ withinPortal: true }}
                    autoComplete="off"
                    rightSectionPointerEvents="all"
                    rightSection={
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={cancelAdd}
                        aria-label="Cancel adding clock"
                      >
                        <IconX size={16} />
                      </ActionIcon>
                    }
                  />
                </Box>
              ) : (
                <ActionIcon
                  variant="light"
                  size="xl"
                  radius="md"
                  onClick={() => {
                    setTzQuery("");
                    setAddOpen(true);
                  }}
                  aria-label="Add world clock"
                >
                  <IconPlus size={22} />
                </ActionIcon>
              )}
            </Box>
          </>
        ) : null}
      </Group>
    </Box>
  );
}

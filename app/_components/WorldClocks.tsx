"use client";

import {
  ActionIcon,
  Autocomplete,
  Box,
  Group,
  Skeleton,
  Stack,
  Text,
  ScrollArea,
  Space,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import { IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { useCurrentPhase } from "@/app/_stores/pomodoroStore";
import {
  useWorldClockHydrated,
  useWorldClocks,
  worldClockActions,
  type WorldClockEntry,
} from "@/app/_stores/worldClockStore";
import { usePhaseColor, usePhaseBackgroundColor } from "@/lib/layout";
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
const CLOCK_SIZE = 100;
const allowedZones = new Set(getSupportedTimeZones());

export function WorldClocks() {
  const m = useWorldClockHeaderMechanics();
  const backgroundColor = usePhaseBackgroundColor();

  return (
    <ScrollArea
      component="header"
      pos="relative"
      w="100%"
      h="173px"
      styles={{ thumb: { backgroundColor: "green.8", opacity: 0.5 } }}
      scrollbars="x"
    >
      {m.headerReady ? (
        <WorldClockPanel {...m} />
      ) : (
        <WorldClocksHeaderSkeleton />
      )}
      <div className="absolute top-0 right-0 w-[80px] h-full" style={{
        background: `linear-gradient(to left, ${backgroundColor}, transparent)`,
      }} />
    </ScrollArea>
  );
}

type WorldClockHeaderProps = {
  envTzReady: boolean;
  clocksHydrated: boolean;
  /** Both IANA env and persisted clocks are ready — show real header. */
  headerReady: boolean;
  localTz: string;
  systemTz: string;
  now: Date;
  visibleUserClocks: readonly WorldClockEntry[];
  implicitZoneSet: Set<string>;
  clocks: readonly WorldClockEntry[];
};

function WorldClockPanel(m: WorldClockHeaderProps) {
  const { localTz, systemTz, now, visibleUserClocks, implicitZoneSet, clocks } = m;

  return (
    <Group
      wrap="nowrap"
      align="flex-start"
      gap={0}
      style={{ width: "max-content", paddingBottom: 4 }}
      ml={-24}
    >
      {localTz === systemTz ? (
        <WorldClockCard
          key={`pinned-merged-${localTz}`}
          timeZone={localTz}
          now={now}
          additionalLabel="Local Time"
        />
      ) : (
        <>
          <WorldClockCard
            key={`pinned-local-${localTz}`}
            timeZone={localTz}
            now={now}
            additionalLabel="Local Time"
          />
          <WorldClockCard
            key={`pinned-system-${systemTz}`}
            timeZone={systemTz}
            now={now}
            additionalLabel="System Time"
          />
        </>
      )}
      {visibleUserClocks.map((c) => (
        <WorldClockCard
          key={c.id}
          timeZone={c.timeZone}
          now={now}
          onRemove={() => worldClockActions.removeWorldClock(c.id)}
        />
      ))}
      <AddClockButton {...{ implicitZoneSet, clocks }} />
      <Space w={32} />
    </Group>
  );
}

/** Shown until host time zones resolve and world-clock storage has hydrated. */
function WorldClocksHeaderSkeleton() {
  return (
    <Group
      wrap="nowrap"
      align="flex-start"
      gap={0}
      style={{ width: "max-content", paddingBottom: 4, opacity: 0.5 }}
      ml={-24}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <VisuallyHidden>Loading world clocks</VisuallyHidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <WorldClockCardSkeleton key={i} />
      ))}
    </Group>
  );
}

/** Mirrors {@link WorldClockCard} layout: analog-sized circle + stacked labels. */
function WorldClockCardSkeleton() {
  return (
    <Box w="154px" style={{ overflow: "hidden" }}>
      <Stack gap="ms">
        <Group justify="center" wrap="nowrap">
          <Skeleton height={CLOCK_SIZE} width={CLOCK_SIZE} circle aria-hidden />
        </Group>
        <Stack gap={6} align="center">
          <Skeleton height={14} width={118} radius="sm" aria-hidden />
          <Skeleton height={14} width={76} radius="sm" aria-hidden />
        </Stack>
      </Stack>
    </Box>
  );
}

type WorldClockCardProps = {
  timeZone: string;
  now: Date;
  /** Shown below the IANA id and GMT, each wrapped in parentheses, e.g. `(Local Time)`. */
  additionalLabel?: string | readonly string[];
  onRemove?: () => void;
};

function WorldClockCard({
  timeZone,
  now,
  additionalLabel,
  onRemove,
}: WorldClockCardProps) {
  const wall = wallClockDateForTimeZone(now, timeZone);
  const gmt = formatGmtOffsetLabel(now, timeZone);
  const dayPeriod = formatZonedDayPeriod(now, timeZone);
  const extras = additionalLabelLines(additionalLabel);
  const removeLabel = `Remove clock`;

  return (
    <Box w="154px" style={{ overflow: "hidden" }}>
      <Stack gap="ms">
        <WorldClockAnalog {...{ wall, dayPeriod }} />
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
                <Tooltip
                  label={removeLabel}
                  position="right"
                  withArrow
                  arrowOffset={10}
                  arrowSize={8}
                  events={{ hover: true, focus: true, touch: true }}
                  color="darker.7"
                  openDelay={500}
                  transitionProps={{ transition: 'fade-right', duration: 300 }}
                >
                  <ActionIcon
                    variant="subtle"
                    color="gray.6"
                    size="xs"
                    onClick={onRemove}
                    aria-label={removeLabel}
                    className="relative translate-y-[-60%] translate-x-[-4px] opacity-75"
                  >
                    <IconTrash size={16} stroke={2} />
                  </ActionIcon>
                </Tooltip>
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
              ta="center"
              fw={500}
              style={{ lineHeight: 1.3, opacity: 0.25 }}
            >
              ({line})
            </Text>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}

type AddClockButtonProps = {
  implicitZoneSet: Set<string>;
  clocks: readonly WorldClockEntry[];
};

/**
 * Compact trigger that expands into an autocomplete slot (fixed column width).
 * Holds its own state/effects; parent passes only validation context.
 */
function AddClockButton({ implicitZoneSet, clocks }: AddClockButtonProps) {
  const primaryColor = usePhaseColor();
  const {
    expanded,
    onExpand,
    onCancel,
    wrapRef,
    inputRef,
    query,
    onQueryChange,
    options,
    onPick,
    onDropdownOpen,
    onDropdownClose,
    onBlur,
  } = useWorldClockAddColumn({ implicitZoneSet, clocks });

  const searchPlaceholder = "Search IANA time zone";
  const addAriaLabel = "Add clock";
  const cancelAriaLabel = "Cancel";

  return (
    <Box
      style={{
        flex: "0 0 auto",
        width: expanded ? 200 : 48,
        minHeight: 120,
        display: "flex",
        alignItems: "flex-start",
        zIndex: 1,
      }}
      py="xs"
    >
      {expanded ? (
        <Box ref={wrapRef} style={{ width: "100%" }}>
          <Autocomplete
            ref={inputRef}
            placeholder={searchPlaceholder}
            data={options}
            value={query}
            onChange={onQueryChange}
            onOptionSubmit={onPick}
            onDropdownOpen={onDropdownOpen}
            onDropdownClose={onDropdownClose}
            onBlur={onBlur}
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
              <Tooltip
                label={cancelAriaLabel}
                position="top-end"
                withArrow
                arrowOffset={10}
                arrowSize={8}
                events={{ hover: true, focus: true, touch: true }}
                color="darker.7"
                openDelay={500}
                transitionProps={{ transition: 'fade-up', duration: 300 }}
              >
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  color={primaryColor}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onCancel}
                  aria-label={cancelAriaLabel}
                >
                  <IconX size={16} stroke={2} />
                </ActionIcon>
              </Tooltip>
            }
          />
        </Box>
      ) : (
        <Tooltip
          label={addAriaLabel}
          position="top-end"
          withArrow
          arrowOffset={20}
          arrowSize={8}
          events={{ hover: true, focus: true, touch: true }}
          color="darker.7"
          transitionProps={{ transition: 'fade-up', duration: 300 }}
          openDelay={500}
        >
          <ActionIcon
            variant="light"
            size="lg"
            radius="md"
            color={primaryColor}
            onClick={onExpand}
            aria-label={addAriaLabel}
          >
            <IconPlus size={20} stroke={2} />
          </ActionIcon>
        </Tooltip>
      )}
    </Box>
  );
}

function WorldClockAnalog({
  wall,
  dayPeriod,
}: {
  wall: Date;
  dayPeriod: string;
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
        <Skeleton
          height={CLOCK_SIZE}
          width={CLOCK_SIZE}
          circle
          aria-hidden
          style={{ position: "absolute", top: 0, left: 0, opacity: 0.5 }}
          animate={false}
        />
        <Clock
          value={wall}
          size={CLOCK_SIZE}
          renderSecondHand
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

function useWorldClockHeaderMechanics(): WorldClockHeaderProps {
  const { envTzReady, localTz, systemTz } = useHostTimeZones();
  const clocksHydrated = useWorldClockHydrated();
  const clocks = useWorldClocks();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => worldClockActions.init(), []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const implicitZoneSet = useMemo(() => {
    if (localTz === systemTz) return new Set([localTz]);
    return new Set([localTz, systemTz]);
  }, [localTz, systemTz]);

  const visibleUserClocks = useMemo(
    () => clocks.filter((c) => !implicitZoneSet.has(c.timeZone)),
    [clocks, implicitZoneSet],
  );

  const headerReady = envTzReady && clocksHydrated;

  return {
    envTzReady,
    clocksHydrated,
    headerReady,
    localTz,
    systemTz,
    now,
    visibleUserClocks,
    implicitZoneSet,
    clocks,
  };
}

function useHostTimeZones(): {
  envTzReady: boolean;
  localTz: string;
  systemTz: string;
} {
  /** Null until first client read of host zones (avoids a flash of pinned UTC before `Intl` resolves). */
  const [envZones, setEnvZones] = useState<{
    local: string;
    system: string;
  } | null>(null);
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
  return { envTzReady, localTz, systemTz };
}

function useWorldClockAddColumn({
  implicitZoneSet,
  clocks,
}: {
  implicitZoneSet: Set<string>;
  clocks: readonly WorldClockEntry[];
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [tzQuery, setTzQuery] = useState("");
  const autocompleteRef = useRef<HTMLInputElement>(null);
  const addWrapRef = useRef<HTMLDivElement>(null);
  const addOpenRef = useRef(addOpen);
  const dropdownOpenRef = useRef(false);
  const commitSelectionRef = useRef(false);

  useLayoutEffect(() => {
    addOpenRef.current = addOpen;
  }, [addOpen]);

  useEffect(() => {
    if (!addOpen) return;
    const id = requestAnimationFrame(() => autocompleteRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [addOpen]);

  const tzData = useMemo(() => {
    const taken = new Set<string>();
    for (const c of clocks) taken.add(c.timeZone);
    implicitZoneSet.forEach((z) => taken.add(z));
    return getSupportedTimeZones().filter((z) => !taken.has(z));
  }, [clocks, implicitZoneSet]);

  const cancelAdd = useCallback(() => {
    setAddOpen(false);
    setTzQuery("");
  }, []);

  const onSubmitZone = useCallback(
    (value: string) => {
      if (!allowedZones.has(value)) return;
      if (implicitZoneSet.has(value)) return;
      if (clocks.some((c) => c.timeZone === value)) return;
      commitSelectionRef.current = true;
      worldClockActions.addWorldClock(value);
      setTzQuery("");
      setAddOpen(false);
      queueMicrotask(() => {
        commitSelectionRef.current = false;
      });
    },
    [implicitZoneSet, clocks],
  );

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

  const onDropdownOpen = useCallback(() => {
    dropdownOpenRef.current = true;
  }, []);

  const onDropdownClose = useCallback(() => {
    dropdownOpenRef.current = false;
  }, []);

  return {
    expanded: addOpen,
    onExpand: () => {
      setTzQuery("");
      setAddOpen(true);
    },
    onCancel: cancelAdd,
    wrapRef: addWrapRef,
    inputRef: autocompleteRef,
    query: tzQuery,
    onQueryChange: setTzQuery,
    options: tzData,
    onPick: onSubmitZone,
    onDropdownOpen,
    onDropdownClose,
    onBlur: onAutocompleteBlur,
  };
}

function additionalLabelLines(
  additionalLabel: string | readonly string[] | undefined,
): string[] {
  if (additionalLabel === undefined) return [];
  return typeof additionalLabel === "string"
    ? [additionalLabel]
    : [...additionalLabel];
}

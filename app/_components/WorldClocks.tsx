"use client";

import {
  ActionIcon,
  Autocomplete,
  Box,
  Group,
  Stack,
  Text,
  ScrollArea,
  Space,
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
  useWorldClocks,
  worldClockActions,
  type WorldClockEntry,
} from "@/app/_stores/worldClockStore";
import { getColorFromPhase } from "@/lib/layout";
import {
  formatGmtOffsetLabel,
  formatZonedDayPeriod,
  getLocalTimeZone,
  getSupportedTimeZones,
  getSystemTimeZone,
  wallClockDateForTimeZone,
} from "@/lib/timezones";
import "react-clock/dist/Clock.css";
import { PHASE_TINT } from "./PhaseBackdrop";

const Clock = dynamic(() => import("react-clock"), { ssr: false });
const CLOCK_SIZE = 110;
const allowedZones = new Set(getSupportedTimeZones());

export function WorldClocks() {
  const m = useWorldClockHeaderMechanics();
  const phase = useCurrentPhase();

  return (
    <ScrollArea
      component="header"
      pos="relative"
      w="100%"
      styles={{ thumb: { backgroundColor: "green.8", opacity: 0.5 } }}
      scrollbars="x"
    >
      <Group
        wrap="nowrap"
        align="flex-start"
        gap="md"
        style={{ width: "max-content", paddingBottom: 4 }}
      >
        {m.envTzReady ? <WorldClockPanel {...m} /> : null}
        <Space w={32} />
      </Group>
      <div className="absolute top-0 right-0 w-[80px] h-full" style={{
        background: `linear-gradient(to left, ${PHASE_TINT[phase]}, transparent)`,
      }} />
    </ScrollArea>
  );
}

type WorldClockHeaderProps = {
  envTzReady: boolean;
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
    <>
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
    </>
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

  return (
    <Box py="xs" pr="xl">
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
                <ActionIcon
                  variant="subtle"
                  color="gray.7"
                  size="xs"
                  onClick={onRemove}
                  aria-label={`Remove clock ${timeZone}`}
                  className="relative translate-y-[-60%] translate-x-[-4px]"
                >
                  <IconTrash size={16} stroke={2} />
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

type AddClockButtonProps = {
  implicitZoneSet: Set<string>;
  clocks: readonly WorldClockEntry[];
};

/**
 * Compact trigger that expands into an autocomplete slot (fixed column width).
 * Holds its own state/effects; parent passes only validation context.
 */
function AddClockButton({ implicitZoneSet, clocks }: AddClockButtonProps) {
  const pomodoroPhase = useCurrentPhase();
  const primaryColor = getColorFromPhase(pomodoroPhase);
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
    searchPlaceholder,
    addAriaLabel,
    cancelAriaLabel,
  } = useWorldClockAddColumn({ implicitZoneSet, clocks });

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
            }
          />
        </Box>
      ) : (
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

  return {
    envTzReady,
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
    searchPlaceholder: "Search IANA time zone",
    addAriaLabel: "Add world clock",
    cancelAriaLabel: "Cancel adding clock",
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

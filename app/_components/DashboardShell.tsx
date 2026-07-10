"use client";

import { Box, Container, Group, Stack, Space } from "@mantine/core";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { usePhaseColor } from "@/lib/layout";
import log from "@/lib/logger";

import { AboutModalLink } from "./AboutModalLink";
import { Pomodoro } from "./Pomodoro";
import { TodaysTodo } from "./TodaysTodo";
import { TodaysWork } from "./TodaysWork";
import { Logo } from "./Logo";
import { DataImportExport } from "./DataImportExport";

/** Below this width the two desktop columns no longer fit side by side. */
const MOBILE_LAYOUT_QUERY = "(max-width: 992px)";
const SWIPE_PAGE_LABELS = ["Timer & work log", "Tasks"] as const;
const SWIPE_PAGE_COUNT = SWIPE_PAGE_LABELS.length;
/** Fraction of page width a drag must cross to commit to the next/previous page. */
const SWIPE_COMMIT_RATIO = 0.22;
/** Movement (px) before a drag is classified as horizontal vs. vertical scroll. */
const SWIPE_AXIS_LOCK_PX = 8;
/** Divides drag distance past the first/last page so it feels like resistance, not a free drag. */
const SWIPE_EDGE_RESISTANCE_DIVISOR = 3;
const SWIPE_SNAP_TRANSITION = "transform 260ms cubic-bezier(0.22, 1, 0.36, 1)";

export function DashboardShell({ initialAboutOpen = false }: { initialAboutOpen?: boolean }) {
  return (
    <Container
      component="main"
      id="main-content"
      size="872px"
      py={0}
      pl={{ base: 18, md: 0 }}
      pr={0}
      aria-label="Productivity tools"
      h="100vh"
      style={{ overflow: "hidden" }}
    >
      <Stack
        gap={0}
        align="start"
      >
        <Group gap={8} w="100%">
          <Box
            component="a"
            href="http://deepda.sh/"
            display="block"
            w="min-content"
            h={{ base: "70px", md: "100px" }}
            mt={ -4 }
            ml={{ base: -17, md: -20 }}
            mb={{ base: -32, md: -32 }}
          >
            <Logo height="100%" />
          </Box>
          <Space style={{ flexGrow: 1 }} />
          <Stack
            h={0}
            pr={6}
            style={{ overflow:"visible", position: "relative", top: "4px" }}
          >
            <Space visibleFrom="md" style={{ height: "4px", overflow: "hidden", marginTop: "-14px" }} />
            <AboutModalLink initialOpen={initialAboutOpen} />
          </Stack>
          <Space style={{ flexGrow: 1 }} visibleFrom="md" />
          <Group
            h={0}
            pr={20}
            justify="end"
            style={{ overflow:"visible" }}
          >
            <DataImportExport layout="horizontal" />
          </Group>
        </Group>
        <MobileColumns />
        <DesktopColumns />
      </Stack>
    </Container>
  );
}

function DesktopColumns() {
  return (
    <Group
      gap={20}
      style={{
        height: "calc(100dvh - 96px)",
        width: "100%",
        minHeight: 0,
      }}
      visibleFrom="md"
    >
      <Stack
        gap={28}
        w="542px"
        h="100%"
        className="min-h-0"
        style={{ overflow: "hidden" }}
      >
        <PomodoroAndWorkLog />
      </Stack>
      <Box h="100%" className="min-h-0" style={{ overflow: "hidden", flexGrow: 1 }}>
        <TodaysTodo />
      </Box>
    </Group>
  );
}

function MobileColumns() {
  const phaseColor = usePhaseColor();
  const { activePage, containerRef, trackRef, onPointerDown, goToPage } =
    useSwipePager(SWIPE_PAGE_COUNT);

  return (
    <Box
      ref={containerRef}
      onPointerDown={onPointerDown}
      style={{
        height: "calc(100dvh - 34px)",
        width: "100%",
        minHeight: 0,
      }}
      hiddenFrom="md"
    >
      <div
        ref={trackRef}
        style={{
          display: "flex",
          flexWrap: "nowrap",
          height: "calc(100% - 50px)" }}
      >
        <Stack
          gap={28}
          h="100%"
          className="min-h-0"
          style={{ overflow: "hidden", flex: "0 0 100%", minWidth: 0 }}
        >
          <PomodoroAndWorkLog />
        </Stack>
        <Box
          h="100%"
          pt={28}
          className="min-h-0"
          style={{ overflow: "hidden", flex: "0 0 100%", minWidth: 0 }}
        >
          <TodaysTodo />
        </Box>
      </div>
      <SwipePagerDots
        activePage={activePage}
        color={phaseColor}
        onSelect={goToPage}
      />
    </Box>
  );
}

function PomodoroAndWorkLog() {
  return (
    <>
      <Box style={{ flexShrink: 0 }} pt={28} pr={18}>
        <Pomodoro />
      </Box>
      <TodaysWork />
    </>
  );
}

function SwipePagerDots({
  activePage,
  color,
  onSelect,
}: {
  activePage: number;
  color: string;
  onSelect: (index: number) => void;
}) {
  return (
    <Group
      mt={20}
      gap={8}
      justify="center"
      role="tablist"
      aria-label="Dashboard pages"
      style={{ flexShrink: 0 }}
    >
      {SWIPE_PAGE_LABELS.map((label, index) => {
        const active = index === activePage;
        return (
          <Box
            key={label}
            component="button"
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={label}
            onClick={() => onSelect(index)}
            bg={active ? color : "gray.7"}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              border: "none",
              padding: 0,
              cursor: "pointer",
              opacity: active ? 1 : 0.5,
            }}
          />
        );
      })}
    </Group>
  );
}

type SwipeDragState = {
  axisLocked: "x" | "y" | null;
  lastDragPx: number;
  detach: () => void;
};

/**
 * Pointer-driven horizontal pager (touch swipe + click-through dots), sized to its own
 * container width in px. `touch-action: pan-y` on the container lets native vertical
 * scroll (inside child ScrollAreas) through untouched; horizontal drags are recognized
 * once movement crosses `SWIPE_AXIS_LOCK_PX` and dominates over vertical movement.
 */
function useSwipePager(pageCount: number): {
  activePage: number;
  containerRef: RefObject<HTMLDivElement | null>;
  trackRef: RefObject<HTMLDivElement | null>;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  goToPage: (index: number) => void;
} {
  const [activePage, setActivePage] = useState(0);
  const activePageRef = useRef(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<SwipeDragState | null>(null);

  useEffect(() => {
    activePageRef.current = activePage;
  }, [activePage]);

  const applyTrackTransform = useCallback(
    (page: number, dragPx: number, animate: boolean) => {
      const track = trackRef.current;
      const container = containerRef.current;
      if (!track || !container) return;
      const pageWidthPx = container.clientWidth;
      track.style.transition = animate ? SWIPE_SNAP_TRANSITION : "none";
      track.style.transform = `translateX(${-page * pageWidthPx + dragPx}px)`;
    },
    [],
  );

  useEffect(() => {
    applyTrackTransform(activePage, 0, true);
  }, [activePage, applyTrackTransform]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      applyTrackTransform(activePageRef.current, 0, false);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [applyTrackTransform]);

  useEffect(() => {
    return () => {
      dragRef.current?.detach();
      dragRef.current = null;
    };
  }, []);

  const goToPage = useCallback(
    (index: number) => {
      setActivePage(clampPageIndex(index, pageCount));
    },
    [pageCount],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (dragRef.current) return;

      const pointerId = e.pointerId;
      const startX = e.clientX;
      const startY = e.clientY;
      const target = e.currentTarget;

      const onMove = (ev: PointerEvent) => {
        const st = dragRef.current;
        if (!st || ev.pointerId !== pointerId) return;

        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        if (st.axisLocked === null) {
          if (
            Math.abs(dx) < SWIPE_AXIS_LOCK_PX &&
            Math.abs(dy) < SWIPE_AXIS_LOCK_PX
          ) {
            return;
          }
          st.axisLocked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
          if (st.axisLocked === "x") {
            try {
              target.setPointerCapture(pointerId);
            } catch (err: unknown) {
              log.warn("dashboardShell: setPointerCapture failed", err);
            }
          }
        }
        if (st.axisLocked !== "x") return;

        ev.preventDefault();
        const atFirstPage = activePageRef.current === 0 && dx > 0;
        const atLastPage = activePageRef.current === pageCount - 1 && dx < 0;
        const dragPx =
          atFirstPage || atLastPage ? dx / SWIPE_EDGE_RESISTANCE_DIVISOR : dx;
        st.lastDragPx = dragPx;
        applyTrackTransform(activePageRef.current, dragPx, false);
      };

      const finishDrag = (ev: PointerEvent) => {
        const st = dragRef.current;
        if (!st || ev.pointerId !== pointerId) return;
        detach();
        dragRef.current = null;

        if (st.axisLocked !== "x") return;

        const pageWidthPx = containerRef.current?.clientWidth ?? 0;
        const commitThresholdPx = pageWidthPx * SWIPE_COMMIT_RATIO;
        let nextPage = activePageRef.current;
        if (st.lastDragPx <= -commitThresholdPx) nextPage += 1;
        else if (st.lastDragPx >= commitThresholdPx) nextPage -= 1;

        const clamped = clampPageIndex(nextPage, pageCount);
        if (clamped === activePageRef.current) {
          applyTrackTransform(clamped, 0, true);
        } else {
          setActivePage(clamped);
        }
      };

      const detach = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", finishDrag);
        window.removeEventListener("pointercancel", finishDrag);
      };

      dragRef.current = { axisLocked: null, lastDragPx: 0, detach };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", finishDrag);
      window.addEventListener("pointercancel", finishDrag);
    },
    [applyTrackTransform, pageCount],
  );

  return { activePage, containerRef, trackRef, onPointerDown, goToPage };
}

function clampPageIndex(index: number, pageCount: number): number {
  return Math.max(0, Math.min(pageCount - 1, index));
}

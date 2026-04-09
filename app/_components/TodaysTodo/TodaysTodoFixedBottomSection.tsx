"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";

import { Box } from "@mantine/core";

import { usePhaseBackgroundColor } from "@/lib/layout";
import { useTodoList } from "@/app/_stores/todoStore";

import { TaskListTitle } from "./TaskListTitle";

type Props = LabelArgs & {
  /** Scrolls to the in-flow Backlog header, then focuses the first backlog task (when present). */
  onBacklogClick: () => void;
};

/**
 * Bottom-of-viewport “Backlog” chip when the in-flow backlog header is below the fold.
 */
export function TodaysTodoFixedBottomSection({
  onBacklogClick,
  viewportRef,
  backlogSectionRef,
  backlogEndSpacerPx,
}: Props) {
  const backgroundColor = usePhaseBackgroundColor();

  const { showStickyBacklogLabel } = useTodaysTodoStickyBacklogLabel({
    viewportRef,
    backlogSectionRef,
    backlogEndSpacerPx,
  });

  return (
    <>
      <div
        className={`absolute ${showStickyBacklogLabel ? "bottom-10" : "bottom-0"} left-0 w-full h-[40px]`}
        style={{
          background: `linear-gradient(to top, ${backgroundColor}, transparent)`,
          pointerEvents: "none",
        }}
      />
      <Box style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        width: "100%",
        background: backgroundColor,
        zIndex: 2,
        border: "none",
        cursor: "pointer",
        textAlign: "left",
        display: showStickyBacklogLabel ? "block" : "none",
      }}>
        <TaskListTitle
          onClick={onBacklogClick}
          title="Scroll to Backlog section and focus first backlog task"
        >
          Backlog
        </TaskListTitle>
      </Box>
    </>
  );
}

type LabelArgs = {
  viewportRef: RefObject<HTMLDivElement | null>;
  backlogSectionRef: RefObject<HTMLElement | null>;
  backlogEndSpacerPx: number;
};

/**
 * When the in-flow “Backlog” header is below the fold, show a sticky label at the
 * bottom of the scroll viewport; click scrolls until the header aligns with the top
 * (same condition as the outer title switching to “Backlog”).
 */
function useTodaysTodoStickyBacklogLabel({
  viewportRef,
  backlogSectionRef,
  backlogEndSpacerPx,
}: LabelArgs): {
  showStickyBacklogLabel: boolean;
} {
  const { items: todayItems, backlogItems, hydrated } = useTodoList();
  const todayItemsLength = todayItems.length;
  const backlogItemsLength = backlogItems.length;
  const [showStickyBacklogLabel, setShowStickyBacklogLabel] = useState(false);

  const recompute = useCallback(() => {
    const vp = viewportRef.current;
    const header = backlogSectionRef.current;
    if (!vp || !header || !hydrated) {
      setShowStickyBacklogLabel(false);
      return;
    }
    const vr = vp.getBoundingClientRect();
    const br = header.getBoundingClientRect();
    const backlogHeaderEntirelyBelowViewport = br.top >= vr.bottom - 40;
    setShowStickyBacklogLabel(backlogHeaderEntirelyBelowViewport);
  }, [viewportRef, backlogSectionRef, hydrated]);

  useEffect(() => {
    const vp = viewportRef.current;
    const header = backlogSectionRef.current;
    recompute();
    if (!vp || !header) return;
    vp.addEventListener("scroll", recompute, { passive: true });
    const ro = new ResizeObserver(recompute);
    ro.observe(vp);
    ro.observe(header);
    return () => {
      vp.removeEventListener("scroll", recompute);
      ro.disconnect();
    };
  }, [
    viewportRef,
    backlogSectionRef,
    recompute,
    hydrated,
    todayItemsLength,
    backlogItemsLength,
    backlogEndSpacerPx,
  ]);

  useLayoutEffect(() => {
    recompute();
  }, [
    recompute,
    hydrated,
    todayItemsLength,
    backlogItemsLength,
    backlogEndSpacerPx,
  ]);

  return { showStickyBacklogLabel };
}

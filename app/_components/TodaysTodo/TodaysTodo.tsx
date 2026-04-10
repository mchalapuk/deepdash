"use client";

import {
  Box,
  ScrollArea,
  Space,
  Stack,
  Text,
} from "@mantine/core";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  todoActions,
  useTodoList,
  type TodoItem,
  type TodoListKind,
} from "@/app/_stores/todoStore";
import log from "@/lib/logger";

import { clampColumn } from "./todoRowHelpers";
import { TodoPersistedRow } from "./TodoPersistedRow";
import { TodaysTodoSectionTitle } from "./TodaysTodoSectionTitle";
import { TaskListTitle } from "./TaskListTitle";
import { TodaysTodoTasksSkeleton } from "./TodaysTodoTasksSkeleton";
import { TodoTrailingRow } from "./TodoTrailingRow";
import { TodaysTodoFixedBottomSection } from "./TodaysTodoFixedBottomSection";
import { useTodaysTodoRowReorder } from "./todaysTodoRowReorder";
import {
  textareaCaretIndexOnFirstVisualLine,
  textareaCaretIndexOnLastVisualLine,
} from "./todaysTodoTextareaNav";
import type {
  TodaysTodoDraftApi,
  TodaysTodoDragApi,
  TodaysTodoFocusApi,
  TodaysTodoUnifiedMechanics,
} from "./types";

/** Run after smooth scroll settles (`scrollend` + timeout fallback for older engines). */
function scheduleAfterViewportSmoothScroll(
  viewportRef: RefObject<HTMLDivElement | null>,
  action: () => void,
): void {
  const vp = viewportRef.current;
  if (!vp) {
    queueMicrotask(action);
    return;
  }
  let ran = false;
  const run = () => {
    if (ran) return;
    ran = true;
    action();
  };
  vp.addEventListener("scrollend", run, { once: true });
  window.setTimeout(run, 500);
}

export function TodaysTodo() {
  useEffect(() => {
    return todoActions.init();
  }, []);

  const { hydrated, items: todayItems, backlogItems } = useTodoList();

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const backlogSectionRef = useRef<HTMLButtonElement | null>(null);
  const backlogBlockMeasureRef = useRef<HTMLDivElement | null>(null);

  const backlogEndSpacerPx = useTodaysTodoBacklogEndSpacer({
    viewportRef,
    backlogBlockMeasureRef,
    hydrated,
    todayItemsLength: todayItems.length,
    backlogItemsLength: backlogItems.length,
  });

  const { trailingTargetList, updateTrailingTargetFromScroll } =
    useTodaysTodoTrailingTargetFromScroll({
      viewportRef,
      backlogSectionRef,
      hydrated,
      todayItemsLength: todayItems.length,
      backlogItemsLength: backlogItems.length,
      backlogEndSpacerPx,
    });

  const {
    draftAPI,
    focusAPI,
    lastRowScrollRef,
    dragAPIToday,
    dragAPIBacklog,
  } = useTodaysTodoMechanics(trailingTargetList, {
    hydrated,
    todayItems,
    backlogItems,
  });

  /** Trailing row Arrow Up / Arrow Left / Backspace: prefer last backlog row; if backlog empty, last today. */
  const lastItemForTrailingKeyboardNav =
    backlogItems.length > 0
      ? backlogItems[backlogItems.length - 1]!
      : todayItems.length > 0
        ? todayItems[todayItems.length - 1]!
        : null;

  const scrollToBacklogHeader = useCallback(() => {
    const vp = viewportRef.current;
    const header = backlogSectionRef.current;
    if (!vp || !header) return;
    const vr = vp.getBoundingClientRect();
    const br = header.getBoundingClientRect();
    const delta = br.top - vr.top + 40;
    vp.scrollTo({ top: vp.scrollTop + delta, behavior: "smooth" });
  }, [viewportRef, backlogSectionRef]);

  const onSectionTitleClick = useCallback(() => {
    if (trailingTargetList === "today") {
      viewportRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      scheduleAfterViewportSmoothScroll(viewportRef, () => {
        const first = todayItems[0];
        if (first) focusAPI.focusRow(first.id, 0);
      });
    } else {
      scrollToBacklogHeader();
      scheduleAfterViewportSmoothScroll(viewportRef, () => {
        const first = backlogItems[0];
        if (first) focusAPI.focusRow(first.id, 0);
      });
    }
  }, [
    trailingTargetList,
    viewportRef,
    todayItems,
    backlogItems,
    focusAPI,
    scrollToBacklogHeader,
  ]);

  const onBacklogHeadingClick = useCallback(() => {
    scrollToBacklogHeader();
    scheduleAfterViewportSmoothScroll(viewportRef, () => {
      const first = backlogItems[0];
      if (first) focusAPI.focusRow(first.id, 0);
    });
  }, [scrollToBacklogHeader, viewportRef, backlogItems, focusAPI]);

  return (
    <Stack
      gap={0}
      w="100%"
      h="100%"
      className="min-h-0"
      style={{ overflow: "hidden" }}
    >
      <TodaysTodoSectionTitle
        trailingTargetList={trailingTargetList}
        onClick={onSectionTitleClick}
      />
      <ScrollArea
        type="scroll"
        viewportRef={viewportRef}
        onScrollPositionChange={updateTrailingTargetFromScroll}
        pr={8}
        pos="relative"
        mb={8}
        style={{ minHeight: 0, flexGrow: 1 }}
        styles={{
          thumb: { backgroundColor: "green.8", opacity: 0.5 },
        }}
      >
        {!hydrated ? (
          <TodaysTodoTasksSkeleton />
        ) : (
          <Stack gap={0} pr={6} pb={4}>
            {todayItems.map((item, index) => (
              <TodoPersistedRow
                key={item.id}
                item={item}
                index={index}
                items={todayItems}
                listKind="today"
                focusAPI={focusAPI}
                dragAPI={dragAPIToday}
              />
            ))}
            <Box ref={backlogBlockMeasureRef}>
              <TaskListTitle
                ref={backlogSectionRef}
                onClick={onBacklogHeadingClick}
                title="Scroll to Backlog section"
              >
                Backlog
              </TaskListTitle>
              {backlogItems.map((item, index) => (
                <TodoPersistedRow
                  key={item.id}
                  item={item}
                  index={index}
                  items={backlogItems}
                  listKind="backlog"
                  focusAPI={focusAPI}
                  dragAPI={dragAPIBacklog}
                />
              ))}
            </Box>
            <Space h={backlogEndSpacerPx} />
            <Space h={28} ref={lastRowScrollRef} />
            <TodaysTodoFixedBottomSection
              onBacklogClick={onBacklogHeadingClick}
              {...{ viewportRef, backlogSectionRef, backlogEndSpacerPx }}
            />
          </Stack>
        )}
      </ScrollArea>
      <Box style={{ flexShrink: 0 }}>
        <TodoTrailingRow
          draftAPI={draftAPI}
          lastItem={lastItemForTrailingKeyboardNav}
          focusAPI={focusAPI}
        />
      </Box>
    </Stack>
  );
}

function useTodaysTodoMechanics(
  trailingTargetList: TodoListKind,
  list: {
    hydrated: boolean;
    todayItems: readonly TodoItem[];
    backlogItems: readonly TodoItem[];
  },
): Omit<TodaysTodoUnifiedMechanics, "hydrated" | "todayItems" | "backlogItems"> {
  const { hydrated, todayItems, backlogItems } = list;
  const { dragAPIToday, dragAPIBacklog, scrollPersistedRowIntoView } =
    useDragApi(todayItems, backlogItems);
  const [trailingDraft, setTrailingDraft] = useState("");
  const lastRowScrollRef = useRef<HTMLDivElement | null>(null);
  /** Per-list baselines so label/scroll-driven `trailingTargetList` switches do not look like an append. */
  const scrollBaselineByList = useRef<{
    today: { len: number; lastId?: string } | null;
    backlog: { len: number; lastId?: string } | null;
  }>({ today: null, backlog: null });

  const { focusAPI, commitTrailing } = useFocusApi({
    trailingTargetList,
    todayItems,
    backlogItems,
    trailingDraft,
    setTrailingDraft,
  });

  useLayoutEffect(() => {
    if (!hydrated) return;

    const runSlot = (
      slot: "today" | "backlog",
      items: readonly TodoItem[],
    ): boolean => {
      const len = items.length;
      const lastId = len > 0 ? items[len - 1]!.id : undefined;
      const prev = scrollBaselineByList.current[slot];
      if (prev === null) {
        scrollBaselineByList.current[slot] = { len, lastId };
        return false;
      }
      const appended = len > prev.len && len > 0 && lastId !== prev.lastId;
      scrollBaselineByList.current[slot] = { len, lastId };
      return appended;
    };

    const appendedToday = runSlot("today", todayItems);
    const appendedBacklog = runSlot("backlog", backlogItems);

    if (trailingTargetList === "today" && appendedToday) {
      const id = todayItems[todayItems.length - 1]!.id;
      scrollPersistedRowIntoView("today", id);
    } else if (trailingTargetList === "backlog" && appendedBacklog) {
      lastRowScrollRef.current?.scrollIntoView({
        block: "end",
        behavior: "smooth",
      });
    }
  }, [
    hydrated,
    todayItems.length,
    todayItems.length > 0 ? todayItems[todayItems.length - 1]!.id : "",
    backlogItems.length,
    backlogItems.length > 0 ? backlogItems[backlogItems.length - 1]!.id : "",
    trailingTargetList,
    scrollPersistedRowIntoView,
  ]);

  const draftAPI = useMemo<TodaysTodoDraftApi>(
    () => ({
      draft: trailingDraft,
      setDraft: setTrailingDraft,
      commitTrailing,
    }),
    [trailingDraft, setTrailingDraft, commitTrailing],
  );

  return {
    draftAPI,
    focusAPI,
    lastRowScrollRef,
    dragAPIToday,
    dragAPIBacklog,
  };
}

function useFocusApi({
  trailingTargetList,
  todayItems,
  backlogItems,
  trailingDraft,
  setTrailingDraft,
}: {
  trailingTargetList: TodoListKind;
  todayItems: readonly TodoItem[];
  backlogItems: readonly TodoItem[];
  trailingDraft: string;
  setTrailingDraft: (v: string) => void;
}): { focusAPI: TodaysTodoFocusApi; commitTrailing: (raw: string) => void } {
  const rowRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const trailingRef = useRef<HTMLTextAreaElement | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const focusRow = useCallback((id: string, pos: number) => {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        const el = rowRefs.current[id];
        if (!el) return;
        el.focus();
        try {
          el.setSelectionRange(pos, pos);
        } catch (e: unknown) {
          log.warn("todaysTodo: focusRow setSelectionRange failed", e);
        }
      });
    });
  }, []);

  const focusRowFromBelow = useCallback((id: string, columnOffset: number) => {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        const tel = rowRefs.current[id];
        if (!tel) return;
        tel.focus();
        const pos = textareaCaretIndexOnLastVisualLine(tel, columnOffset);
        try {
          tel.setSelectionRange(pos, pos);
        } catch (e: unknown) {
          log.warn("todaysTodo: focusRowFromBelow setSelectionRange failed", e);
        }
      });
    });
  }, []);

  const focusRowFromAbove = useCallback((id: string, columnOffset: number) => {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        const tel = rowRefs.current[id];
        if (!tel) return;
        tel.focus();
        const pos = textareaCaretIndexOnFirstVisualLine(tel, columnOffset);
        try {
          tel.setSelectionRange(pos, pos);
        } catch (e: unknown) {
          log.warn("todaysTodo: focusRowFromAbove setSelectionRange failed", e);
        }
      });
    });
  }, []);

  const focusTrailing = useCallback((pos: number) => {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        const el = trailingRef.current;
        if (!el) return;
        el.focus();
        try {
          el.setSelectionRange(pos, pos);
        } catch (e: unknown) {
          log.warn("todaysTodo: focusTrailing setSelectionRange failed", e);
        }
      });
    });
  }, []);

  const focusTrailingAtFirstLineColumn = useCallback((columnOffset: number) => {
    queueMicrotask(() => {
      requestAnimationFrame(() => {
        const el = trailingRef.current;
        if (!el) return;
        el.focus();
        const pos = textareaCaretIndexOnFirstVisualLine(el, columnOffset);
        try {
          el.setSelectionRange(pos, pos);
        } catch (e: unknown) {
          log.warn("todaysTodo: focusTrailingAtFirstLineColumn setSelectionRange failed", e);
        }
      });
    });
  }, []);

  const commitTrailing = useCallback(
    (raw: string) => {
      const text = raw.replace(/\s+$/, "");
      if (text.trim() === "") return;
      todoActions.addItem(text, false, trailingTargetList);
      setTrailingDraft("");
      focusTrailing(0);
    },
    [focusTrailing, trailingTargetList, setTrailingDraft],
  );

  const arrowDownFromLastToday = useCallback(
    (column: number) => {
      if (backlogItems.length > 0) {
        const first = backlogItems[0]!;
        focusRowFromAbove(first.id, column);
      } else {
        focusTrailingAtFirstLineColumn(column);
      }
    },
    [backlogItems, focusRowFromAbove, focusTrailingAtFirstLineColumn],
  );

  const arrowUpFromFirstBacklog = useCallback(
    (column: number) => {
      if (todayItems.length > 0) {
        const last = todayItems[todayItems.length - 1]!;
        focusRowFromBelow(last.id, column);
      } else {
        focusTrailingAtFirstLineColumn(column);
      }
    },
    [todayItems, focusRowFromBelow, focusTrailingAtFirstLineColumn],
  );

  const setRowInputRef = useCallback((itemId: string) => {
    return (el: HTMLTextAreaElement | null) => {
      if (el) {
        rowRefs.current[itemId] = el;
        el.onfocus = () => setFocusedId(itemId);
        el.onblur = () => setFocusedId(null);
      }
      else {
        const el = rowRefs.current[itemId];
        if (el) {
          el.onfocus = null;
          el.onblur = null;
        }
        delete rowRefs.current[itemId];
      }
    };
  }, []);

  const setTrailingInputRef = useCallback((el: HTMLTextAreaElement | null) => {
    trailingRef.current = el;
  }, []);

  const focusAPI = useMemo<TodaysTodoFocusApi>(
    () => ({
      focusedId,
      listKind: trailingTargetList,
      trailingDraftLength: trailingDraft.length,
      setRowInputRef,
      setTrailingInputRef,
      focusRow,
      focusRowFromBelow,
      focusRowFromAbove,
      focusTrailing,
      focusTrailingAtFirstLineColumn,
      arrowDownFromLastToday,
      arrowUpFromFirstBacklog,
    }),
    [
      focusedId,
      trailingTargetList,
      trailingDraft.length,
      setRowInputRef,
      setTrailingInputRef,
      focusRow,
      focusRowFromBelow,
      focusRowFromAbove,
      focusTrailing,
      focusTrailingAtFirstLineColumn,
      arrowDownFromLastToday,
      arrowUpFromFirstBacklog,
    ],
  );

  return { focusAPI, commitTrailing };
}

function useDragApi(
  todayItems: readonly TodoItem[],
  backlogItems: readonly TodoItem[],
): {
  dragAPIToday: TodaysTodoDragApi;
  dragAPIBacklog: TodaysTodoDragApi;
  scrollPersistedRowIntoView: (
    listKind: "today" | "backlog",
    id: string,
  ) => void;
} {
  const todayRowRootRefs = useRef<Record<string, HTMLElement | null>>({});
  const backlogRowRootRefs = useRef<Record<string, HTMLElement | null>>({});
  const dragAPIToday = useTodaysTodoRowReorder(todayItems, todayRowRootRefs);
  const dragAPIBacklog = useTodaysTodoRowReorder(
    backlogItems,
    backlogRowRootRefs,
  );

  const scrollPersistedRowIntoView = useCallback(
    (listKind: "today" | "backlog", id: string) => {
      const roots =
        listKind === "today" ? todayRowRootRefs : backlogRowRootRefs;
      queueMicrotask(() => {
        requestAnimationFrame(() => {
          const el = roots.current[id];
          el?.scrollIntoView({ block: "end", behavior: "smooth" });
        });
      });
    },
    [],
  );

  return { dragAPIToday, dragAPIBacklog, scrollPersistedRowIntoView };
}

type UseTodaysTodoBacklogEndSpacerArgs = {
  viewportRef: RefObject<HTMLDivElement | null>;
  backlogBlockMeasureRef: RefObject<HTMLElement | null>;
  hydrated: boolean;
  todayItemsLength: number;
  backlogItemsLength: number;
};

/** Fills remaining viewport height below the backlog block so the user can scroll the backlog header into view. */
function useTodaysTodoBacklogEndSpacer({
  viewportRef,
  backlogBlockMeasureRef,
  hydrated,
  todayItemsLength,
  backlogItemsLength,
}: UseTodaysTodoBacklogEndSpacerArgs): number {
  const [backlogEndSpacerPx, setBacklogEndSpacerPx] = useState(0);

  const recalcBacklogEndSpacer = useCallback(() => {
    const vp = viewportRef.current;
    const block = backlogBlockMeasureRef.current;
    if (!vp || !block) {
      setBacklogEndSpacerPx(0);
      return;
    }
    const vh = vp.clientHeight;
    const bh = block.offsetHeight;
    setBacklogEndSpacerPx(Math.max(0, Math.ceil(vh - bh)) + 9);
  }, [viewportRef, backlogBlockMeasureRef]);

  useLayoutEffect(() => {
    if (!hydrated) {
      setBacklogEndSpacerPx(0);
      return;
    }
    recalcBacklogEndSpacer();
    const vp = viewportRef.current;
    const block = backlogBlockMeasureRef.current;
    if (!vp || !block) return;
    const ro = new ResizeObserver(recalcBacklogEndSpacer);
    ro.observe(vp);
    ro.observe(block);
    return () => {
      ro.disconnect();
    };
  }, [
    hydrated,
    recalcBacklogEndSpacer,
    todayItemsLength,
    backlogItemsLength,
    viewportRef,
    backlogBlockMeasureRef,
  ]);

  return backlogEndSpacerPx;
}

type UseTodaysTodoTrailingTargetFromScrollArgs = {
  viewportRef: RefObject<HTMLDivElement | null>;
  backlogSectionRef: RefObject<HTMLElement | null>;
  hydrated: boolean;
  todayItemsLength: number;
  backlogItemsLength: number;
  backlogEndSpacerPx: number;
};

/**
 * Which list the trailing “add task” row targets, derived from whether the backlog
 * section header has scrolled to the top of the scroll viewport.
 */
function useTodaysTodoTrailingTargetFromScroll({
  viewportRef,
  backlogSectionRef,
  hydrated,
  todayItemsLength,
  backlogItemsLength,
  backlogEndSpacerPx,
}: UseTodaysTodoTrailingTargetFromScrollArgs): {
  trailingTargetList: TodoListKind;
  updateTrailingTargetFromScroll: () => void;
} {
  const [trailingTargetList, setTrailingTargetList] =
    useState<TodoListKind>("today");

  const updateTrailingTargetFromScroll = useCallback(() => {
    const vp = viewportRef.current;
    const backlogEl = backlogSectionRef.current;
    if (!vp || !backlogEl) return;
    const vr = vp.getBoundingClientRect();
    const br = backlogEl.getBoundingClientRect();
    setTrailingTargetList(br.top <= vr.top - 28 ? "backlog" : "today");
  }, [viewportRef, backlogSectionRef]);

  useEffect(() => {
    const vp = viewportRef.current;
    updateTrailingTargetFromScroll();
    if (!vp) return;
    vp.addEventListener("scroll", updateTrailingTargetFromScroll, {
      passive: true,
    });
    const ro = new ResizeObserver(updateTrailingTargetFromScroll);
    ro.observe(vp);
    return () => {
      vp.removeEventListener("scroll", updateTrailingTargetFromScroll);
      ro.disconnect();
    };
  }, [viewportRef, updateTrailingTargetFromScroll]);

  useLayoutEffect(() => {
    updateTrailingTargetFromScroll();
  }, [
    updateTrailingTargetFromScroll,
    hydrated,
    todayItemsLength,
    backlogItemsLength,
  ]);

  useLayoutEffect(() => {
    updateTrailingTargetFromScroll();
  }, [backlogEndSpacerPx, updateTrailingTargetFromScroll]);

  return { trailingTargetList, updateTrailingTargetFromScroll };
}

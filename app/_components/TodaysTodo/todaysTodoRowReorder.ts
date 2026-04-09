import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import { todoActions, type TodoItem } from "@/app/_stores/todoStore";

type ActiveDrag = {
  id: string;
  pointerId: number;
  endSession: () => void;
};

/** Full-viewport layer: fixed cursor + hit-testing so underlying :hover cursors do not apply. */
function mountDragCursorOverlay(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483646",
    "cursor:grabbing",
    "pointer-events:auto",
    "touch-action:none",
    "background:transparent",
  ].join(";");
  document.body.appendChild(el);
  return el;
}

/**
 * Pointer-driven task reordering (grab handle): document-level move/up, no HTML5 DnD.
 * Reorder uses viewport mouse Y vs each row root’s getBoundingClientRect() (same coordinate space).
 */
export function useTodaysTodoRowReorder(
  items: readonly TodoItem[],
  rowRootRefs: RefObject<Record<string, HTMLElement | null>>,
): {
  registerRowRoot: (id: string) => (el: HTMLElement | null) => void;
  onGripPointerDown: (itemId: string) => (e: ReactPointerEvent<HTMLElement>) => void;
  draggingId: string | null;
} {
  const itemsRef = useRef(items);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const dragRef = useRef<ActiveDrag | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const clearDragUi = useCallback(() => {
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    setDraggingId(null);
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current?.endSession();
  }, []);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const st = dragRef.current;
      if (st == null || e.pointerId !== st.pointerId) return;

      const itemsSnap = itemsRef.current;
      const y = e.clientY;
      const id = st.id;
      const idx = itemsSnap.findIndex((x) => x.id === id);
      if (idx < 0) return;

      const roots = rowRootRefs.current;

      if (idx > 0) {
        const prevId = itemsSnap[idx - 1]!.id;
        const el = roots[prevId];
        if (el) {
          const r = el.getBoundingClientRect();
          if (y < r.top + r.height / 2) {
            todoActions.moveItemRelative(id, -1);
            return;
          }
        }
      }

      if (idx < itemsSnap.length - 1) {
        const nextId = itemsSnap[idx + 1]!.id;
        const el = roots[nextId];
        if (el) {
          const r = el.getBoundingClientRect();
          if (y > r.top + r.height / 2) {
            todoActions.moveItemRelative(id, 1);
          }
        }
      }
    },
    [rowRootRefs],
  );

  useEffect(() => {
    return () => {
      endDrag();
    };
  }, [endDrag]);

  const registerRowRoot = useCallback(
    (id: string) => {
      return (el: HTMLElement | null) => {
        if (el) rowRootRefs.current[id] = el;
        else delete rowRootRefs.current[id];
      };
    },
    [rowRootRefs],
  );

  const onGripPointerDown = useCallback(
    (itemId: string) => {
      return (e: ReactPointerEvent<HTMLElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const pointerId = e.pointerId;

        const onMove = (ev: PointerEvent) => {
          const st = dragRef.current;
          if (st == null || ev.pointerId !== st.pointerId) return;
          if ((ev.buttons & 1) === 0) {
            st.endSession();
            return;
          }
          onPointerMove(ev);
        };

        const overlayEl = mountDragCursorOverlay();

        const detach = () => {
          overlayEl.remove();
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUpOrCancel);
          window.removeEventListener("pointercancel", onUpOrCancel);
          window.removeEventListener("blur", onBlur);
          window.removeEventListener("pointerdown", onAuxPointerDown, true);
          document.removeEventListener("visibilitychange", onVis);
          document.removeEventListener("mouseout", onDocMouseOut, true);
          document.removeEventListener("contextmenu", onContextMenu, true);
        };

        const endSession = () => {
          detach();
          dragRef.current = null;
          clearDragUi();
        };

        const onUpOrCancel = (ev: PointerEvent) => {
          const st = dragRef.current;
          if (st == null || ev.pointerId !== st.pointerId) return;
          if (ev.type === "pointerup" && ev.button !== 0) return;
          st.endSession();
        };

        const onAuxPointerDown = (ev: PointerEvent) => {
          if (dragRef.current == null) return;
          if (ev.button === 0) return;
          ev.preventDefault();
          ev.stopPropagation();
        };

        const onContextMenu = (ev: MouseEvent) => {
          ev.preventDefault();
        };

        const onBlur = () => {
          endSession();
        };

        const onVis = () => {
          if (document.visibilityState === "hidden") endSession();
        };

        const onDocMouseOut = (ev: MouseEvent) => {
          if (dragRef.current == null) return;
          if (ev.relatedTarget != null) return;
          endSession();
        };

        dragRef.current = {
          id: itemId,
          pointerId,
          endSession,
        };
        document.body.style.userSelect = "none";
        setDraggingId(itemId);

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUpOrCancel);
        window.addEventListener("pointercancel", onUpOrCancel);
        window.addEventListener("blur", onBlur);
        window.addEventListener("pointerdown", onAuxPointerDown, true);
        document.addEventListener("visibilitychange", onVis);
        document.addEventListener("mouseout", onDocMouseOut, true);
        document.addEventListener("contextmenu", onContextMenu, true);
      };
    },
    [clearDragUi, onPointerMove],
  );

  return { registerRowRoot, onGripPointerDown, draggingId };
}

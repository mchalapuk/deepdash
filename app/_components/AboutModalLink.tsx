"use client";

import { Anchor, Modal } from "@mantine/core";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { usePhaseColor } from "@/lib/layout";

import { AboutContent } from "./AboutContent";

const ABOUT_PATH = "/about";

/**
 * "About" link shown next to the logo. A plain click opens the about copy in a
 * modal over the live dashboard (so the Pomodoro timer keeps running) and masks
 * the URL as `/about`; modified clicks fall through to the real static `/about`
 * page so the content stays shareable and crawlable.
 */
export function AboutModalLink({ initialOpen = false }: { initialOpen?: boolean }) {
  const color = usePhaseColor();
  const { opened, closeModal, handleTriggerClick } = useAboutModal(initialOpen);

  return (
    <>
      <Anchor
        href={ABOUT_PATH}
        onClick={handleTriggerClick}
        c="gray.7"
        fw={500}
        fz="sm"
        aria-haspopup="dialog"
        aria-label="About DeepDash"
        className="underline! opacity-80 hover:opacity-100"
      >
        About
      </Anchor>
      <Modal
        opened={opened}
        onClose={closeModal}
        title="About DeepDash"
        size="lg"
        radius="md"
        centered
        withinPortal={false}
        overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
        /* Rendered inline (not portaled to <body>) so /about is statically open;
           Mantine's inner wrapper omits `left`, relying on the portal to sit at
           the page's left edge, so anchor it to the viewport ourselves. */
        styles={{
          inner: { left: 0, right: 0 },
        }}
      >
        <AboutContent />
      </Modal>
    </>
  );
}

/**
 * Drives the modal open/close state and keeps it in sync with the browser
 * history so the URL reads `/about` while open and the Back button closes it
 * (Forward reopens it). We merge our flag into Next's existing history state
 * rather than replacing it, so the App Router's own popstate handling is intact.
 *
 * `initialOpen` is true when the `/about` route was loaded directly (or
 * refreshed): the modal opens over the dashboard and closing it rewrites the
 * URL back to `/` since there is no pushed history entry to pop.
 */
function useAboutModal(initialOpen: boolean): {
  opened: boolean;
  closeModal: () => void;
  handleTriggerClick: (e: MouseEvent<HTMLAnchorElement>) => void;
} {
  const [opened, setOpened] = useState(initialOpen);

  const closeModal = useCallback(() => {
    if (typeof window === "undefined") return;
    if (isAboutHistoryEntry(window.history.state)) {
      // Pop our pushed entry; the popstate handler flips `opened` to false.
      window.history.back();
    } else {
      // Direct load / refresh on /about: no entry to pop, so rewrite the URL
      // back to the dashboard in place and close.
      window.history.replaceState(window.history.state, "", "/");
      setOpened(false);
    }
  }, []);

  const handleTriggerClick = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    ) {
      return;
    }
    e.preventDefault();
    const currentState =
      typeof window.history.state === "object" && window.history.state !== null
        ? window.history.state
        : {};
    window.history.pushState(
      { ...currentState, deepdashAbout: true },
      "",
      ABOUT_PATH,
    );
    setOpened(true);
  }, []);

  useEffect(() => {
    const syncFromHistory = () => {
      setOpened(isAboutHistoryEntry(window.history.state));
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  return { opened, closeModal, handleTriggerClick };
}

function isAboutHistoryEntry(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as { deepdashAbout?: unknown }).deepdashAbout === true
  );
}

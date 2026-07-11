"use client";

import { proxy, useSnapshot } from "valtio";
import { type MouseEvent } from "react";

export const ABOUT_PATH = "/about";

const aboutModalStore = proxy({
  opened: false,
});

export function useAboutModalOpened(): boolean {
  return useSnapshot(aboutModalStore).opened;
}

export const aboutModalActions = {
  /**
   * Seeds the open/closed flag from the initial route (`/about` direct load vs.
   * `/`) and keeps it in sync with the browser history so Back/Forward work.
   * This store is UI-only and intentionally does not persist to localStorage.
   */
  init: function init(initialOpen: boolean): () => void {
    aboutModalStore.opened = initialOpen;
    const syncFromHistory = () => {
      aboutModalStore.opened = isAboutHistoryEntry(window.history.state);
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  },

  /**
   * Handles a click on an "About" trigger (the mobile header link or the
   * desktop button next to the GitHub badge). A plain click opens the about
   * copy in a modal over the live dashboard (so the Pomodoro timer keeps
   * running) and masks the URL as `/about`; modified clicks fall through to
   * the real static `/about` page so the content stays shareable and
   * crawlable.
   */
  openFromTriggerClick: function openFromTriggerClick(
    e: MouseEvent<HTMLAnchorElement>,
  ): void {
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
    aboutModalStore.opened = true;
  },

  close: function close(): void {
    if (typeof window === "undefined") return;
    if (isAboutHistoryEntry(window.history.state)) {
      // Pop our pushed entry; the popstate handler flips `opened` to false.
      window.history.back();
    } else {
      // Direct load / refresh on /about: no entry to pop, so rewrite the URL
      // back to the dashboard in place and close.
      window.history.replaceState(window.history.state, "", "/");
      aboutModalStore.opened = false;
    }
  },
};

function isAboutHistoryEntry(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as { deepdashAbout?: unknown }).deepdashAbout === true
  );
}

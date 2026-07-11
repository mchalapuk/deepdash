"use client";

import { Modal } from "@mantine/core";
import { useEffect } from "react";
import { aboutModalActions, useAboutModalOpened } from "@/app/_stores/aboutModalStore";

import { AboutContent } from "./AboutContent";

/**
 * Renders the About modal over the live dashboard (so the Pomodoro timer
 * keeps running) and masks the URL as `/about`. Mounted once; opened from
 * either the mobile header link (`AboutLink`) or the desktop button next to
 * the GitHub badge (`AboutButton`).
 *
 * `initialOpen` is true when the `/about` route was loaded directly (or
 * refreshed): the modal opens over the dashboard and closing it rewrites the
 * URL back to `/` since there is no pushed history entry to pop.
 */
export function AboutModal({ initialOpen = false }: { initialOpen?: boolean }) {
  const opened = useAboutModalOpened();
  useAboutModalInit(initialOpen);

  return (
    <Modal
      opened={opened}
      onClose={aboutModalActions.close}
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
  );
}

function useAboutModalInit(initialOpen: boolean): void {
  useEffect(() => {
    return aboutModalActions.init(initialOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

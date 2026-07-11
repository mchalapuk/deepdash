"use client";

import { Anchor } from "@mantine/core";
import { ABOUT_PATH, aboutModalActions } from "@/app/_stores/aboutModalStore";

/**
 * "About" link. Shown next to the logo on mobile and next to the GitHub
 * badge on desktop (each call site controls its own breakpoint visibility).
 * Opens `AboutModal`.
 */
export function AboutLink({ className }: { className?: string }) {
  return (
    <Anchor
      href={ABOUT_PATH}
      onClick={aboutModalActions.openFromTriggerClick}
      c="gray.7"
      fw={400}
      fz="sm"
      aria-haspopup="dialog"
      aria-label="About DeepDash"
      className={`underline! opacity-80 hover:opacity-100 ${className ?? ""}`}
    >
      About
    </Anchor>
  );
}

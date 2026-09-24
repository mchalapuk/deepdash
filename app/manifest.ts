import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DeepDash — Pomodoro Timer, Work Log & To-Do List",
    short_name: "DeepDash",
    description:
      "Free, local-only productivity dashboard with a Pomodoro timer, daily work log, and keyboard-friendly to-do list.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#484a52",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      /** Full-bleed artwork with the check inside the 80% safe zone, so the same file masks cleanly. */
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

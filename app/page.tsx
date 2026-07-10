import type { Metadata } from "next";

import { VisuallyHidden } from "@mantine/core";

import { Dashboard } from "./_components/Dashboard";

const title = "DeepDash — Pomodoro Timer, Work Log & To-Do List";
const description =
  "DeepDash is a free, local-only productivity dashboard: a Pomodoro timer, daily work log, and keyboard-friendly to-do list that runs entirely in your browser. No account, no trackers, no ads.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "pomodoro timer",
    "productivity dashboard",
    "online to-do list",
    "daily work log",
    "focus timer app",
    "time management tool",
    "privacy-first productivity app",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    url: "https://deepda.sh/",
    siteName: "DeepDash",
    type: "website",
  },
};

export default function Home() {
  return (
    <>
      <VisuallyHidden component="p">{description}</VisuallyHidden>
      <Dashboard />
    </>
  );
}

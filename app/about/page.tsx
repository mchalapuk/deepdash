import type { Metadata } from "next";

import { Dashboard } from "../_components/Dashboard";

const description =
  "DeepDash is a free, local-only productivity dashboard: a Pomodoro timer, daily work log, and keyboard-friendly to-do list that runs entirely in your browser. No account, no trackers, no ads.";

export const metadata: Metadata = {
  title: "About DeepDash",
  description,
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About DeepDash",
    description,
    url: "https://deepda.sh/about",
    siteName: "DeepDash",
    type: "website",
  },
};

export default function AboutPage() {
  return <Dashboard initialAboutOpen />;
}

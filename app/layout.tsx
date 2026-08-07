import type { Metadata } from "next";
import localFont from "next/font/local";
import { ColorSchemeScript } from "@mantine/core";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { getLayoutCsp } from "@/app/lib/csp";
import { AppProviders } from "./_components/AppProviders";
import "./globals.css";

const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  variable: "--font-sans",
  display: "swap",
});

const isDev = process.env.NODE_ENV === "development";

export const metadata: Metadata = {
  metadataBase: new URL("https://deepda.sh"),
  title: "DeepDash — Pomodoro Timer, Work Log & To-Do List",
  description:
    "Free, local-only productivity dashboard with a Pomodoro timer, daily work log, and keyboard-friendly to-do list. No account, no trackers, runs entirely in your browser.",
  keywords: [
    "pomodoro timer",
    "productivity dashboard",
    "to-do list app",
    "daily work log",
    "focus timer",
    "time management app",
    "privacy-first productivity app",
  ],
  authors: [{ name: "Maciej Chałapuk", url: "https://github.com/mchalapuk" }],
  creator: "Maciej Chałapuk",
  robots: { index: true, follow: true },
  openGraph: {
    siteName: "DeepDash",
    type: "website",
    locale: "en_US",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased brightness-110`}
      suppressHydrationWarning
    >
      <head>
        {isDev ? (
          <meta httpEquiv="Content-Security-Policy" content={getLayoutCsp()} />
        ) : null}
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body className="min-h-full">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

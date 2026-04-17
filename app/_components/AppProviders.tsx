"use client";

import { MantineProvider, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { useEffect, useLayoutEffect, useMemo } from "react";
import { maybeApplyFirstRunSeedBundle } from "@/lib/firstRunSeed";
import log from "@/lib/logger";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const theme = useMemo(
    () =>
      createTheme({
        fontFamily:
          'var(--font-sans), ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
      }),
    [],
  );

  useLayoutEffect(() => {
    void maybeApplyFirstRunSeedBundle();
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .register("/sw.js")
      .catch((err: unknown) => log.warn("SW register failed", err));
  }, []);

  return (
    <MantineProvider defaultColorScheme="auto" theme={theme}>
      <Notifications position="bottom-right" zIndex={400} />
      {children}
    </MantineProvider>
  );
}

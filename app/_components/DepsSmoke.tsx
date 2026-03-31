"use client";

import { evaluate } from "mathjs";
import { Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import Clock from "react-clock";
import "react-clock/dist/Clock.css";
import { FlipClockJsCountdown } from "./FlipClockJsCountdown";

export function DepsSmoke() {
  const [now, setNow] = useState(() => new Date());
  const [analogReady, setAnalogReady] = useState(false);
  const [endsAt] = useState(() => Date.now() + 3 * 60 * 1000);

  useEffect(() => {
    setNow(new Date());
    setAnalogReady(true);
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const [sample] = useState(() => evaluate("sqrt(16) + 1"));

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Offline bundle checks: math.js → {String(sample)}
      </Text>
      {analogReady ? <Clock value={now} size={100} className="bg-zinc-200 rounded-full" /> : <div style={{ width: 100, height: 100 }} />}
      <FlipClockJsCountdown endsAt={endsAt} />
    </Stack>
  );
}

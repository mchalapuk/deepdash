import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, Group, Text, Skeleton } from "@mantine/core";

import { type TickType, type TickInstance } from "@pqina/flip";

type Props = {
  secondsRemaining: number;
  fontSize?: string;
}

export function FlipTimer({ secondsRemaining }: Props) {
  const negative = secondsRemaining < 0;
  const t = Math.abs(secondsRemaining);
  const minutes = Math.floor(t / 60);
  const seconds = t % 60;

  return (
    <Group wrap="nowrap" align="center" justify="center" gap={2} h="100%">
      <Text classNames={{ root: negative ? "" : "opacity-0" }} style={{ fontSize: "inherit" }}>-</Text>
      <Box w="2.15em" h="100%" style={{ flexShrink: 0 }}>
        <Flip value={prependZero(minutes)} />
      </Box>
      <Text style={{ fontSize: "inherit", marginTop: "-0.5rem", transform: "scaleY(0.9)" }}>:</Text>
      <Box w="2.15em" h="100%" style={{ flexShrink: 0 }}>
        <Flip value={prependZero(seconds)} />
      </Box>
      <Text classNames={{ root: "opacity-0" }} style={{ fontSize: "inherit" }}>-</Text>
    </Group>
  );
}

export function Flip({ value, fontSize }: { value: string, fontSize?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tickHostRef = useRef<HTMLDivElement | null>(null);
  const tickInstanceRef = useRef<TickInstance | null>(null);
  const tickRef = useRef<TickType | null>(null);
  const [, setTickReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void import("@pqina/flip").then((mod) => {
      if (cancelled) return;
      tickRef.current = mod.default;
      setTickReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    const Tick = tickRef.current;
    const wrap = wrapRef.current;
    if (!Tick || !wrap) return;

    let tickHost = tickHostRef.current;
    if (!tickHost || !wrap.contains(tickHost)) {
      if (tickHost) Tick.DOM.destroy(tickHost);
      tickHost = document.createElement("div");
      tickHost.className = "tick";
      tickHostRef.current = tickHost;
      wrap.appendChild(tickHost);
      tickHost.innerHTML = flipTickSeedMarkup(value);
      tickInstanceRef.current = Tick.DOM.create(tickHost, { value }) ?? null;
    }
    const host = tickHostRef.current;
    if (host && fontSize) host.style.fontSize = fontSize;
    // Re-run after every commit: React may clear non-React children of `wrap`, or Strict Mode
    // may detach the imperative host; `wrap.contains` detects that cheaply.
  });

  // Tick.DOM.destroy removes the `.tick` host from its parent. That node must not be the same
  // element as React’s ref host, so we mount Tick on an inner div appended imperatively.
  useLayoutEffect(() => {
    return () => {
      const Tick = tickRef.current;
      const host = tickHostRef.current;
      if (host && Tick) Tick.DOM.destroy(host);
      tickInstanceRef.current = null;
      tickHostRef.current = null;
    };
  }, []);

  useEffect(() => {
    const inst = tickInstanceRef.current;
    if (inst) inst.value = value;
  }, [value]);

  return (
    <Box pos="relative" h="100%">
      <div className="display-contents" style={{ position: "absolute", top: 0, left: 0, opacity: 0.5 }}>
        <div className="tick" data-state="initialised">
          <div data-repeat="true" aria-hidden="true">
            <Skeleton component="span" data-view="flip" className="tick-flip rounded"> </Skeleton>
            <Skeleton component="span" data-view="flip" className="tick-flip rounded"> </Skeleton>
          </div>
        </div>
      </div>
      <div ref={wrapRef} style={{ display: "contents" }} />
    </Box>
  );
}

function prependZero(value: number): string {
  return value.toString().padStart(2, "0");
}

/** Markup Tick expects under `.tick`; only safe for digit strings from `prependZero`. */
function flipTickSeedMarkup(digits: string): string {
  return `<div data-repeat="true" aria-hidden="true"><span data-view="flip">${digits}</span></div>`;
}

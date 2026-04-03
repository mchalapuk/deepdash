import { useEffect, useLayoutEffect, useRef } from "react";
import { Group, Text } from "@mantine/core";

import Tick, { type TickInstance } from "@pqina/flip";

type Props = {
  secondsRemaining: number;
  fontSize?: string;
}

export function FlipTimer({ secondsRemaining, fontSize = "clamp(3.9rem, 8vw, 3.25rem)" }: Props) {
  const negative = secondsRemaining < 0;
  const t = Math.abs(secondsRemaining);
  const minutes = Math.floor(t / 60);
  const seconds = t % 60;

  return (
    <Group wrap="nowrap" align="center" justify="center" gap={2} className="scale-y-112">
      <Text style={{ fontSize }} classNames={{ root: negative ? "" : "opacity-0" }}>-</Text>
      <Flip value={prependZero(minutes)} {...{ fontSize }} />
      <Text style={{ fontSize, marginTop: "-0.5rem", transform: "scaleY(0.9)" }}>:</Text>
      <Flip value={prependZero(seconds)} {...{ fontSize }} />
      <Text style={{ fontSize }} classNames={{ root: "opacity-0" }}>-</Text>
    </Group>
  );
}

export function Flip({ value, fontSize }: { value: string, fontSize?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const tickHostRef = useRef<HTMLDivElement | null>(null);
  const tickInstanceRef = useRef<TickInstance | null>(null);

  // Tick.DOM.destroy removes the `.tick` host from its parent. That node must not be the same
  // element as React’s ref host, so we mount Tick on an inner div appended imperatively.
  useLayoutEffect(() => {
    return () => {
      const host = tickHostRef.current;
      if (host) Tick.DOM.destroy(host);
      tickInstanceRef.current = null;
      tickHostRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

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

  useEffect(() => {
    const inst = tickInstanceRef.current;
    if (inst) inst.value = value;
  }, [value]);

  return <div ref={wrapRef} style={{ display: "contents" }} />;
}

function prependZero(value: number): string {
  return value.toString().padStart(2, "0");
}

/** Markup Tick expects under `.tick`; only safe for digit strings from `prependZero`. */
function flipTickSeedMarkup(digits: string): string {
  return `<div data-repeat="true" aria-hidden="true"><span data-view="flip">${digits}</span></div>`;
}
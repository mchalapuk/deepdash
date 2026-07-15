"use client";

import { Anchor, List, Stack, Text, Title } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { usePhaseColor } from "@/app/lib/pomodoroLayout";

const LIVE_URL = "https://deepda.sh/";
const REPO_URL = "https://github.com/mchalapuk/deepdash";
const MACIEJS_GITHUB = "https://github.com/mchalapuk"

/**
 * Shared "about" copy rendered both by the static `/about` page (for SEO / direct
 * visits) and by the in-app About modal. Links and the feature bullets pick up
 * the current pomodoro phase color so the copy matches the rest of the session.
 */
export function AboutContent() {
  const color = usePhaseColor();

  return (
    <Stack gap="lg">
      <Text>
        DeepDash is a local-only, privacy-oriented
        productivity dashboard created by <Link href={MACIEJS_GITHUB}>Maciej Chałapuk</Link>.
        It combines a&nbsp;Pomodoro timer, a&nbsp;daily work log, and
        a&nbsp;keyboard-friendly to-do list on a
        single focused screen. It runs entirely in your browser and is{" "}
        free for everyone to use.
      </Text>

      <AboutSection title="Your data stays on your device">
        <Text>
          There is no backend, no account, and no trackers. Everything you type is
          stored locally in your browser. Nothing is uploaded anywhere.
          Nothing is downloaded from other origins than <Link href={LIVE_URL}>deepda.sh</Link>.
        </Text>
      </AboutSection>

      <AboutSection title="What's inside">
        <List
          spacing="xs"
          size="md"
          icon={
            <IconCheck size={14} stroke={3.5} className="mt-1.5" />
          }
          styles={{
            itemWrapper: {
              alignItems: "start",
            },
          }}
        >
          <List.Item>
            <Text span fw={600}>
              Pomodoro
            </Text>{" "}
            — work, short-break, and long-break phases with configurable
            durations, a phase-colored backdrop, and a chime.
          </List.Item>
          <List.Item>
            <Text span fw={600}>
              Work log
            </Text>{" "}
            — a record of each session with total work-time for the day.
          </List.Item>
          <List.Item>
            <Text span fw={600}>
              Daily to-do
            </Text>{" "}
            — a list of task for the day, carrying unfinished items
            into the next day, with a separate backlog.
          </List.Item>
          <List.Item>
            <Text span fw={600}>
              Import / export
            </Text>{" "}
            — backup your data into a file and restore it later.
            Useful when changing a computer or reinstalling the operating system.
          </List.Item>
        </List>
      </AboutSection>

      <AboutSection title="Open source">
        <Text>
          DeepDash is fully open source and released under the MIT license.
          Browse the code, report issues, or leave a star on{" "}
          <Link href={REPO_URL}>GitHub</Link>.
        </Text>
      </AboutSection>
    </Stack>
  );
}

function AboutSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap="xs">
      <Title order={2} size="h4">
        {title}
      </Title>
      {children}
    </Stack>
  );
}

function Link({ href, children }: { href: string, children: React.ReactNode }) {
  return (
    <Anchor
      {...{ href }}
      c="green.5"
      className="underline! brightness-110 saturate-80 opacity-90 hover:brightness-150 hover:saturate-100 hover:opacity-100"
    >
      { children }
    </Anchor>
  )
}


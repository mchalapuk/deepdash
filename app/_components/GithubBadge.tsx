"use client";

import { Badge } from "@mantine/core";

import { IconBrandGithub } from "@tabler/icons-react";

import { usePhaseColor } from "@/app/lib/pomodoroLayout";

const githubLabel = "Give us a Star on GitHub";
const repoUrl = "https://github.com/mchalapuk/deepdash";

export function GithubBadge({ className }: { className?: string }) {
  const color = usePhaseColor();
  const cssColor = `var(--mantine-color-${color.replace(".", "-")})`;

  return (
    <Badge
      component="a"
      href={repoUrl}
      color="rgba(255, 255, 255, .02)"
      c="white"
      size="md"
      px={8}
      leftSection={<IconBrandGithub size={14} stroke={1.5} color="white" />}
      aria-label={githubLabel}
      className={`opacity-75 hover:opacity-100 ${className}`}
      style={{
        textTransform: "none",
        cursor: "pointer",
        fontWeight: 400,
        outline: `solid 1px ${cssColor}`,
        outlineOpacity: .5,
      }}
    >
      {githubLabel}
    </Badge>
  );
}

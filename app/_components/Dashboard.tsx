import { Box } from "@mantine/core"

import { DashboardShell } from "./DashboardShell";
import { PhaseBackdrop } from "./PhaseBackdrop";

/**
 * The full productivity dashboard, shared by `/` and `/about`. On `/about` the
 * About modal starts open over the live dashboard (`initialAboutOpen`) so a
 * direct visit / refresh lands on the dashboard with the modal, not a separate
 * page.
 */
export function Dashboard({ initialAboutOpen = false }: { initialAboutOpen?: boolean }) {
  return (
    <PhaseBackdrop>
      <DashboardShell initialAboutOpen={initialAboutOpen} />
    </PhaseBackdrop>
  );
}

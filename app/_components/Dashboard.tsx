import { Box } from "@mantine/core"

import { DashboardShell } from "./DashboardShell";
import { DataImportExport } from "./DataImportExport";
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
      <DesktopDataImportExport />
    </PhaseBackdrop>
  );
}

/**
 * Desktop keeps the import/export controls tucked in the bottom-right corner
 * instead of the header (see `DashboardShell`, which shows a horizontal
 * variant in the header on mobile only).
 */
function DesktopDataImportExport() {
  return (
    <Box
      pos="fixed"
      bottom={38}
      right={32}
      visibleFrom="md"
      style={{ zIndex: 200 }}
      aria-label="Export and import app data"
    >
      <DataImportExport layout="vertical" />
    </Box>
  );
}

"use client";

import { Box, Button, Group } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { type ChangeEvent, type RefObject, useCallback, useRef } from "react";

import {
  collectWorktoolsExport,
  downloadWorktoolsJson,
  formatWorktoolsImportErrorsForUser,
  runWorktoolsJsonImportFromText,
} from "@/lib/dataExport";
import log from "@/lib/logger";
import { usePhaseColor } from "@/lib/layout";

export function DataImportExport() {
  const [fileInputRef, onExport, onPickImportFile, onFileChange] = useDataImportExport();
  const color = usePhaseColor();

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        aria-hidden
        onChange={onFileChange}
      />
      <Box
        pos="fixed"
        bottom={16}
        right={16}
        style={{ zIndex: 200 }}
      >
        <Group gap="xs">
          <Button variant="filled" size="xs" color={color} onClick={onExport} opacity={0.92}>
            Export
          </Button>
          <Button variant="filled" size="xs" color="gray.7" onClick={onPickImportFile}>
            Import
          </Button>
        </Group>
      </Box>
    </>
  );
}

function useDataImportExport(): [
  RefObject<HTMLInputElement | null>,
  () => void,
  () => void,
  (e: ChangeEvent<HTMLInputElement>) => void,
] {
  const fileRef = useRef<HTMLInputElement>(null);

  const onExport = useCallback(() => {
    try {
      const data = collectWorktoolsExport();
      downloadWorktoolsJson(data);
      notifications.show({
        title: "Export ready",
        message: "Your data was downloaded as JSON.",
        color: "green",
      });
    } catch (e: unknown) {
      log.error("export failed", e);
      notifications.show({
        title: "Export failed",
        message: e instanceof Error ? e.message : "Could not export data.",
        color: "red",
      });
    }
  }, []);

  const onPickImportFile = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const onFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    void (async () => {
      try {
        const text = await file.text();
        const result = runWorktoolsJsonImportFromText(text);
        if (!result.ok) {
          log.error("import failed", result.errors);
          notifications.show({
            title: "Import failed",
            message: formatWorktoolsImportErrorsForUser(result.errors),
            color: "red",
          });
          return;
        }
        notifications.show({
          title: "Import complete",
          message: "Reloading the app with your backup…",
          color: "green",
        });
        window.setTimeout(() => {
          window.location.reload();
        }, 400);
      } catch (err: unknown) {
        log.error("import failed", err);
        notifications.show({
          title: "Import failed",
          message:
            err instanceof Error
              ? err.message
              : "The file could not be read. Choose a valid worktools export JSON.",
          color: "red",
        });
      }
    })();
  }, []);

  return [fileRef, onExport, onPickImportFile, onFileChange];
}

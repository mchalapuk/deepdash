import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test("About link opens a modal over the live dashboard and masks the URL", async ({
  page,
}) => {
  await page.goto("/");

  const dashboard = page.getByRole("main", { name: "Productivity tools" });
  await expect(dashboard).toBeVisible();

  // "About" renders twice (mobile header link + desktop vertical link above
  // the import/export controls); only one is visible per viewport.
  await page
    .getByRole("link", { name: "About DeepDash" })
    .and(page.locator(":visible"))
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("About DeepDash")).toBeVisible();
  // URL is masked to /about while the dashboard stays mounted behind the modal.
  await expect(page).toHaveURL(/\/about$/);
  await expect(dashboard).toBeVisible();

  // The modal must sit within the viewport (rendered inline, it once overflowed
  // off the right edge because Mantine's inner wrapper omits `left`).
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (box && viewport) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  }
});

test("browser Back closes the modal and restores the dashboard URL", async ({
  page,
}) => {
  await page.goto("/");
  // "About" renders twice (mobile header link + desktop vertical link above
  // the import/export controls); only one is visible per viewport.
  await page
    .getByRole("link", { name: "About DeepDash" })
    .and(page.locator(":visible"))
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.goBack();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test("visiting /about directly renders the dashboard with the modal open", async ({
  page,
}) => {
  await page.goto("/about");

  // The live dashboard is mounted behind the modal, not a separate page.
  await expect(
    page.getByRole("main", { name: "Productivity tools" }),
  ).toBeVisible();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("About DeepDash")).toBeVisible();

  // Closing a directly-loaded /about rewrites the URL back to the dashboard.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

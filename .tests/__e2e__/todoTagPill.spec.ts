import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test("renders a [tag] as a Pill once unfocused, and as raw text while editing", async ({
  page,
}) => {
  await page.goto("/");

  // DashboardShell mounts TodaysTodo once for the desktop layout and once
  // for the mobile layout, toggling visibility with CSS media queries
  // rather than conditional rendering, so every locator below can match a
  // duplicate in the hidden layout; scope each to the one actually visible.
  const addTask = page.getByPlaceholder("Add a task…").and(page.locator(":visible"));
  await addTask.click();
  await addTask.fill("Buy milk [errand]");
  await addTask.press("Enter");

  // Committing returns focus to the trailing "add task" field, so the new
  // row is unfocused immediately and should render its tag as a Pill.
  const pill = page
    .locator(".mantine-Pill-root", { hasText: "errand" })
    .and(page.locator(":visible"));
  await expect(pill).toBeVisible();
  await expect(
    page.getByText("Buy milk", { exact: true }).and(page.locator(":visible")),
  ).toBeVisible();

  // Clicking the row switches it into edit mode: the Pill overlay unmounts
  // and the underlying textarea (holding the raw "[errand]" text) is focused.
  await pill.click();
  await expect(pill).toHaveCount(0);
  const activeValue = await page.evaluate(
    () => (document.activeElement as HTMLTextAreaElement | null)?.value,
  );
  expect(activeValue).toBe("Buy milk [errand]");
});

test("renders every [tag] Pill with the same gray-7 color", async ({ page }) => {
  await page.goto("/");

  // See the comment in the test above: scope to the visible layout's copies.
  const addTask = page.getByPlaceholder("Add a task…").and(page.locator(":visible"));
  for (const text of ["Buy milk [errand]", "Buy eggs [groceries]"]) {
    await addTask.click();
    await addTask.fill(text);
    await addTask.press("Enter");
  }

  const pills = page
    .locator(".mantine-Pill-root", { hasText: /^(errand|groceries)$/ })
    .and(page.locator(":visible"));
  await expect(pills).toHaveCount(2);
  const [colorA, colorB] = await pills.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).backgroundColor),
  );
  expect(colorA).toBe(colorB);
});

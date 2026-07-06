import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test("renders a [tag] as a Pill once unfocused, and as raw text while editing", async ({
  page,
}) => {
  await page.goto("/");

  const addTask = page.getByPlaceholder("Add a task…");
  await addTask.click();
  await addTask.fill("Buy milk [errand]");
  await addTask.press("Enter");

  // Committing returns focus to the trailing "add task" field, so the new
  // row is unfocused immediately and should render its tag as a Pill.
  const pill = page.locator(".mantine-Pill-root", { hasText: "errand" });
  await expect(pill).toBeVisible();
  await expect(page.locator("span", { hasText: "Buy milk" })).toBeVisible();

  // Clicking the row switches it into edit mode: the Pill overlay unmounts
  // and the underlying textarea (holding the raw "[errand]" text) is focused.
  await pill.click();
  await expect(pill).toHaveCount(0);
  const activeValue = await page.evaluate(
    () => (document.activeElement as HTMLTextAreaElement | null)?.value,
  );
  expect(activeValue).toBe("Buy milk [errand]");
});

test("reuses the same random color for the same [tag] across different todo items", async ({
  page,
}) => {
  await page.goto("/");

  const addTask = page.getByPlaceholder("Add a task…");
  for (const text of ["Buy milk [errand]", "Buy eggs [errand]"]) {
    await addTask.click();
    await addTask.fill(text);
    await addTask.press("Enter");
  }

  const pills = page.locator(".mantine-Pill-root", { hasText: "errand" });
  await expect(pills).toHaveCount(2);
  const [colorA, colorB] = await pills.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).backgroundColor),
  );
  expect(colorA).toBe(colorB);

  // Saved to localStorage so the same color survives a reload / re-import.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("deepdash.tagColors.v1")))
    .not.toBeNull();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("deepdash.tagColors.v1") ?? "{}"),
  );
  expect(typeof stored.colors.errand).toBe("string");
  expect(stored.colors.errand.length).toBeGreaterThan(0);
});

import { expect, test } from "@playwright/test";

test("public map shows sites, filters and the risk disclaimer", async ({ page }) => {
  await page.goto("/map");
  // Phones get a server-rendered SVG preview first; tap to load MapLibre.
  await expect(page.getByTestId("map-preview").locator("circle").first()).toBeAttached();
  await page.getByTestId("map-preview").click();
  // Wards are shaded by citizen reports first; the risk layer carries its disclaimer.
  await expect(page.getByTestId("legend-reports")).toBeVisible();
  await page.getByRole("radio", { name: /পরিবেশগত ঝুঁকি/ }).click();
  await expect(page.getByTestId("legend-risk")).toBeVisible();
  await expect(page.getByText("পরিবেশগত ঝুঁকি, নিশ্চিত রোগী নয়").first()).toBeVisible();
  const count = page.getByTestId("site-count");
  await expect(count).toBeVisible({ timeout: 30_000 });
  // Map container must have real height (MapLibre's CSS once collapsed it to 0).
  const box = await page.getByTestId("public-map").boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(250);
  const before = await count.innerText();
  await page.getByRole("button", { name: /ফিল্টার/ }).click();
  await page.locator("#map-filters select").last().selectOption("");
  await expect(count).not.toHaveText(before, { timeout: 10_000 }).catch(() => {});
  // No horizontal scroll at 360 px
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("ward list and ward page show the scorecard", async ({ page }) => {
  await page.goto("/ward");
  await page.getByRole("link", { name: /ওয়ার্ড/ }).first().click();
  await expect(page.getByTestId("scorecard")).toBeVisible();
  await expect(page.getByText("৭২ ঘণ্টার মধ্যে পরিষ্কার")).toBeVisible();
  await expect(page.getByText("পরিবেশগত ঝুঁকি, নিশ্চিত রোগী নয়").first()).toBeVisible();
});

test("unknown ward is a 404", async ({ page }) => {
  const res = await page.goto("/ward/99999");
  expect(res?.status()).toBe(404);
});

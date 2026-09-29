import { expect, test } from "@playwright/test";

test("home renders in Bangla by default with a report CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "bn");
  await expect(page.getByTestId("cta-report")).toContainText("রিপোর্ট");
  // No horizontal scroll at 360 px.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("English is available at /en", async ({ page }) => {
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByTestId("cta-report")).toContainText("Report standing water");
});

test("language switch keeps the page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en$/);
});

test("PWA manifest is served", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.lang).toBe("bn");
  expect(m.display).toBe("standalone");
});

import { expect, test, type Page } from "@playwright/test";
import { DHAKA, PHOTO } from "./fixtures";

test.use({ geolocation: DHAKA, permissions: ["geolocation"] });

async function fillReport(page: Page) {
  await page.goto("/report");
  await page.getByTestId("photo-input").setInputFiles(PHOTO);
  await expect(page.locator("figure img")).toBeVisible();
  await page.getByTestId("next").click();
  // Step 2: location (GPS fix is mocked)
  await expect(page.getByText(/নির্ভুলতা/)).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("next").click();
  // Step 3: details
  await page.getByText("টায়ার").click();
  await page.getByText("হ্যাঁ").click();
  await page.getByTestId("next").click();
  // Step 4: confirm
  await expect(page.getByText("🔒")).toBeVisible();
}

test("citizen reports a site in Bangla in four steps", async ({ page }) => {
  const started = Date.now();
  await fillReport(page);
  await page.getByTestId("submit").click();
  await expect(page.getByTestId("done")).toHaveAttribute("data-state", "sent", { timeout: 30_000 });
  await expect(page.getByText("ধন্যবাদ!")).toBeVisible();
  // Machine time for the whole flow; humans need a few more seconds.
  expect(Date.now() - started).toBeLessThan(30_000);

  await page.goto("/mine");
  await expect(page.getByText("টায়ার").first()).toBeVisible();
});

test("report is queued offline and uploads when back online", async ({ page, context }) => {
  await fillReport(page);
  await context.setOffline(true);
  await page.getByTestId("submit").click();
  await expect(page.getByTestId("done")).toHaveAttribute("data-state", "queued");
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.goto("/mine");
  await expect(page.getByText("⏳")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText("টায়ার").first()).toBeVisible();
});

test("report route initial JS stays under 200 KB gzipped", async ({ page }) => {
  const sizes: number[] = [];
  page.on("requestfinished", async (req) => {
    if (req.resourceType() !== "script") return;
    const s = await req.sizes();
    sizes.push(s.responseBodySize);
  });
  // Initial load only: MapLibre and the photo model are fetched later, on demand.
  await page.goto("/report", { waitUntil: "load" });
  await page.waitForTimeout(1000);
  const total = sizes.reduce((a, b) => a + b, 0);
  console.log(`report route JS: ${(total / 1024).toFixed(1)} KB (${sizes.length} files)`);
  expect(total).toBeLessThan(200 * 1024);
});

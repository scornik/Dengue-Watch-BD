import { expect, test } from "@playwright/test";
import { PHOTO } from "./fixtures";
import { admin } from "./helpers/staff";

// Relies on supabase/seed/dev_demo.sql (synthetic ward 1 covers 90.34–90.353 E, 23.78–23.80 N).
async function newSite(lng: number, lat: number) {
  const { data, error } = await admin()
    .from("reports")
    .insert({
      photo_path: "e2e/x.jpg",
      geom: `SRID=4326;POINT(${lng} ${lat})`,
      device_hash: `e2e-game-${Date.now()}-${Math.random()}`,
      site_type: "tire",
    })
    .select("site_id")
    .single();
  expect(error).toBeNull();
  return data!.site_id as string;
}

test("public spot list is open to everyone", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("cta-list").click();
  await expect(page).toHaveURL(/\/sites$/);
  await expect(page.getByTestId("site-card").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("a volunteer names themselves, claims a spot, destroys it and climbs the board", async ({ page, context }) => {
  const lng = 90.341 + Math.random() * 0.01;
  const lat = 23.781 + Math.random() * 0.015;
  const siteId = await newSite(lng, lat);
  const handle = `e2e${Date.now().toString(36)}`;
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: lat + 0.0001, longitude: lng }); // ~11 m away

  await page.goto(`/en/sites/${siteId}`);
  await page.getByTestId("claim").click();
  // No hunter name yet: the panel asks for one first.
  await page.getByTestId("handle-input").fill(handle);
  await page.getByTestId("handle-save").click();
  await page.getByTestId("claim").click();
  await page.getByTestId("after-photo").setInputFiles(PHOTO);
  await expect(page.getByTestId("distance")).toBeVisible();
  await page.getByTestId("confirm-clean").click();
  await expect(page.getByTestId("hunt-done")).toContainText("+20 XP");

  const { data: site } = await admin().from("sites").select("status, after_photo_path").eq("id", siteId).single();
  expect(site?.status).toBe("cleared");
  expect(site?.after_photo_path).toMatch(/^cleanup-photos\//);

  // The header chip and the (uncached) leaderboard row reflect the new XP.
  await expect(page.getByTestId("xp-chip")).toContainText("20 XP");
  const { data: row } = await admin().from("public_leaderboard").select("points, cleans").eq("handle", handle).single();
  expect(row).toEqual({ points: 20, cleans: 1 });

  await page.goto("/en/me");
  await expect(page.getByTestId("hunter-handle")).toHaveText(handle);
});

test("a spot cannot be destroyed from far away", async ({ page, context }) => {
  const lng = 90.341 + Math.random() * 0.01;
  const lat = 23.781 + Math.random() * 0.015;
  const siteId = await newSite(lng, lat);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: lat + 0.003, longitude: lng }); // ~330 m away
  await page.goto(`/en/sites/${siteId}`);
  await page.getByTestId("claim").click();
  await page.getByTestId("handle-input").fill(`far${Date.now().toString(36)}`);
  await page.getByTestId("handle-save").click();
  await page.getByTestId("claim").click();
  await page.getByTestId("after-photo").setInputFiles(PHOTO);
  await expect(page.getByText(/Get within 50 m/)).toBeVisible();
  await expect(page.getByTestId("confirm-clean")).toBeDisabled();
});

test("leaderboard shows hunters", async ({ page }) => {
  await page.goto("/en/leaderboard?all");
  await expect(page.getByRole("heading", { name: /Leaderboard/ })).toBeVisible();
  await expect(page.getByText("MoshaShikari").first()).toBeVisible();
});

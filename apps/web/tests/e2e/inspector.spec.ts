import { expect, test } from "@playwright/test";
import { PHOTO } from "./fixtures";
import { admin, createStaff, useSession } from "./helpers/staff";

// Relies on supabase/seed/dev_demo.sql (synthetic ward 1 covers 90.34–90.353 E, 23.78–23.80 N).
async function newSite(lng: number, lat: number) {
  const { data, error } = await admin()
    .from("reports")
    .insert({
      photo_path: "e2e/x.jpg",
      geom: `SRID=4326;POINT(${lng} ${lat})`,
      device_hash: `e2e-insp-${Date.now()}-${Math.random()}`,
      site_type: "construction",
    })
    .select("site_id, ward_id")
    .single();
  expect(error).toBeNull();
  expect(data!.ward_id).toBe(1);
  return data!.site_id as string;
}

test("inspector assigns and closes a site with an on-site photo", async ({ page, context }) => {
  const lng = 90.341 + Math.random() * 0.01;
  const lat = 23.781 + Math.random() * 0.015;
  const siteId = await newSite(lng, lat);
  const insp = await createStaff("inspector", { ward_id: 1 });
  await useSession(page, insp.session);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: lat + 0.0001, longitude: lng }); // ~11 m away

  await page.goto(`/staff/inspect/${siteId}`);
  await expect(page.getByTestId("insp-site")).toBeVisible();
  await page.getByTestId("assign").click();
  await expect(page.getByText("সংরক্ষিত")).toBeVisible();
  await page.getByTestId("clear").click();
  await page.getByTestId("after-photo").setInputFiles(PHOTO);
  await expect(page.getByTestId("distance")).toContainText("মিটার");
  await page.getByTestId("confirm-clear").click();
  await expect(page).toHaveURL(/\/staff\/inspect$/);

  const sb = admin();
  const { data: site } = await sb.from("sites").select("status, after_photo_path, cleared_at").eq("id", siteId).single();
  expect(site?.status).toBe("cleared");
  expect(site?.after_photo_path).toMatch(new RegExp(`^${siteId}/`));
  const { data: events } = await sb.from("site_events").select("to_status, photo_path").eq("site_id", siteId).order("id");
  expect(events?.map((e) => e.to_status)).toEqual(["new", "assigned", "cleared"]);
});

test("inspector cannot close from more than 50 m away", async ({ page, context }) => {
  const lng = 90.341 + Math.random() * 0.01;
  const lat = 23.781 + Math.random() * 0.015;
  const siteId = await newSite(lng, lat);
  const insp = await createStaff("inspector", { ward_id: 1 });
  await useSession(page, insp.session);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: lat + 0.002, longitude: lng }); // ~220 m away
  await page.goto(`/staff/inspect/${siteId}`);
  await page.getByTestId("clear").click();
  await page.getByTestId("after-photo").setInputFiles(PHOTO);
  await expect(page.getByTestId("distance")).toBeVisible();
  await expect(page.getByTestId("confirm-clear")).toBeDisabled();
});

test("inspector marks a site not found with a reason", async ({ page }) => {
  const siteId = await newSite(90.341 + Math.random() * 0.01, 23.781 + Math.random() * 0.015);
  const insp = await createStaff("inspector", { ward_id: 1 });
  await useSession(page, insp.session);
  await page.goto(`/staff/inspect/${siteId}`);
  await page.getByTestId("not-found").click();
  await expect(page.getByTestId("confirm-notfound")).toBeDisabled();
  await page.getByTestId("reason").fill("container already removed");
  await page.getByTestId("confirm-notfound").click();
  await expect(page).toHaveURL(/\/staff\/inspect$/);
  const { data } = await admin().from("sites").select("status, not_found_reason").eq("id", siteId).single();
  expect(data).toEqual({ status: "not_found", not_found_reason: "container already removed" });
});

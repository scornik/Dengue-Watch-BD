import { expect, test } from "@playwright/test";
import { createStaff, useSession } from "./helpers/staff";

test("public CSV and GeoJSON exports are anonymised", async ({ request }) => {
  const csv = await request.get("/api/export/sites.csv");
  expect(csv.ok()).toBeTruthy();
  const text = await csv.text();
  const header = text.replace(/^﻿/, "").split("\r\n")[0]!;
  expect(header).toBe(
    "id,lat,lng,ward_id,status,site_type,larvae_reported,report_count,first_reported_at,verified_at,cleared_at,closed_at",
  );
  expect(text).not.toMatch(/reporter|device_hash|photo_path/);

  const gj = await request.get("/api/export/sites.geojson");
  const fc = await gj.json();
  expect(fc.type).toBe("FeatureCollection");
  expect(fc.features.length).toBeGreaterThan(0);
  const [lng, lat] = fc.features[0].geometry.coordinates;
  // Snapped to the 0.0005° grid
  expect(Math.abs(lat / 0.0005 - Math.round(lat / 0.0005))).toBeLessThan(1e-6);
  expect(Math.abs(lng / 0.0005 - Math.round(lng / 0.0005))).toBeLessThan(1e-6);
});

test("research export needs a researcher", async ({ request }) => {
  expect((await request.get("/api/export/research.csv")).status()).toBe(401);
  const mod = await createStaff("moderator");
  const denied = await request.get("/api/export/research.csv", {
    headers: { Authorization: `Bearer ${mod.session.access_token}` },
  });
  expect(denied.status()).toBe(403);
  const res = await createStaff("researcher");
  const ok = await request.get("/api/export/research.csv", {
    headers: { Authorization: `Bearer ${res.session.access_token}` },
  });
  expect(ok.status()).toBe(200);
  const head = (await ok.text()).replace(/^﻿/, "").split("\r\n")[0]!;
  expect(head).toContain("report_key");
  expect(head).not.toMatch(/reporter|device|note|photo/);
});

test("ward admin sees the printable weekly digest", async ({ page }) => {
  const adm = await createStaff("ward_admin", { city_corp: "DSCC" });
  await useSession(page, adm.session);
  await page.goto("/staff/digest");
  await expect(page.getByRole("heading", { name: /সাপ্তাহিক সারাংশ · DSCC/ })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(75);
});

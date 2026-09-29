import { expect, test } from "@playwright/test";
import { admin, createStaff, useSession } from "./helpers/staff";

test("moderator approves a pending report with the keyboard", async ({ page }) => {
  // A report straight from the database (as the submit function would write it).
  const sb = admin();
  const lng = 90.3 + Math.random() * 0.01;
  const { data: rep, error } = await sb
    .from("reports")
    .insert({
      photo_path: "e2e/missing.jpg",
      geom: `SRID=4326;POINT(${lng} 23.95)`,
      device_hash: `e2e-mod-${Date.now()}`,
      ai_label: "pending",
      site_type: "bucket_drum",
      // Oldest pending report => first in the queue, whatever else is pending.
      created_at: "2020-01-01T00:00:00Z",
    })
    .select("id, site_id")
    .single();
  expect(error).toBeNull();

  const mod = await createStaff("moderator");
  await useSession(page, mod.session);
  await page.goto("/staff/moderate");
  await expect(page.getByTestId("mod-queue")).toBeVisible();
  // Pending reports come first; ours is the newest pending one, find it by stepping.
  for (let i = 0; i < 10; i++) {
    const { data } = await sb.from("reports").select("ai_source").eq("id", rep!.id).single();
    if (data?.ai_source === "human") break;
    const text = await page.getByTestId("mod-type").innerText();
    if (text.includes("বালতি")) {
      await page.keyboard.press("a");
      await page.waitForTimeout(500);
    } else {
      await page.keyboard.press("j");
    }
  }
  const { data: site } = await sb.from("sites").select("status").eq("id", rep!.site_id).single();
  expect(site?.status).toBe("verified");
  const { data: labels } = await sb.from("ai_labels").select("moderator_label").eq("report_id", rep!.id);
  expect(labels?.map((l) => l.moderator_label)).toContain("bucket_drum");
});

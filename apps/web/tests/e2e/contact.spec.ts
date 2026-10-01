import { expect, test } from "@playwright/test";
import { admin, createStaff, useSession } from "./helpers/staff";

test("a citizen messages the support team and a moderator resolves it", async ({ page }) => {
  const text = `Can my school join as volunteers? e2e-${Date.now()}`;

  await page.goto("/");
  await page.getByTestId("footer-contact").click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(page.getByTestId("contact-email")).toHaveAttribute("href", "mailto:ashik.elahi.cse@gmail.com");
  await expect(page.getByTestId("creator-card")).toContainText("Mohammad Ashik Elahi");

  await page.getByRole("button", { name: "স্বেচ্ছাসেবক হতে চাই" }).click();
  await page.getByTestId("contact-message").fill(text);
  await page.getByTestId("contact-reply").fill("teacher@example.com");
  await page.getByTestId("contact-send").click();
  await expect(page.getByTestId("contact-sent")).toBeVisible({ timeout: 20_000 });

  const { data: row } = await admin().from("support_messages").select("topic, contact, status").eq("message", text).single();
  expect(row).toEqual({ topic: "volunteer", contact: "teacher@example.com", status: "new" });

  const mod = await createStaff("moderator");
  await useSession(page, mod.session);
  await page.goto("/staff/inbox");
  const item = page.getByTestId("inbox-item").filter({ hasText: text });
  await expect(item).toBeVisible();
  await expect(item.getByRole("link", { name: "teacher@example.com" })).toHaveAttribute("href", /^mailto:teacher@example\.com/);
  await item.getByTestId("inbox-resolve").click();
  await expect(item).toHaveCount(0); // left the "new" tab
  const { data: done } = await admin().from("support_messages").select("status, handled_by").eq("message", text).single();
  expect(done).toEqual({ status: "resolved", handled_by: mod.id });
});

test("ward admins cannot open the support inbox", async ({ page }) => {
  const wa = await createStaff("ward_admin", { city_corp: "DNCC" });
  await useSession(page, wa.session);
  await page.goto("/staff/inbox");
  await expect(page.getByTestId("inbox-list")).toHaveCount(0);
  await expect(page.getByText("সাপোর্ট ইনবক্স")).toHaveCount(0);
});

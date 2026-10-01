// Records the real DengueWatch BD web app for the launch videos.
//
// Needs the local stack prepared by setup.sh (supabase start, then bash media/capture/setup.sh) and the web app on
// http://localhost:3100 (`pnpm --filter web build && pnpm --filter web start -p 3100`), so no recording
// ever writes to production. See media/README.md, step "App screen recordings".
//
//   SUPABASE_URL=… ANON_KEY=… SERVICE_ROLE_KEY=… node record.mjs            # all flows
//   … node record.mjs report hunt                                           # some flows
//
// Each flow is one continuous phone-sized recording with named marks (ms from the start of the clip).
// Output: media/video/public/app/<flow>.mp4 and media/video/src/generated/app-clips.json.
// Remotion plays the segment between two marks in the scene that narrates that step.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MEDIA = path.resolve(HERE, "..");
const BASE = process.env.APP_URL ?? "http://localhost:3100";
const SB_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON = process.env.ANON_KEY;
const SERVICE = process.env.SERVICE_ROLE_KEY;
const CHROME = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
if (!ANON || !SERVICE) throw new Error("Set ANON_KEY and SERVICE_ROLE_KEY (eval \"$(supabase status -o env)\")");
if (!/localhost|127\.0\.0\.1/.test(SB_URL + BASE)) throw new Error("Recordings run against the local stack only");

const RAW = path.join(HERE, "out");
const PUBLIC = path.join(MEDIA, "video", "public", "app");
const MANIFEST = path.join(MEDIA, "video", "src", "generated", "app-clips.json");
const CACHE = path.join(HERE, ".cache"); // photo model, wasm and map tiles, so recordings never wait on downloads
const PHOTO = path.join(HERE, "photos", "bucket-water.jpg");
const AFTER = path.join(HERE, "photos", "bucket-upturned.jpg");

// Phone: a common mid-range Android. Recorded at 2× for sharp text in a 1080-wide video.
const PHONE = { width: 390, height: 844 };
const SCALE = 2;
// Mirpur 10, where setup.sh puts the demo spots.
const HERE_GPS = { latitude: 23.80712, longitude: 90.36884 };
const SPOT = { lat: 23.80705, lng: 90.3688 };

const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Shows each tap as an expanding marigold ring, like the "show taps" developer option.
const TAPS = `addEventListener("pointerdown", (e) => {
  const d = document.createElement("div");
  d.style.cssText = "position:fixed;left:" + (e.clientX - 26) + "px;top:" + (e.clientY - 26) + "px;width:52px;height:52px;border-radius:50%;" +
    "background:rgba(245,165,36,.35);border:3px solid #f5a524;z-index:2147483647;pointer-events:none;transition:transform .55s ease-out,opacity .55s ease-out";
  document.documentElement.appendChild(d);
  requestAnimationFrame(() => requestAnimationFrame(() => { d.style.transform = "scale(1.7)"; d.style.opacity = "0"; }));
  setTimeout(() => d.remove(), 700);
}, true);
// Hide the scrollbar so it does not flash during scripted scrolls.
addEventListener("DOMContentLoaded", () => {
  const s = document.createElement("style");
  s.textContent = "::-webkit-scrollbar{display:none} html{scrollbar-width:none}";
  document.head.appendChild(s);
});`;

/** The one call answered in the browser: the submit-report Edge Function. Everything else hits the local stack. */
async function mockSubmit(page, siteId) {
  await page.route("**/functions/v1/submit-report", async (route) => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    await sleep(900);
    return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ site_id: siteId }) });
  });
}

/** Serve the photo model, onnx wasm and map tiles from disk after the first fetch. */
async function cacheStatic(ctx) {
  await ctx.route(/huggingface\.co|\.hf\.co|cdn\.jsdelivr\.net|openfreemap\.org/, async (route) => {
    const url = route.request().url();
    const key = path.join(CACHE, Buffer.from(url).toString("base64url").slice(0, 200));
    if (fs.existsSync(key + ".body")) {
      const meta = JSON.parse(fs.readFileSync(key + ".json", "utf8"));
      return route.fulfill({ status: 200, headers: meta, body: fs.readFileSync(key + ".body") });
    }
    const res = await route.fetch();
    const body = await res.body();
    if (res.ok()) {
      fs.mkdirSync(CACHE, { recursive: true });
      const h = res.headers();
      const keep = { "content-type": h["content-type"] ?? "application/octet-stream", "access-control-allow-origin": "*" };
      fs.writeFileSync(key + ".body", body);
      fs.writeFileSync(key + ".json", JSON.stringify(keep));
    }
    return route.fulfill({ response: res, body });
  });
}

/**
 * Records full-resolution frames (2× device pixels) in a capture loop. Chrome's screencast and
 * Playwright's recordVideo are both capped at 1× CSS pixels in headless mode; a scaled
 * captureScreenshot is not, at ~15 fps, which is plenty for taps and scrolls. Each frame is held
 * until the next one when the clip is assembled.
 */
class Clip {
  constructor(name, page) {
    this.name = name;
    this.page = page;
    this.opened = Date.now();
    this.t0 = this.opened; // marks are relative to this; move it to cut off-camera setup
    this.marks = {};
    this.frames = [];
    this.dir = path.join(RAW, name);
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
  }
  async start() {
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.running = true;
    this.loop = (async () => {
      while (this.running) {
        try {
          const { x, y } = await this.page.evaluate(() => ({ x: scrollX, y: scrollY }));
          const t = Date.now();
          const { data } = await this.cdp.send("Page.captureScreenshot", {
            format: "jpeg",
            quality: 88,
            optimizeForSpeed: true,
            clip: { x, y, width: PHONE.width, height: PHONE.height, scale: SCALE },
          });
          const file = path.join(this.dir, `${String(this.frames.length).padStart(6, "0")}.jpg`);
          fs.writeFileSync(file, Buffer.from(data, "base64"));
          this.frames.push({ file, t });
        } catch {
          await sleep(30); // mid-navigation: no document to capture yet
        }
      }
    })();
    return this;
  }
  async stop() {
    this.ended = Date.now();
    this.running = false;
    await this.loop;
  }
  mark(id) {
    this.marks[id] = Date.now() - this.t0;
    console.log(`  ${this.name}:${id} @ ${(this.marks[id] / 1000).toFixed(1)}s`);
  }
  async tap(locator, pause = 700) {
    await locator.scrollIntoViewIfNeeded();
    await sleep(350);
    await locator.click();
    await sleep(pause);
  }
  async pick(locator, file) {
    const [chooser] = await Promise.all([this.page.waitForEvent("filechooser"), this.tap(locator, 0)]);
    await chooser.setFiles(file);
  }
  async scroll(dy, steps = 18) {
    for (let i = 0; i < steps; i++) {
      await this.page.mouse.wheel(0, dy / steps);
      await sleep(28);
    }
    await sleep(400);
  }
}

async function phoneContext(browser, extra = {}) {
  const ctx = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: SCALE,
    isMobile: true,
    hasTouch: false, // mouse events so the tap ring shows on every click
    locale: "bn-BD",
    geolocation: HERE_GPS,
    permissions: ["geolocation"],
    ignoreHTTPSErrors: true,
    ...extra,
  });
  await ctx.addInitScript(TAPS);
  await cacheStatic(ctx);
  return ctx;
}

async function newSpot(lng, lat, type, thumb) {
  const { data, error } = await admin
    .from("reports")
    .insert({
      photo_path: "demo/rec.jpg",
      thumb_public_path: thumb,
      thumb_status: thumb ? "ok" : "pending",
      geom: `SRID=4326;POINT(${lng} ${lat})`,
      device_hash: `demo-recording-${Date.now()}`,
      site_type: type,
      larvae_seen: "yes",
      created_at: new Date(Date.now() - 26 * 3600e3).toISOString(),
    })
    .select("site_id")
    .single();
  if (error) throw error;
  return data.site_id;
}

async function staffSession(role, extra) {
  const email = `${role}-${Date.now()}@demo.test`;
  const password = `Demo-${Math.random().toString(36).slice(2)}!9`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  await admin.from("profiles").update({ role, ...extra }).eq("id", data.user.id);
  const c = createClient(SB_URL, ANON, { auth: { persistSession: false } });
  const { data: s, error: e2 } = await c.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return s.session;
}

/** Unrecorded: load the on-device photo model once and give this phone a hunter name. */
async function warmUp(browser) {
  const ctx = await browser.newContext({ viewport: PHONE, locale: "bn-BD", ignoreHTTPSErrors: true, geolocation: HERE_GPS, permissions: ["geolocation"] });
  await cacheStatic(ctx);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/report`);
  await page.getByTestId("photo-input").setInputFiles(PHOTO);
  await page.getByText(/সম্ভাব্য প্রজননস্থল|নিশ্চিত হওয়া গেল না|যাচাই করা যায়নি/).first().waitFor({ timeout: 240_000 }).catch(() => console.log("  (photo model still loading; continuing)"));
  await page.getByTestId("next").click();
  await page.getByText(/নির্ভুলতা/).waitFor({ timeout: 60_000 }).catch(() => {});
  await sleep(4000); // map tiles for Mirpur
  await page.goto(`${BASE}/map`);
  await page.getByTestId("map-preview").click().catch(() => {});
  await sleep(8000);
  await ctx.close();
}

// ---------------------------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------------------------

const flows = {
  /** Citizen: home → report in four steps → thank-you screen. */
  async report(browser) {
    const ctx = await phoneContext(browser);
    const page = await ctx.newPage();
    const c = await new Clip("report", page).start();
    await mockSubmit(page, null);
    await page.goto(BASE + "/");
    await sleep(1200);
    c.mark("home");
    await c.scroll(420);
    await sleep(600);
    await c.scroll(-420);
    await sleep(500);
    c.mark("tapReport");
    await c.tap(page.getByTestId("cta-report"), 1200);
    c.mark("camera");
    await c.pick(page.getByText("ক্যামেরা খুলুন").first(), PHOTO);
    await page.getByText(/সম্ভাব্য প্রজননস্থল|নিশ্চিত হওয়া গেল না|যাচাই করা যায়নি/).first().waitFor({ timeout: 120_000 });
    await sleep(1800);
    c.mark("location");
    await c.tap(page.getByTestId("next"), 400);
    await page.getByText(/নির্ভুলতা/).waitFor({ timeout: 30_000 });
    await sleep(1500);
    const map = page.getByTestId("pin-map");
    const box = await map.boundingBox();
    if (box) {
      // Nudge the map so the pin sits on the bucket, the way a person would.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      for (let i = 0; i < 16; i++) {
        await page.mouse.move(box.x + box.width / 2 - i * 3, box.y + box.height / 2 - i * 2);
        await sleep(30);
      }
      await page.mouse.up();
    }
    await sleep(1400);
    c.mark("details");
    await c.tap(page.getByTestId("next"), 900);
    await c.tap(page.getByText("বালতি / ড্রাম"), 600);
    await c.tap(page.getByText("হ্যাঁ", { exact: true }), 800);
    await c.tap(page.getByTestId("next"), 1200);
    await c.scroll(300);
    await sleep(800);
    c.mark("submit");
    await c.tap(page.getByTestId("submit"), 200);
    await page.getByTestId("done").waitFor({ timeout: 30_000 });
    await sleep(2500);
    await c.scroll(350);
    await sleep(1200);
    c.mark("end");
    await finish(c, ctx);
  },

  /** Volunteer: spot list → claim → after photo on the spot → XP → leaderboard. */
  async hunt(browser) {
    const target = await newSpot(SPOT.lng, SPOT.lat, "bucket_drum", "demo/bucket-1.jpg");
    const ctx = await phoneContext(browser);
    const page = await ctx.newPage();
    const c = await new Clip("hunt", page).start();
    // Hunter name is set off-camera (first visit asks for it once).
    await page.goto(`${BASE}/sites/${target}`);
    await page.getByTestId("claim").click();
    await page.getByTestId("handle-input").fill("মিরপুরের_শিকারি");
    await page.getByTestId("handle-save").click();
    await sleep(800);
    await page.goto(BASE + "/");
    await sleep(1000);
    c.t0 = Date.now(); // everything before this is cut from the clip
    c.mark("home");
    await c.tap(page.getByRole("link", { name: "শিকার" }).last(), 1500);
    c.mark("list");
    await c.tap(page.getByText("কাছেরগুলো আগে"), 1500);
    await c.scroll(380);
    await sleep(700);
    await c.scroll(-380);
    await sleep(500);
    c.mark("open");
    await c.tap(page.locator(`a[href$="/sites/${target}"]`).first(), 1600);
    await c.scroll(420);
    await sleep(900);
    c.mark("claim");
    await c.tap(page.getByTestId("claim"), 1600);
    await c.scroll(260);
    await sleep(2200);
    c.mark("after");
    await c.pick(page.getByTestId("take-after"), AFTER);
    await page.getByTestId("distance").waitFor({ timeout: 30_000 });
    await sleep(1600);
    await c.tap(page.getByTestId("confirm-clean"), 200);
    await page.getByTestId("hunt-done").waitFor({ timeout: 30_000 });
    await sleep(3200);
    c.mark("board");
    await page.goto(BASE + "/leaderboard?all");
    await sleep(1800);
    await c.scroll(300);
    await sleep(1500);
    c.mark("end");
    await finish(c, ctx);
  },

  /** For city corporations: a spot's page, the public map with risk, a ward scorecard. */
  async public(browser) {
    const ctx = await phoneContext(browser);
    const page = await ctx.newPage();
    const c = await new Clip("public", page).start();
    const { data: spot } = await admin.from("public_sites").select("id").eq("thumb_public_path", "demo/bucket-2.jpg").limit(1).single();
    await page.goto(`${BASE}/sites/${spot.id}`);
    await sleep(1200);
    c.mark("spot");
    await c.scroll(380);
    await sleep(1500);
    c.mark("map");
    await page.goto(BASE + "/map");
    await sleep(1000);
    await c.tap(page.getByTestId("map-preview"), 6000);
    await c.tap(page.getByTestId("map-mode").getByText(/ঝুঁকি/), 4000);
    await c.scroll(600);
    await sleep(2500);
    c.mark("ward");
    await page.goto(BASE + "/ward/3");
    await sleep(1800);
    await c.scroll(400);
    await sleep(2500);
    c.mark("end");
    await finish(c, ctx);
  },

  /** What a city corporation gets: inspector queue, closing with an after photo, weekly digest, admin. */
  async staff(browser) {
    const session = await staffSession("ward_admin", { ward_id: 3, city_corp: "DNCC" });
    const ctx = await phoneContext(browser);
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${new URL(SB_URL).hostname.split(".")[0]}-auth-token`, JSON.stringify(session)]);
    const page = await ctx.newPage();
    const c = await new Clip("staff", page).start();
    await page.goto(BASE + "/staff/inspect");
    await sleep(1800);
    c.mark("queue");
    await c.scroll(300);
    await sleep(800);
    await c.tap(page.getByTestId("insp-queue").locator("a").first(), 1800);
    await page.getByTestId("insp-site").waitFor();
    await c.scroll(350);
    await c.tap(page.getByTestId("assign"), 1500);
    await c.tap(page.getByTestId("clear"), 1200);
    await c.scroll(300);
    await sleep(1800);
    c.mark("digest");
    await page.goto(BASE + "/staff/digest");
    await sleep(1800);
    await c.scroll(500);
    await sleep(1500);
    c.mark("admin");
    await page.goto(BASE + "/staff/admin");
    await sleep(1500);
    await c.scroll(900, 30);
    await sleep(1500);
    c.mark("data");
    await page.goto(BASE + "/data");
    await sleep(2500);
    c.mark("end");
    await finish(c, ctx);
  },
};

async function finish(clip, ctx) {
  await clip.stop();
  await ctx.close();
  fs.mkdirSync(PUBLIC, { recursive: true });
  const dest = path.join(PUBLIC, `${clip.name}.mp4`);
  // Variable-rate frames -> concat list with per-frame durations, starting at clip.t0.
  const kept = clip.frames.filter((f, i, all) => (all[i + 1]?.t ?? clip.ended) > clip.t0);
  const lines = kept.map((f, i) => {
    const from = Math.max(f.t, clip.t0);
    const to = kept[i + 1]?.t ?? clip.ended;
    return `file '${f.file}'\nduration ${((to - from) / 1000).toFixed(3)}`;
  });
  lines.push(`file '${kept.at(-1).file}'`);
  const list = path.join(clip.dir, "frames.txt");
  fs.writeFileSync(list, lines.join("\n") + "\n");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-vf", "fps=30,format=yuv420p,scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-an", dest]);
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};
  manifest[clip.name] = { src: `app/${clip.name}.mp4`, marks: clip.marks, durationMs: clip.ended - clip.t0 };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + "\n");
  console.log(`→ ${path.relative(MEDIA, dest)} (${kept.length} frames)`);
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(flows);
const browser = await chromium.launch({ executablePath: CHROME });
try {
  await warmUp(browser);
  for (const name of wanted) {
    console.log(`▶ ${name}`);
    await flows[name](browser);
  }
} finally {
  await browser.close();
}

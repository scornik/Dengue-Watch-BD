#!/usr/bin/env node
// Load test for the report pipeline (M9): N reports per minute through the
// submit-report Edge Function, each from a distinct device (so rate limits are
// not what we measure), random points around Dhaka (some clustered so the
// duplicate-merge path is exercised).
//
// Usage:
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... \
//   node scripts/loadtest.mjs --rate 50 --minutes 2 [--photo path.jpg]
//
// Never point this at production without telling the team: it creates real rows
// (clean up with: delete from reports where device_hash in (...)/ note 'loadtest').
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith("--") ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
const RATE = Number(args.rate ?? 50);
const MINUTES = Number(args.minutes ?? 1);
const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_ANON_KEY ?? "";
const photo = readFileSync(args.photo ?? new globalThis.URL("../apps/web/tests/e2e/fixtures/water.jpg", import.meta.url));
const TYPES = ["tire", "bucket_drum", "ac_drip", "construction", "rooftop", "flower_tub", "drain", "other"];

const total = RATE * MINUTES;
const interval = 60_000 / RATE;
const latencies = [];
const statuses = {};
const hotspots = Array.from({ length: 10 }, () => [23.7 + Math.random() * 0.15, 90.36 + Math.random() * 0.1]);

async function one(i) {
  const [hlat, hlng] = hotspots[i % hotspots.length];
  const clustered = i % 3 === 0; // a third land within ~10 m of a hotspot -> merge path
  const lat = clustered ? hlat + (Math.random() - 0.5) * 0.0001 : 23.7 + Math.random() * 0.2;
  const lng = clustered ? hlng + (Math.random() - 0.5) * 0.0001 : 90.33 + Math.random() * 0.15;
  const meta = {
    id: randomUUID(),
    lat, lng,
    accuracy_m: 10,
    site_type: TYPES[i % TYPES.length],
    larvae_seen: "unsure",
    self_cleaned: false,
    note: "loadtest",
    ai_label: "pending",
    ai_score: null,
    device_id: `loadtest-${randomUUID().replace(/-/g, "")}`,
    client_created_at: new Date().toISOString(),
  };
  const form = new FormData();
  form.set("meta", JSON.stringify(meta));
  form.set("photo", new Blob([photo], { type: "image/jpeg" }), "p.jpg");
  const t0 = performance.now();
  try {
    const res = await fetch(`${URL}/functions/v1/submit-report`, {
      method: "POST",
      body: form,
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    await res.arrayBuffer();
    statuses[res.status] = (statuses[res.status] ?? 0) + 1;
  } catch (e) {
    statuses.network = (statuses.network ?? 0) + 1;
  }
  latencies.push(performance.now() - t0);
}

const pct = (p) => {
  const s = [...latencies].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0);
};

console.log(`load test: ${RATE}/min for ${MINUTES} min (${total} reports) -> ${URL}`);
const started = Date.now();
const inflight = [];
for (let i = 0; i < total; i++) {
  inflight.push(one(i));
  await new Promise((r) => setTimeout(r, interval));
}
await Promise.all(inflight);
const secs = (Date.now() - started) / 1000;
const report = {
  sent: total,
  seconds: Math.round(secs),
  statuses,
  latency_ms: { p50: pct(50), p95: pct(95), p99: pct(99), max: Math.round(Math.max(...latencies)) },
};
console.log(JSON.stringify(report, null, 2));
const ok = (statuses[201] ?? 0) + (statuses[200] ?? 0);
process.exit(ok === total && report.latency_ms.p95 < 3000 ? 0 : 1);

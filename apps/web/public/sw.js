/* DengueWatch BD service worker.
 * - Offline app shell (network-first navigations, cache-first static assets)
 * - Background Sync "report-queue": uploads reports saved in IndexedDB
 * - Web push notifications for report status changes
 * Keep the IndexedDB names in sync with src/lib/queue/db.ts.
 */
const VERSION = "dw-v1";
const SHELL = [
  "/", "/report", "/mine", "/en", "/en/report", "/manifest.webmanifest", "/icons/icon-192.png",
  "/fonts/noto-sans-bengali-400.woff2", "/fonts/noto-sans-bengali-700.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(new Request(u, { cache: "reload" })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never cache Supabase/API or tiles here
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/fonts/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match(url.pathname.startsWith("/en") ? "/en/report" : "/report")) || (await caches.match("/"))),
    );
  }
});

// ---------------------------------------------------------------------------
// Background sync
// ---------------------------------------------------------------------------
function idbOpen() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("denguewatch", 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "id" }).createIndex("createdAt", "createdAt");
      if (!db.objectStoreNames.contains("sent")) db.createObjectStore("sent", { keyPath: "id" }).createIndex("sentAt", "sentAt");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result && "result" in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

async function flushFromWorker() {
  const cfg = await caches.open("dw-config").then((c) => c.match("/__config")).then((r) => (r ? r.json() : null));
  if (!cfg) return;
  const db = await idbOpen();
  const items = await tx(db, "queue", "readonly", (s) => s.getAll());
  for (const item of items || []) {
    if (item.state === "failed") continue;
    const form = new FormData();
    form.set("meta", JSON.stringify(item.meta));
    form.set("photo", item.photo, item.id + ".jpg");
    let res;
    try {
      res = await fetch(cfg.functionsUrl + "/submit-report", {
        method: "POST",
        body: form,
        headers: { apikey: cfg.anonKey, Authorization: "Bearer " + (item.token || cfg.anonKey) },
      });
    } catch (e) {
      throw e; // let the browser retry the sync later
    }
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      await tx(db, "sent", "readwrite", (s) =>
        s.put({ id: item.id, siteId: body.site_id || null, siteType: item.meta.site_type, sentAt: Date.now(), thumb: null }),
      );
      await tx(db, "queue", "readwrite", (s) => s.delete(item.id));
    } else if (res.status === 400 || res.status === 413 || res.status === 415) {
      await tx(db, "queue", "readwrite", (s) => s.put({ ...item, state: "failed", attempts: item.attempts + 1, lastError: "http_" + res.status }));
    } else {
      throw new Error("http_" + res.status);
    }
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag !== "report-queue") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      if (clients.length) {
        clients.forEach((c) => c.postMessage({ type: "flush-queue" }));
        return undefined;
      }
      return flushFromWorker();
    }),
  );
});

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "DengueWatch BD", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "ডেঙ্গুওয়াচ বিডি", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "status",
      data: { url: data.url || "/mine" },
      lang: data.lang || "bn",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

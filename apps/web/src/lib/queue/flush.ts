import { ensureCitizenSession } from "@/lib/supabase/client";
import { addSent, listQueue, removeQueueItem, updateQueueItem, type QueueItem } from "./db";
import { sendReport, type SendOutcome } from "./send";

let running: Promise<FlushResult> | null = null;

export type FlushResult = { sent: number; remaining: number; last?: SendOutcome };

async function thumbDataUrl(blob: Blob): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(blob, { resizeWidth: 96 });
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext("2d")?.drawImage(bmp, 0, 0);
    return c.toDataURL("image/jpeg", 0.6);
  } catch {
    return null;
  }
}

async function flushOnce(): Promise<FlushResult> {
  const items = await listQueue();
  let sent = 0;
  let last: SendOutcome | undefined;
  let token: string | null = null;
  for (const item of items) {
    if (item.state === "failed") continue;
    token ??= (await ensureCitizenSession()) ?? item.token;
    const outcome = await sendReport(item.meta, item.photo, token);
    last = outcome;
    if (outcome.kind === "sent") {
      await addSent({
        id: item.id,
        siteId: outcome.siteId,
        siteType: item.meta.site_type,
        sentAt: Date.now(),
        thumb: await thumbDataUrl(item.photo),
      });
      await removeQueueItem(item.id);
      sent++;
      continue;
    }
    const next: QueueItem = {
      ...item,
      attempts: item.attempts + 1,
      lastError: "error" in outcome ? outcome.error : outcome.kind,
      state: outcome.kind === "rejected" ? "failed" : "queued",
    };
    await updateQueueItem(next);
    // Stop on anything that will affect the remaining items the same way.
    if (outcome.kind === "retry" || outcome.kind === "rate_limited" || outcome.kind === "otp_required") break;
  }
  const remaining = (await listQueue()).filter((i) => i.state === "queued").length;
  if (remaining > 0) void registerBackgroundSync();
  return { sent, remaining, last };
}

/** Upload everything in the offline queue (single-flight). */
export function flushQueue(): Promise<FlushResult> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve({ sent: 0, remaining: 0 });
  }
  running ??= flushOnce().finally(() => {
    running = null;
  });
  return running;
}

/** Ask the service worker to wake us up when connectivity returns. */
export async function registerBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    // Background Sync is Chromium-only; elsewhere the "online" event covers it.
    const sync = (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } })?.sync;
    await sync?.register("report-queue");
  } catch {
    /* unsupported */
  }
}

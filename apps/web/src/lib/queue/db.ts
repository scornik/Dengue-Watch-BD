import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ReportMeta } from "@/lib/report/types";

/**
 * IndexedDB layout (also read by public/sw.js — keep names in sync):
 *   db "denguewatch" v1
 *     store "queue": reports waiting to upload
 *     store "sent":  lightweight history for "My reports"
 */
export const DB_NAME = "denguewatch";
export const DB_VERSION = 1;

export type QueueItem = {
  id: string;
  meta: ReportMeta;
  photo: Blob;
  token: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: number;
  /** "queued" = will retry; "failed" = rejected by server validation, needs user action */
  state: "queued" | "failed";
};

export type SentItem = {
  id: string;
  siteId: string | null;
  siteType: string;
  sentAt: number;
  thumb: string | null;
};

interface Schema extends DBSchema {
  queue: { key: string; value: QueueItem; indexes: { createdAt: number } };
  sent: { key: string; value: SentItem; indexes: { sentAt: number } };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const q = db.createObjectStore("queue", { keyPath: "id" });
        q.createIndex("createdAt", "createdAt");
        const s = db.createObjectStore("sent", { keyPath: "id" });
        s.createIndex("sentAt", "sentAt");
      },
    });
  }
  return dbPromise;
}

/** For tests: close the connection so the database can be deleted. */
export async function resetDbForTests() {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

const listeners = new Set<() => void>();
export function onQueueChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emitQueueChange() {
  listeners.forEach((fn) => fn());
}

export async function enqueue(item: Omit<QueueItem, "attempts" | "lastError" | "createdAt" | "state">) {
  const db = await getDb();
  await db.put("queue", { ...item, attempts: 0, lastError: null, createdAt: Date.now(), state: "queued" });
  emitQueueChange();
}

export async function listQueue(): Promise<QueueItem[]> {
  const db = await getDb();
  return db.getAllFromIndex("queue", "createdAt");
}

export async function updateQueueItem(item: QueueItem) {
  const db = await getDb();
  await db.put("queue", item);
  emitQueueChange();
}

export async function removeQueueItem(id: string) {
  const db = await getDb();
  await db.delete("queue", id);
  emitQueueChange();
}

export async function addSent(item: SentItem) {
  const db = await getDb();
  await db.put("sent", item);
  emitQueueChange();
}

export async function listSent(): Promise<SentItem[]> {
  const db = await getDb();
  return (await db.getAllFromIndex("sent", "sentAt")).reverse();
}

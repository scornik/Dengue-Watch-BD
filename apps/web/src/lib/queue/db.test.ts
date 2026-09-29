import { beforeEach, describe, expect, it } from "vitest";
import { addSent, enqueue, listQueue, listSent, removeQueueItem, resetDbForTests } from "./db";

describe("offline queue (IndexedDB)", () => {
  beforeEach(async () => {
    await resetDbForTests();
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase("denguewatch");
      req.onsuccess = req.onerror = req.onblocked = resolve;
    });
  });

  it("stores, lists in order and removes items", async () => {
    const photo = new Blob(["x"], { type: "image/jpeg" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = { id: "a" } as any;
    await enqueue({ id: "a", meta, photo, token: null });
    await new Promise((r) => setTimeout(r, 2));
    await enqueue({ id: "b", meta: { ...meta, id: "b" }, photo, token: "t" });
    const items = await listQueue();
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(items[0]!.state).toBe("queued");
    expect(items[0]!.attempts).toBe(0);
    await removeQueueItem("a");
    expect((await listQueue()).map((i) => i.id)).toEqual(["b"]);
  });

  it("keeps sent history newest first", async () => {
    await addSent({ id: "1", siteId: null, siteType: "tire", sentAt: 1, thumb: null });
    await addSent({ id: "2", siteId: "s", siteType: "drain", sentAt: 2, thumb: null });
    expect((await listSent()).map((s) => s.id)).toEqual(["2", "1"]);
  });
});

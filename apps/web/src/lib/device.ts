/** Random per-install id. The server only ever stores a salted hash of it. */
export function getDeviceId(): string {
  const KEY = "dw_device_id";
  try {
    let id = localStorage.getItem(KEY);
    if (!id || id.length < 16) {
      id = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID().replace(/-/g, "");
  }
}

import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint, withTimeout } from "./push.ts";

describe("isAllowedPushEndpoint", () => {
  it("accepts known push services over https", () => {
    for (const e of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://db5p.notify.windows.com/w/?token=abc",
      "https://web.push.apple.com/QGx",
      "https://api.push.apple.com/3/device/abc",
    ]) {
      expect(isAllowedPushEndpoint(e)).toBe(true);
    }
  });

  it("rejects other hosts, schemes, ports, credentials and look-alikes", () => {
    for (const e of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evilpush.apple.com/x",
      "https://push.apple.com/x",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/x",
      "not a url",
      "",
    ]) {
      expect(isAllowedPushEndpoint(e)).toBe(false);
    }
  });
});

describe("withTimeout", () => {
  it("resolves fast promises and rejects slow ones", async () => {
    await expect(withTimeout(Promise.resolve(1), 50)).resolves.toBe(1);
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toThrow("timeout");
  });
});

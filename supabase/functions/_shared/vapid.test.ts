import { describe, expect, it } from "vitest";
import { vapidJwks } from "./vapid.ts";

const b64url = (b: ArrayBuffer | Uint8Array) =>
  Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString("base64url");

describe("vapidJwks", () => {
  it("round-trips a generated P-256 key pair and signs/verifies", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const rawPub = await crypto.subtle.exportKey("raw", pair.publicKey);
    const jwkPriv = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const jwks = vapidJwks(b64url(rawPub), jwkPriv.d!);
    expect(jwks.privateKey.x).toBe(jwkPriv.x);
    expect(jwks.privateKey.y).toBe(jwkPriv.y);
    const algo = { name: "ECDSA", namedCurve: "P-256" };
    const priv = await crypto.subtle.importKey("jwk", jwks.privateKey, algo, false, ["sign"]);
    const pub = await crypto.subtle.importKey("jwk", jwks.publicKey, algo, false, ["verify"]);
    const data = new TextEncoder().encode("hello");
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, priv, data);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, sig, data)).toBe(true);
  });
  it("rejects malformed public keys", () => {
    expect(() => vapidJwks("AAAA", "AAAA")).toThrow();
  });
});

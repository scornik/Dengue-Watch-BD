// Convert web-push style VAPID keys (base64url raw public point + raw private
// scalar, as printed by `npx web-push generate-vapid-keys`) to the JWK pair
// that @negrel/webpush imports.

function b64urlDecode(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function vapidJwks(publicKey: string, privateKey: string): { publicKey: JsonWebKey; privateKey: JsonWebKey } {
  const pub = b64urlDecode(publicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error("VAPID public key must be an uncompressed P-256 point");
  const x = b64urlEncode(pub.subarray(1, 33));
  const y = b64urlEncode(pub.subarray(33, 65));
  const d = b64urlEncode(b64urlDecode(privateKey));
  const base = { kty: "EC", crv: "P-256", x, y, ext: true };
  return { publicKey: base, privateKey: { ...base, d } };
}

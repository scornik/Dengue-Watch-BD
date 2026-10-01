import { describe, expect, it } from "vitest";
import { bearer, isServiceToken } from "./auth.ts";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload: unknown) => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.sig`;

describe("isServiceToken", () => {
  it("accepts an exact match with the injected key", () => {
    expect(isServiceToken("sb_secret_abc", "sb_secret_abc")).toBe(true);
  });

  it("accepts a (gateway-verified) JWT with role service_role", () => {
    expect(isServiceToken(jwt({ role: "service_role", iss: "supabase" }), "sb_secret_other")).toBe(true);
  });

  it("rejects anon and authenticated JWTs", () => {
    expect(isServiceToken(jwt({ role: "anon" }), "k")).toBe(false);
    expect(isServiceToken(jwt({ role: "authenticated", sub: "u" }), "k")).toBe(false);
  });

  it("rejects empty, malformed and non-JWT tokens", () => {
    expect(isServiceToken("", "")).toBe(false);
    expect(isServiceToken("", undefined)).toBe(false);
    expect(isServiceToken("not-a-jwt", "k")).toBe(false);
    expect(isServiceToken("a.%%%.c", "k")).toBe(false);
    expect(isServiceToken(`x.${Buffer.from("[]").toString("base64url")}.y`, "k")).toBe(false);
  });
});

describe("bearer", () => {
  it("strips the Bearer prefix case-insensitively", () => {
    expect(bearer(new Request("https://x", { headers: { Authorization: "bearer abc" } }))).toBe("abc");
    expect(bearer(new Request("https://x"))).toBe("");
  });
});

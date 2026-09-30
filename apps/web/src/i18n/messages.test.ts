import { describe, expect, it } from "vitest";
import bn from "../../../../messages/bn.json";
import en from "../../../../messages/en.json";

type Tree = { [k: string]: string | Tree };
const flat = (o: Tree, p = ""): Record<string, string> =>
  Object.entries(o).reduce<Record<string, string>>(
    (acc, [k, v]) => (typeof v === "string" ? { ...acc, [`${p}${k}`]: v } : { ...acc, ...flat(v, `${p}${k}.`) }),
    {},
  );
// Argument names only ("{name}" or "{name, plural, ...}"), not words inside plural branches.
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]).sort();

describe("messages", () => {
  const b = flat(bn as Tree);
  const e = flat(en as Tree);
  it("bn and en have the same keys", () => {
    expect(Object.keys(b).sort()).toEqual(Object.keys(e).sort());
  });
  it("every string has the same ICU placeholders in both languages", () => {
    for (const k of Object.keys(e)) expect([k, placeholders(b[k] ?? "")]).toEqual([k, placeholders(e[k]!)]);
  });
  it("no empty strings", () => {
    for (const [k, v] of Object.entries(b)) expect([k, v.trim().length > 0]).toEqual([k, true]);
  });
});

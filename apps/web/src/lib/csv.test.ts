import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
  });
  it("neutralises formulas but keeps negative numbers", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-12.5")).toBe("-12.5");
    expect(csvCell("@x")).toBe("'@x");
  });
  it("builds a BOM-prefixed table", () => {
    expect(toCsv([{ a: 1, b: null }, { a: "ঢাকা", b: true }])).toBe("﻿a,b\r\n1,\r\nঢাকা,true\r\n");
  });
});

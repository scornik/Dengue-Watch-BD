/** RFC 4180 CSV with spreadsheet formula-injection protection. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  // Cells starting with = + - @ (or tab/CR) are executed as formulas by spreadsheets.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const lines = [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))];
  return "﻿" + lines.join("\r\n") + "\r\n"; // BOM so Excel reads Bangla as UTF-8
}

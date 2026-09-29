export type WardFeatureError = { index: number; reason: string };

/** Validates an uploaded ward FeatureCollection before sending it to the DB. */
export function validateWardCollection(input: unknown): { ok: true; count: number } | { ok: false; errors: WardFeatureError[] } {
  const errors: WardFeatureError[] = [];
  const fc = input as { type?: string; features?: unknown[] };
  if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
    return { ok: false, errors: [{ index: -1, reason: "not a FeatureCollection" }] };
  }
  const seen = new Set<string>();
  fc.features.forEach((f, index) => {
    const feat = f as { geometry?: { type?: string }; properties?: Record<string, unknown> };
    const p = feat?.properties ?? {};
    const corp = String(p.city_corp ?? "").toUpperCase();
    const no = Number(p.ward_no);
    if (corp !== "DNCC" && corp !== "DSCC") errors.push({ index, reason: "city_corp must be DNCC or DSCC" });
    const max = corp === "DNCC" ? 54 : 75;
    if (!Number.isInteger(no) || no < 1 || no > max) errors.push({ index, reason: `ward_no must be 1-${max}` });
    if (feat?.geometry?.type !== "Polygon" && feat?.geometry?.type !== "MultiPolygon") {
      errors.push({ index, reason: "geometry must be Polygon or MultiPolygon" });
    }
    const key = `${corp}-${no}`;
    if (seen.has(key)) errors.push({ index, reason: `duplicate ${key}` });
    seen.add(key);
  });
  return errors.length ? { ok: false, errors } : { ok: true, count: fc.features.length };
}

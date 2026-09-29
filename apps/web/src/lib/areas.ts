/** case_counts.area codes (kept in sync with workers/cases). */
export const CASE_AREAS = [
  "DNCC",
  "DSCC",
  "DHAKA_DIV",
  "CHATTOGRAM_DIV",
  "KHULNA_DIV",
  "RAJSHAHI_DIV",
  "RANGPUR_DIV",
  "MYMENSINGH_DIV",
  "BARISHAL_DIV",
  "SYLHET_DIV",
  "BANGLADESH",
] as const;
export type CaseArea = (typeof CASE_AREAS)[number];

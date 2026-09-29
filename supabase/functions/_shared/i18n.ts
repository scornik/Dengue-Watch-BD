// Minimal server-side strings (kept equal to /messages/*.json by a unit test).
export const STRINGS = {
  bn: {
    statusTitle: "আপনার রিপোর্টের খবর",
    status: { new: "নতুন", verified: "যাচাই হয়েছে", assigned: "দায়িত্ব দেওয়া হয়েছে", cleared: "পরিষ্কার হয়েছে", not_found: "পাওয়া যায়নি", rejected: "বাতিল" },
  },
  en: {
    statusTitle: "Update on your report",
    status: { new: "New", verified: "Verified", assigned: "Assigned", cleared: "Cleared", not_found: "Not found", rejected: "Rejected" },
  },
} as const;
export type Locale = keyof typeof STRINGS;
export type Status = keyof (typeof STRINGS)["bn"]["status"];

export function statusMessage(locale: Locale, status: Status): { title: string; body: string } {
  const s = STRINGS[locale] ?? STRINGS.bn;
  const label = s.status[status];
  return { title: s.statusTitle, body: locale === "en" ? `Status: ${label}` : `অবস্থা: ${label}` };
}

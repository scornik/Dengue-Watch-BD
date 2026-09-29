// Weekly ward digest rendering (pure; unit-tested). Bilingual: Bangla first.
export type DigestRow = {
  ward_id: number;
  ward_no: number;
  name_bn: string;
  name_en: string;
  new_sites: number;
  cleared: number;
  not_found: number;
  open_total: number;
  overdue: number;
  risk_level: "green" | "yellow" | "orange" | "red" | null;
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const bnDigits = (n: number | string) => String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]!);
const RISK = {
  green: ["#22c55e", "কম", "Low"],
  yellow: ["#eab308", "মাঝারি", "Moderate"],
  orange: ["#f97316", "বেশি", "High"],
  red: ["#dc2626", "খুব বেশি", "Very high"],
} as const;

export function digestSubject(cityCorp: string, weekStart: string): string {
  return `ডেঙ্গুওয়াচ সাপ্তাহিক সারাংশ · DengueWatch weekly digest — ${cityCorp} — ${weekStart}`;
}

export function renderDigestHtml(opts: { cityCorp: string; weekStart: string; rows: DigestRow[]; siteUrl: string }): string {
  const { cityCorp, weekStart, rows, siteUrl } = opts;
  const totals = rows.reduce(
    (t, r) => ({ n: t.n + r.new_sites, c: t.c + r.cleared, o: t.o + r.open_total, d: t.d + r.overdue }),
    { n: 0, c: 0, o: 0, d: 0 },
  );
  // Busiest wards first: overdue, then open.
  const sorted = [...rows].sort((a, b) => b.overdue - a.overdue || b.open_total - a.open_total || a.ward_no - b.ward_no);
  const tr = sorted
    .map((r) => {
      const risk = r.risk_level ? RISK[r.risk_level] : null;
      return `<tr>
  <td style="padding:6px;border-bottom:1px solid #e5e7eb"><a href="${esc(siteUrl)}/ward/${r.ward_id}">${esc(r.name_bn)}</a><br><small>${esc(r.name_en)}</small></td>
  <td style="padding:6px;text-align:right;border-bottom:1px solid #e5e7eb">${bnDigits(r.new_sites)}</td>
  <td style="padding:6px;text-align:right;border-bottom:1px solid #e5e7eb">${bnDigits(r.cleared)}</td>
  <td style="padding:6px;text-align:right;border-bottom:1px solid #e5e7eb;${r.overdue ? "color:#b91c1c;font-weight:bold" : ""}">${bnDigits(r.overdue)}</td>
  <td style="padding:6px;border-bottom:1px solid #e5e7eb">${
    risk ? `<span style="display:inline-block;width:10px;height:10px;border-radius:5px;background:${risk[0]}"></span> ${risk[1]} / ${risk[2]}` : "–"
  }</td>
</tr>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${esc(digestSubject(cityCorp, weekStart))}</title></head>
<body style="font-family:'Noto Sans Bengali',system-ui,sans-serif;color:#111827;max-width:720px;margin:auto;padding:16px">
<h1 style="color:#065f46;font-size:20px">ডেঙ্গুওয়াচ বিডি · ${esc(cityCorp)} · ${esc(weekStart)} থেকে ৭ দিন</h1>
<p>নতুন স্থান / New sites: <b>${bnDigits(totals.n)}</b> · পরিষ্কার / Cleared: <b>${bnDigits(totals.c)}</b> ·
খোলা / Open: <b>${bnDigits(totals.o)}</b> · ৭২ ঘণ্টার বেশি / Overdue &gt;72 h: <b style="color:#b91c1c">${bnDigits(totals.d)}</b></p>
<table style="border-collapse:collapse;width:100%;font-size:14px">
<thead><tr style="background:#f3f4f6;text-align:left">
<th style="padding:6px">ওয়ার্ড / Ward</th><th style="padding:6px;text-align:right">নতুন / New</th>
<th style="padding:6px;text-align:right">পরিষ্কার / Cleared</th><th style="padding:6px;text-align:right">বকেয়া / Overdue</th>
<th style="padding:6px">পরিবেশগত ঝুঁকি / Env. risk*</th></tr></thead>
<tbody>
${tr}
</tbody></table>
<p style="font-size:12px;color:#4b5563">* পরিবেশগত ঝুঁকি, নিশ্চিত রোগী নয় · Environmental risk, not confirmed cases.</p>
<p><a href="${esc(siteUrl)}/staff/inspect">পরিদর্শকের তালিকা / Inspector queue</a> ·
<a href="${esc(siteUrl)}/staff/digest?corp=${encodeURIComponent(cityCorp)}&amp;week=${encodeURIComponent(weekStart)}">PDF (print)</a></p>
</body></html>`;
}

/** Monday 00:00 Asia/Dhaka of the previous full week, as YYYY-MM-DD and ISO instant. */
export function previousWeek(now = new Date()): { date: string; start: string } {
  const dhaka = new Date(now.getTime() + 6 * 3600_000); // UTC+6, no DST
  const dow = (dhaka.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(dhaka.getUTCFullYear(), dhaka.getUTCMonth(), dhaka.getUTCDate() - dow - 7));
  const date = monday.toISOString().slice(0, 10);
  return { date, start: new Date(monday.getTime() - 6 * 3600_000).toISOString() };
}

// Support inbox email rendering (pure; unit-tested). Everything a citizen typed is escaped.
export type SupportMessage = {
  id: string;
  topic: string;
  name: string | null;
  contact: string | null;
  message: string;
  page: string | null;
  locale: "bn" | "en";
  created_at: string;
};

const TOPICS: Record<string, [string, string]> = {
  question: ["প্রশ্ন", "Question"],
  problem: ["সমস্যা", "Problem"],
  idea: ["পরামর্শ", "Suggestion"],
  city_corporation: ["সিটি করপোরেশন / ওয়ার্ড", "City corporation / ward"],
  volunteer: ["স্বেচ্ছাসেবক হতে চাই", "Wants to volunteer"],
  other: ["অন্যান্য", "Other"],
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

/** The sender's address, when they left one, so "Reply" in the inbox goes straight to them. */
export function replyTo(contact: string | null): string | null {
  const c = contact?.trim() ?? "";
  return EMAIL.test(c) && c.length <= 120 ? c : null;
}

export function topicLabel(topic: string): string {
  const [bn, en] = TOPICS[topic] ?? TOPICS.other!;
  return `${bn} · ${en}`;
}

export function supportSubject(m: SupportMessage): string {
  // One line, short: a citizen's text must not be able to forge headers or flood the subject.
  const preview = m.message.replace(/\s+/g, " ").trim();
  const short = preview.length > 60 ? `${preview.slice(0, 57)}…` : preview;
  return `ডেঙ্গুওয়াচ বার্তা · ${topicLabel(m.topic).split(" · ")[1]}: ${short}`;
}

export function renderSupportText(m: SupportMessage, siteUrl: string): string {
  return [
    `New message to DengueWatch BD support (${topicLabel(m.topic)})`,
    "",
    m.message,
    "",
    `From: ${m.name ?? "(no name)"}`,
    `Contact: ${m.contact ?? "(none)"}`,
    m.page ? `Page: ${m.page}` : null,
    `Received: ${m.created_at}`,
    "",
    `Open the inbox: ${siteUrl}/staff/inbox`,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

export function renderSupportHtml(m: SupportMessage, siteUrl: string): string {
  const reply = replyTo(m.contact);
  const contact = m.contact
    ? reply
      ? `<a href="mailto:${esc(reply)}">${esc(m.contact)}</a>`
      : /^[+\d][\d\s-]{5,}$/.test(m.contact)
        ? `<a href="tel:${esc(m.contact.replace(/[^\d+]/g, ""))}">${esc(m.contact)}</a>`
        : esc(m.contact)
    : "<i>নেই · none</i>";
  return `<!doctype html><html><body style="font-family:'Noto Sans Bengali',system-ui,sans-serif;color:#1b1f3b;max-width:600px;margin:auto">
<p style="margin:0 0 4px;color:#4e5470">নতুন বার্তা · New message</p>
<p style="display:inline-block;margin:0 0 12px;padding:4px 12px;border-radius:999px;background:#1b1f3b;color:#fff;font-weight:700">${esc(topicLabel(m.topic))}</p>
<div style="white-space:pre-wrap;font-size:16px;line-height:1.5;padding:12px 16px;border-left:4px solid #f5a524;background:#fff4df">${esc(m.message)}</div>
<table style="margin:16px 0;font-size:14px;border-collapse:collapse">
<tr><td style="padding:2px 12px 2px 0;color:#4e5470">নাম · Name</td><td>${m.name ? esc(m.name) : "<i>দেননি · not given</i>"}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#4e5470">যোগাযোগ · Contact</td><td>${contact}</td></tr>
${m.page ? `<tr><td style="padding:2px 12px 2px 0;color:#4e5470">পাতা · Page</td><td>${esc(m.page)}</td></tr>` : ""}
<tr><td style="padding:2px 12px 2px 0;color:#4e5470">সময় · Received</td><td>${esc(m.created_at)}</td></tr>
</table>
<p><a href="${esc(siteUrl)}/staff/inbox" style="display:inline-block;padding:10px 18px;border-radius:12px;background:#d7263d;color:#fff;font-weight:700;text-decoration:none">ইনবক্স খুলুন · Open the inbox</a></p>
<p style="font-size:12px;color:#4e5470">${reply ? "Reply to this email to answer the sender directly. · এই ইমেইলের উত্তর দিলে সরাসরি প্রেরকের কাছে যাবে।" : "The sender left no email address. · প্রেরক ইমেইল দেননি।"} Mark it resolved in the inbox when done.</p>
</body></html>`;
}

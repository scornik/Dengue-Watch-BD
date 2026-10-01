import { describe, expect, it } from "vitest";
import { renderSupportHtml, renderSupportText, replyTo, supportSubject, type SupportMessage } from "./support.ts";

const msg = (o: Partial<SupportMessage> = {}): SupportMessage => ({
  id: "m1",
  topic: "volunteer",
  name: "Rina",
  contact: "rina@example.com",
  message: "Can my school join?",
  page: "/bn/contact",
  locale: "bn",
  created_at: "2026-10-01T10:00:00Z",
  ...o,
});

describe("support email", () => {
  it("escapes everything the sender typed", () => {
    const html = renderSupportHtml(msg({ name: '<img src=x onerror="alert(1)">', message: "<script>x</script>", page: '"><a>' }), "https://x.org");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("&quot;&gt;&lt;a&gt;");
  });

  it("links the inbox and the sender's email", () => {
    const html = renderSupportHtml(msg(), "https://x.org");
    expect(html).toContain('href="https://x.org/staff/inbox"');
    expect(html).toContain('href="mailto:rina@example.com"');
    expect(html).toContain("স্বেচ্ছাসেবক হতে চাই · Wants to volunteer");
  });

  it("links a phone number for calling", () => {
    expect(renderSupportHtml(msg({ contact: "01711-000000" }), "https://x.org")).toContain('href="tel:01711000000"');
  });

  it("uses reply-to only for a real email address", () => {
    expect(replyTo("rina@example.com")).toBe("rina@example.com");
    expect(replyTo(" rina@example.com ")).toBe("rina@example.com");
    expect(replyTo("01711-000000")).toBeNull();
    expect(replyTo("a@b.com, evil@x.com")).toBeNull();
    expect(replyTo("x@y.com\nBcc: z@w.com")).toBeNull();
    expect(replyTo(null)).toBeNull();
  });

  it("keeps the subject to one short line", () => {
    const s = supportSubject(msg({ message: "line one\nBcc: evil@x.com\n" + "y".repeat(200) }));
    expect(s).not.toContain("\n");
    expect(s.length).toBeLessThan(110);
    expect(s).toMatch(/^ডেঙ্গুওয়াচ বার্তা · Wants to volunteer: line one Bcc/);
  });

  it("has a plain-text version with the inbox link", () => {
    const t = renderSupportText(msg({ name: null, contact: null }), "https://x.org");
    expect(t).toContain("(no name)");
    expect(t).toContain("https://x.org/staff/inbox");
  });
});

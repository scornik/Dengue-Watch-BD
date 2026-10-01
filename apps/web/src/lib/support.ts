"use client";

import { ensureCitizenSession, getBrowserClient } from "@/lib/supabase/client";

export const SUPPORT_TOPICS = ["question", "problem", "idea", "city_corporation", "volunteer", "other"] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];
export const MESSAGE_MAX = 2000;

export type SupportMessage = {
  id: string;
  topic: SupportTopic;
  name: string | null;
  contact: string | null;
  message: string;
  page: string | null;
  locale: "bn" | "en";
  status: "new" | "read" | "resolved";
  staff_note: string | null;
  handled_at: string | null;
  created_at: string;
};

/** Sends a message to the support inbox (supabase/migrations/20261001000200_support_inbox.sql). */
export async function sendSupportMessage(m: {
  topic: SupportTopic;
  message: string;
  name?: string;
  contact?: string;
  page?: string;
  locale: string;
}): Promise<"sent" | "too_many" | "error"> {
  const token = await ensureCitizenSession().catch(() => null);
  if (!token) return "error";
  const { error } = await getBrowserClient().rpc("submit_support_message", {
    p_topic: m.topic,
    p_message: m.message,
    p_name: m.name ?? null,
    p_contact: m.contact ?? null,
    p_page: m.page ?? null,
    p_locale: m.locale,
  });
  if (!error) return "sent";
  return error.message.includes("too_many_messages") ? "too_many" : "error";
}

import { beforeEach, expect, it, vi } from "vitest";
import { reminderApi } from "@/features/medication-reminders/api";

const signal = () => new AbortController().signal;
const status = { version: 0, linked: false, maskedChat: null, botUsername: "tbcall_fictitious_bot", available: true };
const response = (data: unknown, etag?: string) => Response.json(data, { headers: etag ? { ETag: etag } : {} });
beforeEach(() => { document.cookie = "XSRF-TOKEN=telegram-test; Path=/"; });
it("requires the Telegram status ETag and validates its structure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(status)));
  await expect(reminderApi.telegram(signal())).rejects.toMatchObject({ problem: { code: "INVALID_RESPONSE" } });
});
it.each([
  "https://evil.example/tbcall_fictitious_bot?start=" + "a".repeat(43),
  "http://t.me/tbcall_fictitious_bot?start=" + "a".repeat(43),
  "https://t.me/other_bot?start=" + "a".repeat(43),
  "https://t.me/tbcall_fictitious_bot?start=" + "a".repeat(43) + "&next=evil",
  "https://t.me/tbcall_fictitious_bot?start=" + "a".repeat(43) + "#fragment",
  "https://t.me/tbcall_fictitious_bot?start=short",
])("rejects unsafe or mismatched Telegram deep link %s", async deepLink => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ deepLink, expiresAt: new Date(Date.now() + 300000).toISOString() })));
  await expect(reminderApi.linkTelegram('"opaque"', status.botUsername, signal())).rejects.toMatchObject({ problem: { code: "INVALID_RESPONSE" } });
});
it("rejects expired links and links outside the five minute lifetime", async () => {
  for (const expiry of [-1, 600000]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ deepLink: `https://t.me/tbcall_fictitious_bot?start=${"a".repeat(43)}`, expiresAt: new Date(Date.now() + expiry).toISOString() })));
    await expect(reminderApi.linkTelegram('"opaque"', status.botUsername, signal())).rejects.toMatchObject({ problem: { code: "INVALID_RESPONSE" } });
  }
});

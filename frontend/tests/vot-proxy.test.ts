// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { proxyRequest } from "@/lib/server/backend-proxy";
beforeEach(() => { vi.stubEnv("TBCALL_BACKEND_URL", "http://backend.test"); });
it("streams bounded VOT request without consuming an arrayBuffer and preserves raw MIME/CSRF", async () => {
  const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => {
    expect(init.body).toBeInstanceOf(ReadableStream);
    expect(init.headers).toEqual(expect.any(Headers));
    expect((init.headers as Headers).get("X-XSRF-TOKEN")).toBe("synthetic-token");
    expect(await new Response(init.body).text()).toBe("synthetic");
    return Response.json({ synthetic: true }, { status: 201 });
  });
  vi.stubGlobal("fetch", fetcher);
  const request = new Request("http://frontend.test/api/tbcall/v1/me/vot-submissions", { method: "POST", body: "synthetic", headers: { "Content-Type": "video/webm", "X-XSRF-TOKEN": "synthetic-token", Origin: "http://frontend.test" } });
  const buffered = vi.spyOn(request, "arrayBuffer");
  const response = await proxyRequest(request, ["v1", "me", "vot-submissions"]);
  expect(response.status).toBe(201); expect(buffered).not.toHaveBeenCalled();
});
it("rejects oversized and cross-origin VOT uploads before contacting backend", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  for (const headers of [{ "Content-Length": "20971521" }, { Origin: "https://other.test" }] as Record<string, string>[]) {
    const response = await proxyRequest(new Request("http://frontend.test/api/tbcall/v1/me/vot-submissions", { method: "POST", body: "synthetic", headers: { "Content-Type": "video/webm", ...headers } }), ["v1", "me", "vot-submissions"]);
    expect([403, 413]).toContain(response.status);
  }
  expect(fetcher).not.toHaveBeenCalled();
});
it("streams private video with no-store and no unapproved response headers", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("synthetic-video", { headers: { "Content-Type": "video/mp4", "Content-Length": "15", "Accept-Ranges": "none", "Cache-Control": "public,max-age=999", "X-Unapproved": "private" } })));
  const response = await proxyRequest(new Request("http://frontend.test/api/tbcall/v1/vot-submissions/synthetic/media"), ["v1", "vot-submissions", "synthetic", "media"]);
  expect(response.headers.get("Content-Type")).toBe("video/mp4"); expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(response.headers.has("X-Unapproved")).toBe(false); expect(await response.text()).toBe("synthetic-video");
  expect(response.headers.get("Content-Length")).toBe("15"); expect(response.headers.get("Accept-Ranges")).toBe("none"); expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff"); expect(timeout).toHaveBeenCalledWith(120000);
});
it("rejects chunked uploads beyond the video limit without buffering all chunks", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit) => { await new Response(init.body).arrayBuffer(); return Response.json({}); }));
  const chunks = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(10485760)); controller.enqueue(new Uint8Array(10485760)); controller.enqueue(new Uint8Array(1)); controller.close(); } });
  const request = new Request("http://frontend.test/api/tbcall/v1/me/vot-submissions", { method: "POST", body: chunks, duplex: "half" } as RequestInit);
  const response = await proxyRequest(request, ["v1", "me", "vot-submissions"]); expect(response.status).toBe(413);
});

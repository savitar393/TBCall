// @vitest-environment node
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { proxyRequest } from "@/lib/server/backend-proxy";

let server: Server;
let origin: string;
let received: { path: string; headers: Record<string, unknown>; body: string; method?: string }[] = [];

beforeAll(async () => {
  server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    received.push({ path: req.url!, headers: req.headers, method: req.method, body });
    if (req.url?.startsWith("/api/v1/redirect")) {
      res.writeHead(302, { Location: "https://unapproved.invalid/private" });
      res.end("redirect fixture");
    } else if (req.method === "DELETE") {
      res.writeHead(204, { "Set-Cookie": ["TBCALL_SESSION=; Path=/; Max-Age=0; HttpOnly", "XSRF-TOKEN=; Path=/; Max-Age=0"] });
      res.end();
    } else {
      res.writeHead(401, {
        "Content-Type": "application/problem+json",
        ETag: '"7"', "X-Request-ID": "upstream-id",
        "Set-Cookie": [
          "TBCALL_SESSION=opaque; Path=/; HttpOnly; SameSite=Strict; Expires=Wed, 21 Oct 2026 07:28:00 GMT",
          "XSRF-TOKEN=csrf; Path=/; SameSite=Strict",
        ],
        "X-Unapproved": "must not escape",
      });
      res.end(JSON.stringify({ title: "Login diperlukan", status: 401, code: "AUTHENTICATION_REQUIRED" }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture HTTP server not listening");
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });
beforeEach(() => { received = []; vi.stubEnv("TBCALL_BACKEND_URL", origin); });

describe("fixed backend proxy", () => {
  it("keeps the fixed host and /api root despite target-like query parameters", async () => {
    const response = await proxyRequest(new Request("http://frontend.test/api/tbcall/v1/me?backendUrl=https%3A%2F%2Funapproved.invalid&page=2"), ["v1", "me"]);
    expect(response.status).toBe(401);
    expect(received[0].path).toBe("/api/v1/me?backendUrl=https%3A%2F%2Funapproved.invalid&page=2");
    expect(received[0].headers.host).toBe(new URL(origin).host);
  });
  it.each(["GET", "POST", "PATCH", "DELETE"])("supports %s without an invented HTTP method", async (method) => {
    const response = await proxyRequest(new Request("http://frontend.test/api/tbcall/v1/example", { method, ...(method === "GET" ? {} : { body: "fixture" }) }), ["v1", "example"]);
    expect(response.status).toBe(method === "DELETE" ? 204 : 401);
    expect(received[0].method).toBe(method);
    expect(received[0].body).toBe(method === "GET" ? "" : "fixture");
  });
  it("forwards only the approved request headers and preserves the body", async () => {
    await proxyRequest(new Request("http://frontend.test/api/tbcall/v1/auth/login", {
      method: "POST", body: '{"identity":"fixture","password":"fixture"}',
      headers: { Cookie: "fixture=cookie", "Content-Type": "application/json", Accept: "application/json", "X-XSRF-TOKEN": "fresh", "If-Match": '"9"', "X-Request-ID": "client-id", Authorization: "unapproved", Origin: "https://unapproved.invalid", "X-Forwarded-Host": "unapproved.invalid" },
    }), ["v1", "auth", "login"]);
    expect(received[0].headers).toMatchObject({ cookie: "fixture=cookie", "content-type": "application/json", accept: "application/json", "x-xsrf-token": "fresh", "if-match": '"9"', "x-request-id": "client-id" });
    expect(received[0].headers).not.toHaveProperty("authorization");
    expect(received[0].headers).not.toHaveProperty("origin");
    expect(received[0].headers).not.toHaveProperty("x-forwarded-host");
    expect(received[0].body).toBe('{"identity":"fixture","password":"fixture"}');
  });
  it("preserves problem body/status, ETag, correlation and each cookie including Expires commas", async () => {
    const response = await proxyRequest(new Request("http://frontend.test/api/tbcall/v1/me"), ["v1", "me"]);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ title: "Login diperlukan", status: 401, code: "AUTHENTICATION_REQUIRED" });
    expect(response.headers.get("Content-Type")).toBe("application/problem+json");
    expect(response.headers.get("ETag")).toBe('"7"');
    expect(response.headers.get("X-Request-ID")).toBe("upstream-id");
    expect(response.headers.getSetCookie()).toEqual([
      "TBCALL_SESSION=opaque; Path=/; HttpOnly; SameSite=Strict; Expires=Wed, 21 Oct 2026 07:28:00 GMT",
      "XSRF-TOKEN=csrf; Path=/; SameSite=Strict",
    ]);
    expect(response.headers.get("X-Unapproved")).toBeNull();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("preserves independent cookie deletions and a bodyless 204", async () => {
    const response = await proxyRequest(new Request("http://frontend.test/api/tbcall/v1/auth/logout", { method: "DELETE" }), ["v1", "auth", "logout"]);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(response.headers.getSetCookie()).toEqual(["TBCALL_SESSION=; Path=/; Max-Age=0; HttpOnly", "XSRF-TOKEN=; Path=/; Max-Age=0"]);
  });
  it("does not follow upstream redirects or expose an unapproved Location", async () => {
    const response = await proxyRequest(new Request("http://frontend.test/api/tbcall/v1/redirect"), ["v1", "redirect"]);
    expect(response.status).toBe(302);
    expect(await response.text()).toBe("redirect fixture");
    expect(response.headers.get("Location")).toBeNull();
    expect(received).toHaveLength(1);
  });
  it.each([[], ["..", "secret"], ["v1", "%2e%2e"], ["v1", "%252e%252e"], ["https://unapproved.invalid"], ["v1", "%2fsecret"], ["v1", "\\secret"], ["v1", "%00"]].map(path => ({ path })))("rejects unsafe path $path before contacting the backend", async ({ path }) => {
    const response = await proxyRequest(new Request("http://frontend.test/api/tbcall/v1/me"), path);
    expect(response.status).toBe(400);
    expect(received).toHaveLength(0);
  });
  it.each([undefined, "file:///private", "http://user:secret@localhost:8080", "http://localhost:8080/another-root?token=private"])("fails safely for invalid server configuration %s", async (base) => {
    vi.stubEnv("TBCALL_BACKEND_URL", base);
    const response = await proxyRequest(new Request("http://frontend.test/api/tbcall/v1/me"), ["v1", "me"]);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
    expect(received).toHaveLength(0);
  });
  it("returns safe correlated problem+json for an unreachable backend without logging", async () => {
    vi.stubEnv("TBCALL_BACKEND_URL", "http://127.0.0.1:1");
    const log = vi.spyOn(console, "error");
    const response = await proxyRequest(new Request("http://frontend.test/api/tbcall/v1/me", { headers: { "X-Request-ID": "safe-request-id" } }), ["v1", "me"]);
    expect(response.status).toBe(503);
    expect(response.headers.get("Content-Type")).toBe("application/problem+json");
    expect(await response.json()).toMatchObject({ status: 503, code: "BACKEND_UNAVAILABLE", traceId: "safe-request-id" });
    expect(response.headers.get("X-Request-ID")).toBe("safe-request-id");
    expect(log).not.toHaveBeenCalled();
  });
});

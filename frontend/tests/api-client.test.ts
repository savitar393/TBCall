import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/api/client";
import { readXsrfToken } from "@/lib/api/csrf";
import { ApiError, problemMessage } from "@/lib/api/problem";

const transport = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal("fetch", transport);
  document.cookie = "XSRF-TOKEN=; Max-Age=0; Path=/";
  transport.mockReset();
});

describe("XSRF cookie selection", () => {
  it.each([
    ["", undefined], ["another=value", undefined], ["XSRF-TOKEN=", undefined],
    ["XSRF-TOKEN=a%2Fb%3D", "a/b="], ["other=one; XSRF-TOKEN=fresh; tail=last", "fresh"],
    ["TBCALL_SESSION=%E0%A4%A; XSRF-TOKEN=fresh", "fresh"],
    ["XSRF-TOKEN=%E0%A4%A", undefined],
  ])("reads only the exact CSRF cookie from %s", (cookie, expected) => {
    expect(readXsrfToken(cookie)).toBe(expected);
  });
});

describe("same-origin native API client", () => {
  it("GET bootstrap requires no CSRF and uses same-origin credentials, no cache, and a request UUID", async () => {
    transport.mockResolvedValueOnce(Response.json({ id: "fixture" }, { headers: { ETag: '"3"' } }));
    const response = await apiRequest<{ id: string }>("/v1/me");
    expect(response).toEqual({ data: { id: "fixture" }, etag: '"3"' });
    const [path, options] = transport.mock.calls[0];
    expect(path).toBe("/api/tbcall/v1/me");
    expect(options).toMatchObject({ method: "GET", credentials: "same-origin", cache: "no-store" });
    const headers = new Headers(options?.headers);
    expect(headers.has("X-XSRF-TOKEN")).toBe(false);
    expect(headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
  });
  it.each(["POST", "PATCH", "DELETE"] as const)("%s uses the fresh CSRF cookie, explicit ETag and JSON body", async (method) => {
    document.cookie = "XSRF-TOKEN=first; Path=/";
    transport.mockResolvedValueOnce(new Response(null, { status: 204 }));
    document.cookie = "XSRF-TOKEN=rotated%2Ftoken; Path=/";
    const response = await apiRequest("/v1/example", { method, etag: '"27"', body: { notes: "fixture" } });
    const options = transport.mock.calls[0][1];
    expect(new Headers(options?.headers).get("X-XSRF-TOKEN")).toBe("rotated/token");
    expect(new Headers(options?.headers).get("If-Match")).toBe('"27"');
    expect(new Headers(options?.headers).get("Content-Type")).toBe("application/json");
    expect(options?.body).toBe('{"notes":"fixture"}');
    expect(response.data).toBeUndefined();
  });
  it("does not invent an ETag when the server omits one", async () => {
    transport.mockResolvedValueOnce(Response.json({ version: 99 }));
    expect((await apiRequest("/v1/example")).etag).toBeUndefined();
  });
  it("parses problem+json with parameters and preserves correlation metadata", async () => {
    transport.mockResolvedValueOnce(Response.json({ type: "about:blank", title: "Login diperlukan", status: 401, code: "AUTHENTICATION_REQUIRED", detail: "Fixture", traceId: "problem-trace" }, { status: 401, headers: { "Content-Type": "application/problem+json;charset=UTF-8", "X-Request-ID": "header-trace" } }));
    const error = await apiRequest("/v1/me").catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: "authentication", requestId: "header-trace", problem: { code: "AUTHENTICATION_REQUIRED", detail: "Fixture" } });
  });
  it.each([
    [403, "ACCESS_DENIED", "forbidden"], [403, "CSRF_INVALID", "csrf"],
    [409, "OPTIMISTIC_LOCK_CONFLICT", "stale"], [409, "SOURCE_AUTHORITY_CONFLICT", "source-authority"],
    [428, "PRECONDITION_REQUIRED", "precondition"], [503, "BACKEND_UNAVAILABLE", "unavailable"],
  ])("classifies %s %s without parsing Indonesian prose", async (status, code, kind) => {
    transport.mockResolvedValueOnce(Response.json({ status, title: "arbitrary fixture", code }, { status, headers: { "Content-Type": "application/problem+json" } }));
    const error = await apiRequest("/v1/example").catch((error: unknown) => error);
    expect(error).toMatchObject({ kind });
    expect(problemMessage(error as ApiError).detail).not.toContain("arbitrary fixture");
  });
  it("does not send a mutation with a missing CSRF cookie", async () => {
    await expect(apiRequest("/v1/auth/logout", { method: "POST" })).rejects.toMatchObject({ kind: "csrf" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("never retries a mutation after CSRF_INVALID", async () => {
    document.cookie = "XSRF-TOKEN=fresh; Path=/";
    transport.mockResolvedValue(Response.json({ status: 403, code: "CSRF_INVALID", title: "Permintaan ditolak" }, { status: 403, headers: { "Content-Type": "application/problem+json" } }));
    await expect(apiRequest("/v1/auth/login", { method: "POST", body: { identity: "fixture", password: "fixture" } })).rejects.toMatchObject({ kind: "csrf" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([
    new Response("private HTML exception", { status: 500, headers: { "Content-Type": "text/html" } }),
    new Response("malformed private payload", { status: 502, headers: { "Content-Type": "application/problem+json" } }),
  ])("replaces unsafe or malformed server errors with a generic unavailable message", async (response) => {
    transport.mockResolvedValueOnce(response);
    const error = await apiRequest("/v1/me").catch((error: unknown) => error);
    expect(error).toMatchObject({ kind: "unavailable" });
    expect(JSON.stringify((error as ApiError).problem)).not.toContain("private");
  });
  it("hides transport exception details and keeps the generated request ID", async () => {
    transport.mockRejectedValueOnce(new Error("private host credential"));
    const error = await apiRequest("/v1/me").catch((error: unknown) => error);
    expect(error).toMatchObject({ kind: "unavailable" });
    expect((error as ApiError).requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect((error as ApiError).message).not.toContain("private");
  });
  it("rejects absolute and traversal client paths before fetch", async () => {
    for (const path of ["https://unapproved.invalid", "//unapproved.invalid", "/v1/../../private"]) {
      await expect(apiRequest(path)).rejects.toThrow();
    }
    expect(transport).not.toHaveBeenCalled();
  });
  it("does not convert explicit cancellation into a service outage", async () => {
    const controller = new AbortController(); controller.abort();
    transport.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));
    await expect(apiRequest("/v1/me", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});

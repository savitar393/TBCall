import { readXsrfToken } from "./csrf";
import { ApiError, type ApiProblem } from "./problem";

export type Versioned<T> = { data: T; etag?: string };
export type ApiOptions = { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; etag?: string; signal?: AbortSignal };

function fallbackProblem(status: number, traceId: string): ApiProblem {
  return { type: "about:blank", title: "Permintaan tidak dapat diproses", status, traceId };
}

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<Versioned<T>> {
  const checked = new URL(path, "https://fixed.invalid");
  if (!path.startsWith("/v1/") || checked.origin !== "https://fixed.invalid" || !checked.pathname.startsWith("/v1/"))
    throw new Error("Only same-origin TBCall API paths are supported");
  const method = options.method ?? "GET";
  const requestId = crypto.randomUUID();
  const headers = new Headers({ Accept: "application/json, application/problem+json", "X-Request-ID": requestId });
  if (method !== "GET") {
    const csrf = readXsrfToken();
    if (!csrf) throw new ApiError({ ...fallbackProblem(403, requestId), code: "CSRF_INVALID" }, requestId);
    headers.set("X-XSRF-TOKEN", csrf);
  }
  if (options.etag !== undefined) headers.set("If-Match", options.etag);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`/api/tbcall${path}`, {
      method, headers, credentials: "same-origin", cache: "no-store", signal: options.signal,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError({ ...fallbackProblem(0, requestId), code: "NETWORK_UNAVAILABLE" }, requestId);
  }
  if (!response.ok) {
    let problem = fallbackProblem(response.status, requestId);
    if (response.headers.get("Content-Type")?.toLowerCase().startsWith("application/problem+json")) {
      try {
        const data: unknown = await response.json();
        if (typeof data === "object" && data !== null && "title" in data && typeof data.title === "string") {
          const record = data as Record<string, unknown>;
          problem = {
            title: data.title, status: response.status,
            ...Object.fromEntries(["type", "detail", "code", "instance", "traceId"].filter((key) => typeof record[key] === "string").map((key) => [key, record[key]])),
          };
        }
      } catch { /* Raw or malformed response bodies are never surfaced/logged. */ }
    }
    throw new ApiError(problem, response.headers.get("X-Request-ID") ?? problem.traceId ?? requestId);
  }
  if (response.status === 204 || response.status === 205) return { data: undefined as T, etag: response.headers.get("ETag") ?? undefined };
  try { return { data: await response.json() as T, etag: response.headers.get("ETag") ?? undefined }; }
  catch { throw new ApiError({ ...fallbackProblem(502, requestId), code: "INVALID_RESPONSE" }, response.headers.get("X-Request-ID") ?? requestId); }
}

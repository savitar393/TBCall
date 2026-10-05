const requestHeaders = ["Cookie", "Content-Type", "Accept", "X-XSRF-TOKEN", "If-Match", "X-Request-ID"];
const responseHeaders = ["Content-Type", "ETag", "X-Request-ID"];
const methods = new Set(["GET", "POST", "PATCH", "DELETE"]);

function problem(status: number, code: string, traceId: string): Response {
  return Response.json({
    type: "about:blank", status, code, traceId,
    title: status === 503 ? "Layanan belum tersedia" : "Permintaan tidak valid",
    detail: status === 503 ? "Layanan tidak dapat dihubungi. Silakan coba kembali nanti." : "Alamat atau metode permintaan tidak didukung.",
  }, { status, headers: { "Content-Type": "application/problem+json", "X-Request-ID": traceId, "Cache-Control": "no-store" } });
}

function backendOrigin(): URL {
  const configured = process.env.TBCALL_BACKEND_URL;
  if (!configured) throw new Error("Backend not configured");
  const origin = new URL(configured);
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash)
    throw new Error("Invalid backend origin");
  return origin;
}

function normalizedPath(path: string[]): string | undefined {
  if (!path.length) return undefined;
  try {
    const segments = path.map((segment) => decodeURIComponent(segment));
    if (segments.some((segment) => !segment || segment === "." || segment === ".." || /[\\/%?#\u0000-\u001f\u007f]/.test(segment))) return undefined;
    return segments.map(encodeURIComponent).join("/");
  } catch { return undefined; }
}

/** The only target is server configuration; neither query nor headers can choose it. */
export async function proxyRequest(request: Request, path: string[]): Promise<Response> {
  const suppliedTrace = request.headers.get("X-Request-ID");
  const traceId = suppliedTrace && /^[A-Za-z0-9._-]{1,128}$/.test(suppliedTrace) ? suppliedTrace : crypto.randomUUID();
  if (!methods.has(request.method)) return problem(405, "METHOD_NOT_ALLOWED", traceId);
  const normalized = normalizedPath(path);
  if (!normalized) return problem(400, "INVALID_PROXY_PATH", traceId);
  try {
    const target = new URL(`/api/${normalized}`, backendOrigin());
    target.search = new URL(request.url).search;
    const headers = new Headers();
    for (const name of requestHeaders) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    headers.set("X-Request-ID", traceId);
    const upstream = await fetch(target, {
      method: request.method, headers, cache: "no-store", redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      ...(request.method === "GET" ? {} : { body: await request.arrayBuffer() }),
    });
    const outgoing = new Headers({ "Cache-Control": "no-store" });
    for (const name of responseHeaders) {
      const value = upstream.headers.get(name);
      if (value !== null) outgoing.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) outgoing.append("Set-Cookie", cookie);
    return new Response(upstream.body, { status: upstream.status, headers: outgoing });
  } catch {
    // Deliberately omit the exception: it can contain hosts, credentials or body text.
    return problem(503, "BACKEND_UNAVAILABLE", traceId);
  }
}

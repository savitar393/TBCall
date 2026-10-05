/** Select only the JS-readable CSRF cookie; opaque session cookies are not decoded. */
export function readXsrfToken(cookie: string = document.cookie): string | undefined {
  const entry = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("XSRF-TOKEN="));
  if (!entry) return undefined;
  try { return decodeURIComponent(entry.slice("XSRF-TOKEN=".length)) || undefined; }
  catch { return undefined; }
}

/** Permissions-Policy applies to a document, so capture needs the VOT document's scoped header. */
export function votDocumentNavigation(href: string, event: { preventDefault(): void }) {
  if (href === "/portal/vot") { event.preventDefault(); window.location.assign(new URL("/portal/vot", window.location.origin).href); }
}

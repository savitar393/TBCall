// This numeric-version contract belongs only to laboratory child commands.
export function labEtagFromVersion(version: number): string {
  if (!Number.isSafeInteger(version) || version < 0) throw new Error("Versi laboratorium tidak valid.");
  return `"${version}"`;
}

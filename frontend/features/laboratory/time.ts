export function browserTimezone(): string { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
export function localDateTimeToIso(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) throw new Error("Waktu lokal tidak valid.");
  const date = new Date(value);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(v => Number(v ?? 0));
  const millisecond = Number((match[7] ?? "").padEnd(3, "0"));
  const sameLocalTime = (candidate: Date) => candidate.getFullYear() === year && candidate.getMonth() + 1 === month && candidate.getDate() === day && candidate.getHours() === hour && candidate.getMinutes() === minute && candidate.getSeconds() === second && candidate.getMilliseconds() === millisecond;
  // Reject calendar normalization and nonexistent local times during DST changes.
  if (!Number.isFinite(date.getTime()) || !sameLocalTime(date)) throw new Error("Waktu lokal tidak valid.");
  // A datetime-local value cannot identify which occurrence of a repeated clock time was intended.
  for (const dayOffset of [-1, 1]) {
    const nearby = new Date(date.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const offsetChange = nearby.getTimezoneOffset() - date.getTimezoneOffset();
    if (offsetChange !== 0 && sameLocalTime(new Date(date.getTime() + offsetChange * 60 * 1000))) throw new Error("Waktu lokal ambigu saat pergantian zona waktu.");
  }
  return date.toISOString();
}
export function isoToLocalDateTime(value: string): string {
  const d = new Date(value); if (!Number.isFinite(d.getTime())) throw new Error("Waktu server tidak valid.");
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(d.getFullYear()).padStart(4, "0")}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

// Date-only clinical values retain their civil date; timestamps use the viewer's local zone.
export function civilDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match.map(Number), date = new Date(y, m - 1, d, 12);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}
export function dateKey(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = civilDate(value);
  return date ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(date) : "Tanggal tidak tersedia";
}
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Waktu tidak tersedia" : new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short" }).format(date);
}
export function shiftDate(key: string, days: number): string { const date = civilDate(key)!; date.setDate(date.getDate() + days); return dateKey(date); }
export function shiftMonth(key: string, months: number): string {
  const date = civilDate(key)!, day = date.getDate(); date.setDate(1); date.setMonth(date.getMonth() + months);
  date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate())); return dateKey(date);
}
export function weekDates(key: string): string[] { const date = civilDate(key)!; const monday = shiftDate(key, -(date.getDay() + 6) % 7); return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i)); }
export function monthDates(key: string): string[] { const first = key.slice(0, 8) + "01", start = weekDates(first)[0]; return Array.from({ length: 42 }, (_, i) => shiftDate(start, i)); }
export function displayTemporal(value: unknown): unknown { return typeof value === "string" && civilDate(value) ? formatDate(value) : typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? formatDateTime(value) : value; }

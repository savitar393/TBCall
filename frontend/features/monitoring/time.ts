export { browserTimezone, isoToLocalDateTime, localDateTimeToIso } from "@/features/treatment/time";
// Retain the server's sub-millisecond precision when comparing an untouched timestamp.
export function compareInstants(a: string, b: string): number {
  const nanos = (value: string) => {
    const milliseconds = new Date(value).getTime();
    if (!Number.isFinite(milliseconds)) throw new Error("Waktu tidak valid.");
    const fraction = /T\d{2}:\d{2}:\d{2}\.(\d+)/.exec(value)?.[1] ?? "";
    return BigInt(milliseconds) * 1000000n + BigInt(fraction.padEnd(9, "0").slice(3, 9) || "0");
  };
  const left = nanos(a);
  const right = nanos(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

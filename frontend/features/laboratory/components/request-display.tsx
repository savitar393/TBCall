import Link from "next/link";
import type { Completeness } from "../types";
export function Timestamp({ value }: { value: string | null }) { return value ? <time dateTime={value} title={value}>{new Date(value).toLocaleString()}</time> : <>—</>; }
export function CompletenessDisplay({ value }: { value: Completeness }) { return <div className="space-y-1 text-sm"><p>Hasil tersedia: {value.completedTests} dari {value.totalTests} pemeriksaan</p><p>Spesimen: {value.totalSpecimens} · Diterima: {value.receivedSpecimens} · Layak diperiksa: {value.usableSpecimens}</p>{value.needsNewSpecimen && <p>Backend menandai kebutuhan spesimen baru.</p>}</div>; }
export function QueueLink() { return <Link href="/laboratory" className="text-sm text-primary underline">Kembali ke antrean laboratorium</Link>; }

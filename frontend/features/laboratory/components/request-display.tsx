import { formatDateTime } from "@/lib/date-format";
import Link from "next/link";
import type { Completeness } from "../types";
export function Timestamp({ value }: { value: string | null }) { return value ? <time dateTime={value} title={value}>{formatDateTime(value)}</time> : <>—</>; }
export function labStatusTone(status: string): "neutral" | "active" | "warning" | "complete" { return status === "COMPLETED" ? "complete" : status === "PARTIAL" ? "warning" : ["REQUESTED", "SENT", "RECEIVED"].includes(status) ? "active" : "neutral"; }
export function CompletenessDisplay({ value }: { value: Completeness }) { return <div className="lab-progress text-sm"><p><span className="font-medium">Hasil tersedia: {value.completedTests} dari {value.totalTests} pemeriksaan</span></p><p>Spesimen: {value.totalSpecimens} · Diterima: {value.receivedSpecimens} · Layak diperiksa: {value.usableSpecimens}</p>{value.needsNewSpecimen && <p className="font-medium text-amber-800">Spesimen baru diperlukan sesuai catatan pemeriksaan.</p>}</div>; }
export function QueueLink() { return <Link href="/laboratory" className="text-sm text-primary underline">Kembali ke antrean laboratorium</Link>; }

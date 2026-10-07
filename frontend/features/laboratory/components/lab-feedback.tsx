import { ApiFeedback } from "@/components/api-feedback";
import type { ApiError } from "@/lib/api/problem";
import { labStateConflicts } from "../use-command";
export function LabFeedback({ error }: { error: ApiError | null }) { return error && labStateConflicts.has(error.problem.code ?? "") ? <div role="alert" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><p className="font-semibold">Status laboratorium telah berubah</p><p>Tinjau permintaan terbaru dan garis hasil yang tersedia sebelum mengirim kembali.</p></div> : <ApiFeedback error={error} />; }

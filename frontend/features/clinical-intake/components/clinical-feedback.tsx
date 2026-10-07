import { ApiFeedback } from "@/components/api-feedback";
import type { ApiError } from "@/lib/api/problem";
export function ClinicalFeedback({ error }: { error: ApiError | null }) {
  if (error?.problem.code === "CLINICAL_STATE_CONFLICT") return <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><p className="font-semibold">Status data telah berubah</p><p>Muat ulang dan tinjau keadaan terbaru. Perubahan belum disimpan; tidak ada pengiriman ulang otomatis.</p>{error.requestId && <p>ID permintaan: {error.requestId}</p>}</div>;
  return <ApiFeedback error={error} />;
}

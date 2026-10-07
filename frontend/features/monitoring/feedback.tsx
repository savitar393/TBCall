import { ApiFeedback } from "@/components/api-feedback";
import type { ApiError } from "@/lib/api/problem";
export function MonitoringFeedback({
  error
}: {
  error: ApiError | null;
}) {
  return error?.problem.code === "MONITORING_STATE_CONFLICT" ? <div role="alert">
  <p>Status pemantauan telah berubah.</p>
  <p>Tinjau data terbaru sebelum mengirim tindakan kembali.</p>
</div> : <ApiFeedback error={error} />;
}

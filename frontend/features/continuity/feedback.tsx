import { ApiFeedback } from "@/components/api-feedback";
import type { ApiError } from "@/lib/api/problem";
import { continuityProblemMessage } from "./errors";
export function ContinuityFeedback({ error }: { error: ApiError | null }) {
  const message = error && continuityProblemMessage(error);
  return message ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
    <p className="font-semibold">{message.title}</p><p>{message.detail}</p>
    {error.requestId && <p className="break-all">ID permintaan: {error.requestId}</p>}
  </div> : <ApiFeedback error={error} />;
}

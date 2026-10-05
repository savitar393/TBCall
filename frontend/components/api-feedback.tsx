import { AlertCircle } from "lucide-react";
import { problemMessage, type ApiError } from "@/lib/api/problem";

export function ApiFeedback({ error }: { error: ApiError | null }) {
  if (!error) return null;
  const message = problemMessage(error);
  return <div role="alert" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
    <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
    <div><p className="font-semibold">{message.title}</p><p className="mt-1 leading-relaxed">{message.detail}</p>
      {error.requestId && <p className="mt-2 break-all text-xs">ID permintaan: {error.requestId}</p>}
    </div>
  </div>;
}

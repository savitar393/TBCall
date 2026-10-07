"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { QueryState } from "@/features/continuity/display";
import { CheckField } from "@/features/continuity/fields";
import { Confirmation } from "@/features/continuity/confirmation";
import { monitoringQueries as q } from "../queries";
import { monitoringApi, targetPath } from "../api";
import { canMonitoring } from "../permissions";
import { MonitoringFeedback } from "../feedback";
import { MonitoringForm } from "../form";
import { useMonitoringCommand } from "../use-command";
import { confirmationSchema } from "../monitoring/forms";
import { AlertFields } from "./display";
export function AlertDetail({
  id
}: {
  id: string;
}) {
  const {
    user
  } = useSession();
  const query = useQuery(q.alert(user!.id, id));
  const refs = useQuery(q.references(user!.id));
  const command = useMonitoringCommand("alerts");
  const [confirm, setConfirm] = useState(false);
  const [tag, setTag] = useState<string | undefined>();
  if (!query.data) return <QueryState query={query} />;
  const a = query.data.data;
  const ready = !!query.data.etag && !query.isFetching && !query.isError && !command.pending && !command.reviewRequired && !command.locked;
  return <>
  <h1 className="text-2xl font-semibold">Detail peringatan</h1>
  <AlertFields alert={a} references={refs.data?.data} />
  {canMonitoring(user, a.targetType === "TPT" ? "TPT_READ" : "TREATMENT_READ") && <Link className="text-primary underline" href={targetPath(a.targetType, a.targetId)}>Buka target</Link>}
  <Button variant="outline" disabled={query.isFetching || command.pending} onClick={() => {
      void query.refetch();
      if (refs.isError) void refs.refetch();
    }}>Muat ulang detail peringatan</Button>
  {query.isError && <QueryState query={query} />}
  {refs.isError && <QueryState query={refs} />}
  <MonitoringFeedback error={command.error} />
  {command.reviewRequired && <Button disabled={query.isFetching || query.isError} onClick={command.reviewed}>Saya sudah meninjau data terbaru</Button>}
  <div className="flex flex-wrap gap-3">
    {a.status === "OPEN" && canMonitoring(user, "ALERT_ACKNOWLEDGE") && <Button disabled={!ready || confirm} onClick={() => void command.run(signal => monitoringApi.alertAction(id, "acknowledge", query.data?.etag, signal))}>Akui peringatan</Button>}
    {["OPEN", "ACKNOWLEDGED"].includes(a.status) && canMonitoring(user, "ALERT_RESOLVE") && <Button disabled={!ready || confirm} onClick={() => {
        if (a.status === "OPEN") {
          setTag(query.data?.etag);
          setConfirm(true);
        } else void command.run(signal => monitoringApi.alertAction(id, "resolve", query.data?.etag, signal));
      }}>Selesaikan peringatan</Button>}
  </div>
  {confirm && <Confirmation title="Selesaikan peringatan terbuka" onClose={() => setConfirm(false)}>
    <MonitoringForm scope="alerts" initial={{
        confirmed: false
      }} schema={confirmationSchema} available={ready && ["OPEN", "ACKNOWLEDGED"].includes(a.status) && canMonitoring(user, "ALERT_RESOLVE") && !!tag} onReview={() => setTag(query.data?.etag)} submitLabel="Konfirmasi penyelesaian peringatan" onClose={() => setConfirm(false)} onSuccess={() => setConfirm(false)} save={(_, __, signal) => monitoringApi.alertAction(id, "resolve", tag, signal)}>
      <p>Peringatan ini belum diakui. Konfirmasikan penyelesaiannya.</p>
      <CheckField name="confirmed" label="Saya mengonfirmasi penyelesaian peringatan" />
    </MonitoringForm>
  </Confirmation>}
</>;
}

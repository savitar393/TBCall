"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { z } from "@/lib/validation";
import { useSession } from "@/lib/auth/session";
import { continuityQueries as q } from "../queries";
import { continuityApi } from "../api";
import { canContinuity, sendKind } from "../permissions";
import { QueryState, label } from "../display";
import { ContinuityForm } from "../form";
import { Field } from "../fields";
import { FacilitySearch } from "../facilities";
import type { Preparation } from "../types";

// Keep the initial intent and draft during conflict refetches; changed preparation disables sending.
function SendForm({ id, preparation: p, available, labels }: {
  id: string; preparation: Preparation; available: boolean;
  labels?: { code: string; name: string }[];
}) {
  const { user } = useSession(), router = useRouter();
  const [intent] = useState(() => ({ kind: sendKind(p), preparation: p }));
  const [saved, setSaved] = useState(false);
  const initial = useMemo(() => ({ destinationFacilityId: "", notes: "" }), []);
  const kind = intent.kind;
  if (!kind) return <p role="status">Status saat ini belum mendukung rujukan baru, atau ada rujukan yang masih berjalan.</p>;
  const unchanged = kind === sendKind(p) &&
    (kind === "PRE_TREATMENT_REFERRAL"
      ? p.preTreatmentDestination?.id === intent.preparation.preTreatmentDestination?.id
      : p.openTreatment?.id === intent.preparation.openTreatment?.id) &&
    p.sourceFacility.id === intent.preparation.sourceFacility.id;
  const schema = z.object({ destinationFacilityId: z.string(), notes: z.string() }).refine(
    v => kind !== "TREATMENT_TRANSFER" || z.uuid().safeParse(v.destinationFacilityId).success,
    { path: ["destinationFacilityId"], message: "Pilih fasilitas tujuan." });
  return <>{saved && <p role="status">Rujukan tersimpan.</p>}
    <ContinuityForm initial={initial} schema={schema}
      available={available && unchanged && !saved} submitLabel="Kirim rujukan" context={{ caseId: id }}
      onClose={() => router.back()}
      onSuccess={(r: Awaited<ReturnType<typeof continuityApi.send>>) => {
        if (canContinuity(user, "REFERRAL_READ")) router.push(`/referrals/${r.data.id}`);
        else setSaved(true);
      }}
      save={(v, _, signal) => continuityApi.send(id, {
        referralType: kind,
        destinationFacilityId: kind === "PRE_TREATMENT_REFERRAL"
          ? intent.preparation.preTreatmentDestination!.id : v.destinationFacilityId,
        ...(kind === "TREATMENT_TRANSFER" ? { treatmentId: intent.preparation.openTreatment!.id } : {}),
        ...(v.notes.trim() ? { notes: v.notes.trim() } : {}),
      }, signal)}>
      <h2>{label(labels, kind)}</h2>
      {kind === "PRE_TREATMENT_REFERRAL"
        ? <p>Tujuan sesuai diagnosis konfirmasi: {intent.preparation.preTreatmentDestination!.name}. Tujuan ini tetap.</p>
        : <><p>Episode pengobatan aktif: {intent.preparation.openTreatment!.id}</p><FacilitySearch exclude={p.sourceFacility.id} /></>}
      <Field name="notes" label="Catatan rujukan" multiline />
      {!unchanged && <p role="status">Persiapan telah berubah. Isian dipertahankan untuk ditinjau; buka kembali halaman ini untuk memulai persiapan baru.</p>}
    </ContinuityForm></>;
}

export function ReferralCreate({ id }: { id: string }) {
  const { user } = useSession();
  const query = useQuery(q.preparation(user!.id, id));
  const references = useQuery({ ...q.referralReferences(user!.id), enabled: canContinuity(user, "REFERRAL_READ") });
  const p = query.data?.data;
  if (!p) return <QueryState query={query} />;
  return <><h1 className="text-2xl font-semibold">Buat rujukan</h1>
    <p>{p.sourceFacility.name} · {p.caseStatus}</p>{query.isError && <QueryState query={query} />}
    <p>Persiapan bersifat sementara; server akan memeriksa kembali status saat pengiriman.</p>
    <SendForm id={id} preparation={p} labels={references.data?.data.referralTypes}
      available={!query.isFetching && !query.isError && canContinuity(user, "REFERRAL_WRITE")} />
  </>;
}

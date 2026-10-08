"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/session";
import { ApiFeedback } from "@/components/api-feedback";
import { Button } from "@/components/ui/button";
import { administrationApi, facilityEtag } from "../api";
import { administrationQueries } from "../queries";
import { useAdministrationReferences } from "../references";
import { useAdministrationCommand } from "../use-command";
import { QueryState, Refresh, Fields } from "../display";
import type { ApiError } from "@/lib/api/problem";
import { ConfirmAction } from "../confirm";
import { FacilityForm } from "./form";
export function FacilityDetail({ facilityId }: {
    facilityId: string;
}) {
    const { user } = useSession(), read = useQuery(administrationQueries.facility(user!, facilityId)), refs = useAdministrationReferences(), command = useAdministrationCommand();
    const [needsReview, setNeedsReview] = useState(false), [revision, setRevision] = useState(0);
    async function onError(error: ApiError) {
        if ([409, 428].includes(error.problem.status)) {
            setNeedsReview(true);
            await read.refetch();
        }
    }
    const blocked = needsReview || read.isFetching || !!read.error || !read.data?.etag;
    return <>
    <h1 className="text-2xl font-semibold">Detail fasyankes</h1>
    <Refresh busy={read.isFetching || command.pending} onClick={() => { setNeedsReview(true); void read.refetch(); }}/>
    <QueryState pending={read.isPending || refs.isPending} error={read.error ?? refs.error}/>
    <ApiFeedback error={command.error}/>{read.data && !read.data.etag && <p role="alert">Detail fasyankes belum siap untuk perubahan. Muat ulang sebelum melanjutkan.</p>}{needsReview && <div role="status">
        <p>Draft dipertahankan. Tinjau data terbaru sebelum mengirim kembali.</p>
        <Button disabled={read.isFetching || !!read.error || !read.data?.etag} onClick={() => { setRevision(v => v < 0 ? v - 1 : -1); setNeedsReview(false); }}>Saya sudah meninjau data terbaru</Button>
        </div>}{read.data && refs.data && <>
        <p>Status: {read.data.data.active ? "Aktif" : "Tidak aktif"}</p>{needsReview && <section>
            <h2 className="font-semibold">Data server terbaru</h2>
            <Fields values={{ Nama: read.data.data.name, Alamat: read.data.data.address, Jenis: read.data.data.facilityTypeCode, Induk: read.data.data.parentFacilityId, Provinsi: read.data.data.provinceCode, "Kabupaten/kota": read.data.data.regencyCode, Kecamatan: read.data.data.districtCode, "Desa/kelurahan": read.data.data.villageCode, "Kode pos": read.data.data.postalCode, Lintang: read.data.data.latitude, Bujur: read.data.data.longitude }}/>
            </section>}<FacilityForm facility={read.data.data} references={refs.data.data} pending={command.pending} blocked={blocked} revision={revision} onSubmit={body => void command.run(signal => administrationApi.patch(facilityId, body, facilityEtag(read.data?.etag), signal), { onError, onSuccess: async (_result, current) => {
                    await read.refetch();
                    if (current())
                        setRevision(v => Math.abs(v) + 1);
                } })}/>{read.data.data.active && <ConfirmAction label="Nonaktifkan fasyankes" description="Menonaktifkan fasyankes tidak menghapus data. Tindakan akan ditolak bila masih ada penugasan pengguna aktif." disabled={blocked || command.pending} onConfirm={() => void command.run(signal => administrationApi.deactivate(facilityId, facilityEtag(read.data?.etag), signal), { onError, onSuccess: async (_result, current) => {
                        await read.refetch();
                        if (current())
                            setRevision(v => Math.abs(v) + 1);
                    } })}/>}</>}</>;
}

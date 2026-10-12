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
import Link from "next/link";
import { AppDisclosure, AppPageHeader, AppSection, AppStatusBadge } from "@/components/application-patterns";
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
    const facilityTypeLabel = refs.data?.data.facilityTypes.find(type => type.code === read.data?.data.facilityTypeCode)?.name ?? read.data?.data.facilityTypeCode ?? "Jenis belum ditetapkan";
    return <div className="clinical-workspace">
    <AppPageHeader title="Detail fasyankes" eyebrow="Administrasi" actions={<><Link href="/admin/facilities" className="text-primary underline">Daftar fasyankes</Link><Refresh busy={read.isFetching || command.pending} onClick={() => { setNeedsReview(true); void read.refetch(); }}/></>}/>
    <QueryState pending={read.isPending || refs.isPending} error={read.error ?? refs.error}/>
    <ApiFeedback error={command.error}/>{read.data && !read.data.etag && <p role="alert">Detail fasyankes belum siap untuk perubahan. Muat ulang sebelum melanjutkan.</p>}{needsReview && <div role="status">
        <p>Draft dipertahankan. Tinjau data terbaru sebelum mengirim kembali.</p>
        <Button disabled={read.isFetching || !!read.error || !read.data?.etag} onClick={() => { setRevision(v => v < 0 ? v - 1 : -1); setNeedsReview(false); }}>Saya sudah meninjau data terbaru</Button>
        </div>}{read.data && refs.data && <>
        <section className="clinical-context" aria-label="Konteks fasyankes"><div className="clinical-context-heading"><h2>{read.data.data.name}</h2><AppStatusBadge tone={read.data.data.active ? "active" : "neutral"}>Status: {read.data.data.active ? "Aktif" : "Tidak aktif"}</AppStatusBadge></div><p className="text-sm">{facilityTypeLabel}</p></section>{needsReview && <AppSection title="Data server terbaru">
            <Fields values={{ Nama: read.data.data.name, Alamat: read.data.data.address, Jenis: read.data.data.facilityTypeCode, Induk: read.data.data.parentFacilityId, Provinsi: read.data.data.provinceCode, "Kabupaten/kota": read.data.data.regencyCode, Kecamatan: read.data.data.districtCode, "Desa/kelurahan": read.data.data.villageCode, "Kode pos": read.data.data.postalCode, Lintang: read.data.data.latitude, Bujur: read.data.data.longitude }}/>
            </AppSection>}<AppSection title="Data fasyankes"><FacilityForm facility={read.data.data} references={refs.data.data} pending={command.pending} blocked={blocked} revision={revision} onSubmit={body => void command.run(signal => administrationApi.patch(facilityId, body, facilityEtag(read.data?.etag), signal), { onError, onSuccess: async (_result, current) => {
                    await read.refetch();
                    if (current())
                        setRevision(v => Math.abs(v) + 1);
                } })}/><AppDisclosure title="Metadata fasyankes"><Fields values={{ "ID fasyankes": read.data.data.id, Versi: read.data.data.version }}/></AppDisclosure></AppSection>{read.data.data.active && <AppSection title="Status fasyankes"><ConfirmAction label="Nonaktifkan fasyankes" description="Menonaktifkan fasyankes tidak menghapus data. Tindakan akan ditolak bila masih ada penugasan pengguna aktif." disabled={blocked || command.pending} onConfirm={() => void command.run(signal => administrationApi.deactivate(facilityId, facilityEtag(read.data?.etag), signal), { onError, onSuccess: async (_result, current) => {
                        await read.refetch();
                        if (current())
                            setRevision(v => Math.abs(v) + 1);
                    } })}/></AppSection>}</>}</div>;
}

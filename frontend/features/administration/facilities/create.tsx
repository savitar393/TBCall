"use client";
import { useRouter } from "next/navigation";
import { ApiFeedback } from "@/components/api-feedback";
import { administrationApi } from "../api";
import { useAdministrationCommand } from "../use-command";
import { useAdministrationReferences } from "../references";
import { QueryState } from "../display";
import { FacilityForm } from "./form";
import Link from "next/link";
import { AppPageHeader, AppSection } from "@/components/application-patterns";
export function FacilityCreate() {
    const refs = useAdministrationReferences(), command = useAdministrationCommand(), router = useRouter();
    return <div className="clinical-workspace">
    <AppPageHeader title="Tambah fasyankes" eyebrow="Administrasi" actions={<Link href="/admin/facilities" className="text-primary underline">Daftar fasyankes</Link>}/>
    <QueryState pending={refs.isPending} error={refs.error}/>
    <ApiFeedback error={command.error}/>{refs.data && <AppSection title="Data fasyankes"><FacilityForm references={refs.data.data} pending={command.pending} onSubmit={body => void command.run(signal => administrationApi.create(body, signal), { onSuccess: result => router.push(`/admin/facilities/${result.data.id}`) })}/></AppSection>}</div>;
}

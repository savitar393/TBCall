"use client";
import { useRouter } from "next/navigation";
import { ApiFeedback } from "@/components/api-feedback";
import { administrationApi } from "../api";
import { useAdministrationCommand } from "../use-command";
import { useAdministrationReferences } from "../references";
import { QueryState } from "../display";
import { FacilityForm } from "./form";
export function FacilityCreate() {
    const refs = useAdministrationReferences(), command = useAdministrationCommand(), router = useRouter();
    return <>
    <h1 className="text-2xl font-semibold">Tambah fasyankes</h1>
    <QueryState pending={refs.isPending} error={refs.error}/>
    <ApiFeedback error={command.error}/>{refs.data && <FacilityForm references={refs.data.data} pending={command.pending} onSubmit={body => void command.run(signal => administrationApi.create(body, signal), { onSuccess: result => router.push(`/admin/facilities/${result.data.id}`) })}/>}</>;
}

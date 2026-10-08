"use client";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Facility, FacilityInput, References } from "../types";
import { FacilitySearch } from "./parent-picker";
const optional = (max: number) => z.string().max(max, "Isian terlalu panjang.");
function coordinate(limit: number) { return z.string().refine(v => !v.trim() || /^-?\d+(\.\d{1,6})?$/.test(v.trim()) && Math.abs(Number(v)) <= limit, "Periksa rentang dan maksimal enam angka desimal."); }
export const facilityFormSchema = z.object({ name: z.string().trim().min(1, "Nama wajib diisi.").max(255), facilityTypeCode: optional(50), parentFacilityId: z.union([z.literal(""), z.uuid()]), address: z.string(), provinceCode: optional(20), regencyCode: optional(20), districtCode: optional(20), villageCode: optional(20), postalCode: optional(10), latitude: coordinate(90), longitude: coordinate(180) }).strict();
type Draft = z.infer<typeof facilityFormSchema>;
const labels = { name: "Nama fasyankes", address: "Alamat", provinceCode: "Kode provinsi", regencyCode: "Kode kabupaten/kota", districtCode: "Kode kecamatan", villageCode: "Kode desa/kelurahan", postalCode: "Kode pos", latitude: "Lintang", longitude: "Bujur" } as const;
function defaults(facility?: Facility): Draft { return { name: facility?.name ?? "", facilityTypeCode: facility?.facilityTypeCode ?? "", parentFacilityId: facility?.parentFacilityId ?? "", address: facility?.address ?? "", provinceCode: facility?.provinceCode ?? "", regencyCode: facility?.regencyCode ?? "", districtCode: facility?.districtCode ?? "", villageCode: facility?.villageCode ?? "", postalCode: facility?.postalCode ?? "", latitude: facility?.latitude?.toString() ?? "", longitude: facility?.longitude?.toString() ?? "" }; }
export function FacilityForm({ facility, references, pending, blocked, revision, onSubmit }: {
    facility?: Facility;
    references: References;
    pending: boolean;
    blocked?: boolean;
    revision?: number;
    onSubmit: (body: FacilityInput) => void;
}) {
    const form = useForm<Draft>({ resolver: zodResolver(facilityFormSchema), defaultValues: defaults(facility) });
    // Only an explicit review or a completed save resets the baseline; a conflict GET keeps the draft.
    useEffect(() => {
        if (revision)
            form.reset(defaults(facility), revision < 0 ? { keepDirtyValues: true } : undefined);
    }, [revision, facility, form]);
    const inactive = facility?.facilityTypeCode && !references.facilityTypes.some(t => t.code === facility.facilityTypeCode);
    const parent = useWatch({ control: form.control, name: "parentFacilityId" });
    return <form className="space-y-5" onSubmit={form.handleSubmit(values => {
            const body: FacilityInput = {};
            for (const key of Object.keys(values) as (keyof Draft)[]) {
                if (facility && !form.formState.dirtyFields[key])
                    continue;
                const v = values[key].trim();
                if (key === "name")
                    body.name = v;
                else if (key === "latitude" || key === "longitude")
                    body[key] = v ? Number(v) : null;
                else
                    body[key] = v || null;
            }
            if (body.facilityTypeCode && !references.facilityTypes.some(t => t.code === body.facilityTypeCode) && body.facilityTypeCode !== facility?.facilityTypeCode) {
                form.setError("facilityTypeCode", { message: "Pilih jenis aktif dari referensi." });
                return;
            }
            onSubmit(body);
        })}>
        <fieldset disabled={pending} className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">{Object.entries(labels).map(([key, label]) => <label key={key}>{label}<Input {...form.register(key as keyof typeof labels)}/>{form.formState.errors[key as keyof Draft] && <span role="alert" className="text-sm text-destructive">{form.formState.errors[key as keyof Draft]?.message}</span>}</label>)}<label>Jenis fasyankes<select className="block w-full rounded border p-2" {...form.register("facilityTypeCode")}>
    <option value="">Tidak ditetapkan</option>{inactive && <option value={facility!.facilityTypeCode!}>{facility!.facilityTypeCode} (kode saat ini)</option>}{references.facilityTypes.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}</select>{form.formState.errors.facilityTypeCode && <span role="alert">{form.formState.errors.facilityTypeCode.message}</span>}</label>
    </div>
    <p>Induk saat ini/pilihan: <span className="break-all">{parent || "Tidak ditetapkan"}</span>
    </p>
    <FacilitySearch label="Induk fasyankes" exclude={facility?.id} disabled={pending} onSelect={id => form.setValue("parentFacilityId", id, { shouldDirty: true })}/>
    <Button type="button" variant="outline" onClick={() => form.setValue("parentFacilityId", "", { shouldDirty: true })}>Kosongkan induk</Button>
    <Button className="block" disabled={blocked || pending || (!!facility && !form.formState.isDirty)}>{facility ? "Simpan perubahan" : "Buat fasyankes"}</Button>
    </fieldset>
    </form>;
}

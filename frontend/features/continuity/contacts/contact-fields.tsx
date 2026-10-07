"use client";
import { useFormContext,useWatch } from "react-hook-form";
import { Field,CheckField } from "../fields";
import { FacilitySearch } from "../facilities";
export function ContactFields({sex,workflows,create=false,exclude}:{sex?:{code:string;name:string|null}[];workflows?:{code:string;name:string}[];create?:boolean;exclude?:string}){
 const {control}=useFormContext(),workflow=useWatch({control,name:"workflowType"});
 return <><div className="grid gap-4 sm:grid-cols-2"><Field name="fullName" label="Nama kontak" required/><Field name="birthDate" label="Tanggal lahir kontak" type="date"/>{sex&&<Field name="sexCode" label="Jenis kelamin kontak" options={sex.map(s=>({code:s.code,name:s.name??s.code}))}/>}<Field name="phone" label={create?"Telepon kontak":"Telepon baru"}/>{!create&&<CheckField name="clearPhone" label="Hapus telepon tersimpan"/>}<Field name="address" label="Alamat kontak" multiline/><Field name="relationshipToIndexCase" label="Hubungan dengan kasus indeks"/><Field name="householdContact" label="Kontak serumah" options={[{code:"true",name:"Ya"},{code:"false",name:"Tidak"}]}/></div>{!sex&&<p className="text-sm">Pilihan jenis kelamin bersifat opsional dan belum tersedia.</p>}{create&&<><Field name="workflowType" label="Alur investigasi" required options={workflows?.filter(w=>["INTERNAL","OUTGOING_REFERRAL"].includes(w.code))??[]}/>{workflow==="OUTGOING_REFERRAL"&&<FacilitySearch exclude={exclude}/>}<Field name="notes" label="Catatan permintaan investigasi" multiline/></>}</>;
}

import { render,screen,waitFor,within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect,it,vi } from "vitest";
import { Pagination,label } from "@/features/continuity/display";
import { ContinuityForm } from "@/features/continuity/form";
import { Field,CheckField } from "@/features/continuity/fields";
import { z } from "@/lib/validation";
import { formatDate,formatDateTime } from "@/lib/date-format";
import { ids } from "./clinical-fixtures";
import { renderClinical } from "./clinical-harness";
import * as f from "./continuity-fixtures";
import { continuityBackend,renderContinuity,routing } from "./continuity-harness";

vi.mock("next/navigation",()=>({useRouter:()=>routing,usePathname:()=>"/referrals"}));

it.each(["referrals","investigations","contacts"] as const)("%s uses a clinical record list and hides a single-page paginator",async name=>{
 const record=name==="referrals"?f.referral:name==="investigations"?f.investigation:f.contact;
 continuityBackend(c=>c.options.method==="GET"&&(c.url.includes("/incoming?")||c.url.includes("/outgoing?")||c.url.includes("/cases/")&&c.url.includes("/contacts?"))?Response.json({content:[record],page:0,size:20,totalElements:1}):undefined);
 const {container}=await renderContinuity(name,ids.tbCase);
 const title=name==="referrals"?"Daftar rujukan":name==="investigations"?"Daftar investigasi rujukan":"Daftar kontak";
 const section=await screen.findByRole("region",{name:title});
 await within(section).findByText(name==="referrals"?f.referral.patient.fullName:f.contact.fullName);
 expect(container.querySelector(".clinical-workspace")).toBeInTheDocument();
 expect(within(section).getByRole("list")).toHaveClass("clinical-record-list");
 expect(screen.queryByRole("navigation",{name:"Halaman daftar"})).not.toBeInTheDocument();
 expect(within(section).getByText(new RegExp(formatDateTime(name==="referrals"?f.referral.sentAt:f.investigation.requestedAt).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")))).toBeInTheDocument();
});

it.each([0,1,20])("paginator is omitted on page zero with %s records",total=>{
 render(<Pagination page={0} total={total} setPage={vi.fn()}/>);
 expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
});

it("paginator retains backwards navigation when totals shrink on a later page",async()=>{
 const change=vi.fn();render(<Pagination page={1} total={0} setPage={change}/>);
 await userEvent.click(screen.getByRole("button",{name:"Sebelumnya"}));
 expect(change).toHaveBeenCalledWith(0);
 expect(screen.getByRole("button",{name:"Berikutnya"})).toBeDisabled();
});

it("contact editor focuses its heading and restores the opener after closing",async()=>{
 const calls=continuityBackend();await renderContinuity("contact",f.contact.id);
 const opener=await screen.findByRole("button",{name:"Ubah kontak"});await userEvent.click(opener);
 await waitFor(()=>expect(screen.getByRole("heading",{name:"Ubah kontak"})).toHaveFocus());
 expect(screen.getByRole("group",{name:"Identitas dan hubungan kontak"})).toBeInTheDocument();
 expect(screen.getByLabelText("Telepon baru")).toHaveValue("");
 await userEvent.click(screen.getByRole("button",{name:"Tutup formulir"}));
 await waitFor(()=>expect(opener).toHaveFocus());
 expect(calls.filter(c=>c.options.method!=="GET")).toHaveLength(0);
});

it("referral confirmation focuses its title and restores the initiating action",async()=>{
 const calls=continuityBackend();await renderContinuity("referral",f.referral.id);
 expect(await screen.findByRole("region",{name:"Konteks rujukan"})).toHaveTextContent(f.referral.patient.fullName);
 expect(screen.getByRole("region",{name:"Perjalanan rujukan"})).toHaveTextContent(f.referral.notes!);
 const opener=await screen.findByRole("button",{name:"Batalkan rujukan"});await userEvent.click(opener);
 await waitFor(()=>expect(within(screen.getByRole("dialog")).getByRole("heading",{name:"Batalkan rujukan"})).toHaveFocus());
 await userEvent.click(screen.getByRole("button",{name:"Tutup formulir"}));
 await waitFor(()=>expect(opener).toHaveFocus());
 expect(calls.filter(c=>c.options.method!=="GET")).toHaveLength(0);
});

it("investigation keeps recorded clinical findings visible and administrative identifiers in a disclosure",async()=>{
 const dto={...f.investigation,status:"COMPLETED",resultCode:"RECORDED",activeTbExcluded:false,tptEligible:false};
 continuityBackend(c=>c.options.method==="GET"&&c.url.endsWith(dto.id)?Response.json(dto,{headers:{ETag:'"recorded"'}}):undefined);
 await renderContinuity("investigation",dto.id);await screen.findByRole("heading",{name:"Detail investigasi kontak"});
 const evidence=screen.getByRole("region",{name:"Hasil dan penilaian investigasi"});
 expect(evidence).toHaveTextContent("RECORDED");expect(evidence).toHaveTextContent(dto.notes!);
 expect(within(evidence).getAllByText("Tidak")).toHaveLength(2);
 expect(evidence.querySelector("details")).toBeNull();
 const disclosure=screen.getByText("Identitas rekam kasus indeks").closest("details");
 expect(disclosure).not.toHaveAttribute("open");expect(disclosure).toHaveTextContent(dto.indexCase.id);
 expect(screen.queryByRole("button",{name:"Mulai TPT"})).not.toBeInTheDocument();
});

it("TPT retains explicit regimen evidence and only exposes monitoring with its permission",async()=>{
 continuityBackend(undefined,{...f.continuityOfficer,permissions:[...f.continuityOfficer.permissions,"MONITORING_READ"]});
 await renderContinuity("tpt",f.tpt.id);await screen.findByRole("heading",{name:"Detail TPT"});
 const context=screen.getByRole("region",{name:"Konteks TPT"});
 expect(context).toHaveTextContent(formatDate(f.tpt.startDate));
 expect(within(context).getByRole("link",{name:"Pemantauan"})).toHaveAttribute("href",`/preventive-treatments/${f.tpt.id}/monitoring`);
 const regimen=screen.getByRole("region",{name:"Paduan dan rencana TPT"});
 expect(regimen).toHaveTextContent(f.tpt.regimenDescription!);expect(regimen).toHaveTextContent(f.tpt.notes!);
 expect(regimen.querySelector("details")).toBeNull();
});

it("TPT start focuses its heading after reference data renders and keeps clinical fields empty",async()=>{
 const dto={...f.investigation,status:"COMPLETED",activeTbExcluded:true,tptEligible:true};
 const calls=continuityBackend(c=>c.options.method==="GET"&&c.url.endsWith(dto.id)?Response.json(dto):undefined);
 await renderContinuity("investigation",dto.id);const opener=await screen.findByRole("button",{name:"Mulai TPT"});await userEvent.click(opener);
 await waitFor(()=>expect(screen.getByRole("heading",{name:"Mulai TPT eksplisit"})).toHaveFocus());
 expect(screen.getByLabelText("Paduan preventif katalog")).toHaveValue("");
 expect(screen.getByLabelText("Tanggal akhir rencana TPT")).toHaveValue("");
 expect(screen.getByLabelText("Durasi TPT")).toHaveValue("");
 await userEvent.click(screen.getByRole("button",{name:"Tutup formulir"}));
 await waitFor(()=>expect(opener).toHaveFocus());
 expect(calls.filter(c=>c.options.method!=="GET")).toHaveLength(0);
});

it("catalog labels stay authoritative and known codes have natural Indonesian fallbacks",()=>{
 expect(label([{code:"COMPLETED",name:"Nama dari katalog"}],"COMPLETED")).toBe("Nama dari katalog");
 expect(label(undefined,"TB_RO")).toBe("TBC resistan obat");
 expect(label(undefined,"LOST_TO_FOLLOW_UP")).toBe("Putus tindak lanjut");
 expect(label(undefined,"UNKNOWN_CODE")).toBe("UNKNOWN_CODE");
});

it("form announces field errors once while retaining checkbox, hidden, array, and root errors",async()=>{
 continuityBackend();const save=vi.fn();
 const schema=z.object({name:z.string().min(1,"Nama wajib diisi"),confirmed:z.boolean().refine(v=>v,"Konfirmasi diperlukan"),hidden:z.string().min(1,"Validasi isian tersembunyi"),items:z.array(z.string()).min(1,"Validasi daftar")}).superRefine((_,ctx)=>ctx.addIssue({code:"custom",path:["root","general"],message:"Validasi formulir"}));
 renderClinical(<ContinuityForm initial={{name:"",confirmed:false,hidden:"",items:[] as string[]}} schema={schema} title="Tinjau formulir" available submitLabel="Kirim formulir contoh" save={save} onClose={vi.fn()}><Field name="name" label="Nama"/><CheckField name="confirmed" label="Konfirmasi"/></ContinuityForm>);
 await userEvent.click(screen.getByRole("button",{name:"Kirim formulir contoh"}));
 for(const message of ["Nama wajib diisi","Konfirmasi diperlukan","Validasi isian tersembunyi","Validasi daftar","Validasi formulir"]){await screen.findByText(message);expect(screen.getAllByText(message)).toHaveLength(1);}
 expect(save).not.toHaveBeenCalled();
});

it("directory validation appears once beside the facility selector",async()=>{
 const calls=continuityBackend();await renderContinuity("contacts",ids.tbCase);
 await userEvent.click(await screen.findByRole("button",{name:"Tambah kontak"}));
 await userEvent.type(screen.getByLabelText(/Nama kontak/),"Kontak baru");
 await userEvent.selectOptions(screen.getByLabelText(/Alur investigasi/),"OUTGOING_REFERRAL");
 await userEvent.click(screen.getByRole("button",{name:"Simpan kontak"}));
 expect(await screen.findByText("Pilih fasilitas tujuan.")).toBeInTheDocument();
 expect(screen.getAllByText("Pilih fasilitas tujuan.")).toHaveLength(1);
 expect(calls.filter(c=>c.options.method!=="GET")).toHaveLength(0);
});

import {screen,waitFor,within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {useQueryClient,type QueryClient} from "@tanstack/react-query";
import {expect,it,vi} from "vitest";
import * as f from "./continuity-fixtures";
import {ids} from "./clinical-fixtures";
import {continuityBackend,renderContinuity,routing,failure} from "./continuity-harness";
vi.mock("next/navigation",()=>({useRouter:()=>routing,usePathname:()=>"/referrals"}));
const destActor={...f.continuityOfficer,activeFacilities:[f.destination]};
const getTag=(options:RequestInit)=>new Headers(options.headers).get("If-Match");
it.each(["referrals","investigations"] as const)("%s queue uses live labels and memory-only pagination/tabs",async name=>{
 const calls=continuityBackend();await renderContinuity(name,"");
 await screen.findByText(name==="referrals"?/Label PRE_TREATMENT_REFERRAL/:/Label INTERNAL/);
 await userEvent.click(within(screen.getByRole("group",{name:name==="referrals"?"Arah rujukan":"Arah investigasi"})).getByRole("button",{name:"Keluar"}));await waitFor(()=>expect(calls.some(c=>c.url.includes("/outgoing?page=0"))).toBe(true));
 await userEvent.click(screen.getByRole("button",{name:"Berikutnya"}));await waitFor(()=>expect(calls.some(c=>c.url.includes("/outgoing?page=1"))).toBe(true));
 expect(calls.filter(c=>c.url.includes("/patients"))).toHaveLength(0);
});
it.each(["PLANNED","PAUSED"] as const)("%s preparation offers no transfer send button",async status=>{
 continuityBackend(c=>c.url.endsWith("/referral-preparation")?Response.json({...f.preparation,caseStatus:"ACTIVE",preTreatmentDestination:null,openTreatment:{id:f.continuityIds.treatment,status,startDate:"2026-09-01",plannedEndDate:null,regimenCode:null,regimenName:null}}):undefined);
 await renderContinuity("send",ids.tbCase);await screen.findByText(/Status saat ini belum mendukung/);expect(screen.queryByRole("button",{name:"Kirim rujukan"})).not.toBeInTheDocument();
});
it("ACTIVE transfer uses exact episode and explicit destination from debounced directory",async()=>{
 const calls=continuityBackend(c=>c.url.endsWith("/referral-preparation")?Response.json({...f.preparation,caseStatus:"ACTIVE",preTreatmentDestination:null,openTreatment:{id:f.continuityIds.treatment,status:"ACTIVE",startDate:"2026-09-01",plannedEndDate:null,regimenCode:null,regimenName:null}}):undefined);
 await renderContinuity("send",ids.tbCase);const field=await screen.findByLabelText("Cari fasilitas tujuan");
 await userEvent.type(field,"T");expect(calls.some(c=>c.url.includes("/continuity-facilities"))).toBe(false);
 await userEvent.type(field,"u");await userEvent.click(await screen.findByRole("button",{name:"Pilih Tujuan"}));
 expect(screen.queryByRole("button",{name:`Pilih ${f.preparation.sourceFacility.name}`})).not.toBeInTheDocument();
 await userEvent.click(screen.getByRole("button",{name:"Kirim rujukan"}));
 await waitFor(()=>expect(calls.find(c=>c.options.method==="POST")?.body).toEqual({referralType:"TREATMENT_TRANSFER",destinationFacilityId:f.destination.id,treatmentId:f.continuityIds.treatment}));expect(getTag(calls.find(c=>c.options.method==="POST")!.options)).toBeNull();
});
it.each(["receive","return","cancel","report"] as const)("referral %s submits actual GET ETag and only transition fields",async action=>{
 const dto={...f.referral,status:action==="return"||action==="report"?"RECEIVED":"SENT"};
 const actor=action==="cancel"?f.continuityOfficer:destActor;
 const calls=continuityBackend(c=>c.options.method==="GET"&&c.url.endsWith(f.referral.id)?Response.json(dto,{headers:{ETag:'"actual-referral"'}}):undefined,actor);
 let client!:QueryClient;function Probe(){client=useQueryClient();return null;}
 await renderContinuity("referral",f.referral.id,<Probe/>);
 client.setQueryData(["clinical",actor.id,"case",ids.tbCase],"authoritative-original");client.setQueryData(["treatment",actor.id,"detail",f.continuityIds.treatment],"episode-original");
 const buttons={receive:"Terima rujukan",return:"Kembalikan rujukan",cancel:"Batalkan rujukan",report:"Laporkan pasien datang"};
 const opener=await screen.findByRole("button",{name:buttons[action]});await userEvent.click(opener);
 if(action==="return"||action==="cancel")await userEvent.type(screen.getByLabelText(action==="return"?/Alasan pengembalian/:/Alasan pembatalan/),"Reason");
 if(action==="cancel"||action==="report"){
  await userEvent.click(screen.getByRole("button",{name:"Simpan tindakan rujukan"}));expect(calls.filter(c=>c.options.method==="POST")).toHaveLength(0);
  await userEvent.click(screen.getByLabelText(action==="cancel"?"Saya mengonfirmasi pembatalan rujukan":"Saya mengonfirmasi pemindahan kepemilikan klinis"));
 }
 await userEvent.click(screen.getByRole("button",{name:"Simpan tindakan rujukan"}));
 await waitFor(()=>expect(calls.find(c=>c.url.endsWith(`/${action}`))?.body).toEqual(action==="return"?{returnReason:"Reason"}:action==="cancel"?{cancelReason:"Reason"}:{}));
 expect(getTag(calls.find(c=>c.url.endsWith(`/${action}`))!.options)).toBe('"actual-referral"');
 await screen.findByText("Tindakan tersimpan.");
 if(action==="report"){
  expect(client.getQueryState(["clinical",actor.id,"case",ids.tbCase])?.isInvalidated).toBe(true);
  expect(client.getQueryState(["treatment",actor.id,"detail",f.continuityIds.treatment])?.isInvalidated).toBe(true);
  expect(client.getQueryData(["clinical",actor.id,"case",ids.tbCase])).toBe("authoritative-original");
 }
 await waitFor(()=>expect(opener).toHaveFocus());
});
it.each(["referral","contact","investigation","tpt"] as const)("%s writes are disabled without real detail ETag",async name=>{
 continuityBackend(c=>c.options.method==="GET"&&c.url.endsWith(f[name].id)?Response.json(f[name]):undefined);
 await renderContinuity(name,f[name].id);await screen.findByRole("heading",{level:1});
 const names={referral:"Batalkan rujukan",contact:"Ubah kontak",investigation:"Selesaikan investigasi",tpt:"Ubah TPT"};await waitFor(()=>expect(screen.getByRole("button",{name:names[name]})).toBeDisabled());
});
it.each(["INTERNAL","OUTGOING_REFERRAL"])("%s contact creation uses live workflow and no ETag",async workflow=>{
 const actor={...f.continuityOfficer,permissions:f.continuityOfficer.permissions.filter(p=>p!=="PATIENT_READ")};const calls=continuityBackend(undefined,actor);
 await renderContinuity("contacts",ids.tbCase);await userEvent.click(await screen.findByRole("button",{name:"Tambah kontak"}));
 expect(screen.queryByLabelText(/Jenis kelamin kontak/)).not.toBeInTheDocument();expect(calls.some(c=>c.url.includes("clinical-reference-data"))).toBe(false);
 await userEvent.type(screen.getByLabelText(/Nama kontak/),"Explicit contact");await userEvent.selectOptions(screen.getByLabelText(/Alur investigasi/),workflow);
 if(workflow==="OUTGOING_REFERRAL"){await userEvent.type(screen.getByLabelText("Cari fasilitas tujuan"),"Tu");await userEvent.click(await screen.findByRole("button",{name:"Pilih Tujuan"}));}
 await userEvent.click(screen.getByRole("button",{name:"Simpan kontak"}));
 await waitFor(()=>expect(calls.find(c=>c.options.method==="POST")).toBeDefined());const command=calls.find(c=>c.options.method==="POST")!;
 expect(command.body).toEqual({fullName:"Explicit contact",birthDate:null,sexCode:null,phone:null,address:null,relationshipToIndexCase:null,householdContact:null,workflowType:workflow,...(workflow==="OUTGOING_REFERRAL"?{destinationFacilityId:f.destination.id}:{})});expect(getTag(command.options)).toBeNull();
});
it("contact edit submits only dirty demographic fields with GET ETag",async()=>{
 const calls=continuityBackend();await renderContinuity("contact",f.contact.id);await userEvent.click(await screen.findByRole("button",{name:"Ubah kontak"}));
 const name=screen.getByLabelText(/Nama kontak/);await userEvent.clear(name);await userEvent.type(name,"Revised");
 await userEvent.click(screen.getByRole("button",{name:"Simpan perubahan kontak"}));await waitFor(()=>expect(calls.find(c=>c.options.method==="PATCH")?.body).toEqual({fullName:"Revised"}));expect(getTag(calls.find(c=>c.options.method==="PATCH")!.options)).toBe('"actual-contact"');
});
it.each(["WNI","WNA"])("%s exact resolve/link retains original confirmation and clears masked dialog",async citizenship=>{
 const exact=citizenship==="WNI"?"1234567890123456":"Passport original";
 const calls=continuityBackend(c=>c.url.endsWith("/patients/resolve")?Response.json({patientId:ids.patient,fullName:"Resolved masked display",citizenship,nik:citizenship==="WNI"?"***3456":null,otherIdentityNumber:citizenship==="WNA"?"***inal":null,bpjsNumber:"***5678",birthDate:"1990-01-01",birthDateUnknown:false,sex:null}):undefined);
 await renderContinuity("contact",f.contact.id);await userEvent.click(await screen.findByRole("button",{name:"Tautkan pasien persis"}));
 await userEvent.selectOptions(screen.getByLabelText(/Kewarganegaraan/),citizenship);await userEvent.type(screen.getByLabelText(citizenship==="WNI"?/NIK persis/:/Nomor identitas asing persis/),exact);await userEvent.type(screen.getByLabelText("Konfirmasi nama lengkap"),"Original name");await userEvent.type(screen.getByLabelText("BPJS persis (opsional)"),"12345678");
 expect(screen.queryByLabelText(/UUID/)).not.toBeInTheDocument();await userEvent.click(screen.getByRole("button",{name:"Cari pasien persis"}));await screen.findByText(/Resolved masked display/);expect(screen.queryByDisplayValue(exact)).not.toBeInTheDocument();
 await userEvent.click(screen.getByLabelText("Saya mengonfirmasi pasien ini untuk ditautkan"));await userEvent.click(screen.getByRole("button",{name:"Tautkan pasien"}));
 await waitFor(()=>expect(calls.find(c=>c.url.endsWith("/link-patient"))?.body).toEqual({patientId:ids.patient,citizenship,...(citizenship==="WNI"?{nik:exact}:{otherIdentityNumber:exact}),fullName:"Original name",bpjsNumber:"12345678"}));
 expect(getTag(calls.find(c=>c.url.endsWith("/link-patient"))!.options)).toBe('"actual-contact"');
 await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
 expect(calls.filter(c=>c.url.includes("/patients")&&!c.url.endsWith("/resolve"))).toHaveLength(0);
});
it.each(["CONTACT_WRITE","PATIENT_IDENTITY_RESOLVE"])("without %s no exact-link helper or UUID fallback",async p=>{
 const calls=continuityBackend(undefined,{...f.continuityOfficer,permissions:f.continuityOfficer.permissions.filter(v=>v!==p)});await renderContinuity("contact",f.contact.id);await screen.findByText(f.contact.fullName);
 expect(screen.queryByRole("button",{name:"Tautkan pasien persis"})).not.toBeInTheDocument();expect(calls.some(c=>c.url.includes("/patients"))).toBe(false);
});
it("cancel and reopen exact-link form removes sensitive draft",async()=>{
 continuityBackend();await renderContinuity("contact",f.contact.id);await userEvent.click(await screen.findByRole("button",{name:"Tautkan pasien persis"}));await userEvent.type(screen.getByLabelText(/NIK persis/),"1234567890123456");await userEvent.click(screen.getByRole("button",{name:"Batal tautkan"}));await userEvent.click(screen.getByRole("button",{name:"Tautkan pasien persis"}));expect(screen.getByLabelText(/NIK persis/)).toHaveValue("");
});
it.each(["receive","start","return","cancel"] as const)("investigation %s uses recorded side/state and real ETag",async action=>{
 const dto={...f.investigation,workflowType:"OUTGOING_REFERRAL",status:action==="receive"||action==="cancel"?"SENT":"RECEIVED",destinationFacility:f.destination};
 const calls=continuityBackend(c=>c.options.method==="GET"&&c.url.endsWith(f.investigation.id)?Response.json(dto,{headers:{ETag:'"actual-investigation"'}}):undefined,action==="cancel"?f.continuityOfficer:destActor);
 await renderContinuity("investigation",f.investigation.id);const titles={receive:"Terima investigasi",start:"Mulai investigasi",return:"Kembalikan investigasi",cancel:"Batalkan investigasi"};await userEvent.click(await screen.findByRole("button",{name:titles[action]}));
 if(action==="return")await userEvent.type(screen.getByLabelText(/Alasan pengembalian/),"Return reason");
 if(action==="cancel"||action==="start")await userEvent.click(screen.getByLabelText(action==="cancel"?"Saya mengonfirmasi pembatalan investigasi":"Saya mengonfirmasi mulai investigasi"));
 await userEvent.click(screen.getByRole("button",{name:"Simpan tindakan investigasi"}));await waitFor(()=>expect(calls.find(c=>c.url.endsWith(`/${action}`))?.body).toEqual(action==="return"?{returnReason:"Return reason"}:{}));expect(getTag(calls.find(c=>c.url.endsWith(`/${action}`))!.options)).toBe('"actual-investigation"');
});
it.each(["TB_SO","TB_RO"])("%s TPT start filters live catalog and makes no automatic selection",async categoryCode=>{
 const dto={...f.investigation,status:"COMPLETED",activeTbExcluded:true,tptEligible:true,indexCase:{...f.investigation.indexCase,categoryCode}};
 const calls=continuityBackend(c=>c.options.method==="GET"&&c.url.endsWith(f.investigation.id)?Response.json(dto):undefined);
 await renderContinuity("investigation",f.investigation.id);await userEvent.click(await screen.findByRole("button",{name:"Mulai TPT"}));
 const catalog=await screen.findByLabelText("Paduan preventif katalog");expect(catalog).toHaveValue("");expect(within(catalog).getAllByRole("option")).toHaveLength(2);expect(within(catalog).queryByText(categoryCode==="TB_SO"?"Paduan preventif RO":"Paduan preventif SO")).not.toBeInTheDocument();
 expect(screen.getByLabelText("Durasi TPT")).toHaveValue("");expect(screen.getByLabelText("Tanggal akhir rencana TPT")).toHaveValue("");
 await userEvent.type(screen.getByLabelText(/Tanggal mulai TPT/),"2026-09-01");await userEvent.type(screen.getByLabelText("Deskripsi paduan individual"),"Clinician explicit decision");await userEvent.click(screen.getByRole("button",{name:"Simpan TPT baru"}));
 await waitFor(()=>expect(calls.find(c=>c.options.method==="POST")?.body).toEqual({startDate:"2026-09-01",regimenDescription:"Clinician explicit decision"}));expect(getTag(calls.find(c=>c.options.method==="POST")!.options)).toBeNull();
});
it("TPT edit uses dirty-only mutable fields and prevents clearing sole regimen",async()=>{
 const calls=continuityBackend();await renderContinuity("tpt",f.tpt.id);await userEvent.click(await screen.findByRole("button",{name:"Ubah TPT"}));
 await userEvent.clear(screen.getByLabelText("Deskripsi paduan individual"));await userEvent.click(screen.getByRole("button",{name:"Simpan perubahan TPT"}));expect(calls.filter(c=>c.options.method==="PATCH")).toHaveLength(0);
 await userEvent.type(screen.getByLabelText("Deskripsi paduan individual"),"Revised explicit regimen");await userEvent.clear(screen.getByLabelText("Catatan TPT"));await userEvent.click(screen.getByRole("button",{name:"Simpan perubahan TPT"}));
 await waitFor(()=>expect(calls.find(c=>c.options.method==="PATCH")?.body).toEqual({regimenDescription:"Revised explicit regimen",notes:null}));expect(getTag(calls.find(c=>c.options.method==="PATCH")!.options)).toBe('"actual-tpt"');
});
it.each(["complete","stop","lost-to-follow-up"] as const)("TPT %s closes only after confirmation without outcome inference",async action=>{
 const calls=continuityBackend();await renderContinuity("tpt",f.tpt.id);const titles={complete:"Selesaikan TPT",stop:"Hentikan TPT","lost-to-follow-up":"Catat putus tindak lanjut TPT"};await userEvent.click(await screen.findByRole("button",{name:titles[action]}));
 await userEvent.click(screen.getByRole("button",{name:"Konfirmasi penutupan TPT"}));expect(calls.filter(c=>c.options.method==="POST")).toHaveLength(0);
 await userEvent.click(screen.getByLabelText("Saya mengonfirmasi penutupan episode TPT"));
 if(action==="stop"){await userEvent.click(screen.getByRole("button",{name:"Konfirmasi penutupan TPT"}));expect(calls.filter(c=>c.options.method==="POST")).toHaveLength(0);await userEvent.type(screen.getByLabelText(/Alasan penutupan/),"Clinician reason");}
 await userEvent.click(screen.getByRole("button",{name:"Konfirmasi penutupan TPT"}));await waitFor(()=>expect(calls.find(c=>c.url.endsWith(`/${action}`))?.body).toEqual(action==="stop"?{closureReason:"Clinician reason"}:{}));expect(getTag(calls.find(c=>c.url.endsWith(`/${action}`))!.options)).toBe('"actual-tpt"');
});
it.each(["COMPLETED","STOPPED","LOST_TO_FOLLOW_UP","CANCELLED"])("terminal %s TPT exposes no edits or closure",async status=>{
 continuityBackend(c=>c.options.method==="GET"&&c.url.endsWith(f.tpt.id)?Response.json({...f.tpt,status}):undefined);await renderContinuity("tpt",f.tpt.id);await screen.findByText(`Label ${status}`);expect(screen.queryByRole("button",{name:"Ubah TPT"})).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"Hentikan TPT"})).not.toBeInTheDocument();
});
it.each(["contact","tpt"] as const)("%s conflict preserves dirty draft and requires manual review, with no replay",async name=>{
 const calls=continuityBackend(c=>c.options.method==="PATCH"?failure(409,"OPTIMISTIC_LOCK_CONFLICT"):undefined);
 await renderContinuity(name,f[name].id);await userEvent.click(await screen.findByRole("button",{name:name==="contact"?"Ubah kontak":"Ubah TPT"}));const field=screen.getByLabelText(name==="contact"?"Alamat kontak":"Catatan TPT");await userEvent.clear(field);await userEvent.type(field,"Preserved draft");const save=name==="contact"?"Simpan perubahan kontak":"Simpan perubahan TPT";await userEvent.click(screen.getByRole("button",{name:save}));await screen.findByText("Data telah berubah");
 expect(field).toHaveValue("Preserved draft");expect(screen.getByRole("button",{name:save})).toBeDisabled();expect(calls.filter(c=>c.options.method==="PATCH")).toHaveLength(1);await userEvent.click(screen.getByRole("button",{name:"Saya sudah meninjau data terbaru"}));expect(screen.getByRole("button",{name:save})).toBeEnabled();
});
it.each(["contact","tpt"] as const)("%s SOURCE_AUTHORITY_CONFLICT locks relevant mounted form but preserves reading",async name=>{
 const calls=continuityBackend(c=>c.options.method==="PATCH"?failure(409,"SOURCE_AUTHORITY_CONFLICT"):undefined);await renderContinuity(name,f[name].id);await userEvent.click(await screen.findByRole("button",{name:name==="contact"?"Ubah kontak":"Ubah TPT"}));await userEvent.type(screen.getByLabelText(name==="contact"?"Alamat kontak":"Catatan TPT"),"Private draft");const save=name==="contact"?"Simpan perubahan kontak":"Simpan perubahan TPT";await userEvent.click(screen.getByRole("button",{name:save}));await screen.findByText("Data dikendalikan sumber eksternal");expect(screen.getByRole("button",{name:save})).toBeDisabled();expect(calls.filter(c=>c.options.method==="PATCH")).toHaveLength(1);expect(screen.queryByText("never display clinical prose")).not.toBeInTheDocument();expect(screen.getByRole("button",{name:"Tutup formulir"})).toBeEnabled();
});
it.each(["referral","contact","tpt"] as const)("%s reader does not gain independent write actions",async name=>{
 continuityBackend(undefined,{...f.continuityOfficer,permissions:[name==="referral"?"REFERRAL_READ":name==="contact"?"CONTACT_READ":"TPT_READ"]});await renderContinuity(name,f[name].id);await screen.findByRole("heading",{level:1});
 for(const label of ["Batalkan rujukan","Ubah kontak","Tautkan pasien persis","Ubah TPT","Hentikan TPT"])expect(screen.queryByRole("button",{name:label})).not.toBeInTheDocument();
});
it("contact history requires TPT_READ and internal investigation stays contextual",async()=>{
 const calls=continuityBackend(undefined,{...f.continuityOfficer,permissions:["CONTACT_READ"]});await renderContinuity("contact",f.contact.id);await screen.findByText(f.contact.fullName);expect(screen.getByRole("link",{name:"Buka investigasi"})).toHaveAttribute("href",`/contact-investigations/${f.investigation.id}`);expect(calls.some(c=>c.url.includes("/tpt"))).toBe(false);expect(screen.queryByRole("link",{name:"Buka TPT"})).not.toBeInTheDocument();
});
it("referral send-only actor receives success without read-route navigation",async()=>{
 const calls=continuityBackend(undefined,{...f.continuityOfficer,permissions:["REFERRAL_WRITE"]});routing.push.mockClear();await renderContinuity("send",ids.tbCase);await userEvent.click(await screen.findByRole("button",{name:"Kirim rujukan"}));await screen.findByText("Rujukan tersimpan.");expect(routing.push).not.toHaveBeenCalled();expect(calls.some(c=>c.url.includes("/referral-reference-data"))).toBe(false);
});
it("TPT write-only actor may start without TPT history/read navigation",async()=>{
 const actor={...f.continuityOfficer,permissions:["CONTACT_READ","TPT_WRITE"]};const calls=continuityBackend(c=>c.url.endsWith(f.investigation.id)?Response.json({...f.investigation,status:"COMPLETED",activeTbExcluded:true,tptEligible:true}):undefined,actor);routing.push.mockClear();await renderContinuity("investigation",f.investigation.id);await userEvent.click(await screen.findByRole("button",{name:"Mulai TPT"}));await userEvent.type(await screen.findByLabelText(/Tanggal mulai TPT/),"2026-09-01");await userEvent.type(screen.getByLabelText("Deskripsi paduan individual"),"Explicit regimen");await userEvent.click(screen.getByRole("button",{name:"Simpan TPT baru"}));await screen.findByText(/TPT tersimpan. Izin membaca/);expect(routing.push).not.toHaveBeenCalled();expect(calls.filter(c=>c.options.method==="POST")).toHaveLength(1);
});

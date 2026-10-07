import {act,screen,waitFor,fireEvent} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {QueryClient,useQueryClient} from "@tanstack/react-query";
import {expect,it,vi} from "vitest";
import {useSession} from "@/lib/auth/session";
import {continuityQueries as q} from "@/features/continuity/queries";
import * as f from "./continuity-fixtures";
import {ids} from "./clinical-fixtures";
import {continuityBackend,renderContinuity,routing,failure} from "./continuity-harness";
vi.mock("next/navigation",()=>({useRouter:()=>routing,usePathname:()=>"/referrals"}));
const options={preparation:q.preparation(f.continuityOfficer.id,ids.tbCase),facilities:q.facilities(f.continuityOfficer.id,"Tu",0),referralReferences:q.referralReferences(f.continuityOfficer.id),contactReferences:q.contactReferences(f.continuityOfficer.id),tptReferences:q.tptReferences(f.continuityOfficer.id),referrals:q.referrals(f.continuityOfficer.id,"incoming",0),referral:q.referral(f.continuityOfficer.id,f.referral.id),contacts:q.contacts(f.continuityOfficer.id,ids.tbCase,0),contact:q.contact(f.continuityOfficer.id,f.contact.id),investigations:q.investigations(f.continuityOfficer.id,"outgoing",0),investigation:q.investigation(f.continuityOfficer.id,f.investigation.id),history:q.history(f.continuityOfficer.id,f.contact.id,0),tpt:q.tpt(f.continuityOfficer.id,f.tpt.id),caseContext:q.caseContext(f.continuityOfficer.id,ids.tbCase),clinicalReferences:q.clinicalReferences(f.continuityOfficer.id)};
it.each(Object.entries(options))("%s query scopes user and passes TanStack AbortSignal",async(_,o)=>{
 const calls=continuityBackend(),client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 expect(o.queryKey.slice(0,2)).toEqual(["continuity",f.continuityOfficer.id]);
 await client.fetchQuery(o as ReturnType<typeof q.preparation>);
 expect(calls[0].options.signal).toBeInstanceOf(AbortSignal);client.clear();
});
it.each(["referral","contact","tpt"] as const)("late prior-account %s GET cannot populate the new screen/cache",async name=>{
 let changed=false,resolve!:(r:Response)=>void,signal:AbortSignal|undefined,client!:QueryClient;
 const row=f[name],newRow=name==="referral"?{...f.referral,patient:{...f.referral.patient,fullName:"New account display"}}:name==="contact"?{...f.contact,fullName:"New account display"}:{...f.tpt,regimenDescription:"New account display"};
 continuityBackend(c=>c.url.endsWith("/me")?Response.json(changed?{...f.continuityOfficer,id:"new-account"}:f.continuityOfficer):c.url.endsWith(row.id)?changed?Response.json(newRow,{headers:{ETag:'"new"'}}):(signal=c.options.signal as AbortSignal,new Promise<Response>(r=>{resolve=r;})):undefined);
 function Switch(){const session=useSession();client=useQueryClient();return <button onClick={()=>{changed=true;void session.refresh();}}>Ganti akun</button>;}
 await renderContinuity(name,row.id,<Switch/>);await waitFor(()=>expect(resolve).toBeDefined());
 await userEvent.click(screen.getByText("Ganti akun"));await screen.findByText("New account display");expect(signal?.aborted).toBe(true);
 await act(async()=>{resolve(Response.json(row));await Promise.resolve();});
 expect(screen.getByText("New account display")).toBeInTheDocument();
 expect(client.getQueryCache().findAll({queryKey:["continuity",f.continuityOfficer.id]})).toHaveLength(0);
});
const families=["referral","contact","tpt"] as const;
it.each(families.flatMap(name=>[false,true].map(fails=>({name,fails}))))("late $name command error=$fails cannot invalidate or navigate",async({name,fails})=>{
 let changed=false,resolve!:(r:Response)=>void,signal:AbortSignal|undefined,client!:QueryClient;
 const row=f[name];const calls=continuityBackend(c=>c.url.endsWith("/me")?Response.json(changed?{...f.continuityOfficer,id:"new-account"}:f.continuityOfficer):["PATCH","POST"].includes(c.options.method!)?(signal=c.options.signal as AbortSignal,new Promise<Response>(r=>{resolve=r;})):undefined);
 function Switch(){const session=useSession();client=useQueryClient();return <button onClick={()=>{changed=true;void session.refresh().then(()=>client.setQueryData(["continuity","new-account","sentinel"],"safe-new-data"));}}>Ganti akun</button>;}
 await renderContinuity(name,row.id,<Switch/>);
 const open=name==="referral"?"Batalkan rujukan":name==="contact"?"Ubah kontak":"Ubah TPT";
 await userEvent.click(await screen.findByRole("button",{name:open}));
 if(name==="referral"){
  await userEvent.type(screen.getByLabelText(/Alasan pembatalan/),"Old private draft");
  await userEvent.click(screen.getByLabelText("Saya mengonfirmasi pembatalan rujukan"));
 }else await userEvent.type(screen.getByLabelText(name==="contact"?"Alamat kontak":"Catatan TPT"),"Old private draft");
 const submit=name==="referral"?"Simpan tindakan rujukan":name==="contact"?"Simpan perubahan kontak":"Simpan perubahan TPT";
 await userEvent.click(screen.getByRole("button",{name:submit}));await waitFor(()=>expect(resolve).toBeDefined());
 fireEvent.click(screen.getByText("Ganti akun"));await waitFor(()=>expect(signal?.aborted).toBe(true));await screen.findByRole("button",{name:open});
 const count=calls.length;routing.push.mockClear();routing.replace.mockClear();
 await act(async()=>{resolve(fails?failure(401,"AUTHENTICATION_REQUIRED"):Response.json(row));await Promise.resolve();});
 expect(calls).toHaveLength(count);expect(client.getQueryData(["continuity","new-account","sentinel"])).toBe("safe-new-data");
 expect(client.getMutationCache().getAll()).toHaveLength(0);expect(routing.push).not.toHaveBeenCalled();expect(routing.replace).not.toHaveBeenCalled();
 expect(screen.queryByText("never display clinical prose")).not.toBeInTheDocument();
});
it("same-account permission refresh aborts a pending edit and removes its draft",async()=>{
 let changed=false,resolve!:(r:Response)=>void,signal:AbortSignal|undefined;
 continuityBackend(c=>c.url.endsWith("/me")?Response.json(changed?{...f.continuityOfficer,permissions:["CONTACT_READ"]}:f.continuityOfficer):c.options.method==="PATCH"?(signal=c.options.signal as AbortSignal,new Promise<Response>(r=>{resolve=r;})):undefined);
 function Refresh(){const s=useSession();return <button onClick={()=>{changed=true;void s.refresh();}}>Actualiser</button>;}
 await renderContinuity("contact",f.contact.id,<Refresh/>);await userEvent.click(await screen.findByRole("button",{name:"Ubah kontak"}));await userEvent.type(screen.getByLabelText("Alamat kontak"),"Secret draft");await userEvent.click(screen.getByRole("button",{name:"Simpan perubahan kontak"}));await waitFor(()=>expect(resolve).toBeDefined());
 await userEvent.click(screen.getByText("Actualiser"));await waitFor(()=>expect(signal?.aborted).toBe(true));expect(screen.queryByLabelText("Alamat kontak")).not.toBeInTheDocument();
 await act(async()=>{resolve(Response.json(f.contact));await Promise.resolve();});expect(screen.queryByText("Perubahan kontak tersimpan.")).not.toBeInTheDocument();
});
it("continuity drafts/errors never enter storage, logs, history, metadata, chrome or mutation cache",async()=>{
 const storage=vi.spyOn(Storage.prototype,"setItem"),indexed=vi.fn();vi.stubGlobal("indexedDB",{open:indexed});
 const logs=[vi.spyOn(console,"log"),vi.spyOn(console,"info"),vi.spyOn(console,"warn"),vi.spyOn(console,"error")],push=vi.spyOn(history,"pushState"),replace=vi.spyOn(history,"replaceState"),title=document.title;let client!:QueryClient;
 function Probe(){client=useQueryClient();return null;}
 continuityBackend(c=>c.options.method==="PATCH"?failure(409,"SOURCE_AUTHORITY_CONFLICT"):undefined);
 await renderContinuity("tpt",f.tpt.id,<Probe/>);await userEvent.click(await screen.findByRole("button",{name:"Ubah TPT"}));await userEvent.type(screen.getByLabelText("Catatan TPT"),"Sensitive text");await userEvent.click(screen.getByRole("button",{name:"Simpan perubahan TPT"}));await screen.findByText("Data dikendalikan sumber eksternal");
 expect(storage).not.toHaveBeenCalled();expect(indexed).not.toHaveBeenCalled();expect(push).not.toHaveBeenCalled();expect(replace).not.toHaveBeenCalled();for(const log of logs)expect(log).not.toHaveBeenCalled();expect(document.title).toBe(title);expect(client.getMutationCache().getAll()).toHaveLength(0);expect(screen.getByRole("navigation")).not.toHaveTextContent(f.tpt.regimenDescription!);
});
it.each(["referral","tpt"] as const)("$name creation late after account change cannot navigate",async name=>{
 let changed=false,resolve!:(r:Response)=>void,signal:AbortSignal|undefined;
 const calls=continuityBackend(c=>c.url.endsWith("/me")?Response.json(changed?{...f.continuityOfficer,id:"new-account"}:f.continuityOfficer):c.url.endsWith(f.investigation.id)&&c.options.method==="GET"?Response.json({...f.investigation,status:"COMPLETED",activeTbExcluded:true,tptEligible:true}):c.options.method==="POST"?(signal=c.options.signal as AbortSignal,new Promise<Response>(r=>{resolve=r;})):undefined);
 function Switch(){const session=useSession();return <button onClick={()=>{changed=true;void session.refresh();}}>Ganti akun</button>;}
 await renderContinuity(name==="referral"?"send":"investigation",name==="referral"?ids.tbCase:f.investigation.id,<Switch/>);
 if(name==="tpt"){
  await userEvent.click(await screen.findByRole("button",{name:"Mulai TPT"}));await userEvent.type(await screen.findByLabelText(/Tanggal mulai TPT/),"2026-09-01");await userEvent.type(screen.getByLabelText("Deskripsi paduan individual"),"Old explicit regimen");
 }
 await userEvent.click(await screen.findByRole("button",{name:name==="referral"?"Kirim rujukan":"Simpan TPT baru"}));await waitFor(()=>expect(resolve).toBeDefined());
 await userEvent.click(screen.getByText("Ganti akun"));await waitFor(()=>expect(signal?.aborted).toBe(true));const count=calls.length;routing.push.mockClear();routing.replace.mockClear();
 await act(async()=>{resolve(Response.json(f[name]));await Promise.resolve();});expect(calls).toHaveLength(count);expect(routing.push).not.toHaveBeenCalled();expect(routing.replace).not.toHaveBeenCalled();
});
it.each([false,true])("changing contact route aborts its pending command (error=%s)",async fails=>{
 const nextId="12121212-1212-4212-8212-121212121212";let resolve!:(r:Response)=>void,signal:AbortSignal|undefined;
 const calls=continuityBackend(c=>c.url.endsWith(nextId)?Response.json({...f.contact,id:nextId,fullName:"Another contact"},{headers:{ETag:'"next-contact"'}}):c.options.method==="PATCH"?(signal=c.options.signal as AbortSignal,new Promise<Response>(r=>{resolve=r;})):undefined);
 const {default:Page}=await import("@/app/contacts/[contactId]/page"),{AppProviders}=await import("@/app/providers"),{render}=await import("@testing-library/react");
 const view=render(<AppProviders>{await Page({params:Promise.resolve({contactId:f.contact.id})})}</AppProviders>);
 await userEvent.click(await screen.findByRole("button",{name:"Ubah kontak"}));await userEvent.type(screen.getByLabelText("Alamat kontak"),"Old contact draft");await userEvent.click(screen.getByRole("button",{name:"Simpan perubahan kontak"}));await waitFor(()=>expect(resolve).toBeDefined());
 view.rerender(<AppProviders>{await Page({params:Promise.resolve({contactId:nextId})})}</AppProviders>);await screen.findByText("Another contact");expect(signal?.aborted).toBe(true);expect(screen.queryByLabelText("Alamat kontak")).not.toBeInTheDocument();const count=calls.length;
 await act(async()=>{resolve(fails?failure(401,"AUTHENTICATION_REQUIRED"):Response.json(f.contact));await Promise.resolve();});expect(calls).toHaveLength(count);expect(screen.queryByText("Perubahan kontak tersimpan.")).not.toBeInTheDocument();
});

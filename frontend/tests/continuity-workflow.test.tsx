import {screen,waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {expect,it,vi} from "vitest";
import {renderContinuity,continuityBackend,routing} from "./continuity-harness";
import * as f from "./continuity-fixtures";
import {ids} from "./clinical-fixtures";
vi.mock("next/navigation",()=>({useRouter:()=>routing,usePathname:()=>"/referrals"}));
it.each(["send","contacts","contact","investigation","tpt"] as const)("%s screen provides authorized workflow",async name=>{continuityBackend();await renderContinuity(name,name==="send"||name==="contacts"?ids.tbCase:f.continuityIds[name==="contact"?"contact":name==="investigation"?"investigation":"tpt"]);await screen.findByRole("heading",{level:1});});
it("pre-treatment sends recorded fixed destination without treatment or ETag",async()=>{const calls=continuityBackend();await renderContinuity("send",ids.tbCase);await userEvent.click(await screen.findByRole("button",{name:"Kirim rujukan"}));const call=calls.find(c=>c.options.method==="POST"&&c.url.includes("/referrals"));expect(call?.body).toEqual({referralType:"PRE_TREATMENT_REFERRAL",destinationFacilityId:f.destination.id});expect(new Headers(call?.options.headers).get("If-Match")).toBeNull();});
it("investigation completion renders and requires explicit choices before sending",async()=>{
 const calls=continuityBackend();await renderContinuity("investigation",f.continuityIds.investigation);
 await userEvent.click(await screen.findByRole("button",{name:"Selesaikan investigasi"}));
 await userEvent.click(screen.getByRole("button",{name:"Simpan tindakan investigasi"}));
 expect(calls.filter(c=>c.options.method==="POST")).toHaveLength(0);
 await userEvent.selectOptions(screen.getByLabelText(/TB aktif telah dikecualikan/),"true");
 await userEvent.selectOptions(screen.getByLabelText(/Layak TPT/),"true");
 await userEvent.click(screen.getByRole("button",{name:"Simpan tindakan investigasi"}));
 await waitFor(()=>expect(calls.find(c=>c.url.endsWith("/complete"))?.body).toEqual({activeTbExcluded:true,tptEligible:true}));
 expect(calls.filter(c=>c.options.method==="POST")).toHaveLength(1);
});
it("explicit contact phone clear sends null while the displayed mask is never reused",async()=>{
 const calls=continuityBackend();await renderContinuity("contact",f.contact.id);
 await userEvent.click(await screen.findByRole("button",{name:"Ubah kontak"}));
 expect(screen.getByLabelText(/Telepon baru/)).toHaveValue("");
 await userEvent.click(screen.getByLabelText("Hapus telepon tersimpan"));
 await userEvent.click(screen.getByRole("button",{name:"Simpan perubahan kontak"}));
 await waitFor(()=>expect(calls.find(c=>c.options.method==="PATCH")?.body).toEqual({phone:null}));
});
it("a send conflict preserves notes when fresh preparation becomes in-flight",async()=>{
 let sent=false;
 continuityBackend(c=>{
  if(c.options.method==="POST"){sent=true;return Response.json({status:409,code:"REFERRAL_IN_FLIGHT",detail:"private prose"},{status:409});}
  if(c.url.endsWith("/referral-preparation")&&sent)return Response.json({...f.preparation,inFlightReferral:true});
 });
 await renderContinuity("send",ids.tbCase);
 await userEvent.type(await screen.findByLabelText("Catatan rujukan"),"Draft remains");
 await userEvent.click(screen.getByRole("button",{name:"Kirim rujukan"}));
 await waitFor(()=>expect(screen.getByLabelText("Catatan rujukan")).toHaveValue("Draft remains"));
 await waitFor(()=>expect(screen.getByRole("button",{name:"Kirim rujukan"})).toBeDisabled());
 expect(screen.queryByText("private prose")).not.toBeInTheDocument();
});
it("invalid referral destination refetches preparation and requires draft review",async()=>{
 let prepared=0;
 const calls=continuityBackend(c=>{
  if(c.url.endsWith("/referral-preparation")){prepared++;return Response.json(f.preparation);}
  if(c.options.method==="POST")return Response.json({title:"private",status:400,code:"REFERRAL_DESTINATION_INVALID",detail:"private prose"},{status:400,headers:{"Content-Type":"application/problem+json"}});
 });
 await renderContinuity("send",ids.tbCase);await userEvent.type(await screen.findByLabelText("Catatan rujukan"),"Retain draft");
 await userEvent.click(screen.getByRole("button",{name:"Kirim rujukan"}));
 await screen.findByText("Tujuan rujukan tidak valid");await waitFor(()=>expect(prepared).toBeGreaterThan(1));
 expect(screen.getByLabelText("Catatan rujukan")).toHaveValue("Retain draft");expect(screen.getByRole("button",{name:"Kirim rujukan"})).toBeDisabled();
 expect(calls.filter(c=>c.options.method==="POST")).toHaveLength(1);
});

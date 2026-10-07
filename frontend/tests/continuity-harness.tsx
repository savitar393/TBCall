import type { ReactNode } from "react";
import type { Me } from "@/lib/auth/types";
import { backend,renderClinical,routing,failure,type Call } from "./clinical-harness";
import * as f from "./continuity-fixtures";
export {routing,failure};
const modules=import.meta.glob("../features/continuity/**/*.tsx");
export async function renderContinuity(name:"referrals"|"referral"|"send"|"contacts"|"contact"|"investigations"|"investigation"|"tpt",id:string,extra?:ReactNode){
 const files={referrals:["referrals/queue","ReferralQueue"],referral:["referrals/detail","ReferralDetail"],send:["referrals/create","ReferralCreate"],contacts:["contacts/case-contacts","CaseContacts"],contact:["contacts/detail","ContactDetail"],investigations:["contacts/queue","InvestigationQueue"],investigation:["contacts/investigation","InvestigationDetail"],tpt:["tpt/detail","TptDetail"]};
 const [file,exportName]=files[name],loader=modules[`../features/continuity/${file}.tsx`],guard=modules["../features/continuity/boundary.tsx"];
 if(!loader||!guard)throw new Error("Continuity screens are not implemented");
 const Component=(await loader() as Record<string,(props:{id:string})=>ReactNode>)[exportName];
 const {ContinuityBoundary}=await guard() as typeof import("@/features/continuity/boundary");
 const permission=name==="send"?"REFERRAL_WRITE":name==="referrals"||name==="referral"?"REFERRAL_READ":name==="tpt"?"TPT_READ":"CONTACT_READ";
 return renderClinical(<>{extra}<ContinuityBoundary permission={permission}><Component id={id}/></ContinuityBoundary></>);
}
export function continuityBackend(overrides?:(c:Call)=>Response|Promise<Response>|undefined,actor:Me=f.continuityOfficer){return backend(c=>{
 document.cookie="XSRF-TOKEN=fixture; Path=/";const custom=overrides?.(c);if(custom)return custom;
 const u=c.url,write=c.options.method!=="GET";
 if(u.endsWith("/me"))return Response.json(actor);
 if(u.endsWith("/referral-reference-data"))return Response.json(f.referralReferences);
 if(u.endsWith("/contact-reference-data"))return Response.json(f.contactReferences);
 if(u.endsWith("/tpt-reference-data"))return Response.json(f.tptReferences);
 if(u.endsWith("/referral-preparation"))return Response.json(f.preparation);
 if(u.includes("/continuity-facilities"))return Response.json({content:[{...f.preparation.sourceFacility,facilityTypeCode:null,provinceCode:null,regencyCode:null},{...f.destination,facilityTypeCode:null,provinceCode:null,regencyCode:null}],page:0,size:20,totalElements:2});
 const page=(record:unknown)=>Response.json({content:[record],page:Number(new URL(u,"http://localhost").searchParams.get("page")??0),size:20,totalElements:21});
 if(u.includes("/referrals"))return !write&&(u.includes("/incoming")||u.includes("/outgoing"))?page(f.referral):Response.json(f.referral,{headers:{ETag:'"actual-referral"'}});
 if(u.includes("/contact-investigations"))return u.endsWith("/tpt")?Response.json(f.tpt):!write&&(u.includes("/incoming")||u.includes("/outgoing"))?page(f.investigation):Response.json(f.investigation,{headers:{ETag:'"actual-investigation"'}});
 if(u.includes("/preventive-treatments"))return Response.json(f.tpt,{headers:{ETag:'"actual-tpt"'}});
 if(u.includes("/contacts"))return !write&&u.includes("/tpt")?page(f.tpt):!write&&u.includes("/cases/")?page(f.contact):Response.json(f.contact,{headers:{ETag:'"actual-contact"'}});
 });}

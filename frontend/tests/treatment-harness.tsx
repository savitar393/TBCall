import type { ReactNode } from "react";
import { backend, renderClinical, routing, failure, type Call } from "./clinical-harness";
import { treatmentOfficer, treatmentReferences, treatmentDetail, treatmentDose, treatmentFollow, treatmentAdverse, treatmentOutcome } from "./treatment-fixtures";
import type { Me } from "@/lib/auth/types";
export { routing, failure };
const modules=import.meta.glob("../features/treatment/**/*.tsx");
export async function renderTreatment(name:"episodes"|"detail",id:string,extra?:ReactNode){
 const file=name==="episodes"?"case-treatments":"treatment-detail",loader=modules[`../features/treatment/components/${file}.tsx`],boundary=modules["../features/treatment/components/treatment-boundary.tsx"];
 if(!loader||!boundary)throw new Error("Treatment screens are not implemented");
 const {CaseTreatments,TreatmentDetail}=await loader() as typeof import("@/features/treatment/components/case-treatments") & typeof import("@/features/treatment/components/treatment-detail");
 const {TreatmentBoundary}=await boundary() as typeof import("@/features/treatment/components/treatment-boundary");const Component=name==="episodes"?CaseTreatments:TreatmentDetail;
 return renderClinical(<>{extra}<TreatmentBoundary><Component id={id}/></TreatmentBoundary></>);
}
export function treatmentBackend(overrides?:(call:Call)=>Response|Promise<Response>|undefined,actor:Me=treatmentOfficer){return backend(c=>{
 document.cookie="XSRF-TOKEN=fixture; Path=/";const custom=overrides?.(c);if(custom)return custom;
 if(c.url.endsWith("/me"))return Response.json(actor);
 if(c.url.endsWith("/treatment-reference-data"))return Response.json(treatmentReferences);
 if(c.url.includes("/dose-events"))return Response.json(c.options.method==="POST"?treatmentDose:{content:[treatmentDose],page:Number(new URL(c.url,"http://localhost").searchParams.get("page")??0),size:20,totalElements:21});
 if(c.url.endsWith("/follow-ups")||c.url.endsWith("/complete"))return Response.json(treatmentFollow,{headers:{ETag:'"child-only-tag"'}});
 if(c.url.includes("/adverse-events/" )||c.url.endsWith("/adverse-events"))return Response.json(treatmentAdverse);
 if(c.url.endsWith("/outcome"))return Response.json(treatmentOutcome);
 if(c.url.includes("/treatments"))return Response.json(c.url.includes("/cases/")&&c.options.method!=="POST"?[]:treatmentDetail,{headers:{ETag:'"actual-treatment-tag"'}});
});}

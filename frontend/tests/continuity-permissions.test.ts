import {expect,it} from "vitest";
import * as f from "./continuity-fixtures";
import {canContinuity,continuityNavigation,sendKind,referralActions,investigationActions,canStartTpt} from "@/features/continuity/permissions";
import type {Referral,Investigation} from "@/features/continuity/types";
import * as s from "@/features/continuity/schemas";
import {transitionInput,transitionSchema,transitionValues} from "@/features/continuity/referrals/forms";
import {localDateTimeToIso} from "@/features/continuity/time";
const destActor={...f.continuityOfficer,activeFacilities:[f.destination]};
it.each(["REFERRAL_READ","CONTACT_READ","TPT_READ","REFERRAL_WRITE","CONTACT_WRITE","TPT_WRITE"])("%s always requires explicit TB_OFFICER and permission",p=>{
 expect(canContinuity({...f.continuityOfficer,roles:[]},p)).toBe(false);
 expect(canContinuity({...f.continuityOfficer,permissions:[]},p)).toBe(false);
 expect(canContinuity({...f.continuityOfficer,permissions:[p]},p)).toBe(true);
});
it("navigation independently exposes only read-authorized modules",()=>{
 expect(continuityNavigation({...f.continuityOfficer,permissions:["REFERRAL_WRITE","CONTACT_WRITE","TPT_READ"]})).toEqual([]);
 expect(continuityNavigation({...f.continuityOfficer,permissions:["CONTACT_READ"]})).toEqual([{label:"Investigasi kontak",href:"/contact-investigations"}]);
 expect(continuityNavigation({...f.continuityOfficer,roles:[]})).toEqual([]);
});
it.each(["PLANNED","PAUSED","COMPLETED","CANCELLED"] as const)("%s episode never qualifies as a transfer",status=>{
 expect(sendKind({...f.preparation,caseStatus:"ACTIVE",openTreatment:{id:f.continuityIds.treatment,status,startDate:"2026-09-01",plannedEndDate:null,regimenCode:null,regimenName:null}})).toBeNull();
});
it.each([{inFlightReferral:true},{preTreatmentDestination:null},{caseStatus:"PLANNED"}])("invalid preparation %j does not infer a referral",patch=>expect(sendKind({...f.preparation,...patch})).toBeNull());
const refCases: [Referral["status"],boolean,string[]][]=[["SENT",false,["cancel"]],["SENT",true,["receive"]],["RECEIVED",false,[]],["RECEIVED",true,["return","report"]],["RETURNED",true,[]],["REPORTED",true,[]],["CANCELLED",false,[]],["DRAFT",false,[]]];
it.each(refCases)("referral %s destination=%s mirrors recorded-side transitions",(status,destination,actions)=>{
 expect(referralActions(destination?destActor:f.continuityOfficer,{...f.referral,status})).toEqual(actions);
 expect(referralActions({...f.continuityOfficer,permissions:["REFERRAL_READ"]},{...f.referral,status})).toEqual([]);
});
const invCases: [Investigation["workflowType"],Investigation["status"],boolean,string[]][]=[
 ["OUTGOING_REFERRAL","SENT",false,["cancel"]],["OUTGOING_REFERRAL","SENT",true,["receive"]],
 ["OUTGOING_REFERRAL","RECEIVED",true,["start","return"]],["OUTGOING_REFERRAL","IN_PROGRESS",true,["return","complete"]],
 ["OUTGOING_REFERRAL","IN_PROGRESS",false,[]],["OUTGOING_REFERRAL","COMPLETED",true,[]],
 ["INTERNAL","IN_PROGRESS",false,["complete"]],["INTERNAL","NEW",false,[]],["INCOMING_REFERRAL","IN_PROGRESS",false,[]]];
it.each(invCases)("investigation %s/%s destination=%s mirrors working side",(workflowType,status,destination,actions)=>{
 const i={...f.investigation,workflowType,status,destinationFacility:workflowType==="INTERNAL"?null:f.destination};
 expect(investigationActions(destination?destActor:f.continuityOfficer,i)).toEqual(actions);
 expect(investigationActions({...f.continuityOfficer,permissions:["CONTACT_READ"]},i)).toEqual([]);
});
it.each([{status:"IN_PROGRESS" as const},{activeTbExcluded:false},{activeTbExcluded:null},{tptEligible:false},{tptEligible:null}])("TPT cannot start when projected state differs: %j",patch=>{
 expect(canStartTpt(f.continuityOfficer,{...f.investigation,status:"COMPLETED",activeTbExcluded:true,tptEligible:true,...patch})).toBe(false);
});
it("TPT start additionally requires TPT_WRITE and the recorded working facility",()=>{
 const i={...f.investigation,status:"COMPLETED" as const,activeTbExcluded:true,tptEligible:true};
 expect(canStartTpt(f.continuityOfficer,i)).toBe(true);
 expect(canStartTpt({...f.continuityOfficer,permissions:["CONTACT_WRITE"]},i)).toBe(false);
 expect(canStartTpt(destActor,i)).toBe(false);
});
it.each([["referralPageSchema",f.referral],["contactPageSchema",f.contact],["investigationPageSchema",f.investigation],["tptPageSchema",f.tpt]] as const)("%s validates pagination and forbids enriched rows",(name,row)=>{
 const schema=s[name],page={content:[row],page:0,size:20,totalElements:1};
 expect(schema.safeParse(page).success).toBe(true);
 expect(schema.safeParse({...page,content:[{...row,nik:"secret"}]}).success).toBe(false);
 expect(schema.safeParse({...page,totalElements:-1}).success).toBe(false);
 expect(schema.safeParse({...page,nextCursor:"invented"}).success).toBe(false);
});
it.each(["referralReferences","contactReferences","tptReferences"] as const)("%s rejects missing groups or invented fields",name=>{
 const schema={referralReferences:s.referralReferencesSchema,contactReferences:s.contactReferencesSchema,tptReferences:s.tptReferencesSchema}[name];
 expect(schema.safeParse(f[name]).success).toBe(true);expect(schema.safeParse({}).success).toBe(false);
 expect(schema.safeParse({...f[name],officialSitb:true}).success).toBe(false);
});
it("continuity directory enforces approved fields and excludes invented metadata",()=>{
 const record={...f.destination,facilityTypeCode:null,provinceCode:null,regencyCode:null};
 expect(s.facilityPageSchema.safeParse({content:[record],page:0,size:20,totalElements:1}).success).toBe(true);
 expect(s.facilityPageSchema.safeParse({content:[{...record,staffEmail:"secret"}],page:0,size:20,totalElements:1}).success).toBe(false);
});
it.each([s.contactSchema,s.investigationSchema])("unmasked contact phone is an invalid response",schema=>{
 const dto=schema===s.contactSchema?{...f.contact,phone:"081234567890"}:{...f.investigation,contact:{...f.investigation.contact,phone:"081234567890"}};
 expect(schema.safeParse(dto).success).toBe(false);
});
it("referral local timestamp serializer preserves explicit time and omits blank server defaults",()=>{
 expect(transitionInput("receive",transitionValues())).toEqual({});
 const v={...transitionValues(),patientReportedAt:"2026-09-01T09:15",confirmed:true};
 expect(transitionSchema("report").safeParse(v).success).toBe(true);
 expect(transitionInput("report",v)).toEqual({patientReportedAt:localDateTimeToIso(v.patientReportedAt)});
 expect(transitionSchema("receive").safeParse({...transitionValues(),receivedAt:"invalid"}).success).toBe(false);
});
it.each(["REFERRAL_STATE_CONFLICT","REFERRAL_ALREADY_IN_FLIGHT","REFERRAL_DESTINATION_INVALID","REFERRAL_TREATMENT_MISMATCH","CONTACT_INVESTIGATION_STATE_CONFLICT","CONTACT_ALREADY_LINKED","TPT_STATE_CONFLICT","TPT_ALREADY_OPEN"])("%s maps only known code to safe local feedback",async code=>{
 const {continuityProblemMessage}=await import("@/features/continuity/errors"),{ApiError}=await import("@/lib/api/problem");
 const result=continuityProblemMessage(new ApiError({status:code==="REFERRAL_DESTINATION_INVALID"?400:409,title:"Secret",detail:"Private prose",code}));expect(result).toBeDefined();expect(JSON.stringify(result)).not.toMatch(/Secret|Private prose/);
});

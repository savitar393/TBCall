import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { specimenFormSchema, requestFormSchema, requestValues } from "@/features/laboratory/forms/values";
import { localDateTimeToIso } from "@/features/laboratory/time";
import { ids } from "./clinical-fixtures";
import { labOfficer, labStaff, labDetail, labIds, labReferences, labResult } from "./laboratory-fixtures";
import { labBackend, renderLab, routing, failure } from "./laboratory-harness";
vi.mock("next/navigation",()=>({useRouter:()=>routing,usePathname:()=>"/laboratory"}));
it.each(["2026-02-30T09:00","garbage"])("invalid specimen local time %s returns validation feedback rather than throwing",value=>{
  expect(specimenFormSchema.safeParse({specimenCode:"",specimenType:"Dahak",collectedAt:value,sentAt:"2026-09-01T10:00",notes:""}).success).toBe(false);
});
it("rejects nonexistent daylight-saving local times and round-trips a valid instant",()=>{
  vi.stubEnv("TZ","America/New_York");expect(()=>localDateTimeToIso("2026-03-08T02:30")).toThrow();expect(localDateTimeToIso("2026-03-08T03:30")).toBe("2026-03-08T07:30:00.000Z");
});
it.each([[],["TCM","TCM"],Array.from({length:11},(_,i)=>`T${i}`)])("requires one through ten distinct test types (%j)",testTypeCodes=>{
  expect(requestFormSchema.safeParse({...requestValues(),testingFacilityId:ids.facility,testTypeCodes}).success).toBe(false);
});
it.each(["error","missing-reason"])("catalog %s during creation retains unsaved fields and blocks stale selection",async kind=>{
  let changed=false; const calls=labBackend(c=>changed&&c.url.endsWith("laboratory-reference-data")?kind==="error"?failure(503,"UNAVAILABLE"):Response.json({...labReferences,requestReasons:[]}):undefined);
  function Refresh(){const client=useQueryClient();return <button onClick={()=>{changed=true;void client.invalidateQueries({queryKey:["laboratory",labOfficer.id,"references"]});}}>Perbarui katalog</button>;}
  await renderLab("create",{ownerType:"REGISTRATION",id:ids.registration},<Refresh/>);await userEvent.type(await screen.findByLabelText("Nama kurir"),"Draft courier");await userEvent.selectOptions(screen.getByLabelText(/Fasilitas pemeriksa/),ids.facility);await userEvent.click(screen.getByLabelText("Molekuler langsung"));await userEvent.click(screen.getByText("Perbarui katalog"));
  await waitFor(()=>expect(calls.filter(c=>c.url.endsWith("laboratory-reference-data"))).toHaveLength(2));
  await waitFor(()=>expect(screen.getByLabelText("Nama kurir")).toHaveValue("Draft courier"));expect(screen.getByRole("button",{name:"Simpan permintaan"})).toBeDisabled();expect(calls.some(c=>c.options.method==="POST")).toBe(false);
});
it("a result conflict that makes selected specimen unusable retains draft and rejects replay to obsolete lineage",async()=>{
  let changed=false; const calls=labBackend(c=>{if(c.options.method==="POST"){changed=true;return failure(409,"LAB_RESULT_STATE_CONFLICT");}if(c.url.endsWith(labIds.request))return Response.json({...labDetail,tests:[{...labDetail.tests[0],latestResults:[{...labResult,specimenId:null}]}],specimens:labDetail.specimens.map(s=>changed?{...s,examinationPossible:false}:s)});},labStaff);
  await renderLab("detail",{id:labIds.request});await userEvent.click(await screen.findByRole("button",{name:"Catat hasil Molekuler langsung"}));await userEvent.selectOptions(screen.getByLabelText("Spesimen hasil"),labIds.usable);await userEvent.type(screen.getByLabelText(/Waktu pemeriksaan/),"2026-09-01T12:00");await userEvent.type(screen.getByLabelText("Narasi hasil"),"Retained result");await userEvent.click(screen.getByRole("button",{name:"Simpan hasil"}));await screen.findByText(/Isian tetap dipertahankan/);expect(screen.getByLabelText("Narasi hasil")).toHaveValue("Retained result");expect(screen.getByRole("button",{name:"Saya sudah meninjau data terbaru"})).toBeDisabled();expect(calls.filter(c=>c.options.method==="POST")).toHaveLength(1);
});
it("an action form can only be discarded through explicit inline confirmation",async()=>{
  labBackend();await renderLab("detail",{id:labIds.request});await userEvent.click(await screen.findByRole("button",{name:"Catat spesimen"}));await userEvent.type(screen.getByLabelText(/Jenis spesimen/),"Draft specimen");await userEvent.click(screen.getByRole("button",{name:"Tutup formulir"}));expect(screen.getByLabelText(/Jenis spesimen/)).toHaveValue("Draft specimen");await userEvent.click(screen.getByRole("button",{name:"Pertahankan isian"}));expect(screen.getByLabelText(/Jenis spesimen/)).toHaveValue("Draft specimen");await userEvent.click(screen.getByRole("button",{name:"Tutup formulir"}));await userEvent.click(screen.getByRole("button",{name:"Buang isian dan tutup"}));expect(screen.queryByLabelText(/Jenis spesimen/)).not.toBeInTheDocument();expect(screen.getByRole("button",{name:"Catat spesimen"})).toBeEnabled();
});
it("successful result remains saved even if authoritative detail refresh fails",async()=>{
  let saved=false; const calls=labBackend(c=>{if(c.options.method==="POST"){saved=true;return undefined;}if(saved&&c.url.endsWith(labIds.request))return failure(503,"UNAVAILABLE");},labStaff);
  await renderLab("detail",{id:labIds.request});await userEvent.click(await screen.findByRole("button",{name:"Catat hasil Molekuler langsung"}));await userEvent.type(screen.getByLabelText(/Waktu pemeriksaan/),"2026-09-01T12:00");await userEvent.type(screen.getByLabelText("Narasi hasil"),"Saved narrative");await userEvent.click(screen.getByRole("button",{name:"Simpan hasil"}));await screen.findByText(/Perubahan tersimpan/);await screen.findAllByText("Layanan belum tersedia");expect(screen.queryByLabelText("Narasi hasil")).not.toBeInTheDocument();expect(calls.filter(c=>c.options.method==="POST")).toHaveLength(1);
});
it.each(["2025-11-02T06:30:00Z","2025-11-02T06:30:00.123456789Z"])("narrative-only correction preserves original timestamp %s through a repeated DST hour and server precision",async testedAt=>{
  vi.stubEnv("TZ","America/New_York");
  const calls=labBackend(c=>c.url.endsWith(labIds.request)?Response.json({...labDetail,tests:[{...labDetail.tests[0],latestResults:[{...labResult,testedAt}]}]}):undefined,labStaff);
  await renderLab("detail",{id:labIds.request});await userEvent.click(await screen.findByRole("button",{name:"Koreksi hasil Molekuler langsung S-1 (spesimen 2)"}));
  await userEvent.clear(screen.getByLabelText("Narasi hasil"));await userEvent.type(screen.getByLabelText("Narasi hasil"),"Only narrative changed");await userEvent.click(screen.getByRole("button",{name:"Simpan koreksi"}));await screen.findByText(/Perubahan tersimpan/);
  expect(calls.find(c=>c.url.endsWith("/corrections"))!.body!.testedAt).toBe(testedAt);
});
it("rejects a newly entered ambiguous DST time instead of selecting an offset silently",()=>{
  vi.stubEnv("TZ","America/New_York");expect(()=>localDateTimeToIso("2025-11-02T01:30")).toThrow(/ambigu/i);
});

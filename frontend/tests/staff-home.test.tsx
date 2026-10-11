import { screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { backend, renderClinical } from "./clinical-harness";
import { officer } from "./clinical-fixtures";
import HomePage from "@/app/page";
const page={content:[],page:0,size:10,totalElements:0};
const snapshot={asOf:"2026-10-11T00:00:00Z",upcomingUntil:"2026-10-18T00:00:00Z",cases:{state:"AVAILABLE",data:{active:4,completed:2}},followUps:{state:"AVAILABLE",data:{upcoming:page,overdue:page}},laboratory:{state:"AVAILABLE",data:page}};
it("lands eligible staff on real operational data and contextual worklists",async()=>{
  const calls=backend(call=>call.url.endsWith('/me')?Response.json(officer):call.url.includes('/operational-dashboard?')?Response.json(snapshot):undefined);
  renderClinical(<HomePage/>); await screen.findByRole('heading',{name:'Pelayanan hari ini'});
  const cases=await screen.findByRole('region',{name:'Kasus'}); expect(within(cases).getByText('4')).toBeInTheDocument();
  const shortcuts=within(screen.getByRole('region',{name:'Mulai pelayanan'})); expect(shortcuts.getByRole('link',{name:/Daftar pasien/})).toHaveAttribute('href','/patients');
  expect(document.querySelectorAll("#akun")).toHaveLength(1);
  expect(screen.getByRole("heading",{name:"Akun & konteks akses"}).closest("details")).toBeNull();
  expect(calls.every(call=>call.options.method==='GET')).toBe(true);
});
it.each(['SYSTEM_ADMIN','FACILITY_ADMIN','LAB_STAFF','TREATMENT_SUPPORTER','PROGRAM_MONITOR'])('does not fetch officer metrics merely for %s',async role=>{
  const user={...officer,roles:[{code:role,name:role}]};
  const calls=backend(call=>call.url.endsWith('/me')?Response.json(user):undefined);
  renderClinical(<HomePage/>); await screen.findByRole('heading',{name:'Selamat datang'});
  expect(calls.every(call=>call.url.endsWith('/me'))).toBe(true);
  expect(screen.queryByRole('heading',{name:'Pelayanan hari ini'})).not.toBeInTheDocument();
});
it.each(['scope','permissions'])('does not fetch a dashboard with missing %s',async missing=>{
  const user=missing==='scope'?{...officer,activeFacilities:[]}:{...officer,permissions:[]};
  const calls=backend(call=>call.url.endsWith('/me')?Response.json(user):undefined);
  renderClinical(<HomePage/>); await screen.findByRole('heading',{name:'Selamat datang'});
  expect(calls.every(call=>call.url.endsWith('/me'))).toBe(true);
});

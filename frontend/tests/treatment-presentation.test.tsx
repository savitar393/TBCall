import { screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { treatmentBackend, renderTreatment, routing, failure } from "./treatment-harness";
import { treatmentIds } from "./treatment-fixtures";
vi.mock("next/navigation",()=>({useRouter:()=>routing,usePathname:()=>"/treatments/id"}));
it("renders Indonesian treatment dates and intact UTF-8 separators without changing requests",async()=>{
  const calls=treatmentBackend(); await renderTreatment("detail",treatmentIds.treatment);
  await screen.findByText("Nama snapshot historis");
  const summary=screen.getByRole("region",{name:"Ringkasan pengobatan"});
  expect(summary.textContent).not.toMatch(/Â|â€|â€“/);
  expect(within(summary).getByText(/4 September 2026/)).toBeInTheDocument();
  expect(calls.every(c=>!c.options.method||c.options.method==="GET")).toBe(true);
});
it("places treatment actions next to the patient context and focuses the opened form",async()=>{
  treatmentBackend(); await renderTreatment("detail",treatmentIds.treatment);
  await screen.findByRole("heading",{name:"Detail pengobatan"});
  const navigation=screen.getByRole("navigation",{name:"Bagian pengobatan"});
  expect(within(navigation).getByRole("link",{name:"Jadwal obat"})).toHaveAttribute("href","#treatment-schedule");
  await userEvent.click(screen.getByRole("button",{name:"Catat bukti dosis"}));
  const editor=screen.getByRole("region",{name:"Formulir tindakan"});
  expect(within(editor).getByRole("heading",{name:"Catat bukti dosis"})).toHaveFocus();
  expect(within(editor).getByLabelText(/Tanggal bukti dosis/)).toBeVisible();
  await userEvent.click(within(editor).getByRole("button",{name:"Tutup formulir"}));
  expect(screen.getByRole("button",{name:"Catat bukti dosis"})).toHaveFocus();
});
it("hides unnecessary pagination for an empty dose list",async()=>{
  treatmentBackend(c=>c.url.includes("/dose-events")?Response.json({content:[],page:0,size:20,totalElements:0}):undefined);
  await renderTreatment("detail",treatmentIds.treatment);
  await screen.findByText("Belum ada bukti dosis.");
  expect(screen.queryByRole("button",{name:"Halaman dosis berikutnya"})).not.toBeInTheDocument();
});
it("renders one contextual dose error without replaying failed requests",async()=>{
  const calls=treatmentBackend(c=>c.url.includes("/dose-events")?failure(503,"SERVICE_UNAVAILABLE"):undefined);
  await renderTreatment("detail",treatmentIds.treatment);
  const region=await screen.findByRole("region",{name:"Bukti dosis"});
  await within(region).findByRole("alert");
  expect(within(region).getAllByRole("alert")).toHaveLength(1);
  expect(calls.filter(c=>c.url.includes("/dose-events"))).toHaveLength(1);
});
it("retains a route back when dose totals shrink on a later page",async()=>{
  treatmentBackend(c=>c.url.includes("/dose-events")&&c.url.includes("page=1")?Response.json({content:[],page:1,size:20,totalElements:0}):undefined);
  await renderTreatment("detail",treatmentIds.treatment);
  await userEvent.click(await screen.findByRole("button",{name:"Halaman dosis berikutnya"}));
  await screen.findByText("Belum ada bukti dosis.");
  expect(screen.getByRole("button",{name:"Halaman dosis sebelumnya"})).toBeEnabled();
});

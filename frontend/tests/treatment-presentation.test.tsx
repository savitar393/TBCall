import { screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { treatmentBackend, renderTreatment, routing } from "./treatment-harness";
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

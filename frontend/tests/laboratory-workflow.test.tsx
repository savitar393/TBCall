import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ids } from "./clinical-fixtures";
import { labOfficer, labStaff, labDetail, labIds, labResult } from "./laboratory-fixtures";
import { labBackend, renderLab, routing, failure } from "./laboratory-harness";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/laboratory/requests/id" }));
beforeEach(() => labBackend());
const detail = () => renderLab("detail", { id: labIds.request });
const open = async (name: string) => userEvent.click(await screen.findByRole("button", { name }));
async function resultFields() {
  await userEvent.type(screen.getByLabelText(/Waktu pemeriksaan/), "2026-09-01T12:00");
  await userEvent.type(screen.getByLabelText("Kode hasil"), "FREE-FORM");
}
it("detail renders only projected context/logistics/completeness and independently authorized owner link", async () => {
  const calls = labBackend(); await detail(); await screen.findByText(labDetail.patient.fullName);
  expect(screen.getByRole("link", { name: "Buka registrasi" })).toHaveAttribute("href", `/registrations/${ids.registration}`);
  expect(screen.getByText(labDetail.courierName)).toBeInTheDocument();
  expect(screen.getByText(labResult.resultText)).toBeInTheDocument();
  expect(screen.getByText("Dikoreksi langsung")).toBeInTheDocument();
  expect(calls.some(c => /\/patients|\/registrations|\/cases/.test(c.url))).toBe(false);
});
it("LAB_STAFF owner context is readable without a nonfunctional clinical link", async () => {
  labBackend(undefined, labStaff); await detail(); await screen.findByText(labDetail.patient.fullName);
  expect(screen.queryByRole("link", { name: "Buka registrasi" })).not.toBeInTheDocument();
});
it("without LAB_RESULT_READ even accidentally enriched fixture results are never rendered or recovered", async () => {
  const calls = labBackend(undefined, { ...labStaff, permissions: labStaff.permissions.filter(p => p !== "LAB_RESULT_READ") });
  await detail(); await screen.findByText(labDetail.patient.fullName);
  expect(screen.queryByText(labResult.resultValue)).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: /Koreksi hasil/ })).not.toBeInTheDocument();
  expect(calls.every(c => c.url.endsWith("/me") || c.url.endsWith("laboratory-reference-data") || c.url.endsWith(labIds.request))).toBe(true);
});
it.each([labOfficer, labStaff])("source and testing actions require both actor and facility assignment ($roles.0.code)", async actor => {
  labBackend(undefined, actor); await detail(); await screen.findByText(labDetail.patient.fullName);
  expect(!!screen.queryByRole("button", { name: "Catat spesimen" })).toBe(actor === labOfficer);
  expect(!!screen.queryByRole("button", { name: "Terima spesimen S-1" })).toBe(actor === labStaff);
});
it.each(["source", "testing"])("missing %s permission cannot be inferred from actor role", async kind => {
  const actor = kind === "source" ? labOfficer : labStaff;
  labBackend(undefined, { ...actor, permissions: actor.permissions.filter(p => p !== (kind === "source" ? "LAB_REQUEST_WRITE" : "LAB_RESULT_WRITE")) });
  await detail(); await screen.findByText(labDetail.patient.fullName);
  expect(screen.queryByRole("button", { name: kind === "source" ? "Catat spesimen" : "Terima spesimen S-1" })).not.toBeInTheDocument();
});
it("dual actors get only independently scoped source/testing operations", async () => {
  labBackend(undefined, { ...labOfficer, roles: [...labOfficer.roles, ...labStaff.roles], permissions: [...labOfficer.permissions, "LAB_RESULT_WRITE"] });
  await detail(); await screen.findByText(labDetail.patient.fullName);
  expect(screen.getByRole("button", { name: "Catat spesimen" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Terima spesimen S-1" })).not.toBeInTheDocument();
});
it.each(["DRAFT", "RECEIVED", "PARTIAL", "COMPLETED", "CANCELLED"])("%s blocks new specimen recording", async status => {
  labBackend(c => c.url.endsWith(labIds.request) ? Response.json({ ...labDetail, status }) : undefined);
  await detail(); await screen.findByText(labDetail.patient.fullName); expect(screen.queryByRole("button", { name: "Catat spesimen" })).not.toBeInTheDocument();
});
it("specimen recording uses actual request ETag, bounded free text, explicit optional times and refetch", async () => {
  const calls = labBackend(); await detail(); await open("Catat spesimen");
  await userEvent.type(screen.getByLabelText(/Jenis spesimen/), "Jenis bebas");
  await userEvent.type(screen.getByLabelText("Catatan spesimen"), "Isian pribadi");
  expect(screen.getByText(/Zona waktu browser:/)).toBeInTheDocument();
  await open("Simpan spesimen"); await screen.findByText("Perubahan tersimpan. Data permintaan dimuat ulang.");
  const call = calls.find(c => c.url.endsWith("/specimens") && c.options.method === "POST")!;
  expect(new Headers(call.options.headers).get("If-Match")).toBe('"actual-request-tag"');
  expect(call.body).toEqual({ specimenCode: null, specimenType: "Jenis bebas", collectedAt: null, sentAt: null, notes: "Isian pribadi" });
  expect(calls.filter(c => c.url.endsWith(labIds.request) && c.options.method === "GET").length).toBe(2);
});
it("cancel requires explicit confirmation and uses real request ETag without a body", async () => {
  const calls = labBackend(); await detail(); await open("Batalkan permintaan");
  expect(screen.getByRole("button", { name: "Konfirmasi pembatalan" })).toBeDisabled();
  await userEvent.click(screen.getByLabelText(/Saya mengonfirmasi pembatalan/)); await open("Konfirmasi pembatalan");
  await screen.findByText("Perubahan tersimpan. Data permintaan dimuat ulang.");
  const call = calls.find(c => c.url.endsWith("/cancel"))!; expect(new Headers(call.options.headers).get("If-Match")).toBe('"actual-request-tag"'); expect(call.body).toBeNull();
});
it.each(["DRAFT", "PARTIAL", "COMPLETED", "CANCELLED"])("%s blocks cancellation/receipt", async status => {
  labBackend(c => c.url.endsWith(labIds.request) ? Response.json({ ...labDetail, status }) : undefined, { ...labStaff, roles: [...labOfficer.roles, ...labStaff.roles], permissions: [...labOfficer.permissions, ...labStaff.permissions], activeFacilities: [...labOfficer.activeFacilities, ...labStaff.activeFacilities] });
  await detail(); await screen.findByText(labDetail.patient.fullName); expect(screen.queryByRole("button", { name: "Batalkan permintaan" })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Terima spesimen S-1" })).not.toBeInTheDocument();
});
it("receipt requires explicit boolean/rejection and clears stale rejection on usable=true, using specimen version", async () => {
  const calls = labBackend(undefined, labStaff); await detail(); await open("Terima spesimen S-1");
  await userEvent.type(screen.getByLabelText(/Waktu penerimaan/), "2026-09-01T12:00");
  await userEvent.selectOptions(screen.getByLabelText(/Dapat diperiksa/), "false"); await open("Simpan penerimaan");
  await screen.findByText("Alasan penolakan wajib diisi."); expect(calls.some(c => c.options.method === "POST")).toBe(false);
  await userEvent.type(screen.getByLabelText(/Alasan penolakan/), "Rusak"); await userEvent.selectOptions(screen.getByLabelText(/Dapat diperiksa/), "true");
  expect(screen.queryByLabelText(/Alasan penolakan/)).not.toBeInTheDocument(); await open("Simpan penerimaan"); await screen.findByText("Perubahan tersimpan. Data permintaan dimuat ulang.");
  const call = calls.find(c => c.url.endsWith("/receive"))!;
  expect(new Headers(call.options.headers).get("If-Match")).toBe('"8"'); expect(call.body).toMatchObject({ examinationPossible: true, rejectionReason: null, receivedAt: expect.stringMatching(/Z$/) });
});
it("first result offers only usable unrepresented exact lineages, including independent null lineage", async () => {
  const calls = labBackend(undefined, labStaff); await detail(); await open("Catat hasil Molekuler langsung");
  const select = screen.getByLabelText("Spesimen hasil"); expect(within(select).getByRole("option", { name: "Tanpa spesimen tercatat" })).toBeInTheDocument();
  expect(within(select).queryByRole("option", { name: /S-1/ })).not.toBeInTheDocument();
  await resultFields(); await open("Simpan hasil"); await screen.findByText("Perubahan tersimpan. Data permintaan dimuat ulang.");
  const call = calls.find(c => c.url.endsWith("/results"))!; expect(new Headers(call.options.headers).get("If-Match")).toBe('"7"'); expect(call.body).toMatchObject({ specimenId: null, resultCode: "FREE-FORM" });
  expect(Object.keys(call.body!)).toEqual(["specimenId", "testedAt", "resultCode", "resultValue", "resultText"]);
});
it("used null lineage is excluded while a usable unused specimen can be explicitly chosen", async () => {
  const calls = labBackend(c => c.url.endsWith(labIds.request) ? Response.json({ ...labDetail, tests: [{ ...labDetail.tests[0], latestResults: [{ ...labResult, specimenId: null }] }] }) : undefined, labStaff);
  await detail(); await open("Catat hasil Molekuler langsung"); const select = screen.getByLabelText("Spesimen hasil");
  expect(within(select).queryByRole("option", { name: "Tanpa spesimen tercatat" })).not.toBeInTheDocument();
  await userEvent.selectOptions(select, labIds.usable); await resultFields(); await open("Simpan hasil"); await screen.findByText("Perubahan tersimpan. Data permintaan dimuat ulang.");
  expect(calls.find(c => c.url.endsWith("/results"))!.body!.specimenId).toBe(labIds.usable);
});
it("all represented lineages offer correction rather than a second first result", async () => {
  labBackend(c => c.url.endsWith(labIds.request) ? Response.json({ ...labDetail, tests: [{ ...labDetail.tests[0], latestResults: [labResult, { ...labResult, id: ids.diagnosis, specimenId: null }] }] }) : undefined, labStaff);
  await detail(); await screen.findByText(labDetail.patient.fullName); expect(screen.queryByRole("button", { name: "Catat hasil Molekuler langsung" })).not.toBeInTheDocument(); expect(screen.getAllByRole("button", { name: /Koreksi hasil/ })).toHaveLength(2);
});
it("correction keeps returned time and fixed lineage, sends only result fields using result version, then refetches", async () => {
  const calls = labBackend(undefined, labStaff); await detail(); await open("Koreksi hasil Molekuler langsung S-1 (spesimen 2)");
  expect(screen.queryByLabelText("Spesimen hasil")).not.toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText("Narasi hasil")); await userEvent.type(screen.getByLabelText("Narasi hasil"), "Koreksi bebas");
  await open("Simpan koreksi"); await screen.findByText("Perubahan tersimpan. Data permintaan dimuat ulang.");
  const call = calls.find(c => c.url.endsWith("/corrections"))!; expect(new Headers(call.options.headers).get("If-Match")).toBe('"11"');
  expect(call.body).toEqual({ testedAt: labResult.testedAt, resultCode: labResult.resultCode, resultValue: labResult.resultValue, resultText: "Koreksi bebas" });
});
it.each([[409,"OPTIMISTIC_LOCK_CONFLICT"],[428,"PRECONDITION_REQUIRED"],[409,"LAB_RESULT_ALREADY_EXISTS"],[409,"LAB_RESULT_NOT_LATEST"],[409,"LAB_REQUEST_STATE_CONFLICT"],[409,"LAB_SPECIMEN_STATE_CONFLICT"],[409,"LAB_RESULT_STATE_CONFLICT"]])("%s %s preserves draft, refreshes, requires manual review, never replays or renders prose", async (status, code) => {
  const calls = labBackend(c => c.options.method === "POST" ? failure(Number(status), String(code)) : undefined, labStaff);
  await detail(); await open("Catat hasil Molekuler langsung"); await resultFields(); await open("Simpan hasil");
  await screen.findByText("Isian tetap dipertahankan. Tinjau data terbaru sebelum mengirim lagi.");
  expect(screen.getByLabelText("Kode hasil")).toHaveValue("FREE-FORM"); expect(screen.getByRole("button", { name: "Simpan hasil" })).toBeDisabled();
  expect(screen.queryByText(/never display clinical prose|private server details/)).not.toBeInTheDocument();
  expect(calls.filter(c => c.options.method === "POST")).toHaveLength(1);
  await open("Saya sudah meninjau data terbaru"); expect(screen.getByRole("button", { name: "Simpan hasil" })).toBeEnabled();
});
it("authority lock survives a failed background detail read without losing form values", async () => {
  let failRead = false; const calls = labBackend(c => c.options.method === "POST" ? failure(409,"SOURCE_AUTHORITY_CONFLICT") : failRead && c.url.endsWith(labIds.request) ? failure(503,"UNAVAILABLE") : undefined, labStaff);
  await detail(); await open("Catat hasil Molekuler langsung"); await resultFields(); await open("Simpan hasil"); await screen.findByText("Data dikendalikan sumber eksternal");
  failRead = true; await open("Muat ulang permintaan"); await screen.findAllByText("Layanan belum tersedia");
  expect(screen.getByLabelText("Kode hasil")).toHaveValue("FREE-FORM"); expect(screen.getByRole("button", { name: "Simpan hasil" })).toBeDisabled(); expect(calls.filter(c => c.options.method === "POST")).toHaveLength(1);
});
it("a conflict that removes the selected latest result retains draft and blocks an obsolete correction", async () => {
  let changed = false; labBackend(c => { if (c.options.method === "POST") { changed=true; return failure(409,"LAB_RESULT_NOT_LATEST"); } if(changed && c.url.endsWith(labIds.request)) return Response.json({ ...labDetail, tests:[{...labDetail.tests[0],latestResults:[{...labResult,id:ids.diagnosis}]}] }); }, labStaff);
  await detail(); await open("Koreksi hasil Molekuler langsung S-1 (spesimen 2)"); await userEvent.type(screen.getByLabelText("Narasi hasil"), " tambahan"); await open("Simpan koreksi");
  await screen.findByText("Isian tetap dipertahankan. Tinjau data terbaru sebelum mengirim lagi."); expect(screen.getByLabelText("Narasi hasil")).toHaveValue(`${labResult.resultText} tambahan`);
  expect(screen.getByRole("button",{name:"Saya sudah meninjau data terbaru"})).toBeDisabled(); expect(screen.getByRole("button",{name:"Simpan koreksi"})).toBeDisabled();
});

import { beforeEach, expect, it, vi } from "vitest";
import { votApi, mediaUrl } from "@/features/vot/api";
import { canSelfVot, canReviewVot } from "@/features/vot/permissions";
import { patient } from "./portal-fixtures";
const input = { treatmentId: "synthetic-treatment", occurrenceId: "revision/2026-10-16/08:00", consentPolicyVersion: "vot-synthetic-v1" };
const requests: MockXHR[] = [];
class MockXHR {
  upload = { onprogress: null as ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
  open = vi.fn(); setRequestHeader = vi.fn(); send = vi.fn(); abort = vi.fn(() => this.onabort?.());
  withCredentials = false; timeout = 0; status = 0; responseText = "";
  onload: (() => void) | null = null; onerror: (() => void) | null = null; ontimeout: (() => void) | null = null; onabort: (() => void) | null = null;
  constructor() { requests.push(this); }
}
beforeEach(() => { document.cookie = "XSRF-TOKEN=synthetic-csrf; Path=/"; vi.stubGlobal("XMLHttpRequest", MockXHR); });
it("uploads a raw Blob with cookies, per-upload consent, progress, MIME codecs and cancellation", async () => {
  const controller = new AbortController(), progress = vi.fn(), blob = new Blob(["synthetic"], { type: "video/webm;codecs=vp8,opus" });
  const operation = votApi.upload(input, blob, progress, controller.signal);
  expect(requests.at(-1)!.open).toHaveBeenCalledWith("POST", expect.stringContaining("consentAcknowledged=true"));
  expect(requests.at(-1)!.open.mock.calls[0][1]).toContain("occurrenceId=revision%2F2026-10-16%2F08%3A00");
  expect(requests.at(-1)!.withCredentials).toBe(true); expect(requests.at(-1)!.send).toHaveBeenCalledWith(blob);
  expect(requests.at(-1)!.setRequestHeader).toHaveBeenCalledWith("X-XSRF-TOKEN", "synthetic-csrf");
  expect(requests.at(-1)!.setRequestHeader).toHaveBeenCalledWith("Content-Type", "video/webm;codecs=vp8,opus");
  requests.at(-1)!.upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 4 }); expect(progress).toHaveBeenCalledWith(50);
  controller.abort(); await expect(operation).rejects.toMatchObject({ name: "AbortError" }); expect(requests.at(-1)!.abort).toHaveBeenCalledOnce();
});
it("rejects missing CSRF before constructing a network request", async () => {
  document.cookie = "XSRF-TOKEN=; Path=/; Max-Age=0";
  await expect(votApi.upload(input, new Blob(["synthetic"]), vi.fn())).rejects.toMatchObject({ problem: { code: "CSRF_INVALID" } });
});
it("does not expose raw upload errors and handles interrupted connection", async () => {
  const operation = votApi.upload(input, new Blob(["synthetic"]), vi.fn());
  requests.at(-1)!.status = 413; requests.at(-1)!.responseText = "private upstream storage path"; requests.at(-1)!.onload?.();
  await expect(operation).rejects.toMatchObject({ problem: { status: 413, title: "Video belum dapat dikirim" } });
  const interrupted = votApi.upload(input, new Blob(["synthetic"]), vi.fn()); requests.at(-1)!.onerror?.();
  await expect(interrupted).rejects.toMatchObject({ problem: { code: "NETWORK_UNAVAILABLE" } });
});
it("rejects invalid response metadata", async () => {
  const operation = votApi.upload(input, new Blob(["synthetic"]), vi.fn()); requests.at(-1)!.status = 201; requests.at(-1)!.responseText = "{}"; requests.at(-1)!.onload?.();
  await expect(operation).rejects.toMatchObject({ problem: { code: "INVALID_RESPONSE" } });
});
it("uses protected same-origin media endpoints and dedicated role/link/facility permission checks", () => {
  expect(mediaUrl("patient", "synthetic/id")).toBe("/api/tbcall/v1/me/vot-submissions/synthetic%2Fid/media");
  expect(mediaUrl("staff", "synthetic")).toBe("/api/tbcall/v1/vot-submissions/synthetic/media");
  const linked = { ...patient, permissions: ["VOT_SELF_READ", "VOT_SELF_WRITE"] };
  expect(canSelfVot(linked, true)).toBe(true); expect(canSelfVot({ ...linked, patientLink: null })).toBe(false);
  const officer = { ...patient, roles: [{ code: "TB_OFFICER", name: "Petugas" }], activeFacilities: [{ id: "facility", name: "Contoh" }], permissions: ["VOT_REVIEW_READ", "VOT_REVIEW_WRITE"] };
  expect(canReviewVot(officer, true)).toBe(true); expect(canReviewVot({ ...officer, activeFacilities: [] })).toBe(false);
  expect(canReviewVot({ ...officer, roles: [{ code: "SYSTEM_ADMIN", name: "Admin" }] })).toBe(false);
});

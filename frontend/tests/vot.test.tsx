import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VotRecorder } from "@/features/vot/recorder";
import { StaffVot } from "@/features/vot/staff";
import { PatientVot } from "@/features/vot/patient";
import { VotPlayback } from "@/features/vot/shared";
import { votApi } from "@/features/vot/api";
import { scheduleApi } from "@/features/medication-schedule/api";
import type { SchedulePrescription } from "@/features/medication-schedule/types";
import { patient, treatment } from "./portal-fixtures";
const state = vi.hoisted(() => ({ user: null as unknown, handleFailure: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ useSession: () => state }));
vi.mock("@/features/vot/api", async original => ({ ...await original<typeof import("@/features/vot/api")>(), votApi: { policy: vi.fn(), list: vi.fn(), detail: vi.fn(), upload: vi.fn(), review: vi.fn(), cancel: vi.fn() }, mediaUrl: () => "/api/tbcall/v1/me/vot-submissions/synthetic/media" }));
const policy = { enabled: true, syntheticOnly: true as const, maxFileBytes: 20971520, retentionDays: 7, consentPolicyVersion: "vot-synthetic-v1" };
const occurrence = { kind: "EXPECTED_OCCURRENCE" as const, id: "revision/2026-10-16/08:00", scheduleId: "schedule", revisionId: "revision", treatmentId: "treatment", localDate: "2026-10-16", localTime: "08:00", timeZone: "Asia/Jakarta", scheduledAt: "2026-10-16T01:00:00Z", offsetResolution: "UNAMBIGUOUS" as const };
const submission = { id: "submission", patientId: "patient", treatmentId: "treatment", scheduleId: "schedule", revisionId: "revision", occurrenceId: occurrence.id, scheduledAt: occurrence.scheduledAt, localDate: occurrence.localDate, localTime: occurrence.localTime, timeZone: occurrence.timeZone, contentType: "video/webm", size: 100, submittedAt: "2026-10-16T02:00:00Z", status: "PENDING_REVIEW" as const, consentPolicyVersion: policy.consentPolicyVersion, consentAcknowledged: true as const, reviewedAt: null, reviewedByUserId: null, reviewNotes: null, version: 3, retentionExpiresAt: "2026-10-23T02:00:00Z", mediaDeletedAt: null };
function mount(ui: React.ReactNode) { const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>); }
function recorder() { return mount(<VotRecorder occurrences={[occurrence]} policy={policy} onSaved={vi.fn()}/>); }
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-16T02:00:00Z"));
  vi.clearAllMocks();
  state.user = { ...patient, permissions: [...patient.permissions, "VOT_SELF_READ", "VOT_SELF_WRITE"] };
  vi.mocked(votApi.policy).mockResolvedValue({ data: policy });
  vi.mocked(votApi.list).mockResolvedValue({ data: { content: [submission], page: 0, size: 20, totalElements: 1 } });
  vi.mocked(votApi.detail).mockResolvedValue({ data: submission });
  vi.mocked(votApi.review).mockResolvedValue({ data: { ...submission, status: "OBSERVED" } });
  vi.stubGlobal("MediaRecorder", undefined);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:synthetic") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("requires per-upload consent and preview; unsupported recording offers file fallback", async () => {
  vi.mocked(votApi.upload).mockResolvedValue({ data: submission });
  recorder();
  expect(screen.getByText(/Perekaman tidak didukung/)).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText("Jadwal video"), occurrence.id);
  fireEvent.change(screen.getByLabelText("Pilih video"), { target: { files: [new File(["synthetic"], "demo.webm", { type: "video/webm" })] } });
  expect(screen.getByLabelText("Pratinjau video")).toHaveAttribute("src", "blob:synthetic");
  expect(screen.getByRole("button", { name: "Kirim video" })).toBeDisabled();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Kirim video" }));
  await screen.findByText(/Video berhasil dikirim/);
  expect(votApi.upload).toHaveBeenCalledWith(expect.objectContaining({ occurrenceId: occurrence.id, treatmentId: "treatment", consentPolicyVersion: policy.consentPolicyVersion }), expect.any(Blob), expect.any(Function), expect.any(AbortSignal));
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic");
});
it("rejects oversized or unsupported files locally and displays upload failures", async () => {
  recorder();
  const input = screen.getByLabelText("Pilih video");
  fireEvent.change(input, { target: { files: [new File(["x"], "bad.txt", { type: "text/plain" })] } });
  expect(screen.getByRole("alert")).toHaveTextContent(/WebM atau MP4/);
  const large = new File(["x"], "large.webm", { type: "video/webm" }); Object.defineProperty(large, "size", { value: 20971521 });
  fireEvent.change(input, { target: { files: [large] } });
  expect(screen.getByRole("alert")).toHaveTextContent(/20 MB/);
  fireEvent.change(input, { target: { files: [new File(["x"], "demo.webm", { type: "video/webm" })] } });
  await userEvent.selectOptions(screen.getByLabelText("Jadwal video"), occurrence.id);
  await userEvent.click(screen.getByRole("checkbox"));
  vi.mocked(votApi.upload).mockRejectedValue(new Error("private internals"));
  await userEvent.click(screen.getByRole("button", { name: "Kirim video" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/Video belum dapat dikirim/);
  expect(screen.queryByText("private internals")).not.toBeInTheDocument();
});
it("handles camera denial without starting capture automatically", async () => {
  const getUserMedia = vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  vi.stubGlobal("MediaRecorder", class { static isTypeSupported() { return true; } });
  recorder(); expect(getUserMedia).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Mulai rekam" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/Izin kamera/);
  expect(screen.getByLabelText("Pilih video")).toBeEnabled();
});
it("records on request, previews on stop, and stops camera tracks on unmount", async () => {
  const stop = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
  class Recorder { static isTypeSupported() { return true; } state = "inactive"; mimeType = "video/webm"; ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null; start() { this.state = "recording"; } stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["synthetic"], { type: "video/webm" }) }); this.onstop?.(); } }
  vi.stubGlobal("MediaRecorder", Recorder);
  const view = recorder();
  await userEvent.click(screen.getByRole("checkbox")); await userEvent.click(screen.getByRole("button", { name: "Mulai rekam" }));
  await userEvent.click(await screen.findByRole("button", { name: "Hentikan rekaman" }));
  expect(await screen.findByLabelText("Pratinjau video")).toHaveAttribute("src", "blob:synthetic");
  view.unmount(); expect(stop).toHaveBeenCalled(); expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it("aborts in-flight upload when leaving the recorder", async () => {
  let signal: AbortSignal | undefined;
  vi.mocked(votApi.upload).mockImplementation((_data, _blob, _progress, next) => { signal = next; return new Promise(() => {}); });
  const view = recorder(); await userEvent.selectOptions(screen.getByLabelText("Jadwal video"), occurrence.id);
  fireEvent.change(screen.getByLabelText("Pilih video"), { target: { files: [new File(["x"], "demo.mp4", { type: "video/mp4" })] } });
  await userEvent.click(screen.getByRole("checkbox")); await userEvent.click(screen.getByRole("button", { name: "Kirim video" }));
  view.unmount(); expect(signal?.aborted).toBe(true);
});
it("automatically stops recording at sixty seconds", async () => {
  vi.useFakeTimers();
  const stopTrack = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) } });
  const stopRecording = vi.fn();
  class Recorder { static isTypeSupported() { return true; } state = "inactive"; mimeType = "video/webm"; ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null; start() { this.state = "recording"; } stop() { stopRecording(); this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["synthetic"], { type: "video/webm" }) }); this.onstop?.(); } }
  vi.stubGlobal("MediaRecorder", Recorder); recorder();
  fireEvent.click(screen.getByRole("checkbox"));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Mulai rekam" })); });
  act(() => vi.advanceTimersByTime(59999)); expect(stopRecording).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1)); expect(stopRecording).toHaveBeenCalledOnce(); expect(stopTrack).toHaveBeenCalled(); expect(screen.getByLabelText("Pratinjau video")).toBeInTheDocument();
});
it("never previews or submits a recording that failed before its stop event", async () => {
  const instances: Recorder[] = [];
  const stopTrack = vi.fn();
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) } });
  class Recorder { static isTypeSupported() { return true; } state = "inactive"; mimeType = "video/webm"; ondataavailable: ((e: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null; onerror: (() => void) | null = null; constructor() { instances.push(this); } start() { this.state = "recording"; } stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["incomplete"], { type: "video/webm" }) }); this.onstop?.(); } }
  vi.stubGlobal("MediaRecorder", Recorder); recorder();
  await userEvent.click(screen.getByRole("checkbox")); await userEvent.click(screen.getByRole("button", { name: "Mulai rekam" }));
  act(() => { instances[0].onerror?.(); instances[0].stop(); });
  expect(screen.getByRole("alert")).toHaveTextContent(/Perekaman gagal/); expect(screen.queryByLabelText("Pratinjau video")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Kirim video" })).toBeDisabled(); expect(stopTrack).toHaveBeenCalled();
});
it("stops camera permission results that arrive after leaving the page", async () => {
  const stop = vi.fn(); let finish!: (value: unknown) => void;
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; })) } });
  vi.stubGlobal("MediaRecorder", class { static isTypeSupported() { return true; } });
  const view = recorder(); await userEvent.click(screen.getByRole("checkbox")); await userEvent.click(screen.getByRole("button", { name: "Mulai rekam" })); view.unmount();
  await act(async () => finish({ getTracks: () => [{ stop }] })); expect(stop).toHaveBeenCalledOnce();
});
it.each(["OBSERVED", "NOT_VERIFIABLE", "CANCELLED"] as const)("shows reviewed history classification %s without recording dose evidence", async status => {
  vi.mocked(votApi.list).mockResolvedValue({ data: { content: [{ ...submission, status }], page: 0, size: 20, totalElements: 1 } });
  state.user = { ...patient, permissions: ["VOT_SELF_READ"] };
  mount(<PatientVot/>);
  const labels = { OBSERVED: "Aktivitas teramati", NOT_VERIFIABLE: "Tidak dapat diverifikasi", CANCELLED: "Dibatalkan" };
  expect(await screen.findByText(labels[status])).toBeInTheDocument(); expect(votApi.upload).not.toHaveBeenCalled();
});
it("shows history statuses with no active treatment", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ title: "Not found", code: "RESOURCE_NOT_FOUND" }, { status: 404, headers: { "Content-Type": "application/problem+json" } })));
  mount(<PatientVot/>);
  expect(await screen.findByText("Menunggu peninjauan")).toBeInTheDocument();
  expect(await screen.findByText(/Belum ada pengobatan aktif/)).toBeInTheDocument();
});
it("shows no active schedule without enabling capture or querying occurrences", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json(treatment))));
  vi.spyOn(scheduleApi, "patient").mockResolvedValue(null);
  const readOccurrences = vi.spyOn(scheduleApi, "patientOccurrences");
  mount(<PatientVot/>); expect(await screen.findByText(/Belum ada jadwal obat aktif/)).toBeInTheDocument(); expect(readOccurrences).not.toHaveBeenCalled(); expect(screen.queryByLabelText("Pilih video")).not.toBeInTheDocument();
});
it("does not offer an ended revision even when its past occurrence is within seven days", async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-16T02:00:00Z"));
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(Response.json(treatment))));
  const prescription: SchedulePrescription = { kind: "PRESCRIBED_SCHEDULE", id: "schedule", treatmentId: treatment.id, version: 0, status: "ACTIVE", cancelledAt: null, currentRevision: { id: "revision", revisionNumber: 1, status: "ACTIVE", timeZone: "Asia/Jakarta", startDate: "2026-10-01", endDate: "2026-10-15", recurrence: "DAILY", weekdays: [1,2,3,4,5,6,7], times: ["08:00"], validFrom: "2026-10-01T00:00:00Z", validUntil: null, createdAt: "2026-10-01T00:00:00Z" }, lifecycle: { treatmentStatus: "ACTIVE", futureExpectationsAllowed: true, actualEndDate: null, historyBoundaryKnown: false } };
  vi.spyOn(scheduleApi, "patient").mockResolvedValue({ data: prescription });
  const readOccurrences = vi.spyOn(scheduleApi, "patientOccurrences");
  mount(<PatientVot/>); expect(await screen.findByText(/Belum ada jadwal obat aktif/)).toBeInTheDocument(); expect(readOccurrences).not.toHaveBeenCalled();
});
it("shows an empty officer queue and allows completed status filters", async () => {
  state.user = { ...patient, patientLink: null, roles: [{ code: "TB_OFFICER", name: "Petugas" }], activeFacilities: [{ id: "facility", name: "Contoh" }], permissions: ["VOT_REVIEW_READ"] };
  vi.mocked(votApi.list).mockResolvedValue({ data: { content: [], page: 0, size: 20, totalElements: 0 } });
  mount(<StaffVot/>); expect(await screen.findByText(/Tidak ada video dengan status ini/)).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText("Status video"), "OBSERVED");
  await waitFor(() => expect(votApi.list).toHaveBeenCalledWith("staff", 0, "OBSERVED", undefined, expect.any(AbortSignal)));
});
it("officer queue requires confirmation and sends the selected version", async () => {
  state.user = { ...patient, patientLink: null, roles: [{ code: "TB_OFFICER", name: "Petugas" }], activeFacilities: [{ id: "facility", name: "Contoh" }], permissions: ["VOT_REVIEW_READ", "VOT_REVIEW_WRITE"] };
  mount(<StaffVot/>);
  await userEvent.click(await screen.findByRole("button", { name: "Tinjau video 1" }));
  await userEvent.selectOptions(await screen.findByLabelText("Keputusan peninjauan"), "OBSERVED");
  await userEvent.click(screen.getByRole("button", { name: "Simpan peninjauan" }));
  expect(votApi.review).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Ya, simpan peninjauan" }));
  await waitFor(() => expect(votApi.review).toHaveBeenCalledWith("submission", { decision: "OBSERVED" }, 3, expect.any(AbortSignal)));
});
it("denies unauthorized officers and admins without issuing requests", async () => {
  state.user = { ...patient, roles: [{ code: "SYSTEM_ADMIN", name: "Admin" }], permissions: ["VOT_REVIEW_READ", "VOT_REVIEW_WRITE"] };
  mount(<StaffVot/>); expect(screen.getByText(/Akses peninjauan VOT tidak diizinkan/)).toBeInTheDocument();
  await act(async () => {}); expect(votApi.list).not.toHaveBeenCalled();
});
it("withdraws officer playback after pending cancellation while retaining the patient's own copy", () => {
  const view = mount(<VotPlayback audience="staff" item={{ ...submission, status: "CANCELLED" }}/>);
  expect(screen.queryByRole("button", { name: "Buka video privat" })).not.toBeInTheDocument();
  view.unmount();
  mount(<VotPlayback audience="patient" item={{ ...submission, status: "CANCELLED" }}/>);
  expect(screen.getByRole("button", { name: "Buka video privat" })).toBeInTheDocument();
});

import type { ReactNode } from "react";
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { portalApi } from "@/features/portal/api";
import { useMedicationCalendar } from "@/features/portal/patient/medication-agenda";
import { useSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/problem";
import { failure, portalBackend, renderPortal, routing } from "./portal-harness";
import * as f from "./portal-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/portal" }));

const patient = { kind: "patient" as const };
const signal = () => new AbortController().signal;
const emptyPage = { content: [], page: 0, size: 20, totalElements: 0 };
const notFound = () => failure(404, "RESOURCE_NOT_FOUND");
function SessionError() {
  const { error } = useSession();
  return error ? <p role="alert">Session request failed: {error.problem.status}</p> : null;
}

it("SELF-linked patient without treatment sees empty activities without a session error", async () => {
  const calls = portalBackend(f.patient, call => {
    const path = call.url.split("?")[0];
    if (path.endsWith("/dose-events") || path.endsWith("/medication-schedule")) return notFound();
    if (path.endsWith("/follow-ups")) return Response.json([]);
    if (path.endsWith("/monitoring") || path.endsWith("/notifications")) return Response.json(emptyPage);
  });
  await renderPortal("home", <SessionError/>);
  await screen.findByText("Belum ada laporan dosis yang tercatat.");
  expect(screen.getByText(/Belum ada pengobatan dengan jadwal obat/)).toBeInTheDocument();
  expect(screen.queryByText(/Session request failed/)).not.toBeInTheDocument();
  expect(screen.queryByText("Catatan belum lengkap")).not.toBeInTheDocument();
  expect(calls.filter(c => c.url.includes("/dose-events"))).toHaveLength(1);
  expect(calls.filter(c => c.url.endsWith("/medication-schedule"))).toHaveLength(1);
  expect(calls.some(c => c.url.includes("/occurrences"))).toBe(false);
  expect(calls.every(c => !c.options.method || c.options.method === "GET")).toBe(true);
});

it("empty dose history does not depend on TREATMENT_READ permission", async () => {
  const calls = portalBackend({ ...f.patient, permissions: f.patient.permissions.filter(p => p !== "TREATMENT_READ") }, c => c.url.includes("/dose-events") ? notFound() : undefined);
  await renderPortal("home", <SessionError/>);
  await screen.findByText("Belum ada laporan dosis yang tercatat.");
  expect(calls.some(c => c.url.includes("/medication-schedule") || c.url.endsWith("/treatment"))).toBe(false);
  expect(screen.queryByText(/Session request failed/)).not.toBeInTheDocument();
});

it("only the documented patient-dose absence becomes an empty page", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(notFound()));
  expect((await portalApi.doses(patient, 2, signal())).data).toEqual({ ...emptyPage, page: 2 });
});
it("existing treatment dose records remain unchanged", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(f.page(f.dose))));
  expect((await portalApi.doses(patient, 0, signal())).data).toEqual(f.page(f.dose));
});
it.each([
  [401, "AUTHENTICATION_REQUIRED"], [403, "ACCESS_DENIED"], [409, "OPTIMISTIC_LOCK_CONFLICT"],
  [400, "VALIDATION_ERROR"], [500, "INTERNAL_ERROR"], [503, "UNAVAILABLE"],
  [404, "UNEXPECTED_RESOURCE"],
])("patient dose %s/%s remains an error", async (status, code) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failure(status, code)));
  await expect(portalApi.doses(patient, 0, signal())).rejects.toMatchObject({ problem: { status, code } });
});
it("unclassified route404 is not treated as absence", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 404 })));
  await expect(portalApi.doses(patient, 0, signal())).rejects.toBeInstanceOf(ApiError);
});
it("supporter and unrelated patient404 responses remain errors", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => notFound()));
  await expect(portalApi.doses({ kind: "supporter", caseId: f.caseId }, 0, signal())).rejects.toBeInstanceOf(ApiError);
  await expect(portalApi.patient(signal())).rejects.toBeInstanceOf(ApiError);
});
it("failed dose writes are neither normalized nor replayed", async () => {
  document.cookie = "XSRF-TOKEN=fixture; Path=/";
  const fetch = vi.fn().mockResolvedValue(notFound()); vi.stubGlobal("fetch", fetch);
  await expect(portalApi.recordDose(patient, { scheduledDate: f.date, status: "TAKEN" }, signal())).rejects.toBeInstanceOf(ApiError);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each(["network", "invalid-response"])("unexpected %s failures are retained", async kind => {
  vi.stubGlobal("fetch", kind === "network" ? vi.fn().mockRejectedValue(new Error("offline")) : vi.fn().mockResolvedValue(Response.json({ unexpected: true })));
  await expect(portalApi.doses(patient, 0, signal())).rejects.toMatchObject({ problem: { code: kind === "network" ? "NETWORK_UNAVAILABLE" : "INVALID_RESPONSE" } });
});
it("a real dose read failure still reaches portal error handling", async () => {
  portalBackend(f.patient, c => c.url.includes("/dose-events") ? failure(503, "UNAVAILABLE") : undefined);
  await renderPortal("home", <SessionError/>);
  expect(await screen.findByText("Session request failed: 503")).toBeInTheDocument();
  expect(screen.getByText("Catatan belum lengkap")).toBeInTheDocument();
});

function calendar(read: () => Response) {
  const fetch = vi.fn().mockImplementation(async () => read()); vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useMedicationCalendar(f.patient.id, true, null, "week"), { wrapper }), fetch, client };
}
async function refocusAndReconnect() {
  await act(async () => {
    focusManager.setFocused(false); onlineManager.setOnline(false);
    await Promise.resolve(); onlineManager.setOnline(true); focusManager.setFocused(true);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}
it("known no-treatment schedule does not refetch on focus/reconnect but manual refresh still reads", async () => {
  const hook = calendar(notFound);
  try {
    await waitFor(() => expect(hook.result.current.prescription.isSuccess).toBe(true));
    expect(hook.result.current.schedule).toBeUndefined();
    await refocusAndReconnect(); expect(hook.fetch).toHaveBeenCalledTimes(1);
    await act(async () => { await hook.result.current.refresh(); });
    expect(hook.fetch).toHaveBeenCalledTimes(2);
    expect(hook.result.current.prescription.data).toBeNull();
  } finally { hook.unmount(); hook.client.clear(); focusManager.setFocused(undefined); onlineManager.setOnline(true); }
});
it.each([200, 503])("present schedule or actual error %s retains automatic revalidation", async status => {
  const absentSchedule = { kind: "PRESCRIBED_SCHEDULE", id: null, treatmentId: f.id, version: null, status: "ABSENT", currentRevision: null, cancelledAt: null, lifecycle: { treatmentStatus: "ACTIVE", futureExpectationsAllowed: true, actualEndDate: null, historyBoundaryKnown: false } };
  const hook = calendar(() => status === 200 ? Response.json(absentSchedule) : failure(503, "UNAVAILABLE"));
  try {
    await waitFor(() => expect(hook.result.current.prescription.isFetching).toBe(false));
    await refocusAndReconnect();
    await waitFor(() => expect(hook.fetch.mock.calls.length).toBeGreaterThan(1));
    expect(hook.result.current.prescription.isError).toBe(status === 503);
  } finally { hook.unmount(); hook.client.clear(); focusManager.setFocused(undefined); onlineManager.setOnline(true); }
});
it("a failed manual refresh after absence remains an error and can revalidate", async () => {
  let reads = 0;
  const hook = calendar(() => ++reads === 1 ? notFound() : failure(503, "UNAVAILABLE"));
  try {
    await waitFor(() => expect(hook.result.current.prescription.isSuccess).toBe(true));
    await act(async () => { await hook.result.current.refresh(); });
    await waitFor(() => expect(hook.result.current.prescription.isError).toBe(true));
    expect(hook.result.current.prescription.error).toMatchObject({ problem: { status: 503 } });
    await refocusAndReconnect();
    await waitFor(() => expect(hook.fetch.mock.calls.length).toBeGreaterThan(2));
  } finally { hook.unmount(); hook.client.clear(); focusManager.setFocused(undefined); onlineManager.setOnline(true); }
});

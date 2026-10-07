import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQueryClient, type QueryClient, focusManager, onlineManager } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import * as f from "./monitoring-fixtures";
import { monitoringBackend, renderMonitoring, tag, failure, routing } from "./monitoring-harness";
it("active plan on another history page blocks new plan", async () => {
  monitoringBackend(c => c.url.includes("/monitoring-plans?") ? Response.json({
    content: [{
      ...f.plan,
      status: new URL(c.url, "http://test").searchParams.get("page") === "0" ? "CANCELLED" : "ACTIVE"
    }],
    page: Number(new URL(c.url, "http://test").searchParams.get("page")),
    size: 1,
    totalElements: 2
  }) : undefined);
  await renderMonitoring("target", f.treatment.id);
  await screen.findByRole("heading", {
    name: "Riwayat rencana"
  });
  await waitFor(() => expect(screen.queryByRole("button", {
    name: "Buat rencana pemantauan"
  })).not.toBeInTheDocument());
});
it.each(["PLANNED", "PAUSED", "COMPLETED", "CANCELLED"])("%s target cannot create active plan", async status => {
  monitoringBackend(c => c.url.endsWith(f.treatment.id) ? Response.json({
    ...f.treatment,
    status
  }) : c.url.includes("/monitoring-plans?") ? Response.json({
    ...f.page(f.plan),
    content: [],
    totalElements: 0
  }) : undefined);
  await renderMonitoring("target", f.treatment.id);
  await screen.findByRole("heading", {
    name: "Riwayat rencana"
  });
  expect(screen.queryByRole("button", {
    name: "Buat rencana pemantauan"
  })).not.toBeInTheDocument();
});
it("TPT manual form excludes treatment-only types and allows 1..100 empty rows", async () => {
  monitoringBackend(c => c.url.includes("/monitoring-plans?") ? Response.json({
    ...f.page(f.plan),
    content: [],
    totalElements: 0
  }) : undefined);
  await renderMonitoring("target", f.tpt.id, "TPT");
  await userEvent.click(await screen.findByRole("button", {
    name: "Buat rencana pemantauan"
  }));
  const type = screen.getByLabelText(/Jenis kegiatan 1/);
  expect(within(type).queryByText("Live BACTERIOLOGY_FOLLOW_UP")).not.toBeInTheDocument();
  expect(within(type).queryByText("Live SAFETY_MONITORING")).not.toBeInTheDocument();
  expect(screen.getByRole("button", {
    name: "Hapus kegiatan 1"
  })).toBeDisabled();
  for (let i = 1; i < 100; i++) fireEvent.click(screen.getByRole("button", {
    name: "Tambah kegiatan manual"
  }));
  expect(screen.getAllByRole("group", {
    name: /Kegiatan nomor/
  })).toHaveLength(100);
  expect(screen.getByRole("button", {
    name: "Tambah kegiatan manual"
  })).toBeDisabled();
  expect(screen.getByLabelText(/Jadwal kegiatan 100/)).toHaveValue("");
}, 30000);
it("manual create sends explicitly entered event and navigates with no ETag", async () => {
  const calls = monitoringBackend(c => c.url.includes("/monitoring-plans?") ? Response.json({
    ...f.page(f.plan),
    content: [],
    totalElements: 0
  }) : undefined);
  routing.push.mockClear();
  await renderMonitoring("target", f.treatment.id);
  await userEvent.click(await screen.findByRole("button", {
    name: "Buat rencana pemantauan"
  }));
  await userEvent.type(screen.getByLabelText(/Tanggal mulai rencana/), "2026-09-04");
  await userEvent.selectOptions(screen.getByLabelText(/Jenis kegiatan 1/), "CLINICAL_REVIEW");
  fireEvent.change(screen.getByLabelText(/Jadwal kegiatan 1/), {
    target: {
      value: "2026-09-05T10:00"
    }
  });
  await userEvent.click(screen.getByRole("button", {
    name: "Simpan rencana baru"
  }));
  await waitFor(() => expect(calls.find(c => c.options.method === "POST")).toBeDefined());
  const command = calls.find(c => c.options.method === "POST")!;
  expect(command.body).toEqual({
    startDate: "2026-09-04",
    events: [{
      eventType: "CLINICAL_REVIEW",
      scheduledAt: new Date(2026, 8, 5, 10, 0).toISOString()
    }]
  });
  expect(tag(command)).toBeNull();
  await waitFor(() => expect(routing.push).toHaveBeenCalledWith(`/monitoring-plans/${f.plan.id}`));
});
it("add event blocks another parent command until authoritative plan refresh completes", async () => {
  let added = false;
  let resolve!: (r: Response) => void;
  let client!: QueryClient;
  const calls = monitoringBackend(c => c.url.endsWith(`/monitoring-plans/${f.plan.id}/events`) && c.options.method === "POST" ? (added = true, Response.json(f.event)) : added && c.url.endsWith(`/monitoring-plans/${f.plan.id}`) ? new Promise<Response>(r => {
    resolve = r;
  }) : undefined);
  function Probe() {
    client = useQueryClient();
    return null;
  }
  await renderMonitoring("plan", f.plan.id, "TREATMENT", <Probe />);
  client.setQueryData(["monitoring", f.actor.id, "alerts", "sentinel"], "safe");
  await userEvent.click(await screen.findByRole("button", {
    name: "Tambah kegiatan"
  }));
  await userEvent.selectOptions(screen.getByLabelText(/Jenis kegiatan/), "CLINICAL_REVIEW");
  fireEvent.change(screen.getByLabelText(/Jadwal kegiatan/), {
    target: {
      value: "2026-09-05T10:00"
    }
  });
  await userEvent.click(screen.getByRole("button", {
    name: "Simpan kegiatan baru"
  }));
  await waitFor(() => expect(resolve).toBeDefined());
  expect(screen.getByRole("button", {
    name: "Ubah rencana"
  })).toBeDisabled();
  expect(tag(calls.find(c => c.options.method === "POST")!)).toBe('"plan-get"');
  expect(client.getQueryState(["monitoring", f.actor.id, "alerts", "sentinel"])?.isInvalidated).toBe(true);
  await act(async () => resolve(Response.json({
    ...f.plan,
    version: 902
  }, {
    headers: {
      ETag: '"parent-next"'
    }
  })));
  await waitFor(() => expect(screen.getByRole("button", {
    name: "Ubah rencana"
  })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", {
    name: "Ubah rencana"
  }));
  await userEvent.clear(screen.getByLabelText("Catatan rencana"));
  added = false;
  await userEvent.click(screen.getByRole("button", {
    name: "Simpan rencana"
  }));
  await waitFor(() => expect(calls.find(c => c.options.method === "PATCH")).toBeDefined());
  expect(tag(calls.find(c => c.options.method === "PATCH")!)).toBe('"parent-next"');
});
it.each(["DRAFT", "PAUSED", "COMPLETED", "CANCELLED"])("%s parent forbids all monitoring mutations", async status => {
  monitoringBackend(c => c.url.endsWith(`/monitoring-plans/${f.plan.id}`) ? Response.json({
    ...f.plan,
    status
  }, {
    headers: {
      ETag: '"plan-state"'
    }
  }) : undefined);
  await renderMonitoring("plan");
  await screen.findByRole("heading", {
    name: "Rencana pemantauan"
  });
  expect(screen.queryByRole("button", {
    name: "Ubah rencana"
  })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {
    name: "Tambah kegiatan"
  })).not.toBeInTheDocument();
  await userEvent.click(await screen.findByRole("button", {
    name: "Buka kegiatan 1"
  }));
  await screen.findByRole("button", {
    name: "Muat ulang kegiatan"
  });
  expect(screen.queryByRole("button", {
    name: "Selesaikan kegiatan"
  })).not.toBeInTheDocument();
});
it.each(["SCHEDULED", "DUE", "OVERDUE", "COMPLETED", "CANCELLED"])("authoritative %s event governs structural actions even when list says scheduled", async status => {
  monitoringBackend(c => c.url.endsWith(`/monitoring-events/${f.event.id}`) ? Response.json({
    ...f.event,
    status
  }, {
    headers: {
      ETag: '"event-state"'
    }
  }) : undefined);
  await renderMonitoring("plan");
  await userEvent.click(await screen.findByRole("button", {
    name: "Buka kegiatan 1"
  }));
  await screen.findByRole("button", {
    name: "Muat ulang kegiatan"
  });
  expect(!!screen.queryByRole("button", {
    name: "Jadwalkan ulang"
  })).toBe(["SCHEDULED", "DUE"].includes(status));
  expect(!!screen.queryByRole("button", {
    name: "Selesaikan kegiatan"
  })).toBe(["SCHEDULED", "DUE", "OVERDUE"].includes(status));
  expect(!!screen.queryByRole("button", {
    name: "Batalkan kegiatan"
  })).toBe(["SCHEDULED", "DUE", "OVERDUE"].includes(status));
});
it("event cancellation requires deliberate confirmation and invalidates alert queue", async () => {
  let client!: QueryClient;
  function Probe() {
    client = useQueryClient();
    return null;
  }
  const calls = monitoringBackend();
  await renderMonitoring("plan", f.plan.id, "TREATMENT", <Probe />);
  client.setQueryData(["monitoring", f.actor.id, "alerts", "sentinel"], "safe");
  await userEvent.click(await screen.findByRole("button", {
    name: "Buka kegiatan 1"
  }));
  await userEvent.click(await screen.findByRole("button", {
    name: "Batalkan kegiatan"
  }));
  await userEvent.click(screen.getByRole("button", {
    name: "Konfirmasi pembatalan kegiatan"
  }));
  expect(calls.filter(c => c.options.method === "POST")).toHaveLength(0);
  await userEvent.click(screen.getByLabelText("Saya mengonfirmasi pembatalan kegiatan"));
  await userEvent.click(screen.getByRole("button", {
    name: "Konfirmasi pembatalan kegiatan"
  }));
  await waitFor(() => expect(calls.find(c => c.url.endsWith("/cancel"))).toBeDefined());
  expect(tag(calls.find(c => c.url.endsWith("/cancel"))!)).toBe('"event-get"');
  await waitFor(() => expect(client.getQueryState(["monitoring", f.actor.id, "alerts", "sentinel"])?.isInvalidated).toBe(true));
});
it("open event draft remains bound to observed tag after explicit refresh until conflict review", async () => {
  let changed = false;
  let failed = false;
  const calls = monitoringBackend(c => c.url.endsWith(`/monitoring-events/${f.event.id}`) ? c.options.method === "PATCH" ? (failed = true, failure(409, "OPTIMISTIC_LOCK_CONFLICT")) : Response.json({
    ...f.event,
    dueAt: changed ? "2026-02-01T10:00:00+07:00" : f.event.dueAt
  }, {
    headers: {
      ETag: changed ? '"fresh-event"' : '"observed-event"'
    }
  }) : undefined);
  await renderMonitoring("plan");
  await userEvent.click(await screen.findByRole("button", {
    name: "Buka kegiatan 1"
  }));
  await userEvent.click(await screen.findByRole("button", {
    name: "Jadwalkan ulang"
  }));
  await userEvent.clear(screen.getByLabelText("Batas waktu kegiatan"));
  changed = true;
  await userEvent.click(screen.getByRole("button", {
    name: "Muat ulang kegiatan"
  }));
  await waitFor(() => expect(screen.getByRole("button", {
    name: "Simpan jadwal"
  })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", {
    name: "Simpan jadwal"
  }));
  await screen.findByText("Data telah berubah");
  expect(failed).toBe(true);
  expect(tag(calls.find(c => c.options.method === "PATCH")!)).toBe('"observed-event"');
  expect(screen.getByLabelText("Batas waktu kegiatan")).toHaveValue("");
  await userEvent.click(screen.getByRole("button", {
    name: "Saya sudah meninjau data terbaru"
  }));
  await userEvent.click(screen.getByRole("button", {
    name: "Simpan jadwal"
  }));
  await waitFor(() => expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(2));
  expect(tag(calls.filter(c => c.options.method === "PATCH")[1])).toBe('"fresh-event"');
});
it.each(["plan", "event", "alert", "notification"] as const)("missing %s GET tag safely disables/rejects versioned action", async kind => {
  const calls = monitoringBackend(c => kind === "plan" && c.url.endsWith(`/monitoring-plans/${f.plan.id}`) ? Response.json(f.plan) : kind === "event" && c.url.endsWith(`/monitoring-events/${f.event.id}`) ? Response.json(f.event) : kind === "alert" && c.url.endsWith(`/alerts/${f.alert.id}`) ? Response.json(f.alert) : kind === "notification" && c.url.endsWith(`/me/notifications/${f.notification.id}`) ? Response.json(f.notification) : undefined);
  await renderMonitoring(kind === "alert" ? "alert" : kind === "notification" ? "notifications" : "plan", kind === "alert" ? f.alert.id : f.plan.id);
  if (kind === "event") {
    await userEvent.click(await screen.findByRole("button", {
      name: "Buka kegiatan 1"
    }));
    expect(await screen.findByRole("button", {
      name: "Jadwalkan ulang"
    })).toBeDisabled();
  } else if (kind === "notification") {
    await userEvent.click(await screen.findByRole("button", {
      name: "Tandai notifikasi 1 dibaca"
    }));
    await screen.findByText("Versi data diperlukan");
  } else expect(await screen.findByRole("button", {
    name: kind === "alert" ? "Akui peringatan" : "Ubah rencana"
  })).toBeDisabled();
  expect(calls.some(c => c.options.method !== "GET")).toBe(false);
});
it.each(["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"])("%s alert status gates ack and resolve", async status => {
  monitoringBackend(c => c.url.endsWith(f.alert.id) ? Response.json({
    ...f.alert,
    status
  }, {
    headers: {
      ETag: '"status"'
    }
  }) : undefined);
  await renderMonitoring("alert", f.alert.id);
  await screen.findByRole("heading", {
    name: "Detail peringatan"
  });
  expect(!!screen.queryByRole("button", {
    name: "Akui peringatan"
  })).toBe(status === "OPEN");
  expect(!!screen.queryByRole("button", {
    name: "Selesaikan peringatan"
  })).toBe(["OPEN", "ACKNOWLEDGED"].includes(status));
});
it("acknowledge awaits fresh detail then resolve uses advanced GET tag", async () => {
  let acknowledged = false;
  const calls = monitoringBackend(c => c.url.endsWith("/acknowledge") ? (acknowledged = true, Response.json({
    ...f.alert,
    status: "ACKNOWLEDGED"
  })) : c.url.endsWith(f.alert.id) && acknowledged ? Response.json({
    ...f.alert,
    status: "ACKNOWLEDGED"
  }, {
    headers: {
      ETag: '"ack-next"'
    }
  }) : undefined);
  await renderMonitoring("alert", f.alert.id);
  await userEvent.click(await screen.findByRole("button", {
    name: "Akui peringatan"
  }));
  await waitFor(() => expect(screen.queryByRole("button", {
    name: "Akui peringatan"
  })).not.toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", {
    name: "Selesaikan peringatan"
  }));
  await waitFor(() => expect(calls.find(c => c.url.endsWith("/resolve"))).toBeDefined());
  expect(tag(calls.find(c => c.url.endsWith("/resolve"))!)).toBe('"ack-next"');
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("alert filter controls stay in memory and links use only route IDs", async () => {
  const push = vi.spyOn(history, "pushState");
  const replace = vi.spyOn(history, "replaceState");
  const calls = monitoringBackend();
  await renderMonitoring("alerts");
  await screen.findByRole("link", {
    name: "Buka peringatan 1"
  });
  await userEvent.selectOptions(screen.getByLabelText("Status peringatan"), "OPEN");
  await userEvent.selectOptions(screen.getByLabelText("Jenis target"), "TPT");
  await userEvent.selectOptions(screen.getByLabelText("Jumlah per halaman"), "10");
  await waitFor(() => expect(calls.some(c => c.url.includes("status=OPEN") && c.url.includes("targetType=TPT") && c.url.includes("size=10"))).toBe(true));
  expect(push).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  expect(screen.getByRole("link", {
    name: "Buka peringatan 1"
  })).toHaveAttribute("href", `/alerts/${f.alert.id}`);
  expect(screen.getByRole("region", {
    name: "Daftar peringatan"
  }).querySelector("article")).toBeTruthy();
});
it.each(["READ", "PENDING", "FAILED", "CANCELLED"])("notification authoritative %s detail blocks old SENT list read command", async status => {
  const calls = monitoringBackend(c => c.url.endsWith(f.notification.id) ? Response.json({
    ...f.notification,
    status
  }, {
    headers: {
      ETag: '"new-detail"'
    }
  }) : undefined);
  await renderMonitoring("notifications");
  await userEvent.click(await screen.findByRole("button", {
    name: "Tandai notifikasi 1 dibaca"
  }));
  await screen.findByText("Status pemantauan telah berubah.");
  expect(calls.some(c => c.options.method === "POST")).toBe(false);
});
it("DELIVERED notification reads and refreshes detail/list; unsupported channel hidden", async () => {
  const calls = monitoringBackend(c => c.url.split("?")[0].endsWith("/me/notifications") ? Response.json({
    ...f.page(f.notification),
    content: [{
      ...f.notification,
      status: "DELIVERED"
    }, {
      ...f.notification,
      id: f.event.id,
      channel: "SMS"
    }]
  }) : undefined);
  await renderMonitoring("notifications");
  await userEvent.click(await screen.findByRole("button", {
    name: "Tandai notifikasi 1 dibaca"
  }));
  await waitFor(() => expect(calls.filter(c => c.options.method === "GET" && c.url.endsWith(f.notification.id))).toHaveLength(2));
  expect(screen.queryByText("Live SMS")).not.toBeInTheDocument();
  const count = calls.length;
  await userEvent.click(screen.getByRole("button", {
    name: "Muat ulang notifikasi"
  }));
  await waitFor(() => expect(calls.length).toBeGreaterThan(count));
});
it("notification detail observer survives GC while read POST is deferred", async () => {
  let resolve!: (r: Response) => void;
  let client!: QueryClient;
  const calls = monitoringBackend(c => c.url.endsWith("/read") ? new Promise<Response>(r => {
    resolve = r;
  }) : undefined);
  function Probe() {
    client = useQueryClient();
    return null;
  }
  await renderMonitoring("notifications", f.plan.id, "TREATMENT", <Probe />);
  client.setQueryDefaults(["monitoring", f.actor.id, "notification"], {
    gcTime: 0
  });
  await userEvent.click(await screen.findByRole("button", {
    name: "Tandai notifikasi 1 dibaca"
  }));
  await waitFor(() => expect(resolve).toBeDefined());
  await waitFor(() => expect(client.getQueryCache().find({
    queryKey: ["monitoring", f.actor.id, "notification", f.notification.id]
  })?.getObserversCount()).toBe(1));
  await waitFor(() => expect(client.getQueryState(["monitoring", f.actor.id, "notification", f.notification.id])?.fetchStatus).toBe("idle"));
  const detailReadsBeforeResponse = calls.filter(c => c.options.method === "GET" && c.url.endsWith(f.notification.id)).length;
  vi.useFakeTimers();
  try {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300001);
    });
    expect(client.getQueryCache().find({
      queryKey: ["monitoring", f.actor.id, "notification", f.notification.id]
    })?.getObserversCount()).toBe(1);
    await act(async () => resolve(Response.json({
      ...f.notification,
      status: "READ"
    })));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(calls.filter(c => c.options.method === "GET" && c.url.endsWith(f.notification.id))).toHaveLength(detailReadsBeforeResponse + 1);
  } finally {
    vi.useRealTimers();
  }
});
it.each(["plan", "alert", "notification"] as const)("failed %s post-command detail refetch keeps further commands unavailable", async kind => {
  let wrote = false;
  const calls = monitoringBackend(c => c.options.method !== "GET" ? (wrote = true, Response.json(kind === "plan" ? f.plan : kind === "alert" ? f.alert : f.notification)) : wrote && c.url.endsWith(kind === "plan" ? f.plan.id : kind === "alert" ? f.alert.id : f.notification.id) ? failure(503, "NETWORK_UNAVAILABLE") : undefined);
  await renderMonitoring(kind === "alert" ? "alert" : kind === "notification" ? "notifications" : "plan", kind === "alert" ? f.alert.id : f.plan.id);
  if (kind === "plan") {
    await userEvent.click(await screen.findByRole("button", {
      name: "Ubah rencana"
    }));
    await userEvent.clear(screen.getByLabelText("Catatan rencana"));
    await userEvent.click(screen.getByRole("button", {
      name: "Simpan rencana"
    }));
    await waitFor(() => expect(screen.getByRole("button", {
      name: "Ubah rencana"
    })).toBeDisabled());
  } else {
    await userEvent.click(await screen.findByRole("button", {
      name: kind === "alert" ? "Akui peringatan" : "Tandai notifikasi 1 dibaca"
    }));
    await waitFor(() => expect(screen.getByRole("button", {
      name: kind === "alert" ? "Akui peringatan" : "Tandai notifikasi 1 dibaca"
    })).toBeDisabled());
  }
  expect(calls.filter(c => c.options.method !== "GET")).toHaveLength(1);
});
it("notifications perform no background polling and refresh is explicit", async () => {
  const calls = monitoringBackend();
  await renderMonitoring("notifications");
  await screen.findByRole("button", {
    name: "Tandai notifikasi 1 dibaca"
  });
  const count = calls.length;
  vi.useFakeTimers();
  try {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(calls).toHaveLength(count);
  } finally {
    vi.useRealTimers();
  }
  await userEvent.click(screen.getByRole("button", {
    name: "Muat ulang notifikasi"
  }));
  await waitFor(() => expect(calls.length).toBeGreaterThan(count));
});
it("notification list/detail do not refetch on focus or network reconnection", async () => {
  const calls = monitoringBackend();
  await renderMonitoring("notifications");
  await userEvent.click(await screen.findByRole("button", {
    name: "Tandai notifikasi 1 dibaca"
  }));
  await waitFor(() => expect(calls.filter(c => c.options.method === "GET" && c.url.endsWith(f.notification.id))).toHaveLength(2));
  await waitFor(() => expect(screen.getByRole("button", {
    name: "Muat ulang notifikasi"
  })).toBeEnabled());
  const count = calls.filter(c => c.url.includes("/me/notifications")).length;
  try {
    await act(async () => {
      focusManager.setFocused(false);
      onlineManager.setOnline(false);
      await Promise.resolve();
      onlineManager.setOnline(true);
      focusManager.setFocused(true);
      await Promise.resolve();
    });
    expect(calls.filter(c => c.url.includes("/me/notifications"))).toHaveLength(count);
  } finally {
    focusManager.setFocused(undefined);
    onlineManager.setOnline(true);
  }
});

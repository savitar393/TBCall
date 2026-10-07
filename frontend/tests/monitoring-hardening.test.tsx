import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import * as f from "./monitoring-fixtures";
import { monitoringBackend, renderMonitoring, tag, failure } from "./monitoring-harness";
it("manual review keeps edited due draft but refreshes pristine schedule and binds new tag", async () => {
  let wrote = false;
  const newSchedule = "2026-02-01T10:00:00+07:00";
  const calls = monitoringBackend(c => c.url.endsWith(`/monitoring-events/${f.event.id}`) ? c.options.method === "PATCH" ? (wrote = true, failure(409, "OPTIMISTIC_LOCK_CONFLICT")) : Response.json({
    ...f.event,
    scheduledAt: wrote ? newSchedule : f.event.scheduledAt
  }, {
    headers: {
      ETag: wrote ? '"review-event"' : '"draft-event"'
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
  await userEvent.click(screen.getByRole("button", {
    name: "Simpan jadwal"
  }));
  await screen.findByText("Data telah berubah");
  await userEvent.click(screen.getByRole("button", {
    name: "Saya sudah meninjau data terbaru"
  }));
  await waitFor(() => expect(new Date((screen.getByLabelText(/Jadwal kegiatan/) as HTMLInputElement).value).getTime()).toBe(new Date(newSchedule).getTime()));
  expect(screen.getByLabelText("Batas waktu kegiatan")).toHaveValue("");
  await userEvent.click(screen.getByRole("button", {
    name: "Simpan jadwal"
  }));
  await waitFor(() => expect(calls.filter(c => c.options.method === "PATCH")).toHaveLength(2));
  expect(calls.filter(c => c.options.method === "PATCH")[1].body).toEqual({
    dueAt: null
  });
  expect(tag(calls.filter(c => c.options.method === "PATCH")[1])).toBe('"review-event"');
});
it.each(["TREATMENT", "TPT"] as const)("%s alert target link requires separate target read and does not fetch identity/event", async type => {
  const permission = type === "TPT" ? "TPT_READ" : "TREATMENT_READ";
  const calls = monitoringBackend(c => c.url.endsWith(f.alert.id) ? Response.json({
    ...f.alert,
    targetType: type
  }, {
    headers: {
      ETag: '"alert"'
    }
  }) : undefined, {
    ...f.actor,
    permissions: f.actor.permissions.filter(p => p !== permission)
  });
  await renderMonitoring("alert", f.alert.id);
  await screen.findByRole("heading", {
    name: "Detail peringatan"
  });
  expect(screen.queryByRole("link", {
    name: "Buka target"
  })).not.toBeInTheDocument();
  expect(calls.some(c => c.url.includes("/patients") || c.url.includes("/monitoring-events/") || c.url.includes("/treatments/") || c.url.includes("/preventive-treatments/"))).toBe(false);
});
it("notification alert link requires independent ALERT_READ", async () => {
  monitoringBackend(undefined, {
    ...f.actor,
    permissions: ["NOTIFICATION_READ_SELF"]
  });
  await renderMonitoring("notifications");
  await screen.findByRole("button", {
    name: "Tandai notifikasi 1 dibaca"
  });
  expect(screen.queryByRole("link", {
    name: "Buka peringatan terkait"
  })).not.toBeInTheDocument();
});
it("history preserves backend newest-first ordering with differing offsets", async () => {
  const secondId = "30000000-0000-4000-8000-000000000090";
  monitoringBackend(c => c.url.includes("/monitoring-plans?") ? Response.json({
    ...f.page(f.plan),
    content: [{
      ...f.plan,
      createdAt: "2026-01-01T01:00:00Z"
    }, {
      ...f.plan,
      id: secondId,
      createdAt: "2026-01-01T07:00:00+07:00"
    }],
    totalElements: 2
  }) : undefined);
  await renderMonitoring("target", f.treatment.id);
  const links = within(await screen.findByRole("region", {
    name: "Riwayat rencana"
  })).getAllByRole("link", {
    name: "Buka rencana"
  });
  expect(links[0]).toHaveAttribute("href", `/monitoring-plans/${f.plan.id}`);
  expect(links[1]).toHaveAttribute("href", `/monitoring-plans/${secondId}`);
});
it("failed availability scan keeps history readable and offers safe retry", async () => {
  let historyReads = 0;
  monitoringBackend(c => c.url.includes("/monitoring-plans?") ? ++historyReads === 1 ? Response.json(f.page({
    ...f.plan,
    status: "CANCELLED"
  })) : failure(503, "NETWORK_UNAVAILABLE") : undefined);
  await renderMonitoring("target", f.treatment.id);
  await screen.findByRole("heading", {
    name: "Riwayat rencana"
  });
  await screen.findAllByText("Layanan belum tersedia");
  expect(screen.getByRole("button", {
    name: "Coba kembali"
  })).toBeInTheDocument();
  expect(screen.queryByRole("button", {
    name: "Buat rencana pemantauan"
  })).not.toBeInTheDocument();
  expect(screen.queryByText("never display clinical prose")).not.toBeInTheDocument();
});
it("reader of empty active history is not told an active plan exists", async () => {
  monitoringBackend(c => c.url.includes("/monitoring-plans?") ? Response.json({
    ...f.page(f.plan),
    content: [],
    totalElements: 0
  }) : undefined, {
    ...f.actor,
    permissions: ["MONITORING_READ", "TREATMENT_READ"]
  });
  await renderMonitoring("target", f.treatment.id);
  await screen.findByText("Belum ada rencana.");
  expect(screen.queryByText(/Rencana aktif baru belum dapat dibuat/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Memeriksa riwayat/)).not.toBeInTheDocument();
});
it("reference failures retry explicitly while successful mutation preserves reference cache", async () => {
  let failed = true;
  const calls = monitoringBackend(c => c.url.endsWith("/monitoring-reference-data") && failed ? failure(503, "NETWORK_UNAVAILABLE") : undefined);
  await renderMonitoring("plan");
  await screen.findAllByText("Layanan belum tersedia");
  failed = false;
  await userEvent.click(screen.getByRole("button", {
    name: "Coba kembali"
  }));
  await waitFor(() => expect(screen.queryByRole("button", {
    name: "Coba kembali"
  })).not.toBeInTheDocument());
  const count = calls.filter(c => c.url.endsWith("/monitoring-reference-data")).length;
  await userEvent.click(screen.getByRole("button", {
    name: "Ubah rencana"
  }));
  await userEvent.clear(screen.getByLabelText("Catatan rencana"));
  await userEvent.click(screen.getByRole("button", {
    name: "Simpan rencana"
  }));
  await waitFor(() => expect(screen.queryByRole("button", {
    name: "Simpan rencana"
  })).not.toBeInTheDocument());
  expect(calls.filter(c => c.url.endsWith("/monitoring-reference-data"))).toHaveLength(count);
});
it("plan has no pause/resume/complete and alert has no dismiss commands", async () => {
  monitoringBackend();
  await renderMonitoring("plan");
  await screen.findByRole("heading", {
    name: "Rencana pemantauan"
  });
  for (const name of [/jeda/i, /lanjutkan rencana/i, /selesaikan rencana/i, /dismiss/i]) expect(screen.queryByRole("button", {
    name
  })).not.toBeInTheDocument();
});

import { screen, within, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { treatmentBackend, renderTreatment } from "./treatment-harness";
import { continuityBackend, renderContinuity } from "./continuity-harness";
import { routing } from "./monitoring-harness";
vi.mock("next/navigation", () => ({
  useRouter: () => routing,
  usePathname: () => "/monitoring-plans"
}));
import { monitoringBackend, renderMonitoring } from "./monitoring-harness";
import * as f from "./monitoring-fixtures";
it("staff navigation has independent alerts and notifications links, no global monitoring", async () => {
  monitoringBackend();
  await renderMonitoring("plan");
  await screen.findByRole("heading", {
    name: "Rencana pemantauan"
  });
  const nav = screen.getByRole("navigation", {
    name: "Navigasi utama desktop"
  });
  expect(within(nav).getByRole("link", {
    name: "Peringatan"
  })).toHaveAttribute("href", "/alerts");
  expect(within(nav).getByRole("link", {
    name: "Notifikasi"
  })).toHaveAttribute("href", "/notifications");
  expect(within(nav).queryByRole("link", {
    name: "Pemantauan"
  })).not.toBeInTheDocument();
});
it.each(["PATIENT", "TREATMENT_SUPPORTER"])("%s with artificial permissions cannot enter any staff monitoring screen", async code => {
  monitoringBackend(undefined, {
    ...f.actor,
    roles: [{
      code,
      name: code
    }]
  });
  await renderMonitoring("notifications");
  await screen.findByRole("heading", {
    name: "Akses tidak diizinkan"
  });
  expect(screen.queryByRole("link", {
    name: "Notifikasi"
  })).not.toBeInTheDocument();
});
it.each(["MONITORING_READ", "TREATMENT_READ"])("target route requires independent %s", async permission => {
  const calls = monitoringBackend(undefined, {
    ...f.actor,
    permissions: f.actor.permissions.filter(p => p !== permission)
  });
  await renderMonitoring("target", f.treatment.id);
  await screen.findByRole("heading", {
    name: "Akses tidak diizinkan"
  });
  expect(calls.some(c => c.url.includes("monitoring-reference"))).toBe(false);
});
it("monitoring reader sees plan without inferred manage or target link", async () => {
  monitoringBackend(undefined, {
    ...f.actor,
    permissions: ["MONITORING_READ"]
  });
  await renderMonitoring("plan");
  await screen.findByRole("heading", {
    name: "Rencana pemantauan"
  });
  expect(screen.queryByRole("button", {
    name: "Ubah rencana"
  })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", {
    name: "Buka target"
  })).not.toBeInTheDocument();
});
it.each(["ALERT_ACKNOWLEDGE", "ALERT_RESOLVE"])("missing %s independently hides action", async permission => {
  monitoringBackend(undefined, {
    ...f.actor,
    permissions: f.actor.permissions.filter(p => p !== permission)
  });
  await renderMonitoring("alert", f.alert.id);
  await screen.findByRole("heading", {
    name: "Detail peringatan"
  });
  expect(screen.queryByRole("button", {
    name: permission === "ALERT_ACKNOWLEDGE" ? "Akui peringatan" : "Selesaikan peringatan"
  })).not.toBeInTheDocument();
});
const routeCases = [{
  file: "treatments/[treatmentId]/monitoring",
  params: {
    treatmentId: f.treatment.id
  },
  permission: "MONITORING_READ"
}, {
  file: "preventive-treatments/[tptId]/monitoring",
  params: {
    tptId: f.tpt.id
  },
  permission: "MONITORING_READ"
}, {
  file: "monitoring-plans/[planId]",
  params: {
    planId: f.plan.id
  },
  permission: "MONITORING_READ"
}, {
  file: "alerts",
  params: {},
  permission: "ALERT_READ"
}, {
  file: "alerts/[alertId]",
  params: {
    alertId: f.alert.id
  },
  permission: "ALERT_READ"
}, {
  file: "notifications",
  params: {},
  permission: "NOTIFICATION_READ_SELF"
}];
const pages = import.meta.glob("../app/**/page.tsx");
it.each(routeCases.flatMap(route => ["PATIENT", "TREATMENT_SUPPORTER"].map(role => ({
  ...route,
  role
}))))("actual $file route denies artificial permissions to $role", async ({
  file,
  params,
  role
}) => {
  const calls = monitoringBackend(undefined, {
    ...f.actor,
    roles: [{
      code: role,
      name: role
    }]
  });
  const Page = ((await pages[`../app/${file}/page.tsx`]()) as {
    default: (p: {
      params: Promise<Record<string, string>>;
    }) => Promise<React.ReactNode>;
  }).default;
  render(<AppProviders>{await Page({
      params: Promise.resolve(params as Record<string, string>)
    })}</AppProviders>);
  await screen.findByRole("heading", {
    name: "Akses tidak diizinkan"
  });
  expect(calls).toHaveLength(1);
});
it.each(routeCases)("actual $file requires independent $permission", async ({
  file,
  params,
  permission
}) => {
  const calls = monitoringBackend(undefined, {
    ...f.actor,
    permissions: f.actor.permissions.filter(p => p !== permission)
  });
  const Page = ((await pages[`../app/${file}/page.tsx`]()) as {
    default: (p: {
      params: Promise<Record<string, string>>;
    }) => Promise<React.ReactNode>;
  }).default;
  render(<AppProviders>{await Page({
      params: Promise.resolve(params as Record<string, string>)
    })}</AppProviders>);
  await screen.findByRole("heading", {
    name: "Akses tidak diizinkan"
  });
  expect(calls).toHaveLength(1);
});
it.each(["TREATMENT", "TPT"] as const)("existing %s contextual link requires officer plus MONITORING_READ and target read", async target => {
  const {
    cleanup
  } = await import("@testing-library/react");
  for (const variation of ["all", "no-monitoring", "wrong-role"]) {
    cleanup();
    const actor = {
      ...f.actor,
      permissions: variation === "no-monitoring" ? f.actor.permissions.filter(p => p !== "MONITORING_READ") : f.actor.permissions,
      roles: variation === "wrong-role" ? [{
        code: "PATIENT",
        name: "Patient"
      }] : f.actor.roles
    };
    if (target === "TREATMENT") {
      treatmentBackend(undefined, actor);
      await renderTreatment("detail", f.treatment.id);
    } else {
      continuityBackend(undefined, actor);
      await renderContinuity("tpt", f.tpt.id);
    }
    if (variation === "wrong-role") {
      await screen.findByRole("heading", {
        name: "Akses tidak diizinkan"
      });
    } else {
      await screen.findByRole("heading", {
        name: target === "TREATMENT" ? "Detail pengobatan" : "Detail TPT"
      });
    }
    const link = screen.queryByRole("link", {
      name: "Pemantauan"
    });
    expect(!!link).toBe(variation === "all");
    if (link) expect(link).toHaveAttribute("href", `/${target === "TREATMENT" ? "treatments" : "preventive-treatments"}/${target === "TREATMENT" ? f.treatment.id : f.tpt.id}/monitoring`);
  }
});
it.each(["TREATMENT", "TPT"] as const)("existing %s source route without target read exposes no monitoring link", async target => {
  const actor = {
    ...f.actor,
    permissions: f.actor.permissions.filter(p => p !== (target === "TREATMENT" ? "TREATMENT_READ" : "TPT_READ"))
  };
  if (target === "TREATMENT") {
    treatmentBackend(undefined, actor);
    await renderTreatment("detail", f.treatment.id);
  } else {
    continuityBackend(undefined, actor);
    await renderContinuity("tpt", f.tpt.id);
  }
  await screen.findByRole("heading", {
    name: "Akses tidak diizinkan"
  });
  expect(screen.queryByRole("link", {
    name: "Pemantauan"
  })).not.toBeInTheDocument();
});
it.each(["ALERT_READ", "NOTIFICATION_READ_SELF"])("staff nav requires independent %s", async permission => {
  monitoringBackend(undefined, {
    ...f.actor,
    permissions: f.actor.permissions.filter(p => p !== permission)
  });
  await renderMonitoring("plan");
  await screen.findByRole("heading", {
    name: "Rencana pemantauan"
  });
  expect(within(screen.getByRole("navigation", {
    name: "Navigasi utama desktop"
  })).queryByRole("link", {
    name: permission === "ALERT_READ" ? "Peringatan" : "Notifikasi"
  })).not.toBeInTheDocument();
});
it.each(["MONITORING_MANAGE", "ALERT_ACKNOWLEDGE", "ALERT_RESOLVE"])("write-only %s does not grant staff read route", async permission => {
  const calls = monitoringBackend(undefined, {
    ...f.actor,
    permissions: [permission]
  });
  await renderMonitoring(permission === "MONITORING_MANAGE" ? "plan" : "alert", permission === "MONITORING_MANAGE" ? f.plan.id : f.alert.id);
  await screen.findByRole("heading", {
    name: "Akses tidak diizinkan"
  });
  expect(calls).toHaveLength(1);
});

import { act, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { useSession } from "@/lib/auth/session";
import * as f from "./monitoring-fixtures";
import { monitoringBackend, renderMonitoring, routing, failure } from "./monitoring-harness";
vi.mock("next/navigation", () => ({
  useRouter: () => routing,
  usePathname: () => "/alerts"
}));
it.each([false, true])("late old-account monitoring GET (error=%s) cannot enter new screen/cache", async fails => {
  let changed = false;
  let resolve!: (r: Response) => void;
  let signal: AbortSignal | undefined;
  let client!: QueryClient;
  monitoringBackend(c => c.url.endsWith("/me") ? Response.json(changed ? {
    ...f.actor,
    id: "new-account"
  } : f.actor) : c.url.endsWith(`/monitoring-plans/${f.plan.id}`) ? changed ? Response.json({
    ...f.plan,
    notes: "New account notes"
  }, {
    headers: {
      ETag: '"new"'
    }
  }) : (signal = c.options.signal as AbortSignal, new Promise<Response>(r => {
    resolve = r;
  })) : undefined);
  function Switch() {
    const session = useSession();
    client = useQueryClient();
    return <button onClick={() => {
      changed = true;
      void session.refresh();
    }}>Ganti akun</button>;
  }
  await renderMonitoring("plan", f.plan.id, "TREATMENT", <Switch />);
  await waitFor(() => expect(resolve).toBeDefined());
  await userEvent.click(screen.getByText("Ganti akun"));
  await screen.findByText("New account notes");
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    resolve(fails ? failure(401, "AUTHENTICATION_REQUIRED") : Response.json(f.plan));
    await Promise.resolve();
  });
  expect(screen.getByText("New account notes")).toBeInTheDocument();
  expect(client.getQueryCache().findAll({
    queryKey: ["monitoring", f.actor.id]
  })).toHaveLength(0);
});
it.each(["alert", "notifications"] as const)("late old-account %s command suppresses success/error/refetch/navigation", async name => {
  for (const fails of [false, true]) {
    const {
      cleanup
    } = await import("@testing-library/react");
    cleanup();
    let changed = false;
    let resolve!: (r: Response) => void;
    let signal: AbortSignal | undefined;
    let client!: QueryClient;
    const calls = monitoringBackend(c => c.url.endsWith("/me") ? Response.json(changed ? {
      ...f.actor,
      id: "new-account"
    } : f.actor) : c.options.method === "POST" ? (signal = c.options.signal as AbortSignal, new Promise<Response>(r => {
      resolve = r;
    })) : undefined);
    function Switch() {
      const session = useSession();
      client = useQueryClient();
      return <button onClick={() => {
        changed = true;
        void session.refresh().then(() => client.setQueryData(["monitoring", "new-account", "sentinel"], "new-safe-data"));
      }}>Ganti akun</button>;
    }
    await renderMonitoring(name, name === "alert" ? f.alert.id : f.plan.id, "TREATMENT", <Switch />);
    await userEvent.click(await screen.findByRole("button", {
      name: name === "alert" ? "Akui peringatan" : "Tandai notifikasi 1 dibaca"
    }));
    await waitFor(() => expect(resolve).toBeDefined());
    fireEvent.click(screen.getByText("Ganti akun"));
    await waitFor(() => expect(signal?.aborted).toBe(true));
    await screen.findByRole("button", {
      name: name === "alert" ? "Akui peringatan" : "Tandai notifikasi 1 dibaca"
    });
    const count = calls.length;
    routing.push.mockClear();
    routing.replace.mockClear();
    await act(async () => {
      resolve(fails ? failure(401, "AUTHENTICATION_REQUIRED") : Response.json(name === "alert" ? f.alert : f.notification));
      await Promise.resolve();
    });
    expect(calls).toHaveLength(count);
    expect(client.getQueryData(["monitoring", "new-account", "sentinel"])).toBe("new-safe-data");
    expect(routing.push).not.toHaveBeenCalled();
    expect(routing.replace).not.toHaveBeenCalled();
    expect(client.getMutationCache().getAll()).toHaveLength(0);
  }
});
it("same account grant change aborts mounted monitoring form and clears draft", async () => {
  let changed = false;
  let resolve!: (r: Response) => void;
  let signal: AbortSignal | undefined;
  monitoringBackend(c => c.url.endsWith("/me") ? Response.json(changed ? {
    ...f.actor,
    permissions: ["MONITORING_READ"]
  } : f.actor) : c.options.method === "PATCH" ? (signal = c.options.signal as AbortSignal, new Promise<Response>(r => {
    resolve = r;
  })) : undefined);
  function Refresh() {
    const s = useSession();
    return <button onClick={() => {
      changed = true;
      void s.refresh();
    }}>Actualiser</button>;
  }
  await renderMonitoring("plan", f.plan.id, "TREATMENT", <Refresh />);
  await userEvent.click(await screen.findByRole("button", {
    name: "Ubah rencana"
  }));
  await userEvent.type(screen.getByLabelText("Catatan rencana"), " old secret");
  await userEvent.click(screen.getByRole("button", {
    name: "Simpan rencana"
  }));
  await waitFor(() => expect(resolve).toBeDefined());
  await userEvent.click(screen.getByText("Actualiser"));
  await waitFor(() => expect(signal?.aborted).toBe(true));
  expect(screen.queryByLabelText("Catatan rencana")).not.toBeInTheDocument();
  await act(async () => resolve(Response.json(f.plan)));
});
it.each([false, true])("changing plan route aborts pending edit and protects next context (error=%s)", async fails => {
  const nextId = "30000000-0000-4000-8000-000000000099";
  let resolve!: (r: Response) => void;
  let signal: AbortSignal | undefined;
  const calls = monitoringBackend(c => c.url.endsWith(`/monitoring-plans/${nextId}`) ? Response.json({
    ...f.plan,
    id: nextId,
    notes: "Next plan notes"
  }, {
    headers: {
      ETag: '"next"'
    }
  }) : c.options.method === "PATCH" ? (signal = c.options.signal as AbortSignal, new Promise<Response>(r => {
    resolve = r;
  })) : undefined);
  const {
    default: Page
  } = await import("@/app/monitoring-plans/[planId]/page");
  const {
    AppProviders
  } = await import("@/app/providers");
  const {
    render
  } = await import("@testing-library/react");
  const view = render(<AppProviders>{await Page({
      params: Promise.resolve({
        planId: f.plan.id
      })
    })}</AppProviders>);
  await userEvent.click(await screen.findByRole("button", {
    name: "Ubah rencana"
  }));
  await userEvent.type(screen.getByLabelText("Catatan rencana"), " old draft");
  await userEvent.click(screen.getByRole("button", {
    name: "Simpan rencana"
  }));
  await waitFor(() => expect(resolve).toBeDefined());
  view.rerender(<AppProviders>{await Page({
      params: Promise.resolve({
        planId: nextId
      })
    })}</AppProviders>);
  await screen.findByText("Next plan notes");
  expect(signal?.aborted).toBe(true);
  const count = calls.length;
  await act(async () => resolve(fails ? failure(401, "AUTHENTICATION_REQUIRED") : Response.json(f.plan)));
  expect(calls).toHaveLength(count);
  expect(screen.queryByLabelText("Catatan rencana")).not.toBeInTheDocument();
});
it("monitoring clinical state never enters storage/log/history/metadata/chrome", async () => {
  const storage = vi.spyOn(Storage.prototype, "setItem");
  const indexed = vi.fn();
  vi.stubGlobal("indexedDB", {
    open: indexed
  });
  const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
  const push = vi.spyOn(history, "pushState");
  const replace = vi.spyOn(history, "replaceState");
  const title = document.title;
  monitoringBackend(c => c.options.method === "PATCH" ? failure(409, "SOURCE_AUTHORITY_CONFLICT") : undefined);
  await renderMonitoring("plan");
  await userEvent.click(await screen.findByRole("button", {
    name: "Ubah rencana"
  }));
  await userEvent.type(screen.getByLabelText("Catatan rencana"), " sensitive draft");
  await userEvent.click(screen.getByRole("button", {
    name: "Simpan rencana"
  }));
  await screen.findByText("Data dikendalikan sumber eksternal");
  expect(storage).not.toHaveBeenCalled();
  expect(indexed).not.toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  for (const log of logs) expect(log).not.toHaveBeenCalled();
  expect(document.title).toBe(title);
  expect(screen.getByRole("navigation", {
    name: "Navigasi utama desktop"
  })).not.toHaveTextContent("Private plan notes");
});

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { backend, renderLinking, tagged, failure } from "./account-linking-harness";
import * as f from "./account-linking-fixtures";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/cases" }));

it("a single supporter roster has no pager and inline creation returns keyboard focus", async () => {
  const { calls } = backend(); await renderLinking("supporter");
  await screen.findByRole("button", { name: "Buka pendamping Pendamping Contoh" });
  expect(screen.queryByRole("button", { name: "Halaman berikutnya" })).not.toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "Tambah pendamping" });
  await userEvent.click(trigger);
  const editor = screen.getByRole("region", { name: "Buat pendamping" });
  expect(editor).toHaveFocus();
  await userEvent.click(screen.getByRole("button", { name: "Batal buat pendamping" }));
  expect(trigger).toHaveFocus();
  expect(calls.every(c => c.options.method === "GET")).toBe(true);
});

it.each([[500, "INTERNAL_ERROR"], [409, "SOURCE_AUTHORITY_CONFLICT"]])("cancel after a refused create (%s) returns focus to roster reload when Add is disabled", async (status, code) => {
  const { calls } = backend(f.actor, c => c.options.method === "POST" ? failure(status, code) : undefined);
  await renderLinking("supporter");
  await userEvent.click(await screen.findByRole("button", { name: "Tambah pendamping" }));
  await userEvent.type(screen.getByLabelText("Nama pendamping"), "Pendamping Sintetis");
  await userEvent.click(screen.getByRole("button", { name: "Simpan pendamping" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Batal buat pendamping" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "Batal buat pendamping" }));
  expect(screen.getByRole("button", { name: "Tambah pendamping" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Muat ulang daftar pendamping" })).toHaveFocus();
  expect(calls.filter(c => c.options.method === "POST")).toHaveLength(1);
});

it("a later empty supporter page retains its previous-page action when the total shrinks", async () => {
  backend(f.actor, c => {
    if (!c.url.split("?")[0].endsWith("/supporters")) return;
    const page = Number(new URL(c.url, "http://localhost").searchParams.get("page"));
    return Response.json(page === 0 ? { ...f.page, totalElements: 21 } : { content: [], page: 1, size: 20, totalElements: 0 });
  });
  await renderLinking("supporter");
  await userEvent.click(await screen.findByRole("button", { name: "Halaman berikutnya" }));
  await screen.findByText("Belum ada pendamping dalam halaman ini.");
  expect(screen.getByRole("button", { name: "Halaman sebelumnya" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "Halaman sebelumnya" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Buka pendamping Pendamping Contoh" })).toBeVisible());
});

it("successful creation restores focus only after the delayed roster refresh enables the trigger", async () => {
  let created = false;
  let finishRefresh!: (response: Response) => void;
  const refreshed = new Promise<Response>(resolve => { finishRefresh = resolve; });
  const { calls } = backend(f.actor, c => {
    if (!c.url.split("?")[0].endsWith("/supporters")) return;
    if (c.options.method === "POST") { created = true; return tagged(f.detail); }
    if (created) return refreshed;
  });
  await renderLinking("supporter");
  const trigger = await screen.findByRole("button", { name: "Tambah pendamping" });
  await userEvent.click(trigger);
  await userEvent.type(screen.getByLabelText("Nama pendamping"), "Pendamping Sintetis");
  await userEvent.click(screen.getByRole("button", { name: "Simpan pendamping" }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "Buat pendamping" })).not.toBeInTheDocument());
  expect(trigger).toBeDisabled();
  finishRefresh(Response.json(f.page));
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(trigger).toBeEnabled();
  expect(calls.filter(c => c.options.method === "POST")).toHaveLength(1);
});

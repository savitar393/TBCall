import { act, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useSession, ME_QUERY_KEY } from "@/lib/auth/session";
import { usePortalCommand } from "@/features/portal/use-command";
import { portalApi } from "@/features/portal/api";
import { AppProviders } from "@/app/providers";
import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { portalBackend, renderPortal, routing, failure } from "./portal-harness";
import * as f from "./portal-fixtures";
import type { Me } from "@/lib/auth/types";
vi.mock("next/navigation", () => ({ useRouter: () => routing, usePathname: () => "/portal" }));
it("old handler cannot start a dose POST after Me cache changes before its observer rerenders",async()=>{
  const calls=portalBackend();let client!:QueryClient,oldRun!:ReturnType<typeof usePortalCommand>["run"];
  function Probe(){const session=useSession();client=useQueryClient();const command=usePortalCommand();if(session.user)oldRun=command.run;return <p>{session.user?"Ready":"Loading"}</p>;}
  render(<AppProviders><Probe/></AppProviders>);await screen.findByText("Ready");
  const invoke=oldRun;await act(async()=>{client.setQueryData(ME_QUERY_KEY,{...f.patient,patientLink:{...f.patient.patientLink!,patientId:f.caseId}});await invoke(signal=>portalApi.recordDose({kind:"patient"},{scheduledDate:f.date,status:"MISSED"},signal));});
  expect(calls.some(c=>c.options.method==="POST")).toBe(false);
});
it.each([false, true])("old-account patient query (error=%s) is aborted and cannot enter new cache or navigate", async (fails) => {
    let changed = false, resolve!: (r: Response) => void, signal: AbortSignal | undefined, client!: QueryClient;
    portalBackend(f.patient, c => c.url.endsWith("/me") ? Response.json(changed ? { ...f.patient, id: "new-account" } : f.patient) : c.url.endsWith("/me/patient") ? changed ? Response.json({ ...f.selfPatient, fullName: "Nama akun baru" }) : (signal = c.options.signal as AbortSignal, new Promise<Response>(r => resolve = r)) : undefined);
    function Switch() { const session = useSession(); client = useQueryClient(); return <button onClick={() => { changed = true; void session.refresh(); }}>Ganti konteks</button>; }
    await renderPortal("home", <Switch />);
    await waitFor(() => expect(resolve).toBeDefined());
    await userEvent.click(screen.getByText("Ganti konteks"));
    await screen.findByText("Nama akun baru");
    expect(signal?.aborted).toBe(true);
    routing.replace.mockClear();
    await act(async () => { resolve(fails ? failure(401, "AUTHENTICATION_REQUIRED") : Response.json(f.selfPatient)); await Promise.resolve(); });
    expect(screen.queryByText("Nama pasien privat")).not.toBeInTheDocument();
    expect(client.getQueryCache().findAll({ queryKey: ["portal", f.patient.id] })).toHaveLength(0);
    expect(routing.replace).not.toHaveBeenCalled();
});
const scenarios = ["account", "role", "patientLink", "supporterCaseIds"] as const;
it.each(scenarios.flatMap(context => [false, true].map(fails => [context, fails] as const)))("%s context change aborts dose command and suppresses late error=%s", async (context, fails) => {
    const actor = context === "supporterCaseIds" ? f.supporter : f.patient;
    let changed = false, resolve!: (r: Response) => void, signal: AbortSignal | undefined, client!: QueryClient;
    const next: Me = { ...actor, ...(context === "account" ? { id: "new-account" } : context === "role" ? { roles: [] } : context === "patientLink" ? { patientLink: null } : { supporterCaseIds: [] }) };
    const calls = portalBackend(actor, c => c.url.endsWith("/me") ? Response.json(changed ? next : actor) : c.options.method === "POST" ? (signal = c.options.signal as AbortSignal, new Promise<Response>(r => resolve = r)) : undefined);
    function Switch() { const session = useSession(); client = useQueryClient(); return <button onClick={() => { changed = true; void session.refresh().then(() => client.setQueryData(["portal", next.id, "sentinel"], "new-context")); }}>Ganti konteks</button>; }
    await renderPortal(context === "supporterCaseIds" ? "case" : "treatment", <Switch />);
    await screen.findByLabelText("Status laporan");
    fireEvent.change(screen.getByLabelText("Tanggal dosis"), { target: { value: f.date } });
    await userEvent.selectOptions(screen.getByLabelText("Status laporan"), "MISSED");
    await userEvent.type(screen.getByLabelText("Catatan dosis"), "Draf lama");
    await userEvent.click(screen.getByRole("button", { name: "Simpan laporan dosis" }));
    await waitFor(() => expect(resolve).toBeDefined());
    await userEvent.click(screen.getByText("Ganti konteks"));
    await waitFor(() => expect(signal?.aborted).toBe(true));
    await waitFor(() => expect(client.getQueryData(["portal", next.id, "sentinel"])).toBe("new-context"));
    const count = calls.length;
    routing.replace.mockClear();
    routing.push.mockClear();
    await act(async () => { resolve(fails ? failure(401, "AUTHENTICATION_REQUIRED") : Response.json(f.dose)); await Promise.resolve(); });
    expect(calls).toHaveLength(count);
    expect(screen.queryByText("Laporan dosis tersimpan.")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Draf lama")).not.toBeInTheDocument();
    expect(routing.replace).not.toHaveBeenCalled();
    expect(routing.push).not.toHaveBeenCalled();
    expect(client.getQueryData(["portal", next.id, "sentinel"])).toBe("new-context");
    expect(client.getMutationCache().getAll()).toHaveLength(0);
});
it.each(["account", "permission", "role"] as const)("notification detail GET aborted on %s change cannot issue read POST", async (context) => {
    let changed = false, resolve!: (r: Response) => void, signal: AbortSignal | undefined;
    const next = { ...f.patient, ...(context === "account" ? { id: "new-account" } : context === "permission" ? { permissions: [] } : { roles: [] }) };
    const calls = portalBackend(f.patient, c => c.url.endsWith("/me") ? Response.json(changed ? next : f.patient) : c.url.endsWith(`/notifications/${f.id}`) ? (signal = c.options.signal as AbortSignal, new Promise<Response>(r => resolve = r)) : undefined);
    function Switch() { const session = useSession(); return <button onClick={() => { changed = true; void session.refresh(); }}>Ganti konteks</button>; }
    await renderPortal("notifications", <Switch />);
    await userEvent.click(await screen.findByRole("button", { name: "Tandai notifikasi 1 dibaca" }));
    await waitFor(() => expect(resolve).toBeDefined());
    await userEvent.click(screen.getByText("Ganti konteks"));
    await waitFor(() => expect(signal?.aborted).toBe(true));
    const count = calls.length;
    await act(async () => { resolve(Response.json(f.notification, { headers: { ETag: '"late"' } })); await Promise.resolve(); });
    expect(calls).toHaveLength(count);
    expect(calls.some(c => c.options.method === "POST")).toBe(false);
});
it.each([false, true])("same-user patient link replacement aborts old query (error=%s)", async (fails) => {
    let changed = false, resolve!: (r: Response) => void, signal: AbortSignal | undefined;
    portalBackend(f.patient, c => c.url.endsWith("/me") ? Response.json({ ...f.patient, patientLink: changed ? { ...f.patient.patientLink!, patientId: f.caseId } : f.patient.patientLink }) : c.url.endsWith("/me/patient") ? changed ? Response.json({ ...f.selfPatient, patientId: f.caseId, fullName: "Profil tautan baru" }) : (signal = c.options.signal as AbortSignal, new Promise<Response>(r => resolve = r)) : undefined);
    function Switch() { const session = useSession(); return <button onClick={() => { changed = true; void session.refresh(); }}>Ganti konteks</button>; }
    await renderPortal("home", <Switch />);
    await waitFor(() => expect(resolve).toBeDefined());
    await userEvent.click(screen.getByText("Ganti konteks"));
    await screen.findByText("Profil tautan baru");
    expect(signal?.aborted).toBe(true);
    routing.replace.mockClear();
    await act(async () => { resolve(fails ? failure(403, "AUTHORIZATION_DENIED") : Response.json(f.selfPatient)); await Promise.resolve(); });
    expect(screen.queryByText("Nama pasien privat")).not.toBeInTheDocument();
    expect(routing.replace).not.toHaveBeenCalled();
});

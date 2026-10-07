import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { useSession } from "@/lib/auth/session";
import { clinicalQueries } from "@/features/clinical-intake/queries";
import { ids, officer, patientPage, patientDetail, registration, diagnosis, caseView, references, facilityPage } from "./clinical-fixtures";
const filters = { page: 0, size: 20, name: "", nik: "", bpjs: "", registrationStatus: "", caseStatus: "", facilityId: "" };
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/patients" }));
const transport = vi.fn<typeof fetch>();
beforeEach(() => { vi.stubGlobal("fetch", transport); transport.mockReset(); });
it("cancels late old-account clinical GET before publishing a different /me and never caches/renders it for the new account", async () => {
  let switched = false;
  let resolveOld!: (value: Response) => void;
  let client!: QueryClient;
  let oldSignal: AbortSignal | undefined;
  transport.mockImplementation(async (url, options) => {
    if (String(url).endsWith("/me")) return Response.json(switched ? { ...officer, id: "new-account" } : officer);
    if (!switched) { oldSignal = options?.signal as AbortSignal; return new Promise<Response>(resolve => { resolveOld = resolve; }); }
    return Response.json({ ...patientPage, content: [{ ...patientPage.content[0], fullName: "Pasien akun baru" }] });
  });
  function Probe() {
    const session = useSession(); client = useQueryClient();
    const query = useQuery({ ...clinicalQueries.patients(session.user?.id ?? "none", filters), enabled: !!session.user });
    return <><span>{session.user?.id}</span><p>{query.data?.data.content[0]?.fullName}</p><button onClick={() => void session.refresh()}>Ganti akun</button></>;
  }
  render(<AppProviders><Probe /></AppProviders>);
  await waitFor(() => expect(resolveOld).toBeDefined());
  switched = true;
  await userEvent.click(screen.getByText("Ganti akun"));
  await screen.findByText("Pasien akun baru");
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => { resolveOld(Response.json(patientPage)); await Promise.resolve(); });
  expect(screen.queryByText("Pasien Contoh")).not.toBeInTheDocument();
  expect(client.getQueryData(["clinical", "new-account", "patients", filters])).toMatchObject({ data: { content: [{ fullName: "Pasien akun baru" }] } });
  expect(client.getQueryCache().findAll({ queryKey: ["clinical", officer.id] })).toHaveLength(0);
});
it.each([
  ["patients", patientPage], ["patient", patientDetail], ["registration", registration], ["diagnoses", [diagnosis]],
  ["diagnosis", diagnosis], ["tbCase", caseView], ["references", references], ["facilities", facilityPage],
] as const)("%s query key belongs to the current user and consumes an abort signal", async (name, fixture) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  transport.mockResolvedValue(Response.json(fixture));
  const options = {
    patients: clinicalQueries.patients(officer.id, filters), patient: clinicalQueries.patient(officer.id, ids.patient),
    registration: clinicalQueries.registration(officer.id, ids.registration), diagnoses: clinicalQueries.diagnoses(officer.id, ids.registration),
    diagnosis: clinicalQueries.diagnosis(officer.id, ids.diagnosis), tbCase: clinicalQueries.tbCase(officer.id, ids.tbCase),
    references: clinicalQueries.references(officer.id), facilities: clinicalQueries.facilities(officer.id, "rumah", 0),
  }[name];
  expect(options.queryKey.slice(0, 2)).toEqual(["clinical", officer.id]);
  await client.fetchQuery(options as ReturnType<typeof clinicalQueries.references>);
  expect(transport.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  client.clear();
});

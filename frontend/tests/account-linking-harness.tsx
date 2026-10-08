import { render, screen, fireEvent } from "@testing-library/react";
import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { AppProviders } from "@/app/providers";
import type { Me } from "@/lib/auth/types";
import { expect, vi } from "vitest";
import * as f from "./account-linking-fixtures";
export type Call = {
    url: string;
    options: RequestInit;
    body: Record<string, unknown> | null;
};
export const failure = (status: number, code = "OPTIMISTIC_LOCK_CONFLICT") => Response.json({ status, code, title: "PRIVATE RAW TITLE", detail: "PRIVATE RAW DETAIL" }, { status, headers: { "Content-Type": "application/problem+json" } });
export const tagged = (value: unknown, tag = '"31"') => Response.json(value, { headers: { ETag: tag } });
export function backend(actor: Me = f.actor, override?: (call: Call) => Response | Promise<Response> | undefined) {
    const calls: Call[] = [];
    const state: {
        actor: Me;
        patient: typeof f.patientState | null;
        supporter: Omit<typeof f.detail, "linkedUser"> & {
            linkedUser: null | {
                userId: string;
                maskedEmail: string | null;
                maskedPhone: string | null;
            };
        };
        page: typeof f.page;
    } = { actor, patient: null, supporter: structuredClone(f.detail), page: structuredClone(f.page) };
    document.cookie = "XSRF-TOKEN=fixture; Path=/";
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (url, options = {}) => {
        const call = { url: String(url), options, body: typeof options.body === "string" ? JSON.parse(options.body) : null };
        calls.push(call);
        const custom = override?.(call);
        if (custom)
            return custom;
        const path = call.url.split("?")[0], method = options.method ?? "GET";
        if (path.endsWith("/me"))
            return Response.json(state.actor);
        if (path.endsWith("/resolve-user"))
            return Response.json(f.candidate);
        if (path.endsWith("/precondition"))
            return Response.json({ ...f.pairState, pair: null });
        if (path.includes("/patients/")) {
            if (method === "DELETE") {
                state.patient = null;
                return tagged({ ...f.patientResponse, verificationStatus: "REVOKED" });
            }
            if (method === "POST") {
                state.patient = f.patientState;
                return tagged(f.patientResponse);
            }
            return state.patient ? tagged(state.patient) : Response.json({ link: null });
        }
        if (path.endsWith("/supporters")) {
            if (method === "POST")
                return tagged(f.detail, '"999"');
            return Response.json({ ...state.page, page: Number(new URL(call.url, "https://fixed.invalid").searchParams.get("page")) });
        }
        if (path.endsWith("/account-link")) {
            if (method === "DELETE")
                return tagged({ ...f.supporterResponse, linkedUserId: null });
            return tagged(f.supporterResponse);
        }
        if (path.includes("/supporters/"))
            return tagged(state.supporter);
        throw new Error("Unexpected account-linking test path");
    }));
    return { calls, state };
}
export let client: QueryClient;
function Probe() {
    const queryClient = useQueryClient();
    useEffect(() => { client = queryClient; }, [queryClient]);
    return null;
}
const modules = import.meta.glob("../features/account-linking/*section.tsx");
export async function renderLinking(kind: "patient" | "supporter", status = "ACTIVE", resource = kind === "patient" ? f.ids.patient : f.ids.tbCase) {
    const loader = modules[`../features/account-linking/${kind}-section.tsx`];
    expect(loader, `${kind} section`).toBeDefined();
    const exports = await loader() as {
        PatientAccountLinkSection: (p: {
            patientId: string;
        }) => React.ReactNode;
        CaseSupporterSection: (p: {
            caseId: string;
            caseStatus: string;
        }) => React.ReactNode;
    };
    const children = kind === "patient" ? <exports.PatientAccountLinkSection patientId={resource}/> : <exports.CaseSupporterSection caseId={resource} caseStatus={status}/>;
    const view = render(<AppProviders>
    <Probe />{children}</AppProviders>);
    return { ...view, navigate: (nextResource: string, nextStatus = status) => view.rerender(<AppProviders>
        <Probe />{kind === "patient" ? <exports.PatientAccountLinkSection patientId={nextResource}/> : <exports.CaseSupporterSection caseId={nextResource} caseStatus={nextStatus}/>}</AppProviders>) };
}
export async function resolve() { fireEvent.change(await screen.findByLabelText("Email atau telepon login terverifikasi (persis)"), { target: { value: "exact@example.test" } }); fireEvent.click(screen.getByRole("button", { name: "Cari akun terverifikasi" })); await screen.findByText(/Akun tujuan:/); }
export async function acknowledge() { await resolve(); fireEvent.click(screen.getByRole("checkbox")); }
export async function selectSupporter() { fireEvent.click(await screen.findByRole("button", { name: "Buka pendamping Pendamping Contoh" })); await screen.findByText("Pendamping Contoh · PMO"); }

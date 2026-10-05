import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { useSession } from "@/lib/auth/session";
import { apiRequest } from "@/lib/api/client";
import { authenticationRequired, fixtureUser } from "./fixtures";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => "/" }));
const transport = vi.fn<typeof fetch>();
let calls: { path: string; method: string; csrf: string | null }[];

function Probe() {
  const session = useSession();
  const client = useQueryClient();
  return <>
    <span data-testid="status">{session.status}</span>
    <span data-testid="identity">{session.user?.email ?? "anonymous"}</span>
    <span data-testid="cache">{client.getQueryData<string>(["private-fixture"]) ?? "empty"}</span>
    <span data-testid="error">{session.error?.kind}</span>
    <button disabled={session.isPending} onClick={() => void session.login({ identity: "fixture", password: "fixture" }).catch(() => {})}>Login probe</button>
    <button disabled={session.isPending} onClick={() => void session.logout().catch(() => {})}>Logout probe</button>
    <button onClick={() => void session.refresh().catch(() => {})}>Refresh probe</button>
    <button onClick={() => { client.setQueryData(["private-fixture"], "private-cache"); }}>Seed private cache</button>
    <button onClick={() => void apiRequest("/v1/fixture", { method: "POST", body: {} }).catch((error: unknown) => session.handleFailure(error))}>Request probe</button>
  </>;
}
function renderProbe() { return render(<AppProviders><Probe /></AppProviders>); }

beforeEach(() => {
  calls = []; transport.mockReset(); replace.mockReset();
  document.cookie = "XSRF-TOKEN=; Max-Age=0; Path=/";
  vi.stubGlobal("fetch", transport);
});
function setTransport(handler: (path: string, options: RequestInit) => Response | Promise<Response>) {
  transport.mockImplementation(async (input, options = {}) => {
    const path = String(input); calls.push({ path, method: options.method ?? "GET", csrf: new Headers(options.headers).get("X-XSRF-TOKEN") });
    return handler(path, options);
  });
}

describe("memory-only authoritative /me session", () => {
  it("bootstraps /me and treats its 401 as anonymous while accepting the CSRF cookie", async () => {
    setTransport(() => { document.cookie = "XSRF-TOKEN=bootstrap; Path=/"; return authenticationRequired(); });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(calls).toEqual([{ path: "/api/tbcall/v1/me", method: "GET", csrf: null }]);
    expect(screen.getByTestId("error")).toBeEmptyDOMElement();
  });
  it("performs bootstrap -> login with CSRF -> /me refresh and ignores login-response identity", async () => {
    let authenticated = false;
    setTransport((path) => {
      if (path.endsWith("/auth/login")) { authenticated = true; document.cookie = "XSRF-TOKEN=; Max-Age=0; Path=/"; return Response.json({ id: "never-use-login-id", status: "ACTIVE", expiresAt: "2026-10-06T00:00:00Z" }); }
      document.cookie = `XSRF-TOKEN=${authenticated ? "rotated" : "bootstrap"}; Path=/`;
      return authenticated ? Response.json(fixtureUser) : authenticationRequired();
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    await userEvent.click(screen.getByText("Login probe"));
    await waitFor(() => expect(screen.getByTestId("identity")).toHaveTextContent("petugas@example.test"));
    expect(calls).toEqual([
      { path: "/api/tbcall/v1/me", method: "GET", csrf: null },
      { path: "/api/tbcall/v1/auth/login", method: "POST", csrf: "bootstrap" },
      { path: "/api/tbcall/v1/me", method: "GET", csrf: null },
    ]);
    expect(replace).toHaveBeenCalledWith("/");
  });
  it("logout sends CSRF, refreshes /me, clears private cache and navigates to login", async () => {
    let authenticated = true;
    setTransport((path) => {
      if (path.endsWith("/auth/logout")) { authenticated = false; document.cookie = "XSRF-TOKEN=; Max-Age=0; Path=/"; return new Response(null, { status: 204 }); }
      document.cookie = `XSRF-TOKEN=${authenticated ? "active" : "fresh-anonymous"}; Path=/`;
      return authenticated ? Response.json(fixtureUser) : authenticationRequired();
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    await userEvent.click(screen.getByText("Seed private cache"));
    await userEvent.click(screen.getByText("Logout probe"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(screen.getByTestId("cache")).toHaveTextContent("empty");
    expect(calls.map(({ path }) => path)).toEqual(["/api/tbcall/v1/me", "/api/tbcall/v1/auth/logout", "/api/tbcall/v1/me"]);
    expect(calls[1].csrf).toBe("active");
    expect(replace).toHaveBeenCalledWith("/login");
  });
  it("a later /me401 removes prior private cache and routes to login", async () => {
    let expired = false;
    setTransport(() => expired ? authenticationRequired() : Response.json(fixtureUser));
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    await userEvent.click(screen.getByText("Seed private cache"));
    expired = true;
    await userEvent.click(screen.getByText("Refresh probe"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(screen.getByTestId("cache")).toHaveTextContent("empty");
    expect(replace).toHaveBeenCalledWith("/login");
  });
  it("an account change clears cached prior-user data before publishing the new /me", async () => {
    let switched = false;
    setTransport(() => Response.json(switched ? { ...fixtureUser, id: "other-user", email: "other@example.test" } : fixtureUser));
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    await userEvent.click(screen.getByText("Seed private cache"));
    switched = true;
    await userEvent.click(screen.getByText("Refresh probe"));
    await waitFor(() => expect(screen.getByTestId("identity")).toHaveTextContent("other@example.test"));
    expect(screen.getByTestId("cache")).toHaveTextContent("empty");
  });
  it("CSRF_INVALID refreshes /me once without replaying the failed login", async () => {
    setTransport((path) => {
      if (path.endsWith("/auth/login")) return Response.json({ status: 403, title: "Permintaan ditolak", code: "CSRF_INVALID" }, { status: 403, headers: { "Content-Type": "application/problem+json" } });
      document.cookie = "XSRF-TOKEN=csrf; Path=/"; return authenticationRequired();
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    await userEvent.click(screen.getByText("Login probe"));
    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("csrf"));
    expect(calls.filter(({ method }) => method === "POST")).toHaveLength(1);
    expect(calls.filter(({ path }) => path.endsWith("/me"))).toHaveLength(2);
  });
  it.each([[401, "AUTHENTICATION_REQUIRED", "authentication", "/login"], [403, "ACCESS_DENIED", "forbidden", "/forbidden"], [409, "SOURCE_AUTHORITY_CONFLICT", "source-authority", undefined], [428, "PRECONDITION_REQUIRED", "precondition", undefined]] as const)("handles %s %s at the session boundary", async (status, code, kind, route) => {
    setTransport((path) => {
      if (path.endsWith("/fixture")) return Response.json({ title: "Fixture", status, code }, { status, headers: { "Content-Type": "application/problem+json" } });
      document.cookie = "XSRF-TOKEN=active; Path=/"; return Response.json(fixtureUser);
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    await userEvent.click(screen.getByText("Seed private cache"));
    await userEvent.click(screen.getByText("Request probe"));
    await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent(kind));
    if (route) expect(replace).toHaveBeenCalledWith(route);
    if (status === 401) expect(screen.getByTestId("cache")).toHaveTextContent("empty");
  });
  it("optimistic conflict refetches /me and reports stale data without replaying the mutation", async () => {
    setTransport((path) => {
      if (path.endsWith("/fixture")) return Response.json({ title: "Fixture", status: 409, code: "OPTIMISTIC_LOCK_CONFLICT" }, { status: 409, headers: { "Content-Type": "application/problem+json" } });
      document.cookie = "XSRF-TOKEN=active; Path=/"; return Response.json(fixtureUser);
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    await userEvent.click(screen.getByText("Request probe"));
    await waitFor(() => expect(calls.filter(({ path }) => path.endsWith("/me"))).toHaveLength(2));
    expect(screen.getByTestId("error")).toHaveTextContent("stale");
    expect(calls.filter(({ method }) => method === "POST")).toHaveLength(1);
  });
  it("successful logout stays anonymous and clears cache if the subsequent /me is unavailable", async () => {
    let loggedOut = false;
    setTransport((path) => {
      if (path.endsWith("/auth/logout")) { loggedOut = true; return new Response(null, { status: 204 }); }
      document.cookie = "XSRF-TOKEN=active; Path=/";
      return loggedOut ? new Response("private exception", { status: 503 }) : Response.json(fixtureUser);
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    await userEvent.click(screen.getByText("Seed private cache"));
    await userEvent.click(screen.getByText("Logout probe"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.getByTestId("identity")).toHaveTextContent("anonymous");
    expect(screen.getByTestId("cache")).toHaveTextContent("empty");
  });
  it("deduplicates a pending login", async () => {
    let finish: (() => void) | undefined;
    setTransport((path) => {
      if (path.endsWith("/auth/login")) return new Promise<Response>((resolve) => { finish = () => resolve(Response.json({ status: "ACTIVE" })); });
      document.cookie = "XSRF-TOKEN=bootstrap; Path=/"; return authenticationRequired();
    });
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    await userEvent.dblClick(screen.getByText("Login probe"));
    expect(calls.filter(({ path }) => path.endsWith("/auth/login"))).toHaveLength(1);
    await act(async () => { finish?.(); });
  });
  it("uses no browser persistence and never decodes an opaque session-cookie value", async () => {
    const stored = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Persistence forbidden"); });
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Persistence forbidden"); });
    vi.stubGlobal("indexedDB", { open: () => { throw new Error("Persistence forbidden"); } });
    document.cookie = "TBCALL_SESSION=%E0%A4%A; Path=/";
    setTransport(() => Response.json(fixtureUser));
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(stored).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  });
  it("rejects a malformed /me safely instead of treating login identity as current-user state", async () => {
    setTransport(() => Response.json({ id: "unexpected", privatePayload: "never render" }));
    renderProbe();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unavailable"));
    expect(screen.getByTestId("identity")).toHaveTextContent("anonymous");
  });
});

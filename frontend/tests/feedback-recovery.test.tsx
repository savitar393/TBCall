import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import { useSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/problem";
import { fixtureUser } from "./fixtures";
const route = vi.hoisted(() => ({ path: "/", replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => route, usePathname: () => route.path }));
function Probe() {
  const client = useQueryClient(), session = useSession();
  const read = (fail: boolean, key = "recoverable") => client.fetchQuery({ queryKey: [key], staleTime: 0, retry: false, queryFn: async () => { if (fail) throw new ApiError({ status: 503, title: "Private payload" }); return "ok"; } }).catch(() => {});
  return <><p data-testid="error">{session.error?.kind}</p><p>{session.status}</p><button onClick={() => void read(true)}>Fail read</button><button onClick={() => void read(false)}>Recover read</button><button onClick={() => void read(false, "unrelated")}>Other read</button><button onClick={() => void session.handleFailure(new ApiError({ status: 503, title: "mutation" }))}>Fail mutation</button></>;
}
function setup() { vi.stubGlobal("fetch", vi.fn(async () => Response.json(fixtureUser))); return render(<AppProviders><Probe /></AppProviders>); }
it("clears the global feedback when the same failed GET recovers", async () => {
  setup(); await screen.findByText("authenticated");
  await userEvent.click(screen.getByText("Fail read")); await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("unavailable"));
  await userEvent.click(screen.getByText("Other read")); expect(screen.getByTestId("error")).toHaveTextContent("unavailable");
  await userEvent.click(screen.getByText("Recover read")); await waitFor(() => expect(screen.getByTestId("error")).toBeEmptyDOMElement());
});
it("successful reads cannot silence a mutation error or replay a mutation", async () => {
  setup(); await screen.findByText("authenticated"); await userEvent.click(screen.getByText("Fail mutation"));
  await userEvent.click(screen.getByText("Recover read")); expect(screen.getByTestId("error")).toHaveTextContent("unavailable");
});
it("navigation removes stale feedback while retaining authoritative identity", async () => {
  route.path = "/"; const view = setup(); await screen.findByText("authenticated");
  await userEvent.click(screen.getByText("Fail read")); await waitFor(() => expect(screen.getByTestId("error")).toHaveTextContent("unavailable"));
  route.path = "/portal"; view.rerender(<AppProviders><Probe /></AppProviders>);
  await waitFor(() => expect(screen.getByTestId("error")).toBeEmptyDOMElement());
  expect(screen.getByText("authenticated")).toBeInTheDocument();
});

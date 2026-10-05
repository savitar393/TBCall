import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import HomePage from "@/app/page";
import LoginPage from "@/app/login/page";
import ForbiddenPage from "@/app/forbidden/page";
import { ApiFeedback } from "@/components/api-feedback";
import { ApiError } from "@/lib/api/problem";
import { filterNavigation, foundationNavigation } from "@/lib/navigation";
import { authenticationRequired, fixtureUser } from "./fixtures";

const { replace, path } = vi.hoisted(() => ({ replace: vi.fn(), path: { current: "/" } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => path.current }));
const transport = vi.fn<typeof fetch>();
beforeEach(() => {
  path.current = "/"; replace.mockReset(); transport.mockReset();
  vi.stubGlobal("fetch", transport);
  document.cookie = "XSRF-TOKEN=; Max-Age=0; Path=/";
});
function renderPage(page: React.ReactNode) { return render(<AppProviders>{page}</AppProviders>); }

describe("permission-driven foundation navigation", () => {
  const items = [{ label: "Beranda", href: "/" }, { label: "Akun/context", href: "/#akun", requiredPermissions: ["INTEGRATION_MANAGE"] }];
  it("uses actual permission codes without inferring access from a role-like string", () => {
    expect(filterNavigation(items, ["SYSTEM_ADMIN"]).map(item => item.label)).toEqual(["Beranda"]);
    expect(filterNavigation(items, ["INTEGRATION_MANAGE"]).map(item => item.label)).toEqual(["Beranda", "Akun/context"]);
  });
  it("requires every explicitly declared permission", () => {
    const guarded = [{ label: "Akun/context", href: "/#akun", requiredPermissions: ["PATIENT_READ", "CASE_READ"] }];
    expect(filterNavigation(guarded, ["PATIENT_READ"])).toEqual([]);
    expect(filterNavigation(guarded, ["PATIENT_READ", "CASE_READ"])).toHaveLength(1);
  });
  it("exposes only the two implemented authenticated context links without inventing /me permissions", () => {
    expect(filterNavigation(foundationNavigation, []).map(({ label, href }) => [label, href])).toEqual([["Beranda", "/"], ["Akun/context", "/#akun"]]);
  });
});

describe("Indonesian login", () => {
  function anonymous() {
    transport.mockImplementation(async () => { document.cookie = "XSRF-TOKEN=bootstrap; Path=/"; return authenticationRequired(); });
    path.current = "/login";
  }
  it("associates labels and validates locally without posting empty credentials", async () => {
    anonymous(); renderPage(<LoginPage />);
    const button = await screen.findByRole("button", { name: "Masuk" });
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.getByLabelText("Email atau nomor telepon")).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Kata sandi")).toHaveAttribute("type", "password");
    await userEvent.click(button);
    expect(await screen.findByText("Identitas login wajib diisi.")).toHaveAttribute("role", "alert");
    expect(screen.getByText("Kata sandi wajib diisi.")).toHaveAttribute("role", "alert");
    expect(transport.mock.calls.every(([, options]) => options?.method === "GET")).toBe(true);
  });
  it("submits backend identity/password after bootstrap and uses only refreshed /me", async () => {
    let signedIn = false; path.current = "/login";
    transport.mockImplementation(async (input, options) => {
      if (String(input).endsWith("/auth/login")) { signedIn = true; expect(options?.body).toBe('{"identity":"petugas@example.test","password":"fixture-password"}'); return Response.json({ id: "discard-this" }); }
      document.cookie = "XSRF-TOKEN=fresh; Path=/"; return signedIn ? Response.json(fixtureUser) : authenticationRequired();
    });
    renderPage(<LoginPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Masuk" })).toBeEnabled());
    await userEvent.type(screen.getByLabelText("Email atau nomor telepon"), "petugas@example.test");
    await userEvent.type(screen.getByLabelText("Kata sandi"), "fixture-password");
    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(transport.mock.calls.map(([url]) => String(url))).toEqual(["/api/tbcall/v1/me", "/api/tbcall/v1/auth/login", "/api/tbcall/v1/me"]);
  });
  it("disables submission when bootstrap is unavailable and announces a safe error", async () => {
    path.current = "/login"; transport.mockResolvedValue(new Response("private exception", { status: 503 }));
    renderPage(<LoginPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Layanan belum tersedia");
    expect(screen.getByRole("button", { name: "Masuk" })).toBeDisabled();
    expect(screen.queryByText(/private exception/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Coba kembali" })).toBeEnabled();
  });
  it("announces rejected credentials safely and clears the submitted password", async () => {
    path.current = "/login";
    transport.mockImplementation(async (input) => {
      document.cookie = "XSRF-TOKEN=bootstrap; Path=/";
      return String(input).endsWith("/auth/login")
        ? Response.json({ title: "private account information", detail: "private credential detail", status: 401, code: "INVALID_CREDENTIALS" }, { status: 401, headers: { "Content-Type": "application/problem+json" } })
        : authenticationRequired();
    });
    renderPage(<LoginPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Masuk" })).toBeEnabled());
    await userEvent.type(screen.getByLabelText("Email atau nomor telepon"), "petugas@example.test");
    await userEvent.type(screen.getByLabelText("Kata sandi"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Masuk" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Login tidak berhasil");
    expect(screen.getByRole("alert")).toHaveTextContent("Periksa kembali email atau nomor telepon dan kata sandi Anda.");
    expect(screen.getByRole("alert")).not.toHaveTextContent(/private/);
    await waitFor(() => expect(screen.getByLabelText("Kata sandi")).toHaveValue(""));
    expect(transport.mock.calls.filter(([input]) => String(input).endsWith("/auth/login"))).toHaveLength(1);
  });
  it("redirects an already authenticated /login user without another login request", async () => {
    path.current = "/login"; transport.mockResolvedValue(Response.json(fixtureUser));
    renderPage(<LoginPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(transport.mock.calls.every(([, options]) => options?.method === "GET")).toBe(true);
  });
  it("shows only implemented navigation and no recovery/registration or clinical links", async () => {
    anonymous(); renderPage(<LoginPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Masuk" })).toBeEnabled());
    for (const link of screen.getAllByRole("link")) expect(["/login", "/"]).toContain(link.getAttribute("href"));
    expect(screen.queryByText(/Daftar akun|Lupa kata sandi/)).not.toBeInTheDocument();
  });
});

describe("authenticated responsive identity shell", () => {
  it("shows only identity/context, role names, facility, verified link state and supporter count", async () => {
    transport.mockResolvedValue(Response.json({ ...fixtureUser, patientLink: { id: "private-link", patientId: "private-patient", version: 0 }, supporterCaseIds: ["private-case-a", "private-case-b"] }));
    renderPage(<HomePage />);
    expect(await screen.findByRole("heading", { name: "Selamat datang" })).toBeInTheDocument();
    expect(screen.getAllByText("Petugas TBC").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Puskesmas Contoh").length).toBeGreaterThan(0);
    expect(screen.getByText("SELF terverifikasi")).toBeInTheDocument();
    expect(screen.getByLabelText("Jumlah kasus pendampingan tertaut")).toHaveTextContent("2");
    expect(screen.queryByText(/private-patient|private-case-a|private-link/)).not.toBeInTheDocument();
    expect(transport.mock.calls.map(([url]) => String(url))).toEqual(["/api/tbcall/v1/me"]);
  });
  it("renders readable empty roles/facilities/SELF context without a role-based clinical link", async () => {
    transport.mockResolvedValue(Response.json({ ...fixtureUser, roles: [], permissions: [], activeFacilities: [], email: null, phone: "08123456789" }));
    renderPage(<HomePage />);
    await screen.findByRole("heading", { name: "Selamat datang" });
    expect(screen.getByText("Belum ada peran aktif")).toBeInTheDocument();
    expect(screen.getAllByText("Belum ada fasilitas aktif").length).toBeGreaterThan(0);
    expect(screen.getByText("Belum tertaut")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Navigasi utama desktop" });
    expect(within(nav).getByRole("link", { name: "Beranda" })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: "Akun/context" })).toHaveAttribute("href", "/#akun");
  });
  it("routes an anonymous home to login without displaying protected context", async () => {
    transport.mockResolvedValue(authenticationRequired()); renderPage(<HomePage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByRole("heading", { name: "Selamat datang" })).not.toBeInTheDocument();
    expect(screen.queryByText("petugas@example.test")).not.toBeInTheDocument();
  });
  it("collapses and expands desktop navigation while keeping accessible labels", async () => {
    transport.mockResolvedValue(Response.json(fixtureUser)); renderPage(<HomePage />);
    await screen.findByRole("heading", { name: "Selamat datang" });
    await userEvent.click(screen.getByRole("button", { name: "Ciutkan navigasi" }));
    expect(screen.getByRole("button", { name: "Perluas navigasi" })).toHaveAttribute("aria-expanded", "false");
    expect(within(screen.getByRole("navigation", { name: "Navigasi utama desktop" })).getByRole("link", { name: "Beranda" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Perluas navigasi" }));
    expect(screen.getByRole("button", { name: "Ciutkan navigasi" })).toHaveAttribute("aria-expanded", "true");
  });
  it("opens an accessible mobile drawer, closes by Escape and restores focus", async () => {
    transport.mockResolvedValue(Response.json(fixtureUser)); renderPage(<HomePage />);
    await screen.findByRole("heading", { name: "Selamat datang" });
    const trigger = screen.getByRole("button", { name: "Buka navigasi" });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Menu TBCall" });
    expect(within(dialog).getByRole("navigation", { name: "Navigasi utama seluler" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
  it("supplies the document nonce to the drawer's injected scroll-lock stylesheet", async () => {
    transport.mockResolvedValue(Response.json(fixtureUser));
    render(<AppProviders nonce="fixture-document-nonce"><HomePage /></AppProviders>);
    await screen.findByRole("heading", { name: "Selamat datang" });
    await userEvent.click(screen.getByRole("button", { name: "Buka navigasi" }));
    await waitFor(() => {
      const stylesheet = [...document.head.querySelectorAll("style")].find(style => style.textContent?.includes("overflow: hidden"));
      expect(stylesheet).toBeDefined();
      expect(stylesheet).toHaveAttribute("nonce", "fixture-document-nonce");
      expect(getComputedStyle(document.body).overflow).toBe("hidden");
    });
  });
  it("has a skip link, main landmark and working account anchor without dead clinical routes", async () => {
    transport.mockResolvedValue(Response.json(fixtureUser)); renderPage(<HomePage />);
    await screen.findByRole("heading", { name: "Selamat datang" });
    expect(screen.getByRole("link", { name: "Lewati ke konten utama" })).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("heading", { name: "Akun & konteks akses" }).parentElement).toHaveAttribute("id", "akun");
    for (const link of screen.getAllByRole("link")) expect(["/", "/#akun", "#main-content"]).toContain(link.getAttribute("href"));
  });
  it("renders the forbidden route with a meaningful Indonesian heading and working home link", async () => {
    path.current = "/forbidden"; transport.mockResolvedValue(Response.json(fixtureUser));
    renderPage(<ForbiddenPage />);
    expect(await screen.findByRole("heading", { name: "Akses tidak diizinkan" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kembali ke beranda" })).toHaveAttribute("href", "/");
  });
});

describe("safe announced API feedback", () => {
  it("announces externally controlled read-only data without exposing raw problem prose", () => {
    render(<ApiFeedback error={new ApiError({ status: 409, title: "private source internals", detail: "private clinical payload", code: "SOURCE_AUTHORITY_CONFLICT" }, "fixture-id")} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Data dikendalikan sumber eksternal");
    expect(alert).toHaveTextContent("hanya dapat dibaca");
    expect(alert).toHaveTextContent("fixture-id");
    expect(alert).not.toHaveTextContent("private");
  });
  it("surfaces a safe precondition error", () => {
    render(<ApiFeedback error={new ApiError({ status: 428, title: "fixture" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Versi data diperlukan");
  });
});

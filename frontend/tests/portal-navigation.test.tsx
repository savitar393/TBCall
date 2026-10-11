import { screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { backend, renderClinical } from "./clinical-harness";
import { fixtureUser } from "./fixtures";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/portal" }));
it("shows independently granted patient portal navigation without an empty staff facility box", async () => {
    backend(c => c.url.endsWith("/me") ? Response.json({ ...fixtureUser, roles: [{ code: "PATIENT", name: "Pasien" }], activeFacilities: [] }) : undefined);
    renderClinical(<AppShell><p>Konten aman</p></AppShell>);
    expect(await screen.findByRole("navigation", { name: "Navigasi utama desktop" }).then(nav=>within(nav).getByRole("link", {name:"Beranda"}))).toHaveAttribute("href", "/portal");
    expect(within(screen.getByRole("navigation",{name:"Navigasi utama desktop"})).getByRole("link",{name:"Notifikasi"})).toHaveAttribute("href", "/portal/notifications");
    expect(screen.queryByRole("link", { name: "Pengobatan" })).not.toBeInTheDocument();
    expect(screen.queryByText("Fasilitas aktif")).not.toBeInTheDocument();
});

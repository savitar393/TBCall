import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AppProviders } from "@/app/providers";
import HomePage from "@/app/page";
import { portalBackend } from "./portal-harness";
vi.mock('next/navigation',()=>({useRouter:()=>({replace:vi.fn()}),usePathname:()=>'/'}));
it('patient login root highlights home and preserves a working secondary account destination', async()=>{
  portalBackend(); render(<AppProviders><HomePage/></AppProviders>); await screen.findByRole('heading',{name:'Kegiatan hari ini'});
  expect(within(screen.getByRole('navigation',{name:'Akses cepat pasien'})).getByRole('link',{name:'Beranda'})).toHaveAttribute('aria-current','page');
  expect(within(screen.getByRole('navigation',{name:'Navigasi utama desktop'})).getByRole('link',{name:'Profil'})).toHaveAttribute('href','/portal/profile');
  expect(screen.queryByRole('link',{name:'Akun & akses'})).not.toBeInTheDocument();
});

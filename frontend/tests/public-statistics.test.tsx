import { LandingPage } from "@/features/public/landing";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { TbPublicStatistics } from "@/features/public/tb-statistics";
import { tbDistricts, tbPublicSource, tbPublicTotal } from "@/features/public/tb-statistics-data";
import { Brand } from "@/components/brand";
it("versioned public snapshot preserves 35 unique district facts and the exact aggregate",()=>{
  expect(tbDistricts).toHaveLength(35); expect(new Set(tbDistricts.map(d=>d.code)).size).toBe(35);
  expect(tbDistricts.every(d=>Number.isInteger(d.count)&&d.count>=0)).toBe(true);
  expect(tbPublicTotal).toBe(86743);
  expect(tbDistricts.find(d=>d.name==="Kabupaten Banyumas")?.count).toBe(6992);
  expect(tbDistricts.find(d=>d.name==="Kabupaten Klaten")?.count).toBe(662);
  expect(tbPublicSource.year).toBe(2024); expect(tbPublicSource.version).toBe("jateng-2024-v1");
});
it("public chart exposes every district, reports scope and cannot be mistaken for patient outcomes",async()=>{
  render(<TbPublicStatistics/>);
  const figure=screen.getByRole("figure",{name:"Jumlah penemuan kasus TBC per kabupaten atau kota tahun 2024"});
  expect(within(figure).getAllByRole("listitem")).toHaveLength(6);
  await userEvent.click(screen.getByRole("button",{name:"Lihat seluruh 35 wilayah"}));
  expect(within(figure).getAllByRole("listitem")).toHaveLength(35);
  expect(screen.getByText(/bukan estimasi insiden, jumlah pasien unik/)).toBeInTheDocument();
  expect(screen.getByText(/diperbarui 23 Oktober 2025/)).toBeInTheDocument();
  expect(screen.getByRole("link",{name:/Dinas Kesehatan Provinsi Jawa Tengah/})).toHaveAttribute("rel","noopener noreferrer");
  await userEvent.click(screen.getByRole("button",{name:"Tampilkan enam wilayah"}));
  expect(within(figure).getAllByRole("listitem")).toHaveLength(6);
});
it("horizontal brand uses the supplied transparent asset without duplicate visible text",()=>{
  render(<Brand/>); const brand=screen.getByRole("link",{name:"TBCall"});
  expect(brand.textContent).toBe("");
  expect(brand.querySelector("img")?.getAttribute("src")).toContain("long-logo.png");
});


it("education uses all four supplied illustrations with safe external links", () => {
  const { container } = render(<LandingPage/>);
  const cards = container.querySelectorAll('#edukasi a[target="_blank"]');
  expect(cards).toHaveLength(4);
  for (const card of cards) {
    expect(card).toHaveAttribute("rel", "noopener noreferrer");
    expect(card.querySelector('img')).toHaveAttribute('alt', '');
    expect(card.querySelector('img')?.getAttribute('src')).toContain('articles');
  }
  expect(screen.getByText(/Ilustrasi disediakan pemilik TBCall/)).toBeInTheDocument();
});

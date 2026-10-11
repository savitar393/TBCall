import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AppBreadcrumbs, AppDisclosure, AppFormSection, AppPageHeader, AppSection, AppState, AppStatusBadge, AppTable, AppViewLinks } from "@/components/application-patterns";
import { AppConfirmation } from "@/components/application-confirmation";

it("offers semantic headings, contextual breadcrumbs and actions", () => {
  render(<><AppBreadcrumbs items={[{label:"Beranda",href:"/"},{label:"Pengobatan"}]}/><AppPageHeader title="Pengobatan" description="Catatan sesuai izin baca" actions={<button>Perbarui</button>}/><AppSection title="Jadwal" actions={<AppStatusBadge>ACTIVE</AppStatusBadge>}>Isi catatan</AppSection></>);
  expect(screen.getByRole("heading",{name:"Pengobatan",level:1})).toBeInTheDocument();
  expect(within(screen.getByRole("navigation",{name:"Jejak navigasi"})).getByRole("link",{name:"Beranda"})).toHaveAttribute("href","/");
  expect(screen.getByRole("region",{name:"Jadwal"})).toHaveTextContent("ACTIVE");
});
it.each(["loading","empty","restricted","unavailable","success","error"] as const)("distinguishes %s feedback without fabricating counts",kind=>{
  render(<AppState kind={kind} title="Keadaan tercatat">Petunjuk berikutnya</AppState>);
  expect(screen.getByText("Keadaan tercatat")).toBeInTheDocument();
  expect(screen.queryByText("0")).not.toBeInTheDocument();
  if(kind==="loading"||kind==="success") expect(screen.getByRole("status")).toBeInTheDocument();
  if(kind==="error") expect(screen.getByRole("alert")).toBeInTheDocument();
});
it("uses native disclosures, labeled form groups, accessible table regions and view links",async()=>{
  render(<><AppDisclosure title="Penjelasan">Definisi status</AppDisclosure><AppFormSection title="Jadwal" description="Ikuti resep"><label>Waktu<input type="time"/></label></AppFormSection><AppTable caption="Daftar catatan"><thead><tr><th scope="col">Nama</th></tr></thead><tbody><tr><td>Fiksi</td></tr></tbody></AppTable><AppViewLinks label="Tampilan" items={[{href:"/patients",label:"Pasien",current:true}]}/></>);
  const summary=screen.getByText("Penjelasan"); await userEvent.click(summary); expect(summary.closest("details")).toHaveAttribute("open");
  expect(screen.getByRole("group",{name:"Jadwal"})).toBeInTheDocument();
  expect(screen.getByRole("region",{name:"Daftar catatan"})).toHaveAttribute("tabindex","0");
  expect(screen.getByRole("link",{name:"Pasien"})).toHaveAttribute("aria-current","page");
});
it("requires explicit confirmation, supports cancellation and restores focus",async()=>{
  const confirm=vi.fn(); render(<AppConfirmation label="Hapus penugasan" description="Periksa pengguna" disabled={false} onConfirm={confirm}/>);
  await userEvent.click(screen.getByRole("button",{name:"Hapus penugasan"}));
  const dialog=screen.getByRole("dialog"); expect(dialog).toHaveAccessibleName("Konfirmasi hapus penugasan");
  await userEvent.click(within(dialog).getByRole("button",{name:"Batal"})); expect(confirm).not.toHaveBeenCalled();
  await waitFor(()=>expect(screen.getByRole("button",{name:"Hapus penugasan"})).toHaveFocus());
  await userEvent.click(screen.getByRole("button",{name:"Hapus penugasan"}));
  await userEvent.click(screen.getByRole("button",{name:"Ya, hapus penugasan"})); expect(confirm).toHaveBeenCalledTimes(1);
});

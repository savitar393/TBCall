import { describe, expect, it } from "vitest";
import { applicationNavigation, applicationBreadcrumbs, navigationActive } from "@/lib/application-navigation";
import { patient, supporter } from "./portal-fixtures";
import { fixtureUser } from "./fixtures";
describe("authenticated workflow navigation", () => {
  it("offers separate reporting destinations only with their independent roles and permissions", () => {
    const monitor = { ...fixtureUser, roles: [{ code: "PROGRAM_MONITOR", name: "Monitor" }], permissions: ["REPORT_READ"] };
    const hrefs = (user: typeof fixtureUser) => applicationNavigation(user).flatMap(g => g.links).map(l => l.href);
    expect(hrefs(monitor)).toContain("/program-reports"); expect(hrefs(monitor)).not.toContain("/admin/program-reports");
    expect(hrefs({ ...monitor, permissions: [] })).not.toContain("/program-reports");
    const admin = { ...monitor, roles: [{ code: "SYSTEM_ADMIN", name: "Admin" }], permissions: ["REPORT_SCOPE_MANAGE"] };
    expect(hrefs(admin)).toContain("/admin/program-reports"); expect(hrefs(admin)).not.toContain("/program-reports");
  });
  it("keeps patient destinations separate and respects independent permissions", () => {
    const user = { ...patient, permissions: [] };
    const links = applicationNavigation(user).flatMap(group => group.links);
    expect(links.map(link => link.href)).toEqual(["/portal", "/portal/calendar", "/portal/profile", "/portal/support"]);
    expect(navigationActive("/", "/portal", user)).toBe(true);
    expect(navigationActive("/portal/treatment", "/portal", user)).toBe(false);
  });
  it("never exposes officer or admin workflows from a supporter role", () => {
    const links = applicationNavigation(supporter).flatMap(group => group.links);
    expect(links.some(link => link.href === "/supporting-cases")).toBe(true);
    expect(links.some(link => ["/patients", "/intake/new", "/admin/users", "/dashboard"].includes(link.href))).toBe(false);
  });
  it("marks nested destinations without marking home or hash links", () => {
    expect(navigationActive("/laboratory/requests/fictional", "/laboratory", fixtureUser)).toBe(true);
    expect(navigationActive("/patients", "/", fixtureUser)).toBe(false);
    expect(navigationActive("/", "/#akun", fixtureUser)).toBe(false);
    expect(navigationActive("/patients-other", "/patients", fixtureUser)).toBe(false);
  });
  it("does not put identifiers or unauthorized detail links in breadcrumbs", () => {
    const user = { ...fixtureUser, roles: [{ code: "TB_OFFICER", name: "Petugas" }], permissions: ["TREATMENT_READ"] };
    const crumbs = applicationBreadcrumbs("/cases/fictional-private-id/summary", user);
    expect(crumbs.at(-1)?.label).toBe("Ringkasan kasus");
    expect(crumbs.some(crumb => crumb.href?.startsWith("/cases/"))).toBe(false);
    expect(JSON.stringify(crumbs)).not.toContain("fictional-private-id");
  });
});

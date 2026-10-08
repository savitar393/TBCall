import { expect, it } from "vitest";
import * as f from "./portal-fixtures";
const modules = import.meta.glob("../features/{administration,integration}/{permissions,schemas,api,queries}.ts");
async function moduleAt(area: string, file: string) {
    const loader = modules[`../features/${area}/${file}.ts`];
    expect(loader, `${area}/${file}`).toBeDefined();
    return await loader() as Record<string, unknown>;
}
it("administration navigation checks independent system grants and scoped facility-admin lookup", async () => {
    const { administrationNavigation } = await moduleAt("administration", "permissions") as {
        administrationNavigation: (user: typeof f.patient) => {
            href: string;
        }[];
    };
    const system = { ...f.patient, roles: [{ code: "SYSTEM_ADMIN", name: "Admin" }], permissions: ["FACILITY_MANAGE", "USER_MANAGE_FACILITY"] };
    expect(administrationNavigation(system).map(n => n.href)).toEqual(["/admin/facilities", "/admin/users"]);
    expect(administrationNavigation({ ...system, permissions: [] })).toEqual([]);
    expect(administrationNavigation({ ...system, roles: f.patient.roles })).toEqual([]);
    const facility = { ...system, roles: [{ code: "FACILITY_ADMIN", name: "Admin fasilitas" }], activeFacilities: [f.facility] };
    expect(administrationNavigation(facility).map(n => n.href)).toEqual(["/admin/users"]);
    expect(administrationNavigation({ ...facility, activeFacilities: [] })).toEqual([]);
});
it("integration navigation requires system role and integration grant", async () => {
    const { integrationNavigation } = await moduleAt("integration", "permissions") as {
        integrationNavigation: (user: typeof f.patient) => {
            href: string;
        }[];
    };
    const actor = { ...f.patient, roles: [{ code: "SYSTEM_ADMIN", name: "Admin" }], permissions: ["INTEGRATION_MANAGE"] };
    expect(integrationNavigation(actor).map(n => n.href)).toEqual(["/integrations"]);
    expect(integrationNavigation({ ...actor, permissions: [] })).toEqual([]);
    expect(integrationNavigation({ ...actor, roles: f.patient.roles })).toEqual([]);
});

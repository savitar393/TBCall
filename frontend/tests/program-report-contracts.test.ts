import { describe, expect, it, vi } from "vitest";
import { reportApi, consistentSnapshot } from "@/features/program-reports/api";
import { canMonitor, canManageScopes, canPublish } from "@/features/program-reports/permissions";
import { fixtureUser } from "./fixtures";

describe("reporting contracts", () => {
  it("rejects mixed snapshots rather than composing a release", () => {
    expect(() => consistentSnapshot([{ snapshotId: "a" }, { snapshotId: "b" }, { snapshotId: "a" }])).toThrow();
    expect(() => consistentSnapshot([{ snapshotId: "a" }, { snapshotId: "a" }, { snapshotId: "a" }])).not.toThrow();
  });
  it("requires role and independent permissions without facility inheritance", () => {
    const user = { ...fixtureUser, permissions: ["REPORT_READ", "REPORT_SCOPE_MANAGE", "REPORT_PUBLISH"] };
    expect(canMonitor(user)).toBe(false); expect(canManageScopes(user)).toBe(false);
    const monitor = { ...user, roles: [{ code: "PROGRAM_MONITOR", name: "Monitor" }] };
    expect(canMonitor(monitor)).toBe(true); expect(canPublish(monitor)).toBe(false);
    const admin = { ...user, roles: [{ code: "SYSTEM_ADMIN", name: "Admin" }] };
    expect(canMonitor(admin)).toBe(false); expect(canManageScopes(admin)).toBe(true); expect(canPublish(admin)).toBe(true);
    expect(canPublish({ ...admin, permissions: ["REPORT_SCOPE_MANAGE"] })).toBe(false);
  });
  it("validates scope discovery and never accepts private fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ catalogueVersion: "v", scopes: [{ scope: "PROVINCE", code: "33", name: "Jawa Tengah", patientId: "private" }] })));
    await expect(reportApi.scopes(new AbortController().signal)).rejects.toThrow();
  });
  it("does not turn an unpublished response into zero or retry reads automatically", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ title: "Belum diterbitkan", code: "REPORT_NOT_PUBLISHED" }, { status: 503, headers: { "Content-Type": "application/problem+json" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(reportApi.scopes(new AbortController().signal)).rejects.toMatchObject({ problem: { code: "REPORT_NOT_PUBLISHED" } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(["snapshot", "geography", "date"])("rejects a mismatched %s in actual bundle responses", async mismatch => {
    const g = { scope: "PROVINCE" as const, code: "33", name: "Jawa Tengah" }, id = "11111111-1111-4111-8111-111111111111", dataAsOf = "2026-10-15T00:00:00Z";
    const stamp = { snapshotId: id, dataAsOf }, counts = { caseEpisodes: 0, activeCaseEpisodes: 0, completedCaseEpisodes: 0, activeTreatmentEpisodes: 0, recordedTreatmentOutcomes: 0, representedFacilities: 0 };
    vi.stubGlobal("fetch", vi.fn(async (path: string) => Response.json(path.includes("/summary?") ? { ...stamp, state: "AVAILABLE", summary: { geography: g, indicators: counts } } : path.includes("/breakdown?") ? { ...stamp, state: "AVAILABLE", geography: g, rows: [] } : { ...stamp, ...(mismatch === "snapshot" ? { snapshotId: "22222222-2222-4222-8222-222222222222" } : mismatch === "date" ? { dataAsOf: "2026-10-16T00:00:00Z" } : {}), geography: mismatch === "geography" ? { ...g, code: "34" } : g, dataSource: "TBCALL_HELD_RECORDS_NOT_OFFICIAL_SURVEILLANCE", reportingBasis: "APPROVED_CURRENT_STATE_SNAPSHOT", catalogueVersion: "v", codeNamespace: "KEMENDAGRI", effectiveOn: "2025-06-23", catalogueCheckedOn: "2026-10-13", sources: [], minimumPatientSupport: 10, disclosurePolicy: "WHOLE_RELEASE_CONTRIBUTION_TRAJECTORY_K10", dataQuality: "ALL_CASES_ATTRIBUTED", unattributedCaseEpisodes: null, indicators: [], limitations: [] })));
    await expect(reportApi.bundle(g, new AbortController().signal)).rejects.toBeInstanceOf(Error);
  });
});

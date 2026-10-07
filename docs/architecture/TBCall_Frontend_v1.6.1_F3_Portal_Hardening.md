# TBCall Frontend v1.6.1 — F3 Portal Contract Hardening

Base under review: `a156a4a5583ddd0576168166357ebfdc07f234a9`

This is a narrow frontend-only corrective checkpoint before merging F3.

## Finding 1 — Use live portal dose/admin choices directly

`features/portal/references.ts` currently duplicates PATIENT/SUPPORTER dose code allowlists, then filters the live `/me/portal-reference-data` response. The dose form also duplicates the administration-mode code list.

Required:
- PATIENT uses `patientDoseStatuses` directly.
- TREATMENT_SUPPORTER uses `supporterDoseStatuses` directly.
- administration modes use `administrationModes` directly.
- do not keep duplicate frontend code allowlists.

Keep regressions proving the server-provided patient list excludes TAKEN_OBSERVED/DISPENSED_HOME and the supporter list excludes DISPENSED_HOME. Add a regression showing a changed live allowed option is not hidden by a local code filter.

## Finding 2 — Gate supporter case workspace by case-workspace permissions

The approved F3 architecture requires `/supporting-cases` only for TREATMENT_SUPPORTER plus at least one of:
- TREATMENT_READ
- ADHERENCE_READ
- ADHERENCE_RECORD
- MONITORING_READ
- ALERT_READ

Current implementation shows `Pendampingan` to every supporter and permits the route with role alone.

Required:
- add one reusable helper such as `canSupportCases(user)`;
- use it for `Pendampingan`, `/supporting-cases`, and `/supporting-cases/[caseId]`;
- retain the existing supporterCaseIds allowlist for the detail route;
- NOTIFICATION_READ_SELF alone must still permit `/portal/notifications` but not the case workspace;
- ALERT_ACKNOWLEDGE alone is not sufficient.

Add regressions for notification-only supporter navigation/direct-route denial and for allowed workspace permissions.

## Finding 3 — Browser-local future-date guard for dose report

Backend already rejects future scheduledDate. The approved F3 frontend contract also requires client-side `scheduledDate <= browser-local today`.

Required:
- set date input `max` to browser-local today;
- validate again before POST;
- use a tested local-date helper, not UTC `toISOString().slice(0,10)`;
- on future date, show safe local feedback, send no POST, preserve draft.

Cover both PATIENT and SUPPORTER.

## Boundaries

Do not modify Java/backend source, backend tests, V1–V17, auth/session code, staff feature modules, route inventory, package dependencies/configuration, or begin F4.

Run:

```powershell
pnpm run lint
pnpm run typecheck
pnpm test
pnpm run build
```

All existing 791 tests must remain green plus new regressions.

Commit and push to the same `feat/frontend-f3-portal` branch.

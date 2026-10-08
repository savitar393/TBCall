# Coverage contract

The complete machine-readable ledger is `coverage.json`: 20 original F6B scenarios plus 36 F6C extensions, with 58 assertion occurrences. Exact IDs, objectives, preconditions and expected results are retained. A result is PASS only if its source-derived checks succeed; dependencies failing produce BLOCKED, failures remain FAIL and unexecuted work remains NOT RUN. None may be silently dropped.

| IDs | Coverage |
|---|---|
| P01–P02 | Anonymous/session CSRF, cookie attributes, token rotation, logout |
| A01–A02 | Seven synthetic roles, two facilities, facility administration restrictions |
| C01–C02 | Registration → diagnosis → case, foreign-facility/wrong-role denial |
| L01–L03 | Exact verified resolution, safe masking, authoritative patient link ETags, identity-bound revocation/role loss |
| S01–S02 | Supporter records, resolution/linking, safe portal, authoritative unlink |
| E01 | Authoritative GET ETag and stale precondition rejection |
| B01–B08 | Rendered login/linking/consent/portal, stale UI mutation, account switch and membership loss clearing |
| D01–D07 | Live reference catalogs, specimen/testing-facility permissions, result correction lineage and bounded lab races |
| D08–D15 | Treatment start, permissions/ETags, actor/day dose evidence, follow-ups, adverse events, explicit outcome races, terminal denial, patient/supporter evidence |
| D16–D20 | IK eligibility rejection, contact-driven TPT, TPT permission/ETag checks, outgoing investigation and exact contact link/self projection |
| D21–D27 | Treatment/TPT plans/events, reschedule/cancel races, controlled DUE/OVERDUE scheduler, privacy, IN_APP receipts, acknowledgements/resolution, event completion |
| D28 | Patient and supporter portal rendering against actual treatment/monitoring records |
| D29–D33 | Referral/transfer responsibility, historical access, report/outcome and transfer/write races |
| D34–D35 | Identity lookup budget, 8-request bounded two-session race (5 unavailable, 3 throttled) and durable audits |
| D36 | Patient/supporter revocation, independent role/permission/facility denials, explicit TPT completion and audit metadata privacy allowlist |

Database checks execute after workflows in read-only PostgreSQL transactions. Assertions verify final lineage/state, no duplicate successful writes and corresponding audit durability. Their SQL/UUIDs remain in the browser container's tmpfs and host process memory; only keys and count results are retained locally.

D28 patient DOM privacy covers the final alerts page; supporter privacy covers its combined treatment/monitoring/alerts DOM. Treatment/follow-up/monitoring API projections and original patient-home DOM are tested separately. Referral return, IK return/cancel and TPT stop/lost-to-follow-up are not covered by this ledger. Passing this suite does not close those gaps.

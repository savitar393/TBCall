# Contact investigation — Phase 4B

Binding contract: [approved v1.4B](architecture/TBCall_Application_API_v1.4B_Phase4B_Contact_Investigation_TPT.md). Contact snapshots, investigations, linked Patients and TPT remain separate records.

## Endpoints

All paths below are under `/api/v1`. Lists return `content`, `page`, `size`, `totalElements`; default page 0/size 20, maximum size 50. Detail/command responses include resource `version` and ETag. Existing-record writes require `If-Match: "<version>"` (428 missing, 400 malformed, 409 stale).

| Method | Path | Operation |
|---|---|---|
| POST | `/cases/{caseId}/contacts` | Atomically create Contact and initial investigation; 201 |
| GET | `/cases/{caseId}/contacts` | Scoped contact list |
| GET | `/contacts/{contactId}` | Contact snapshot and scoped summaries |
| PATCH | `/contacts/{contactId}` | Demographics only |
| POST | `/contacts/{contactId}/link-patient` | Exact identity reconfirmation; no replacement/unlink |
| GET | `/contact-investigations/incoming` | Recorded destination assignment |
| GET | `/contact-investigations/outgoing` | Recorded source, OUTGOING_REFERRAL only |
| GET | `/contact-investigations/{id}` | Source/destination handoff |
| POST | `/contact-investigations/{id}/receive` | Destination, SENT -> RECEIVED |
| POST | `/contact-investigations/{id}/start` | Destination, RECEIVED -> IN_PROGRESS |
| POST | `/contact-investigations/{id}/return` | Destination, RECEIVED/IN_PROGRESS -> RETURNED |
| POST | `/contact-investigations/{id}/cancel` | Source, SENT -> CANCELLED |
| POST | `/contact-investigations/{id}/complete` | Working facility, IN_PROGRESS -> COMPLETED |

## Creation and states

Creation input: `fullName` (required), optional `birthDate`, `sexCode`, `phone`, `address`, `relationshipToIndexCase`, `householdContact`, plus `workflowType`, optional `destinationFacilityId`, `notes`. Birth date cannot be future; supplied sex must be active. Phone uses the existing international normalization (08 -> +62). Unknown input fields are rejected.

The server derives indexCase, source facility, requestedAt and state. Clients cannot supply a linked patient, source, status or timestamps.

- INTERNAL requires no destination and starts IN_PROGRESS at source.
- OUTGOING_REFERRAL requires an active different destination and starts SENT.
- Outgoing receive records `receivedAt` (optional, defaults to Clock), between requestedAt and now. Receive does not complete investigation.
- Start/Cancel accept `{}`. Source cancellation is unavailable after receipt.
- Return requires nonblank `returnReason` and ends the workflow.
- Completion requires explicit `activeTbExcluded` and `tptEligible` booleans. Eligibility=true requires exclusion=true. Optional `investigatedAt` defaults to now and must follow request/receipt; `eligibilityAssessedAt` equals it. Optional `resultCode` is free text within the existing schema, not an invented official SITB code. Omitted/null completion notes preserve existing notes; supplied text replaces them.

Completion creates no patient, registration, case or TPT. No screening/lab value determines eligibility. A separate explicit TPT start is required.

## Authorization and privacy

TB_OFFICER requires CONTACT_READ/WRITE and relevant active facility assignments. INTERNAL investigation details belong to source; OUTGOING details belong to source or destination. Transitions require the specified side, and completion uses source for INTERNAL/destination for outgoing. Contacts with investigation history use recorded source/destination scope; contacts without any investigation use current index-case facility. Contact list results are filtered to this scope, including after transfer. Contact demographic writes/linking use the same authorized workflow scope.

Contact responses expose snapshot demographics, masked phone, relationship/household flag, linked-patient boolean and scoped investigation/TPT summaries. They never reveal linked Patient UUID/identity or an unrelated Patient record. TPT summaries require TPT_READ and the TPT's active facility scope.

Officer investigation projection includes state/times/facilities, minimum contact handoff, index-case UUID/category, recorded result/eligibility and investigation notes. It excludes index-patient identity, HIV/DM, laboratory/diagnosis prose, accounts, audit and sync. PATIENT/TREATMENT_SUPPORTER and admin/lab/program roles have no operational bypass or contact-investigation portal.

## Exact patient linking

Read Contact first, then POST link-patient with its If-Match and `patientId`, WNI `citizenship`/16-digit `nik` or WNA `citizenship`/`otherIdentityNumber`, and secondary exact `fullName` or `birthDate` (optional `bpjsNumber` must also match). This reuses Phase 2 `PatientIdentityService.existing`, including name normalization, ambiguity errors and demographic refresh after its patient lock. UUID-only linking is rejected even for in-scope patients. No fuzzy search, patient creation, snapshot overwrite, link replacement or unlink occurs.

## Transactions and authority

READ_COMMITTED. Create locks TBCase before inserts. Investigation writes lock Contact then ContactInvestigation; linking/Contact PATCH lock Contact. Scalar scoped IDs precede entity hydration so waiters read fresh state. Partial indexes guard one open investigation and one open contact TPT; no retries.

ContactSourceAuthorityPolicy checks local contact writes and investigation transitions after role/scope checks under locks, before mutation. Its prototype is local authorization only; earlier Clinical/Laboratory/Referral policies are unchanged. Index-case transfer never moves existing investigation or TPT facilities.

Audit actions: CONTACT_CREATED, CONTACT_UPDATED, CONTACT_LINKED_PATIENT, CONTACT_INVESTIGATION_SENT, CONTACT_INVESTIGATION_RECEIVED, CONTACT_INVESTIGATION_STARTED, CONTACT_INVESTIGATION_RETURNED, CONTACT_INVESTIGATION_CANCELLED, CONTACT_INVESTIGATION_COMPLETED. Metadata is actor/action/target/correlation only; no contact identity, eligibility, result, notes or return reason.

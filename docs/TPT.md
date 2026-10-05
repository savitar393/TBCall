# Contact-driven preventive treatment — Phase 4B

Binding contract: [approved v1.4B](architecture/TBCall_Application_API_v1.4B_Phase4B_Contact_Investigation_TPT.md). TPT is a separate PreventiveTreatment aggregate. This phase supports explicit clinician-selected contact-driven enrollment only.

## Endpoints

All paths below are under `/api/v1`. Lists use page 0/size 20 by default, maximum 50. Existing TPT writes require TPT If-Match; responses include version/ETag.

| Method | Path | Operation |
|---|---|---|
| POST | `/contact-investigations/{id}/tpt` | Start explicit contact TPT; 201 |
| GET | `/contacts/{contactId}/tpt` | History filtered by TPT facility |
| GET | `/preventive-treatments/{id}` | Officer detail |
| PATCH | `/preventive-treatments/{id}` | ACTIVE metadata only |
| POST | `/preventive-treatments/{id}/complete` | ACTIVE -> COMPLETED |
| POST | `/preventive-treatments/{id}/stop` | ACTIVE -> STOPPED; reason required |
| POST | `/preventive-treatments/{id}/lost-to-follow-up` | ACTIVE -> LOST_TO_FOLLOW_UP |
| GET | `/me/tpt` | VERIFIED SELF safe latest TPT |

## Eligibility and enrollment

Start requires COMPLETED investigation, activeTbExcluded=true, tptEligible=true, existing contact index case, and no PLANNED/ACTIVE TPT for that contact. INTERNAL facility derives from source; outgoing derives from destination. Actor must be TB_OFFICER + TPT_WRITE assigned to that active facility. Server sets contact owner, patient=null, same contact indexCase, facility and ACTIVE state. V6 lineage remains enforced.

Input: optional `regimenCode`/`regimenDescription` (at least one), required `startDate`, optional `plannedEndDate`, positive `durationValue`, `durationUnit` DAY/WEEK/MONTH, positive `weightKg`, `drugSource`, `notes`. Start date cannot be future; planned end cannot precede start. Weight respects the existing numeric(6,2) range/precision. Duration fields are optional independently and never inferred. Unknown fields are rejected.

## Regimen concepts

| TBCall canonical code | Display | Category |
|---|---|---|
| TPT_SO_6H | TPT 6H | TB_SO |
| TPT_SO_3HP | TPT 3HP | TB_SO |
| TPT_SO_3HR | TPT 3HR | TB_SO |
| TPT_SO_4R | TPT 4R | TB_SO |
| TPT_SO_1HP | TPT 1HP | TB_SO |
| TPT_RO_6LFX | TPT RO 6Lfx | TB_RO |

All six use PREVENTIVE. Supplied catalog regimen must be active and match the index-case category. These are approved TBCall identifiers, not official SITB physical database/API codes. Eligibility/dose selection follows current national guidance and clinician assessment. V14 inserts no fixed regimen_drugs, effective dates, composition, dosing or duration rules.

For individualized regimens, especially RO contexts where 6Lfx is inappropriate, supply `regimenDescription` without inventing another code. Description is the dedicated safe regimen display field; put private clinical narratives in officer notes. Both code and description may be supplied; generic PATCH cannot change the catalog regimen.

## Update, close and continuity

ACTIVE PATCH permits only plannedEndDate, durationValue/unit, weightKg, drugSource, regimenDescription and notes. Omitted values remain; explicit null clears optional values. Description cannot be cleared if no catalog regimen remains. Owner/facility/indexCase/regimen/start/status/actualEndDate are immutable through PATCH.

Closure uses optional `actualEndDate` defaulting to today, with startDate <= actualEndDate <= today. Stop requires nonblank `closureReason`; LTFU reason is optional. No outcome_code is populated, and national TPT outcome mapping is deferred. Closed history permits an otherwise valid new contact-driven TPT.

Officer detail and history use TPT.facility, independently of index-case currentFacility and investigation ownership. This also preserves history for pre-existing contact-owned TPT without an investigation after index-case transfer. Index-case transfer never relocates investigations/TPT or rewrites their history.

TPT start locks Contact -> ContactInvestigation -> open-TPT check/insert. Update/closure locks Contact -> PreventiveTreatment. READ_COMMITTED; scoped scalar IDs before lock/hydration; indexes remain final guards; no retries. ContactSourceAuthorityPolicy checks TPT writes under those locks. Source denial rolls back changes and success audits; prior policies stay unchanged.

## Patient SELF

PATIENT + TPT_READ + VERIFIED SELF sees latest TPT through direct patient ownership or contact.linkedPatient. Contact-driven starts always use contact ownership; direct-patient enrollment is not added. Latest orders by startDate, createdAt and UUID descending. More than one ACTIVE episode through either ownership path returns 409 ACTIVE_TPT_AMBIGUOUS.

Safe projection contains status, regimen display/dedicated description, dates, duration and facility display only. No index-case identity/category, contact relationship/address/phone, eligibility/result/investigation notes, weight, officer notes, drugSource, closureReason, account/audit/sync or writable aggregate ID/version is exposed. No patient adherence write or supporter TPT access is implemented.

Audit actions: TPT_STARTED, TPT_UPDATED, TPT_COMPLETED, TPT_STOPPED, TPT_LOST_TO_FOLLOW_UP. Metadata contains only actor/action/target/correlation; no regimenDescription, notes, eligibility or closureReason.

## Later architecture

Phase 4C must decide whether monitoring_plans becomes multi-target before sharing monitoring/alerts between TB treatment and TPT. Monitoring schedules, alerts, notifications, TPT adherence/adverse tracking, automated eligibility/regimen/dose, non-contact enrollment, contact-to-TB promotion and SITB networking are deferred.

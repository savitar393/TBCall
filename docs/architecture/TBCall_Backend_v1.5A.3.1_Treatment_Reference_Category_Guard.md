# TBCall Backend v1.5A.3.1 — Treatment Reference Category Guard

Base under review: `923d1708171ca14d67256e51be6372ee440ecf4a`

This is a narrow corrective checkpoint on the existing `codex/backend-f2c-treatment-reference` branch.

## Finding

The approved v1.5A.3 contract requires `regimens` to return only active `TB_TREATMENT` rows with a non-null TB case category.

The current service query filters only:
- `r.active=true`
- `r.regimenKind='TB_TREATMENT'`

It does not require `r.tbCaseCategoryCode is not null`.

The schema permits a null case category, so an active TB_TREATMENT row with no category could be returned as `caseCategoryCode: null`. That breaks the published contract and makes safe case-category filtering impossible.

## Required fix

Add:

`r.tbCaseCategoryCode is not null`

to the regimen query.

Keep ordering by `r.tbCaseCategoryCode, r.code`.

Do not change the response DTO shape.

## Regression test

Insert an active `TB_TREATMENT` regimen with null `tb_case_category_code` and assert it is excluded from `/api/v1/treatment-reference-data`.

Keep all existing PREVENTIVE/inactive exclusion and exact projection assertions.

## Boundaries

Do not:
- modify V1–V17;
- create V18;
- modify frontend files;
- change treatment write behavior;
- change any other reference group;
- begin F2C UI.

Run:

```powershell
.\mvnw.cmd clean test
```

All existing 997 tests plus the new regression must pass.

Update `docs/PHASE5A_3_REPORT.md` only as necessary to record this review fix and final test total.

Commit and push the correction to the same branch and return:
- new commit SHA;
- exact changed paths;
- exact clean-test result;
- confirmation the null-category regression is covered.

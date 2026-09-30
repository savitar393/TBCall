# TBCall persistence foundation

This module is the migration-managed persistence layer for TBCall. It contains no API, frontend, SITB connector, clinical automation, or development patient seed.

## Requirements

- Java 21
- Maven 3.9 or newer
- PostgreSQL 15 or newer for application startup
- Docker-compatible container runtime for `mvn test`

Set `TBCALL_DB_URL`, `TBCALL_DB_USER`, and `TBCALL_DB_PASSWORD` for a PostgreSQL database, then start with `mvn spring-boot:run`. The database user needs permission to install the V1 `pgcrypto`, `citext`, and `pg_trgm` extensions and create schema objects. For tests, run `mvn clean test`; Testcontainers starts empty PostgreSQL 16 databases and Spring Boot applies V1 through V7 before Hibernate validates the mappings. All entity/repository Java sources are committed under `src/main/java`; no generation helper or local reference PDF is required to compile or test a clone.

## Ownership and mapping

Flyway is the schema authority (`spring.jpa.hibernate.ddl-auto=validate`). V1 and V2 are immutable historical migrations. V3–V7 implement the [Domain / Schema v1.1 checkpoint](docs/architecture/TBCall_Domain_Schema_v1.1.md): current reference catalogs, resistance/condition observations, relational integrity and RBAC seeds. Provenance and exact grants are in [REFERENCE_DATA.md](REFERENCE_DATA.md), and operational terminology is in [TERMINOLOGY.md](docs/TERMINOLOGY.md). Code strings are TBCall canonical choices, not claims about SITB database or API codes.

Each V1 table has a corresponding JPA entity. UUID foreign keys are lazy, unidirectional references toward the parent; reference table foreign keys are stored as code strings while PostgreSQL enforces them. The four composite-key join tables use explicit `@IdClass` keys. Polymorphic target IDs in external identifiers, sync items, monitoring events, and audit logs remain UUID values rather than false JPA foreign keys. PostgreSQL `jsonb`, `inet`, and `citext` columns have explicit mappings. Database defaults are retained through dynamic inserts, and database-managed creation/update timestamps are read-only in JPA.

`TBCase` also uses dynamic updates so changes to its clinical classification do not overwrite an unhydrated database-default status after insertion. Newly inserted entities can still have null in-memory defaults until refreshed/reloaded; callers must load database state before relying on those values. Before services are implemented, define consistent default hydration/update handling for the other existing entities that currently use dynamic inserts alone.

The V1 `lab_requests` constraint permits either `registration_id` or `case_id`, exactly one per row. The integration suite tests both paths. The migration includes its own `BEGIN`/`COMMIT` around V1; Flyway also starts a transaction, so PostgreSQL emits a harmless nested-transaction warning on first migration. The source was preserved unchanged.

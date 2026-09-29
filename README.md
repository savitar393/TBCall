# TBCall persistence foundation

This module is the migration-managed persistence layer for TBCall. It contains no API, frontend, SITB connector, clinical automation, or development patient seed.

## Requirements

- Java 21
- Maven 3.9 or newer
- PostgreSQL 15 or newer for application startup
- Docker-compatible container runtime for `mvn test`

Set `TBCALL_DB_URL`, `TBCALL_DB_USER`, and `TBCALL_DB_PASSWORD` for a PostgreSQL database, then start with `mvn spring-boot:run`. The database user needs permission to install the V1 `pgcrypto`, `citext`, and `pg_trgm` extensions and create schema objects. For tests, run `mvn test`; Testcontainers starts an empty PostgreSQL 16 database and Spring Boot applies both Flyway migrations before Hibernate validates the mappings.

## Ownership and mapping

Flyway is the schema authority (`spring.jpa.hibernate.ddl-auto=validate`). The supplied V1 migration is copied byte for byte to `src/main/resources/db/migration`. V2 seeds only reference values described in [REFERENCE_DATA.md](REFERENCE_DATA.md). Those code strings are TBCall canonical choices, not claims about SITB database or API codes.

Each V1 table has a corresponding JPA entity. UUID foreign keys are lazy, unidirectional references toward the parent; reference table foreign keys are stored as code strings while PostgreSQL enforces them. The four composite-key join tables use explicit `@IdClass` keys. Polymorphic target IDs in external identifiers, sync items, monitoring events, and audit logs remain UUID values rather than false JPA foreign keys. PostgreSQL `jsonb`, `inet`, and `citext` columns have explicit mappings. Database defaults are retained through dynamic inserts, and database-managed creation/update timestamps are read-only in JPA.

The V1 `lab_requests` constraint permits either `registration_id` or `case_id`, exactly one per row. The integration suite tests both paths. The migration includes its own `BEGIN`/`COMMIT` around V1; Flyway also starts a transaction, so PostgreSQL emits a harmless nested-transaction warning on first migration. The source was preserved unchanged.

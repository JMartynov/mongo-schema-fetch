# Use Cases Matrix & Implementation Tasks

This file tracks the use cases extracted from `OLD_README.md` and lists the tasks required to implement them fully, including functionality, testing, and documentation.

## UC-1: Ручной профилинг разработчиком (Manual Profiling)
**Description:** A developer investigates a slow query locally or on staging. They run `mongo-schema-fetch <uri>`, receive `schema-payload.json`, visually verify the absence of real user data, and upload it to the Web UI via an interactive "Magic Link" for recommendations.
**Implementation Status:**
- [x] CLI generates `schema-payload.json`.
- [x] Zero Data Leak logic (scrubbing sensitive data).
- [x] Magic Link interactive prompt (implemented in `src/upload.ts`).
- [x] Unit Tests verifying interactive behavior.
- [x] Acceptance Tests.
- [x] Update documentation to formally explain this use case.

## UC-2: Интеграция в CI/CD (Предотвращение деградации) (CI/CD Integration)
**Description:** A step in a CI/CD pipeline (e.g., GitHub Actions) that runs against a test DB. The payload, along with a query file, is sent to the service API via `--auto-analyze`. If the analysis detects a degradation (e.g., Full Collection Scan), the pipeline fails and blocks production deployment.
**Implementation Status:**
- [x] `--quiet` mode for CI/CD environments.
- [x] `--query-file <path>` CLI parameter.
- [x] `--auto-analyze` CLI parameter and API mock logic (with process exit codes).
- [x] Unit Tests verifying CI/CD behavior.
- [x] Acceptance Tests.
- [x] Update documentation to formalize this CI/CD workflow and the new parameters.

## UC-3: Безопасный экспорт аналитиком данных (Secure Export by Analyst)
**Description:** An analyst or DBA runs the utility against a secondary node in a production cluster using the `--read-preference secondary` flag to gather statistics without burdening the primary writing node.
**Implementation Status:**
- [x] `--read-preference <mode>` CLI parameter implemented and passed to the MongoDB connection.
- [x] Unit Tests verifying read preference parsing and passing.
- [x] Acceptance Tests.
- [x] Update documentation to formalize this use case.

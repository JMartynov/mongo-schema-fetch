# CLI Options Acceptance Test Coverage Report

This report evaluates which `mongo-schema-fetch` command-line options are covered by the project's acceptance test suite (Cucumber Gherkin features under `features/` and Vitest container-based integration tests under `test/cli-acceptance.test.ts`).

---

## 📊 Options Coverage Summary Table

| Option | Covered by Acceptance? | Test Context / Scenario Name |
| :--- | :---: | :--- |
| `<uri>` | **YES** | Used as the main argument in all Cucumber and Vitest scenarios. |
| `--db <name>` | **YES** | Used in almost all scenarios (e.g. `--db testdb`). |
| `--collections <list>` | **NO** | Only covered by CLI unit tests (`test/cli-unit.test.ts`). |
| `--all-collections` | **YES** | Used in almost all scenarios (e.g. `--all-collections`). |
| `--out <path>` | **YES** | Used in all scenarios to output results (e.g. `--out ${outPath}`). |
| `--sample <number>` | **YES** | Used in security scenarios (e.g. `--sample 1000`). |
| `--enum-threshold <number>` | **YES** | Used in security scenarios (e.g. `--enum-threshold 1000`). |
| `--store-values` | **YES** | Tested in `Fetch schema from MongoDB <version>...` and Vitest acceptance tests. |
| `--stored-values-limit <number>` | **NO** | Only covered by unit tests (`test/schema.test.ts`, `test/cli-unit.test.ts`). |
| `--distinct-fields-threshold <number>`| **NO** | Only covered by unit tests (`test/schema.test.ts`, `test/cli-unit.test.ts`). |
| `--sanitize-pii` | **NO** | Only covered by unit tests (`test/schema.test.ts`, `test/cli-unit.test.ts`). |
| `--read-preference <mode>` | **YES** | Tested in `Fetch schema from MongoDB with secondaryPreferred read preference`. |
| `--quiet` | **YES** | Passed in all runs to prevent interactive prompts during test execution. |
| `--query-file <path>` | **NO** | Only covered by mock unit tests (`test/upload.test.ts`). |
| `--auto-analyze` | **NO** | Only covered by mock unit tests (`test/upload.test.ts`). |
| `--additional` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `-u, --username <username>` | **YES** | Tested in all authentication-related Cucumber scenarios. |
| `-p, --password [password]` | **YES** | Tested in all authentication-related Cucumber scenarios. |
| `--auth-source <database>` | **YES** | Tested in custom authentication and MONGODB-X509 scenarios. |
| `--auth-mechanism <mechanism>` | **YES** | Tested in authentication scenarios (SCRAM-SHA-256, SCRAM-SHA-1, MONGODB-X509). |
| `--auth-mechanism-properties <props>`| **NO** | Declared in options parsing but not verified in any acceptance scenario. |
| `--tls` | **YES** | Tested in all TLS and MONGODB-X509 scenarios. |
| `--tls-ca-file <path>` | **YES** | Tested in TLS and MONGODB-X509 scenarios. |
| `--tls-certificate-key-file <path>`| **YES** | Tested in mTLS and MONGODB-X509 scenarios. |
| `--tls-certificate-key-file-password <pwd>`| **YES** | Tested in `Fetch schema from TLS-enabled MongoDB using password-encrypted client certificate`. |
| `--tls-allow-invalid-certificates` | **YES** | Tested in `Fetch schema from TLS-enabled MongoDB succeeds if invalid CA verification is bypassed`. |
| `--tls-allow-invalid-hostnames` | **YES** | Tested in `Fetch schema from TLS-enabled MongoDB succeeds if mismatching hostname is bypassed`. |
| `--connect-timeout-ms <ms>` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--socket-timeout-ms <ms>` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--server-selection-timeout-ms <ms>`| **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--max-idle-time-ms <ms>` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--max-pool-size <size>` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--min-pool-size <size>` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--app-name <name>` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--retry-writes` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--no-retry-writes` | **NO** | Only covered by default configuration parsing. |
| `--retry-reads` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--no-retry-reads` | **NO** | Only covered by default configuration parsing. |
| `--direct-connection` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--no-direct-connection` | **NO** | Only covered by default configuration parsing. |
| `--load-balanced` | **NO** | Not covered by any acceptance or integration test. |
| `--compressors <list>` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--write-concern-w <w>` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--write-concern-j` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--no-write-concern-j` | **NO** | Only covered by default configuration parsing. |
| `--write-concern-wtimeout-ms <ms>` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--read-concern-level <level>` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |

---

## 🔍 Detailed Analysis of Uncovered Options

### 1. Options covered only by unit/help tests:
* **`--collections <list>`**: Used to target specific collections. In acceptance tests, `--all-collections` is used exclusively.
* **`--stored-values-limit <number>` & `--distinct-fields-threshold <number>`**: Added in Phase 3. Handled by core parser tests and CLI argument parsing unit tests, but not explicitly specified in the container-based Cucumber features.
* **`--sanitize-pii`**: Added in Phase 4. Verified via core schema cleaning unit tests and CLI argument unit tests, but security acceptance tests run with the default setting (disabled).
* **`--query-file <path>` & `--auto-analyze`**: Used for pipeline optimizer checks. Tested in unit tests (`test/upload.test.ts`), but not in Cucumber E2E tests because it relies on mocking the platform API connection.

### 2. Connection flags with default/negated fallbacks:
* **`--no-retry-writes`**, **`--no-retry-reads`**, **`--no-direct-connection`**, **`--no-write-concern-j`**: The positive forms are verified in the comprehensive connection test case, but the negated versions are only handled implicitly by the Commander options structure.
* **`--auth-mechanism-properties <properties>`**: Configured in parser but not used in the authentication scenarios.
* **`--load-balanced`**: Requires a specialized load-balanced MongoDB cluster configuration (e.g. behind a proxy), which is not easily reproducible in standard single-container testcontainers environments.

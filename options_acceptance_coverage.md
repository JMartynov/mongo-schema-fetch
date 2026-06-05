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

---

## 📅 Test Implementation & Invariants Plan

To achieve comprehensive acceptance test coverage across all options, we will implement new Gherkin scenarios and step definitions covering the missing options and their key invariants:

### 1. New Gherkin Scenarios (`features/cli-acceptance.feature`)

#### A. Target Collection Selection (`--collections`)
* **Scenario**: Fetch schema targeting a specific collection.
* **Coverage**: `--collections <list>`
* **Verification**: Assert that only the specified collection is included in the payload, and others are ignored.

#### B. Negated Connection Options
* **Scenario**: Fetch schema with negated connection options.
* **Coverage**: `--no-retry-writes`, `--no-retry-reads`, `--no-direct-connection`, `--no-write-concern-j`
* **Verification**: Run CLI with these negated flags and assert exit code `0`.

#### C. Pipeline Auto-Analysis (`--query-file` and `--auto-analyze`)
* **Scenarios**: 
  1. Auto-analyze passes when query is optimized (no `"fail_test"`).
  2. Auto-analyze fails when query degrades performance (contains `"fail_test"`).
* **Coverage**: `--query-file <path>`, `--auto-analyze`
* **Verification**: Verify that exit codes accurately represent optimization check results (exit code `0` for pass, `1` for fail).

#### D. Value Limits & PII Option Flags (`--store-values`, `--stored-values-limit`, `--sanitize-pii`)
* **Scenario**: Fetch schema with customized stored values limit and PII sanitization.
* **Coverage**: `--store-values`, `--stored-values-limit`, `--sanitize-pii`
* **Verification**: Assert that values are stored but only up to the specified limit and sensitive fields are filtered.

#### E. Edge Case & Invariant Violations (Invalid Options)
* **Scenario 1**: CLI fails if distinct fields threshold is exceeded (`--distinct-fields-threshold`).
  * **Invariant**: When the unique keys count in a collection exceeds `distinctFieldsAbortThreshold`, the parser throws an abort error.
  * **Test**: Set `--distinct-fields-threshold 1` on a collection with `name` and `age` fields, verifying it exits with `1`.
* **Scenario 2**: Fetch schema fails if load balanced option is enabled on standalone connection (`--load-balanced`).
  * **Invariant**: The MongoDB driver throws `MongoInvalidArgumentError` if `loadBalanced` is set for standalone/replica sets.
  * **Test**: Run with `--load-balanced` and assert exit code `1`.

### 2. Step Definition Extensions (`features/step_definitions/cli.steps.ts`)
* Implement step definitions matching:
  - `When I run mongo-schema-fetch with "--collections users" and quiet mode` (checks `--collections`)
  - `When I run mongo-schema-fetch with username, password, and negated connection parameters and quiet mode` (checks `--no-retry-writes` etc.)
  - `Given a query file {string} containing {string}` (creates temporary query file)
  - `When I run mongo-schema-fetch with "--all-collections --query-file query-ok.json --auto-analyze" and quiet mode` (checks auto-analyze)
  - `When I run mongo-schema-fetch with "--store-values --stored-values-limit 1 --distinct-fields-threshold 50 --sanitize-pii --all-collections" and quiet mode` (checks stored values limit)
  - `When I run mongo-schema-fetch with "--all-collections --distinct-fields-threshold 1" and quiet mode` (checks distinct fields threshold abort)
  - `When I run mongo-schema-fetch with "--load-balanced --all-collections" and quiet mode` (checks load-balanced error handling)
  - Extend the existing `When I run mongo-schema-fetch with all extended connection options...` step to include `--auth-mechanism-properties SERVICE_NAME:mongodb` to cover `--auth-mechanism-properties`.


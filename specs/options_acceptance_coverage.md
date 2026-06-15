# CLI Options Acceptance Test Coverage Report

This report evaluates which `mongo-schema-fetch` command-line options are covered by the project's acceptance test suite (Cucumber Gherkin features under `features/` and Vitest container-based integration tests under `test/cli-acceptance.test.ts`).

---

## 📊 Options Coverage Summary Table

| Option | Covered by Acceptance? | Test Context / Scenario Name |
| :--- | :---: | :--- |
| `<uri>` | **YES** | Used as the main argument in all Cucumber and Vitest scenarios. |
| `--db <name>` | **YES** | Used in almost all scenarios (e.g. `--db testdb`). |
| `--collections <list>` | **YES** | Tested in `Fetch schema targeting a specific collection` and `Fetch schema targeting a non-existent collection`. |
| `--all-collections` | **YES** | Used in almost all scenarios (e.g. `--all-collections`). |
| `--out <path>` | **YES** | Used in all scenarios to output results (e.g. `--out ${outPath}`). |
| `--sample <number>` | **YES** | Used in security scenarios (e.g. `--sample 1000`). |
| `--enum-threshold <number>` | **YES** | Used in `Fetch schema with enum-threshold below unique values count` and security scenarios. |
| `--store-values` | **YES** | Tested in `Fetch schema from MongoDB <version>...` and Vitest acceptance tests. |
| `--stored-values-limit <number>` | **YES** | Tested in `Fetch schema with store-values and stored-values-limit`. |
| `--distinct-fields-threshold <number>`| **YES** | Tested in `CLI fails if distinct fields threshold is exceeded`. |
| `--sanitize-pii` | **YES** | Tested in `Fetch schema with sanitize-pii removes enum values for sensitive fields`. |
| `--read-preference <mode>` | **YES** | Tested in `Fetch schema from MongoDB with secondaryPreferred read preference`. |
| `--quiet` | **YES** | Passed in all runs to prevent interactive prompts during test execution. |
| `--query-file <path>` | **YES** | Tested in `Auto-analyze passes when query is optimized` and `Auto-analyze fails when query degrades performance`. |
| `--auto-analyze` | **YES** | Tested in `Auto-analyze passes when query is optimized` and `Auto-analyze fails if query-file is not provided`. |
| `--additional` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `-u, --username <username>` | **YES** | Tested in all authentication-related Cucumber scenarios. |
| `-p, --password [password]` | **YES** | Tested in all authentication-related Cucumber scenarios. |
| `--auth-source <database>` | **YES** | Tested in custom authentication and MONGODB-X509 scenarios. |
| `--auth-mechanism <mechanism>` | **YES** | Tested in authentication scenarios (SCRAM-SHA-256, SCRAM-SHA-1, MONGODB-X509). |
| `--auth-mechanism-properties <props>`| **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
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
| `--no-retry-writes` | **YES** | Tested in `Fetch schema with negated connection options`. |
| `--retry-reads` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--no-retry-reads` | **YES** | Tested in `Fetch schema with negated connection options`. |
| `--direct-connection` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--no-direct-connection` | **YES** | Tested in `Fetch schema fails if direct connection is disabled on single-node replica set`. |
| `--load-balanced` | **YES** | Tested in `Fetch schema fails if load balanced option is enabled on standalone connection`. |
| `--compressors <list>` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--write-concern-w <w>` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--write-concern-j` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--no-write-concern-j` | **YES** | Tested in `Fetch schema with negated connection options`. |
| `--write-concern-wtimeout-ms <ms>` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--read-concern-level <level>` | **YES** | Tested in `Fetch schema from authenticated MongoDB using all extended connection options`. |
| `--server <[host:]port>` | **YES** | Tested in `CLI connects and successfully uploads to a local server` and validation scenarios. |
| `--query <string>` | **YES** | Tested in `CLI connects and successfully uploads to a local server` and validation scenarios. |
| `--machine` | **YES** | Tested in `CLI runs in machine mode and writes logs to default file`. |
| `--log-file <path>` | **YES** | Tested in `CLI runs in machine mode and writes logs to a custom file`. |

---

## 🔍 Detailed Analysis of Option Invariants

This section defines the key business rules and validation invariants for each of the major configuration options and documents how they are verified in the E2E Cucumber suite:

### 1. Distinct Fields Threshold Abort (`--distinct-fields-threshold`)
* **Invariant**: When the number of unique fields encountered during schema parsing exceeds this threshold, the schema parsing process must immediately abort.
* **Acceptance Test**: Verified in `CLI fails if distinct fields threshold is exceeded` by setting the threshold to `1` on a collection with two fields. Assert exit code `1`.

### 2. Standalone Load Balancing Error (`--load-balanced`)
* **Invariant**: Enabling load balancing on a standalone MongoDB instance is invalid and must cause the MongoDB driver to reject the configuration.
* **Acceptance Test**: Verified in `Fetch schema fails if load balanced option is enabled on standalone connection` which triggers exit code `1`.

### 3. Pipeline Auto-Analysis Constraint (`--auto-analyze`)
* **Invariant**: `--auto-analyze` requires a query file parameter (`--query-file`). Invoking the CLI with `--auto-analyze` but without `--query-file` is invalid.
* **Acceptance Test**: Verified in `Auto-analyze fails if query-file is not provided`. Assert exit code `1`.

### 4. Stored Values Constraint (`--stored-values-limit`)
* **Invariant**: When collecting values for schema analysis (`--store-values`), the number of sample values collected per field must not exceed the specified limit.
* **Acceptance Test**: Verified in `Fetch schema with store-values and stored-values-limit` by passing `--stored-values-limit 1` and asserting that the `enumValues` array for `role` has at most 1 item.

### 5. Enum Threshold Constraint (`--enum-threshold`)
* **Invariant**: Unique values are only preserved as `enumValues` if their count is strictly less than the specified threshold.
* **Acceptance Test**: Verified in `Fetch schema with enum-threshold below unique values count` by setting `--enum-threshold 2` on a collection where `role` has 2 unique values (`admin` and `user`), and asserting that `enumValues` is not stored/empty.

### 6. PII Sanitization Invariant (`--sanitize-pii`)
* **Invariant**: When `--sanitize-pii` is active, fields matching sensitive patterns (like `email`) must not leak any raw values or enum values.
* **Acceptance Test**: Verified in `Fetch schema with sanitize-pii removes enum values for sensitive fields` by asserting that the `email` field has no `enumValues` created.

### 7. Connection Options Negation Invariants
* **Invariants**: Negated connection flags like `--no-retry-writes`, `--no-retry-reads`, and `--no-write-concern-j` must parse cleanly and allow connection without errors.
* **Acceptance Test**: Verified in `Fetch schema with negated connection options`. Assert exit code `0`.

### 8. Target Collection Resolution & Warning Invariant
* **Invariant**: When specific collections are requested via `--collections`, any non-existent collections must be skipped with a warning, while existing collections are processed successfully.
* **Acceptance Test**: Verified in `Fetch schema targeting a non-existent collection` by targeting `users,nonexistent` and verifying the exit code is `0`, `users` is processed, and `nonexistent` is excluded.

### 9. Local Server Obligatory Query Invariant (`--server` + `--query` / `--query-file`)
* **Invariant**: When `--server` is specified, either `--query` or `--query-file` must be provided.
* **Acceptance Test**: Verified in `CLI fails if --server is passed without query parameters` which asserts exit code `1` and error message: `Error: --query or --query-file must be provided when using --server`.

### 10. Query JSON Validation Invariant (`--query`)
* **Invariant**: When `--query` is provided, it must contain a valid JSON string.
* **Acceptance Test**: Verified in `CLI fails if --query has invalid JSON formatting` which asserts exit code `1` and error message: `Error: --query must be valid JSON`.

### 11. Headless Machine Mode Output and Emojis Suppression (`--machine`)
* **Invariant**: When `--machine` is enabled, all terminal styling, ASCII banners, stage indicators, and progress emojis are suppressed, resulting in completely clean stdout.
* **Acceptance Test**: Verified in `CLI runs in machine mode and writes logs to default file` which asserts that the terminal output is completely empty on success.

### 12. Headless Machine Mode File Logging (`--machine` + `--log-file`)
* **Invariant**: Running in machine mode writes detailed, UTC-timestamped execution logs to `schema-fetch.log` by default, or a custom file specified by `--log-file`.
* **Acceptance Test**: Verified in `CLI runs in machine mode and writes logs to default file` and `CLI runs in machine mode and writes logs to a custom file` by asserting the existence of the log files and checking their contents for UTC timestamps.


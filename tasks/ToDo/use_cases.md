# Extracted Use Cases & Implementation Status

This document contains all use cases extracted from [OLD_README.md](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/OLD_README.md) detailing the target scenarios, operational requirements, and their exact implementation status in the codebase.

---

## UC-1: Manual Developer Profiling (DX-Focused)

### Description
A developer is investigating query performance issues on a local or staging MongoDB database. They invoke the CLI tool, choose target collections manually via an interactive console select menu (with support for selection highlights, space key toggles, etc.), get a memory-safe and zero-data-leak schema payload generated locally on disk, and are optionally prompted to instantly upload the payload to the Web UI via a secure "Magic Link" which opens their default web browser for analysis.

### Requirements & Invariants
1. **Interactive Prompt**: If no collection names are supplied via arguments, list all collections with prompts. Only auto-scan if total collections count is small (e.g. <= 10).
2. **Zero Data Leak Policy**: Eliminate all raw data `values` in the schema payload (including ObjectIDs, Dates, strings, and numbers).
3. **Low-Cardinality Enum Preservation**: Preserve enumerated values ONLY for `"String"` or `"Number"` fields where unique value count in the sample is less than the threshold (default 20), and string values do not exceed 100 characters in length.
4. **Magic Link Confirmation**: Offer to upload the local file via a mock POST request and launch the default system browser opening a temporary analysis link.
5. **No Interference**: Ensure the interactive prompt is disabled if the user explicitly passes output files or `--quiet` flags.

### Status
**Implemented**

* **Verification**:
  * Unit tests in [upload.test.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/test/upload.test.ts) check the confirmation prompts and browser auto-opening.
  * Unit tests in [schema.test.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/test/schema.test.ts) verify enum extraction and values stripping.
  * Integration tests in [cli-acceptance.test.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/test/cli-acceptance.test.ts) and Cucumber step definitions in [cli.steps.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/features/step_definitions/cli.steps.ts) verify the complete end-to-end execution.

---

## UC-2: Automated CI/CD Pipeline Integration (Performance Regression Guard)

### Description
The utility executes silently in automated workflows (such as GitHub Actions or GitLab CI) against a test database. All interactive features and Magic Link upload prompts must be fully bypassed. The CLI receives a query JSON file via `--query-file` and a target `--auto-analyze` flag. It transmits both the schema payload and the query file to the optimizer API. If the API returns any query degradation report (like an index miss or a Full Collection Scan), the CLI tool exits with code `1`, causing the pipeline runner to fail and block deployment.

### Requirements & Invariants
1. **Quiet Mode**: Suppress all interactive prompt blocks completely.
2. **Parameter Enforcements**: Require `--query-file` to be specified if `--auto-analyze` is active.
3. **Auto-Analyze Logic**: Verify files exist, call the optimizer API endpoint, and parse the result.
4. **Status Exit Codes**: Exit with code `0` on success/clean runs, and exit with code `1` on API failures or missing options.

### Status
**Implemented**

* **Verification**:
  * Argument syntax and validation failures are verified in [cli.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/cli.ts) (lines 29-32).
  * API response routing and exit codes are tested in [upload.test.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/test/upload.test.ts) and BDD acceptance features.

---

## UC-3: Safe Production Secondary Scan (DBA/Analyst)

### Description
A database administrator (DBA) or data analyst runs the schema profiling command on a production cluster replica set or sharded cluster. To avoid adding load or locks on the primary database node, they route all read operations to a secondary node.

### Requirements & Invariants
1. **Read Preference Parameter**: Support `--read-preference` (e.g. `secondary` or `secondaryPreferred`) command-line arguments.
2. **Connection Binding**: Pass the parsed preference options to the MongoDB connection constructor.

### Status
**Implemented**

* **Verification**:
  * Unit tests in [cli-unit.test.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/test/cli-unit.test.ts) assert correct CLI option parsing.
  * Acceptance test scenarios in [cli-acceptance.feature](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/features/cli-acceptance.feature) verify end-to-end connection configurations routing to secondary preferred nodes.

---

## UC-4: Resilient Database Privilege Execution (Permissions Tolerance)

### Description
The utility is expected to run successfully in environments where the user is granted restrictive read-only permissions on select databases and collections, without throwing fatal connection or query execution errors.

### Requirements & Invariants
1. **Admin command safety**: Do not fail fatal if `db.adminCommand({ buildInfo: 1 })` or `hostInfo` fail due to insufficient database roles. Skip those sections gracefully.
2. **Stats Fallbacks**: If `collStats` is blocked, fallback to estimation methods (`countDocuments` and `estimatedDocumentCount`).
3. **Index Stats Tolerances**: If index stats aggregation is unauthorized, proceed with empty index details rather than failing execution.

### Status
**Implemented**

* **Verification**:
  * Handled gracefully in [db.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/db.ts) (try-catch safety wrappers around stats and index queries).
  * Unit tests in [db.test.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/test/db.test.ts) verify fallback counts and gracefully handled privilege warnings.

---

## UC-5: Memory-Safe Smart Sampling & OOM Prevention

### Description
When analyzing large collections containing very large documents (which can reach up to the 16MB BSON limit), loading all records into memory at once would trigger Node.js Out-Of-Memory (OOM) failures or over-burden the database CPU. The utility automatically controls sampling rates and reads database cursors via streams.

### Requirements & Invariants
1. **Dynamic Sampling Rate**: Automatically reduce sample limits depending on the collection's `avgObjSize` (e.g. limit to 1000 for size < 10KB, limit to 300 for size 10KB-100KB, limit to 50 for size > 100KB).
2. **Streams Usage**: Avoid utilizing `toArray()` directly on the MongoDB cursor. Stream records directly through a Node.js Readable Stream to the parser.
3. **Time Limits**: Set `.maxTimeMS(5000)` on all aggregate/sampling queries.

### Status
**Implemented**

* **Verification**:
  * Implemented in [schema.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/schema.ts) (dynamic limit logic and streaming via `Readable.from(cursor)`).
  * Unit tests verify dynamic sizes and stream piping.

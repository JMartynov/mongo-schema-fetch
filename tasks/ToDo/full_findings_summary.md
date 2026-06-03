# MongoDB Schema Fetch Utility - Full Findings & Optimization Summary

This document presents the complete findings of the improvements implemented in `mongo-schema-fetch` and the advanced performance research conducted on MongoDB query, index, schema, and storage engine optimization.

---

## 1. Executive Summary

During this optimization cycle, we achieved two primary goals:
1. **Utility Upgrades**: We expanded the `serverContext` metadata extraction to include detailed hardware properties, WiredTiger cache limits, and implemented symbolic hostname/IP masking to enforce the Zero Data Leak Policy.
2. **Advanced Performance Research**: We conducted a deep analysis of currently collected parameters and mapped out advanced diagnostic commands, aggregation stages, and index strategies to drive next-generation query and database optimizations.

---

## 2. Implemented Code Upgrades

We modified seven source and test files to introduce the following upgrades:

### A. Hardware & Engine Metrics Extraction
* **CPU Architecture**: Extracted `cpuArch` (e.g., `"x86_64"`, `"aarch64"`) from the host's system configuration.
* **Memory Capacity**: Extracted `memSizeMB` (total physical memory in megabytes) from the host system.
* **Processor Counts**: Extracted `numProcessors` (logical cores count) to scale query execution thread boundaries.
* **WiredTiger Engine Cache**: Executed the admin command `{ serverStatus: 1 }` to fetch the exact configured memory cache limit in bytes: `wiredTiger.cache["maximum bytes configured"]`.
* **Graceful Degradation**: Wrapped all system/admin command runs in separate `try-catch` blocks. If cluster monitoring privileges are missing, the tool logs warnings and proceeds rather than failing, ensuring compatibility with restricted database roles.

### B. Zero Data Leak Hostname & IP Symbolic Masking
To prevent the leak of internal network architecture, database nodes, or server details in the exported schema blueprint:
1. **Host Info Cleaning**: Deleted `hostname` from `hostInfo.system` and stripped the entire `extra` object (which can contain kernel paths and processor models).
2. **Symbolic Address Mapping**: Implemented a deterministic, stateful mapping in the database driver layer. Host strings retrieved during index access diagnostics (e.g. `$indexStats`) are mapped to sequential, anonymous identifiers:
   * `cluster-node-01.internal.net:27017` $\rightarrow$ `node_1:27017`
   * `192.168.1.100:27017` $\rightarrow$ `node_2:27017`
   * Identical hosts map consistently to the same symbol within the payload to maintain replica set relationship visibility without disclosing actual IP/host identities.

### C. Testing Verification
* **Vitest Unit/Integration Tests**: Added tests in `test/db.test.ts` and `test/validation.test.ts` to assert that hardware keys are correctly parsed, sanitization blocks succeed, and validation schemas enforce proper types. All 26 tests passed.
* **Cucumber BDD Acceptance Tests**: Executed 8 Cucumber scenarios (59 steps) using Docker `Testcontainers` simulating standalone and authenticated databases, replicas, and read-preferences (`secondaryPreferred`). All scenarios passed.

---

## 3. MongoDB Diagnostics & Optimization Matrix

Below is the consolidated matrix mapping currently collected statistics alongside future opportunities to drive automated query, index, and storage optimization.

### Collected Metrics (Active)
* **`buildInfo`**: Maps engine version to check version-specific query planner rules.
* **`hostInfo` (Sanitized)**: Evaluates core counts and RAM to recommend query concurrency.
* **`wiredTigerCacheBytes`**: Compares total database working set against RAM cache limits.
* **`collStats`**: Predicts growth rates, average document sizes, and index storage overhead.
* **`indexes`**: Verifies if queries align with existing compound or single-field indexes.
* **`indexStats` (Sanitized)**: Flags unused indexes (where `ops === 0` over a long period) to be dropped, improving write performance.
* **`mongodb-schema` (Inferred)**: Profiles schema structures, identifies enums, and details polymorphic (mixed type) fields.

### Advanced Diagnostic Opportunities (Proposed)
* **`$planCacheStats`**: Inspects cached query plans, query hashes, and index selections to diagnose query planner issues.
* **`db.getCollectionInfos()`**: Retrieves database-enforced `$jsonSchema` rules to compare server validations with actual observed shapes.
* **`adminCommand({ top: 1 })`**: Identifies "hot collections" causing high write lock or read latencies.
* **`db.system.profile` (Profiler)**: Captures slow queries directly from database logs, logging keys vs. documents examined to highlight index recommendations.
* **`explain("executionStats")`**: Analyzes user-supplied query files to identify execution bottlenecks, full collection scans (`COLLSCAN`), and covered queries.

---

## 4. Advanced Optimization Patterns Researched

### A. Explain Stage Diagnostics
When evaluating query executions, the optimizer should target:
* **`COLLSCAN`**: Immediately flag for index creation.
* **`FETCH`**: If preceded by `IXSCAN`, look for opportunities to add missing projected fields to the index to convert the query into a **Covered Query** (eliminating disk fetches).
* **`SORT`**: If sorting is done in memory and exceeds 100MB, the query will fail. Propose compound indexes that incorporate sort keys following the **ESR (Equality, Sort, Range)** rule.

### B. Aggregation Pipeline Optimizations
* **Stage Coalescing**: Validate that `$match` stages are placed at the very beginning of the pipeline so they merge into the initial query scanner (`$cursor`), minimizing document load.
* **Unindexed `$lookup`**: Audit foreign collections referenced in `$lookup` stages. If the foreign field lacks an index, the engine executes a full collection scan per input document. Recommend index creation on the foreign field.

### C. Redundant Indexes
* **Prefix Rule**: An index is redundant if its key sequence is the leading prefix of a compound index (e.g., `{ name: 1 }` is redundant if `{ name: 1, email: 1 }` exists).
* **Action**: Recommend dropping prefix indexes to save memory and write latency, unless they enforce unique constraints.

### D. WiredTiger Storage Optimizations
* **Disk Fragmentation**: Calculated as `storageSize / size`. If this ratio exceeds 1.5, it indicates substantial empty space inside database files due to frequent updates/deletions. Recommend running `compact`.
* **Concurrent Transaction Tickets**: If available read/write tickets drop to zero under `serverStatus`, it indicates threads are locked waiting for disk I/O, pointing to slow, unindexed scans.
* **Selective Partial Indexes**: Recommend `partialFilterExpression` for fields with skewed query patterns (e.g. `{ deleted: false }`) to shrink index sizes.
* **Case-Insensitive Collation**: Propose collation indexes (strength 2) instead of CPU-heavy case-insensitive regex options (`$options: "i"`).

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

The following matrix maps currently collected metrics alongside future diagnostic opportunities, detailing their implementation status, extraction methods, optimization categories, and sensitive data exposure risks.

| Feature / Metric | Status | How to Get Feature | Purpose, Benefit & Optimization Category | Sensitive Data Exposure Risks |
| :--- | :--- | :--- | :--- | :--- |
| **Server Engine Details** (`buildInfo`) | **Implemented** | `adminDb.command({ buildInfo: 1 })` | **Query/Index Optimization**: Identifies target version for optimizer planning. | Low. Discloses engine version and git revision, no actual data. |
| **Host System Info** (`hostInfo`) | **Implemented** (Sanitized) | `adminDb.command({ hostInfo: 1 })` | **Other (Compute/Concurrency)**: Identifies CPU cores and RAM size. | **High**: Contains hostname and machine details. Resolved by deleting `hostname` and the `extra` block. |
| **Engine Cache Configuration** | **Implemented** | `adminDb.command({ serverStatus: 1 })` -> `wiredTiger.cache` | **Other (Memory Cache)**: Audits available memory for index working set. | Low. Discloses bytes allocated, no data structures. |
| **Collection Storage Stats** | **Implemented** | `db.command({ collStats: collName })` with estimation fallbacks | **Schema/Index Optimization**: Reports size, document count, and index sizes. | Low. Shows volume metrics, no document content. |
| **Index Specifications** | **Implemented** | `coll.indexes()` | **Index/Query Optimization**: Verifies query field matching with indexes. | Low. Displays index keys, no field values. |
| **Index Access Usage** (`$indexStats`) | **Implemented** (Sanitized) | `coll.aggregate([{ $indexStats: {} }])` | **Index Optimization**: Identifies unused indexes to improve write performance. | **Medium**: Exposes replica set network hostnames. Resolved by symbolic masking (`node_1:27017`). |
| **Probabilistic Collection Schema** | **Implemented** (Sanitized) | `coll.aggregate([{ $sample: { size: limit } }])` $\rightarrow$ `mongodb-schema` | **Schema Optimization**: Details field types, path, enums. | **Critical**: Can expose actual field values. Resolved by stripping `values` array and truncating strings. |
| **Aggregation plan cache** (`$planCacheStats`) | **Not Implemented** | `coll.aggregate([{ $planCacheStats: {} }])` | **Query/Index Optimization**: Inspects cached execution plans and queries. | Low. Discloses query shapes and hashes, no literal document values. |
| **Enforced Schema Validation** | **Not Implemented** | `db.getCollectionInfos({ name: collName })` | **Schema Optimization**: Audits database-enforced `$jsonSchema` rules. | Low. Discloses database structural constraints. |
| **Collection Read/Write Hots** | **Not Implemented** | `adminDb.command({ top: 1 })` | **Other (Priority Tuning)**: Identifies high-latency write/read collections. | Low. Exposes collection-level latency timings. |
| **Slow Query Profiler Logs** | **Not Implemented** | query on `db.system.profile` | **Query/Index Optimization**: Recommends indexes based on slow queries. | **Critical**: Contains literal query arguments and filter values. Needs query parsing/scrubbing before export. |
| **Ad-hoc Query Execution Plans** | **Not Implemented** | `coll.find(query).explain("executionStats")` | **Query/Index Optimization**: Identifies `COLLSCAN` and covered queries. | **High**: Contains literal filter values inside query shape. Needs values scrubbing. |
| **WiredTiger Concurrent Tickets** | **Not Implemented** | `adminDb.command({ serverStatus: 1 })` -> `wiredTiger.concurrentTransactions` | **Other (Performance Diagnostics)**: Detects read/write thread contention. | Low. Represents numeric transaction thread slots. |
| **Time-To-Live (TTL) Specs** | **Partially Implemented** | check `expireAfterSeconds` in `coll.indexes()` | **Index/Storage Optimization**: Checks if logs/events clean up automatically. | Low. Discloses index expiration options. |

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

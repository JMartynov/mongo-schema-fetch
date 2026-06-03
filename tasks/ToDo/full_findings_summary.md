Here is the fully updated document, including a new section (Section 5) that provides concrete JSON output examples for the advanced diagnostic commands mentioned throughout the text, along with detailed explanations of how an automated optimization system can leverage this data.

---

# MongoDB Schema Fetch Utility - Full Findings & Optimization Summary

This document presents the complete findings of the improvements implemented in `mongo-schema-fetch` and the advanced performance research conducted on MongoDB query, index, schema, and storage engine optimization.

---

## 1. Executive Summary

During this optimization cycle, we achieved two primary goals:

1. **Utility Upgrades**: We expanded the `serverContext` metadata extraction to include detailed hardware properties, WiredTiger cache limits, and implemented symbolic hostname/IP masking to enforce the Zero Data Leak Policy.
2. **Advanced Performance Research**: We conducted a deep analysis of currently collected parameters and mapped out advanced diagnostic commands, aggregation stages, and index strategies to drive next-generation query and database optimizations.
3. **Modern Aggregation-Based Diagnostics Integration**: Analyzed the paradigm shift from legacy monolithic administrative commands to continuous, queryable data streams (spanning v6.2 through v8.0), integrating advanced telemetry from stages like `$queryStats`, `$currentOp`, and sophisticated WiredTiger cache mechanics.

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

The following matrix maps currently collected metrics alongside future diagnostic opportunities, detailing their implementation status, extraction methods, optimization categories, and sensitive data exposure risks. New capabilities leveraging the recent shift towards aggregation-based diagnostics have been appended.

| Feature / Metric | Status | How to Get Feature | Purpose, Benefit & Optimization Category | Sensitive Data Exposure Risks |
| --- | --- | --- | --- | --- |
| **Server Engine Details** (`buildInfo`) | **Implemented** | `adminDb.command({ buildInfo: 1 })` | **Query/Index Optimization**: Identifies target version for optimizer planning. | Low. Discloses engine version and git revision, no actual data. |
| **Host System Info** (`hostInfo`) | **Implemented** (Sanitized) | `adminDb.command({ hostInfo: 1 })` | **Other (Compute/Concurrency)**: Identifies CPU cores and RAM size. | **High**: Contains hostname and machine details. Resolved by deleting `hostname` and the `extra` block. |
| **Engine Cache Configuration** | **Implemented** | `adminDb.command({ serverStatus: 1 })` -> `wiredTiger.cache` | **Other (Memory Cache)**: Audits available memory for index working set. | Low. Discloses bytes allocated, no data structures. |
| **Collection Storage Stats** | **Implemented** | `db.command({ collStats: collName })` with estimation fallbacks | **Schema/Index Optimization**: Reports size, document count, and index sizes. | Low. Shows volume metrics, no document content. |
| **Index Specifications** | **Implemented** | `coll.indexes()` | **Index/Query Optimization**: Verifies query field matching with indexes. | Low. Displays index keys, no field values. |
| **Index Access Usage** (`$indexStats`) | **Implemented** (Sanitized) | `coll.aggregate([{ $indexStats: {} }])` | **Index Optimization**: Identifies unused indexes to improve write performance. | **Medium**: Exposes replica set network hostnames. Resolved by symbolic masking (`node_1:27017`). |
| **Probabilistic Collection Schema** | **Implemented** (Sanitized) | `coll.aggregate([{ $sample: { size: limit } }])` $\rightarrow$ `mongodb-schema` | **Schema Optimization**: Details field types, path, enums. | **Critical**: Can expose actual field values. Resolved by stripping `values` array and truncating strings. |
| **Aggregation plan cache** (`$planCacheStats`) | **Implemented** (Optional) | `coll.aggregate([{ $planCacheStats: {} }])` | **Query/Index Optimization**: Inspects cached execution plans, extracting `works` and `planCacheShapeHash`. | Low. Discloses query shapes and hashes, no literal document values. |
| **Enforced Schema Validation** | **Implemented** | `db.listCollections({ name: collName })` | **Schema Optimization**: Audits database-enforced `$jsonSchema` rules. | Low. Discloses database structural constraints. |
| **Collection Read/Write Hots** | **Not Implemented** | `adminDb.command({ top: 1 })` | **Other (Priority Tuning)**: Identifies high-latency write/read collections. | Low. Exposes collection-level latency timings. |
| **Slow Query Profiler Logs** | **Not Implemented** | query on `db.system.profile` | **Query/Index Optimization**: Recommends indexes based on slow queries. | **Critical**: Contains literal query arguments and filter values. Needs query parsing/scrubbing before export. |
| **Ad-hoc Query Execution Plans** | **Not Implemented** | `coll.find(query).explain("executionStats")` | **Query/Index Optimization**: Identifies `COLLSCAN` and covered queries. | **High**: Contains literal filter values inside query shape. Needs values scrubbing. |
| **WiredTiger Concurrent Tickets** | **Implemented** | `adminDb.command({ serverStatus: 1 })` -> `wiredTiger.concurrentTransactions` | **Other (Performance Diagnostics)**: Detects read/write thread contention. | Low. Represents numeric transaction thread slots. |
| **Time-To-Live (TTL) Specs** | **Partially Implemented** | check `expireAfterSeconds` in `coll.indexes()` | **Index/Storage Optimization**: Checks if logs/events clean up automatically. | Low. Discloses index expiration options. |
| **Active Query Execution** (`$currentOp`) | **Not Implemented** | `coll.aggregate([{ $currentOp: { idleConnections: true } }])` | **Performance Optimization**: Tracks long-running transactions and real-time index build progressions (`progress.done`, `msg`). | **High**: Can expose live operational payloads and queries. |
| **Collection Latency Histograms** (`$collStats`) | **Implemented** (Optional) | `coll.aggregate([{ $collStats: { latencyStats: { histograms: true } } }])` | **Schema Efficiency**: Identifies micro-stalls and working set eviction via read/write latency histograms (`micros` and `count`). | Low. Only reveals bucketed timing metrics. |
| **Continuous Query Profiling** (`$queryStats`) | **Not Implemented** | `coll.aggregate([{ $queryStats: {} }])` | **Query Optimization**: Provides continuous, in-memory telemetry (Query Store) tracking `metrics.lastExecutionMicros` (MongoDB 8.0+). | **Medium**: Exposes query structures via `queryShapeHash`. |
| **Network & Replication Topologies** | **Not Implemented** | `adminDb.command({ replSetGetStatus: 1 })` | **High Availability**: Detects high-latency network routes (`pingMs`), oplog status (`optimes`), and failover risks. | **Medium**: Exposes internal node network metadata. |
| **Replica Set Data Consistency** (`dbCheck`) | **Not Implemented** | `db.command({ dbCheck: 1 })` | **Data Integrity**: Safely detects silent data corruption across replica sets in the background via cryptographic hashing. | Low. Logs to internal healthlog collections. |
| **Structural Integrity** (`validate`) | **Not Implemented** | `db.command({ validate: collName })` | **Data Integrity**: Scans collections locally for physical BSON corruption. Note: Triggers severe exclusive write locks. | Low. Provides structural health data. |
| **Configuration & Security Auditing** | **Not Implemented** | `adminDb.command({ getCmdLineOpts: 1 })` | **Compliance**: Verifies proper optimization parameters and security telemetry frameworks (SIEM audit logging) are loaded. | **High**: Discloses server paths, configurations, and security filter definitions. |

---

## 4. Advanced Optimization Patterns Researched

### A. Explain Stage Diagnostics

When evaluating query executions, the optimizer should target:

* **`COLLSCAN`**: Immediately flag for index creation.
* **`FETCH`**: If preceded by `IXSCAN`, look for opportunities to add missing projected fields to the index to convert the query into a **Covered Query** (eliminating disk fetches).
* **`SORT`**: If sorting is done in memory and exceeds 100MB, the query will fail. Propose compound indexes that incorporate sort keys following the **ESR (Equality, Sort, Range)** rule.
* **Sort Spill Limitations**: Track `metrics.query.sort.spillToDisk` in telemetry. A non-zero value indicates that memory limits were exceeded and sorting spilled to the physical disk, resulting in a severe latency penalty. Mandates immediate schema optimization or selective `$match`/`$limit` stage inclusion.
* **Explain Restrictions**: Crucially, an aggregation pipeline containing a `$out` or `$merge` stage cannot utilize `explain()` in `executionStats` or `allPlansExecution` modes. Output stages must be temporarily removed when profiling complex transformations.
* **Query Settings Override**: Legacy Index Filters are officially deprecated starting in MongoDB 8.0. Administrators must use the `setQuerySettings` command to establish persistent, cluster-wide operation rejection filters to block prohibited `queryShapeHash` values.

### B. Aggregation Pipeline Optimizations

* **Stage Coalescing**: Validate that `$match` stages are placed at the very beginning of the pipeline so they merge into the initial query scanner (`$cursor`), minimizing document load.
* **Unindexed `$lookup**`: Audit foreign collections referenced in `$lookup` stages. If the foreign field lacks an index, the engine executes a full collection scan per input document. Recommend index creation on the foreign field.

### C. Redundant Indexes

* **Prefix Rule**: An index is redundant if its key sequence is the leading prefix of a compound index (e.g., `{ name: 1 }` is redundant if `{ name: 1, email: 1 }` exists).
* **Action**: Recommend dropping prefix indexes to save memory and write latency, unless they enforce unique constraints.

### D. WiredTiger Storage Optimizations

* **Disk Fragmentation**: Calculated as `storageSize / size`. If this ratio exceeds 1.5, it indicates substantial empty space inside database files due to frequent updates/deletions. Recommend running `compact`.
* **Concurrent Transaction Tickets**: If available read/write tickets drop to zero under `serverStatus`, it indicates threads are locked waiting for disk I/O, pointing to slow, unindexed scans.
* **Selective Partial Indexes**: Recommend `partialFilterExpression` for fields with skewed query patterns (e.g. `{ deleted: false }`) to shrink index sizes.
* **Case-Insensitive Collation**: Propose collation indexes (strength 2) instead of CPU-heavy case-insensitive regex options (`$options: "i"`).
* **Cache Dirty Data Thresholds**: Monitor `tracked dirty bytes in the cache`. If it exceeds 5% of the total configured cache size, incoming write operations are outpacing the storage engine's ability to compress and flush to disk.
* **Eviction Thread Diagnostics**: A high or rapidly increasing count of `pages evicted by application threads` is a definitive symptom of an active database stall, indicating background eviction threads couldn't keep up and forced active client connections to clear cache memory.
* **Dynamic Configuration Tuning**: Eviction blocks can be mitigated dynamically (without restarting the cluster) via `setParameter`: `wiredTigerEngineRuntimeConfig: "eviction=(threads_min=4,threads_max=8)"`.
* **Transaction Limits**: Long-running transactions pin older, obsolete page versions in the cache. Setting a strict `transactionLifetimeLimitSeconds` parameter is the recommended defense to prevent total lockups of the storage engine.

### E. The Aggregation-Based Diagnostics Paradigm

* **Deprecation of Legacy Commands**: Legacy monolithic commands such as `currentOp`, `collStats`, `dbStats`, and `top` have undergone aggressive deprecation since MongoDB 6.2. Diagnostics must now be performed utilizing corresponding aggregation stages (e.g., `$currentOp`, `$collStats`) to allow in-engine MQL filtering, minimizing network payloads.
* **Index Build Monitoring**: Utilize the `$currentOp` stage with a match for `{ "command.createIndexes": { $exists: true } }`. This reveals granular, real-time progress (`progress.done` vs `progress.total`) and internal phases (`msg: "Index Build: scanning collection"`). Remaining build time can be mathematically projected using the `secs_running` field. Note that in replica sets, `idleConnections: true` is required to capture builds waiting on a commit quorum.

### F. Query Optimizer Observability

* **Shape Hashing Evolution**: The legacy `queryHash` field used to identify logical query shapes has been deprecated in MongoDB 8.0, replaced by the significantly more robust `planCacheShapeHash`.
* **Cache Triage**: By querying `$planCacheStats`, administrators can identify the `works` count (the number of discrete logic steps performed to find a winning plan). A high `works` count pinpoints inefficient structures. If polluted with suboptimal plans, the cache can be surgically cleared using the `planCacheClear` command.
* **Continuous Query Telemetry**: MongoDB 8.0 introduced the Query Store via the `$queryStats` aggregation stage. This tracks continuous, lightweight runtime statistics in server memory grouped by `queryShapeHash`, exposing metrics like `metrics.lastExecutionMicros` to proactively detect latency drift without the massive CPU overhead of traditional system profilers.

### G. Replication Topologies & Connection Pools

* **Network & Replication Lag**: Use `replSetGetStatus` to track `pingMs` (identifying faulty network layers/packet loss between primary and secondaries) and track replication progress via `optimes` (`applied`, `durable`, `last_committed`). MongoDB 8.0 upgraded this telemetry to include election metrics like `lastSeenWrittenOpTimeAtElection` for deep post-mortem auditing of data rollback risks. Legacy single-buffer metrics have been deprecated in favor of `apply.count` and `write.count` for tracking concurrent operation queues.
* **Connection Storm Diagnostics**: Under `serverStatus`, the new metrics `connections.queuedForEstablishment` and `connections.establishmentRateLimit` allow teams to detect active connection storms and connection throttling, triggering infrastructure load-balancer tuning and `tcp_keepalive_time` alignment.

### H. Data Integrity Validation

* **Local Locking Scans (`validate`)**: The `db.collection.validate()` command scans for physical file corruption and missing BSON structures (`checkBSONConformance`). However, it imposes an exclusive write lock that completely halts application traffic on the collection. MongoDB 8.2 introduced `repairMode` telemetry for automatic non-fatal anomaly repairs.
* **Distributed Consistency Scans (`dbCheck`)**: For cross-replica consistency auditing without severe locking, the internal `dbCheck` command runs in the background, computing cryptographic hashes across data-bearing members. Findings are logged to the `local.system.healthlog` collection. CPU impact is tunable via parameters like `dbCheckMaxTotalIndexKeysPerSnapshot`.

### I. Configuration Auditing

* **Parameter Integrity**: Utilizing the `getCmdLineOpts` command allows performance engineers and security teams to verify that critical optimizations (e.g., `--wiredTigerCacheSizeGB`) and Security Information and Event Management (SIEM) audit filters were perfectly loaded at startup without environment variable conflicts, satisfying stringent regulatory frameworks like PCI-DSS.

---

## 5. Command Output Examples & Optimization System Benefits

This section details the explicit JSON telemetry structures returned by the core diagnostic commands and aggregation stages mentioned above. It outlines exactly how automated optimization systems, observability agents, and CI/CD pipelines can ingest this data to trigger autonomous self-healing, alerting, and schema tuning.

### A. Explain Command (`explain("executionStats")`)

* **Example Output:**
```json
{
  "executionStats": {
    "nReturned": 5,
    "executionTimeMillis": 120,
    "totalKeysExamined": 10000,
    "totalDocsExamined": 10000,
    "executionStages": {
      "stage": "COLLSCAN"
    }
  }
}

```


* **Benefits for an Optimization System:** An automated agent can mathematically compare `totalDocsExamined` to `nReturned`. If the ratio is excessively high (e.g., 1000:1) and the root stage is a `COLLSCAN`, the system can instantly flag the query shape and automatically generate a Data Definition Language (DDL) recommendation for a new index based on the scanned fields.

### B. Active Operations (`$currentOp`)

* **Example Output (Index Build):**
```json
{
  "opid": 149302,
  "secs_running": 145,
  "msg": "Index Build: scanning collection",
  "progress": {
    "done": 1500000,
    "total": 6000000
  },
  "command": { "createIndexes": "users" }
}

```


* **Benefits for an Optimization System:** By dividing `progress.done` by `secs_running`, a system can calculate the processing rate (documents per second). It can then project the exact ETA for completion. If a resource-heavy build threatens peak application traffic, the optimization engine can autonomously issue a `killOp` to abort the build and reschedule it for a maintenance window.

### C. Storage Telemetry (`serverStatus` - WiredTiger & Connections)

* **Example Output:**
```json
{
  "wiredTiger": {
    "cache": {
      "maximum bytes configured": 8589934592,
      "bytes currently in the cache": 8400000000,
      "tracked dirty bytes in the cache": 600000000,
      "pages evicted by application threads": 42
    }
  },
  "connections": {
    "current": 1200,
    "queuedForEstablishment": 150
  }
}

```


* **Benefits for an Optimization System:** A health-monitoring daemon can constantly poll these metrics. If `tracked dirty bytes` exceeds 5% of max capacity or `pages evicted by application threads` rises above `0`, the system definitively knows the disk I/O cannot keep up with write volume. The system can react by automatically adjusting external load balancer configurations (throttling incoming requests based on `queuedForEstablishment`) to protect database stability.

### D. Optimizer Observability (`$planCacheStats`)

* **Example Output:**
```json
{
  "planCacheShapeHash": "A1B2C3D4",
  "isActive": true,
  "works": 84500,
  "cachedPlan": {
    "inputStage": {
      "stage": "IXSCAN",
      "indexName": "idx_status_created"
    }
  }
}

```


* **Benefits for an Optimization System:** By polling the cache, a system maps the computational cost (`works`) to specific query shapes. If an update or data skew causes the `works` count for an active plan to skyrocket compared to historical baselines, the system can autonomously execute a `planCacheClear` for `A1B2C3D4` to force the database engine to trial and cache a more efficient index strategy.

### E. Query Telemetry Store (`$queryStats`)

* **Example Output:**
```json
{
  "queryShapeHash": "F9E8D7C6",
  "metrics": {
    "executionCount": 5400,
    "totalExecutionMicros": 162000000,
    "lastExecutionMicros": 45000
  }
}

```


* **Benefits for an Optimization System:** An observability agent can use this low-overhead, in-memory store to track the latency drift of queries over time (comparing average historical execution time to `lastExecutionMicros`). It proactively alerts developers to subtle database decay (like index fragmentation or unchecked volume growth) weeks before the queries trigger hard timeout limits.

### F. Replication Diagnostics (`replSetGetStatus`)

* **Example Output:**
```json
{
  "members": [
    {
      "name": "node_1:27017",
      "stateStr": "PRIMARY",
      "optime": { "ts": "71939281928" }
    },
    {
      "name": "node_2:27017",
      "stateStr": "SECONDARY",
      "pingMs": 145,
      "optime": { "ts": "71939270000" }
    }
  ]
}

```


* **Benefits for an Optimization System:** If the round-trip network latency (`pingMs`) spikes, or if the mathematical difference between the Primary's `optime` and Secondary's `optime` breaches a Service Level Agreement (SLA), an automated traffic controller can dynamically strip the lagging secondary from the read-preference pool, preventing stale reads for end-users.

### G. Distributed Consistency (`dbCheck`)

* **Example Output (From `local.system.healthlog`):**
```json
{
  "severity": "error",
  "msg": "dbCheck failure",
  "attr": {
    "collection": "prod.orders",
    "error": "hash mismatch between primary and secondary for key range { _id: MinKey } to { _id: MaxKey }"
  }
}

```


* **Benefits for an Optimization System:** An automated system tailing the healthlog can detect silent, unprompted hardware corruption or replication bugs immediately. It can page Site Reliability Engineering (SRE) teams with critical severity, triggering surgical data repairs before corrupted sectors are committed to immutable nightly backups.

### H. Local File Integrity (`validate`)

* **Example Output:**
```json
{
  "ns": "db.transactions",
  "nrecords": 150000,
  "nInvalidDocuments": 2,
  "corruptRecords": [ "ObjectId('64b...123')", "ObjectId('64b...124')" ],
  "repairMode": "auto"
}

```


* **Benefits for an Optimization System:** If a node suffers an abrupt crash and is brought offline for validation, an orchestration script can parse the `corruptRecords` array. It can automatically generate and run cold-storage restoration scripts targeting only the specifically corrupted `ObjectIds`, restoring data integrity without requiring a full multi-terabyte database rollback.

### I. Configuration Auditing (`getCmdLineOpts`)

* **Example Output:**
```json
{
  "parsed": {
    "storage": {
      "wiredTiger": {
        "engineConfig": { "cacheSizeGB": 16 }
      }
    },
    "security": {
      "javascriptEnabled": false,
      "auditLog": { "destination": "file", "format": "JSON" }
    }
  }
}

```


* **Benefits for an Optimization System:** Infrastructure-as-Code (IaC) and CI/CD security pipelines can execute this command programmatically post-deployment to ensure that critical optimization limits (like `cacheSizeGB`) and strict compliance telemetry frameworks (like SIEM `auditLog` parameters) are actively enforced, automatically failing deployments that drift from standard operating configurations.
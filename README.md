# mongo-schema-fetch

A secure Node.js CLI tool designed to extract MongoDB schema blueprints and performance statistics **without exposing or exporting real user data** (Zero Data Leak policy).

It analyzes collections, infers schema types using `mongodb-schema`, and captures crucial context like index usage and collection statistics to power query optimization and environment simulation.

## Key Features

- **Zero Data Leak**: Extracts schema shapes and types, not the data itself. Sensitive fields are scrubbed. Enum values are only captured if their cardinality is low and they are short strings.
- **Smart Sampling**: Uses `$sample` to intelligently infer schemas without loading massive collections into memory. Sampling size dynamically adjusts based on the average object size to prevent Out-Of-Memory (OOM) errors.
- **Interactive & CI/CD Modes**: Offers an interactive prompt for selecting collections manually, or a strict silent mode (`--quiet`) for automated CI/CD pipelines.
- **Magic Link Integration**: Seamlessly uploads schema payloads to a secure web optimizer via a one-time link, automatically opening your browser for instant analysis.

## Installation

### Requirements
- Node.js >= 20
- MongoDB URI with read access

### Option 1: Run via npx (Recommended for instant use)
You don't need to install it globally. Simply run:
```bash
npx mongo-schema-fetch "mongodb://username:password@localhost:27017/my_database"
```

### Option 2: Install globally via npm
```bash
npm install -g mongo-schema-fetch
```
Then run:
```bash
mongo-schema-fetch "mongodb://username:password@localhost:27017/my_database"
```

### Option 3: Clone and build locally
```bash
git clone https://github.com/your-org/mongo-schema-fetch.git
cd mongo-schema-fetch
npm install
npm run build
node dist/cli.js "mongodb://localhost:27017/my_database"
```

---

## Usage and CLI Parameters

### Basic Interactive Usage
```bash
npx mongo-schema-fetch "mongodb://localhost:27017/my_database"
```
If you have multiple collections, this will launch an interactive prompt asking you to select the collections you wish to scan using the `<space>` bar.

### CLI Parameters Reference

| Option | Description | Default |
|--------|-------------|---------|
| `<uri>` | **(Required)** MongoDB Connection URI. | |
| `--db <name>` | Override the database name specified in the URI. Useful if the URI connects to `admin` but you want to scan `analytics`. | URI's database |
| `--collections <list>` | Comma-separated list of collections to scan. Skips the interactive prompt. | |
| `--all-collections` | Force scan **all** collections in the database. Skips the interactive prompt. | `false` |
| `--out <path>` | File path where the generated JSON payload will be saved. | `schema-payload.json` |
| `--sample <number>` | Custom document sample limit for schema inference. Overrides the smart dynamic limit. | Dynamic (50-1000) |
| `--enum-threshold <number>` | Threshold limit for saving enum values. If unique values in a field are below this number, they are saved. | `20` |
| `--read-preference <mode>` | Specify read preference (e.g., `secondary`) for Replica Sets to avoid burdening the primary node. | None |
| `--quiet` | Disable all interactive prompts and "Magic Link" upload requests. Essential for CI/CD environments. | `false` |
| `--additional` | Enable collection of advanced execution query plan cache stats (`$planCacheStats`) and latency histograms (`$collStats`). | `false` |
| `-h, --help` | Display help for command. | |

### Use Case Examples

**1. Manual Profiling (Interactive)**
A developer wants to extract the schema for specific collections locally.
```bash
npx mongo-schema-fetch "mongodb://localhost:27017/myapp"
```
*Result: An interactive menu appears to select collections.*

**2. Automated CI/CD Pipeline (Silent)**
Extract schemas of `users` and `orders` to a specific path without any prompts.
```bash
npx mongo-schema-fetch "mongodb://ci-db:27017/test_db" \
  --collections users,orders \
  --out /tmp/schema.json \
  --quiet
```

**3. Production Secondary Node Scan**
A DBA safely scans a production cluster using a secondary node to ensure no performance impact on the primary.
```bash
npx mongo-schema-fetch "mongodb://prod-cluster..." \
  --read-preference secondary \
  --all-collections
```

**4. Handling Highly Polymorphic Data**
If documents vary wildly and the default 1000 sample isn't enough to capture all variants, explicitly increase the sample size.
```bash
npx mongo-schema-fetch "mongodb://localhost:27017/myapp" \
  --collections logs \
  --sample 5000
```

---

## Output Format & Invariants (`schema-payload.json`)

The generated JSON file adheres to a strict contract validated by JSON Schema (AJV). This guarantees that down-stream analysis tools and Web UI optimizers can confidently consume the data.

### Invariants Guarantee
1. **Zero Raw Values**: With the exception of low-cardinality short string Enums, absolutely no actual values from the database are stored. `values` arrays from `mongodb-schema` are forcibly deleted.
2. **Safe Enumerations**: String and Number values are only retained if the number of unique occurrences is less than the `--enum-threshold` (default 20). Furthermore, string enums are discarded if they exceed 100 characters in length.
3. **Validated Contract**: The tool halts with an error if the output does not strictly match the expected JSON schema.

### JSON Payload Structure

The output file contains two main top-level properties: `serverContext` and `collections`.

#### 1. `serverContext`
Contains metadata about the MongoDB environment. Crucial for understanding query planner behavior which changes between versions.
* **`buildInfo`**: The exact build version of the database.
* **`hostInfo`** (Optional): Information about the underlying OS and CPU/RAM limits (sanitized to remove `hostname` and `extra` platform keys).
* **`cpuArch` / `memSizeMB` / `numProcessors`** (Optional): Extracted core hardware properties.
* **`wiredTigerCacheBytes`** (Optional): Configured WiredTiger engine maximum cache memory.
* **`concurrentTransactions`** (Optional): Current read and write concurrency ticket availability.
* **`cacheDirtyRatio`** (Optional): Cache dirty ratio percentage indicating memory flushing overhead.
* **`pagesEvictedByApp`** (Optional): Pages evicted by application threads indicating severe cache memory pressure.

#### 2. `collections`
An array of objects, one for each scanned collection. Each object contains:
* **`stats`**: Metrics about the collection's size, storage type, and execution footprints.
  * `name`: Collection name.
  * `count`: Precise document count.
  * `estimatedDocumentCount`: Fast metadata count.
  * `avgObjSize`: Average size of a document in bytes.
  * `totalIndexSize`: The combined size of all indexes in bytes.
  * `type` (Optional): Collection storage model (e.g. `"collection"`, `"view"`, `"timeseries"`).
  * `options` (Optional): Storage options (capped size limit, timeseries fields, clustered index).
  * `validator` (Optional): Database-enforced schema constraints (like `$jsonSchema` validators).
  * `planCache` (Optional): Cached query execution plans (only under `--additional`).
  * `latencyStats` (Optional): Read/write latency statistics and histograms (only under `--additional`).
* **`indexes`**: Metadata regarding how the collection is indexed.
  * `name`: Collection name.
  * `indexes`: The raw index definition (keys, direction, unique/sparse flags).
  * `indexStats`: Usage metrics (how many times an index was actively used).
* **`schema`**: The probabilistic schema inferred by `mongodb-schema`.
  * Describes fields, their types (`String`, `Number`, `ObjectId`, etc.), and nested sub-documents/arrays.
  * `enumValues`: Array of unique values (only if cardinality is below the threshold).

### Full Output Example

```json
{
  "serverContext": {
    "buildInfo": {
      "version": "6.0.4",
      "gitVersion": "44ce594c53835cc6e6c433c2a04ea0d6bcecd16c",
      "modules": [],
      "allocator": "tcmalloc",
      "javascriptEngine": "mozjs",
      "sysInfo": "deprecated",
      "versionArray": [6, 0, 4, 0],
      "openssl": {
        "running": "OpenSSL 1.1.1f  31 Mar 2020",
        "compiled": "OpenSSL 1.1.1f  31 Mar 2020"
      },
      "buildEnvironment": {
        "distmod": "ubuntu2004",
        "distarch": "x86_64",
        "cc": "/opt/mongodbtoolchain/v3/bin/gcc: gcc (GCC) 8.5.0",
        "ccflags": "-Werror -include mongo/platform/basic.h -fasynchronous-unwind-tables -ggdb -Wall -Wsign-compare -Wno-unknown-pragmas -Winvalid-pch -fno-omit-frame-pointer -fno-strict-aliasing -O2 -march=sandybridge -mtune=generic -mprefer-vector-width=128 -Wno-unused-local-typedefs -Wno-unused-function -Wno-deprecated-declarations -Wno-unused-const-variable -Wno-unused-but-set-variable -Wno-missing-braces -fstack-protector-strong -Wa,--nocompress-debug-sections -fno-builtin-memcmp",
        "cxx": "/opt/mongodbtoolchain/v3/bin/g++: g++ (GCC) 8.5.0",
        "cxxflags": "-Woverloaded-virtual -Wno-maybe-uninitialized -fsized-deallocation -std=c++17",
        "linkflags": "-Wl,--fatal-warnings -pthread -Wl,-z,now -fuse-ld=gold -fstack-protector-strong -Wl,--no-threads -Wl,--build-id -Wl,--hash-style=gnu -Wl,-z,noexecstack -Wl,--warn-execstack -Wl,-z,relro -Wl,-z,origin -Wl,--enable-new-dtags",
        "target_arch": "x86_64",
        "target_os": "linux",
        "cppdefines": "SAFEINT_USE_INTRINSICS 0 PCRE_STATIC NDEBUG _XOPEN_SOURCE 700 _GNU_SOURCE _REENTRANT 1 _FORTIFY_SOURCE 2 BOOST_THREAD_VERSION 5 BOOST_THREAD_USES_DATETIME BOOST_SYSTEM_NO_DEPRECATED BOOST_MATH_NO_LONG_DOUBLE_MATH_FUNCTIONS BOOST_ENABLE_ASSERT_DEBUG_HANDLER BOOST_LOG_NO_SHORTHAND_NAMES BOOST_LOG_USE_NATIVE_SYSLOG BOOST_LOG_WITHOUT_THREAD_ATTR ABSL_FORCE_ALIGNED_ACCESS"
      },
      "bits": 64,
      "debug": false,
      "maxBsonObjectSize": 16777216,
      "storageEngines": ["devnull", "ephemeralForTest", "wiredTiger"],
      "ok": 1
    }
  },
  "collections": [
    {
      "stats": {
        "name": "users",
        "count": 15000,
        "estimatedDocumentCount": 15000,
        "avgObjSize": 145,
        "totalIndexSize": 36864
      },
      "indexes": {
        "name": "users",
        "indexes": [
          {
            "v": 2,
            "key": { "_id": 1 },
            "name": "_id_"
          },
          {
            "v": 2,
            "key": { "email": 1 },
            "name": "email_1",
            "unique": true
          }
        ],
        "indexStats": [
          {
            "name": "_id_",
            "key": { "_id": 1 },
            "host": "database-host:27017",
            "accesses": {
              "ops": 12500,
              "since": "2023-10-12T08:00:00.000Z"
            }
          },
          {
            "name": "email_1",
            "key": { "email": 1 },
            "host": "database-host:27017",
            "accesses": {
              "ops": 5000,
              "since": "2023-10-12T08:00:00.000Z"
            }
          }
        ]
      },
      "schema": {
        "count": 1000,
        "fields": [
          {
            "name": "_id",
            "path": "_id",
            "count": 1000,
            "type": "ObjectId",
            "probability": 1,
            "hasDuplicates": false,
            "types": [
              {
                "name": "ObjectId",
                "path": "_id",
                "count": 1000,
                "probability": 1,
                "hasDuplicates": false
              }
            ]
          },
          {
            "name": "email",
            "path": "email",
            "count": 1000,
            "type": "String",
            "probability": 1,
            "hasDuplicates": false,
            "types": [
              {
                "name": "String",
                "path": "email",
                "count": 1000,
                "probability": 1,
                "hasDuplicates": false
              }
            ]
          },
          {
            "name": "status",
            "path": "status",
            "count": 1000,
            "type": "String",
            "probability": 1,
            "hasDuplicates": true,
            "enumValues": ["active", "suspended", "pending"],
            "types": [
              {
                "name": "String",
                "path": "status",
                "count": 1000,
                "probability": 1,
                "hasDuplicates": true,
                "enumValues": ["active", "suspended", "pending"]
              }
            ]
          },
          {
            "name": "age",
            "path": "age",
            "count": 950,
            "type": "Number",
            "probability": 0.95,
            "hasDuplicates": true,
            "types": [
              {
                "name": "Number",
                "path": "age",
                "count": 950,
                "probability": 0.95,
                "hasDuplicates": true
              }
            ]
          }
        ]
      }
    }
  ]
}
```

---

## Detailed Metrics & MongoDB Commands Reference

This section provides an exhaustive catalog of every metric collected by `mongo-schema-fetch`, documenting the exact MongoDB commands executed, target namespaces, driver commands, fallbacks, and security sanitizations.

### 1. Server Context Metrics (`serverContext`)

#### Build & Version Information (`buildInfo`)
* **MongoDB Command**: `{ buildInfo: 1 }` (executed via `adminDb.command({ buildInfo: 1 })`)
* **Target Namespace**: `admin` database (administrative privileges required).
* **Extracted Properties**:
  * `version`: Semantic database version (e.g. `"7.0.8"`).
  * `gitVersion`: The Git revision hash of the compiled binary.
  * `versionArray`: Major/minor release numbers array.
  * `bits`: Platform bits architecture (`64`).
* **Optimization Value**: Identifies the engine version to enable or disable version-specific optimizer planning (e.g. legacy query hash filters are deprecated starting in MongoDB 8.0).
* **Fallback**: Returns an empty object `{}` on permission/execution failures.

#### Host & Hardware Specifications (`hostInfo`)
* **MongoDB Command**: `{ hostInfo: 1 }` (executed via `adminDb.command({ hostInfo: 1 })`)
* **Target Namespace**: `admin` database.
* **Extracted Properties**:
  * `os`: Host operating system metadata (`type`, `name`, `version`).
  * `system`: CPU architecture, memory limits, and physical core counts.
* **Zero Data Leak Sanitization**:
  * Deletes `hostInfo.system.hostname` to prevent exposing network architecture details.
  * Deletes the entire `hostInfo.extra` object to strip hardware details like exact processor models.
* **Optimization Value**: Used to evaluate machine capacity and align query execution parallelism limits.
* **Fallback**: Returns an empty object `{}` on permission/execution failures.

#### CPU Architecture (`cpuArch`)
* **MongoDB Command**: Extracted from `hostInfo.system.cpuArch` (queried via `{ hostInfo: 1 }` command).
* **Target Namespace**: `admin` database.
* **Optimization Value**: Identifies physical architecture constraints.
* **Fallback**: Left undefined if `hostInfo` fails.

#### Total Memory (`memSizeMB`)
* **MongoDB Command**: Extracted from `hostInfo.system.memSizeMB` (queried via `{ hostInfo: 1 }` command).
* **Target Namespace**: `admin` database.
* **Optimization Value**: Used to determine the overall memory size limits of the host machine.
* **Fallback**: Left undefined if `hostInfo` fails.

#### Number of Processors (`numProcessors`)
* **MongoDB Command**: Extracted from `hostInfo.system.numProcessors` (queried via `{ hostInfo: 1 }` command).
* **Target Namespace**: `admin` database.
* **Optimization Value**: Evaluates logical processor core counts to estimate thread scheduling.
* **Fallback**: Left undefined if `hostInfo` fails.

#### WiredTiger Cache Limit (`wiredTigerCacheBytes`)
* **MongoDB Command**: `{ serverStatus: 1 }` (executed via `adminDb.command({ serverStatus: 1 })`)
* **Target Namespace**: `admin` database.
* **Extracted Path**: `serverStatus.wiredTiger.cache["maximum bytes configured"]`.
* **Optimization Value**: Identifies the memory threshold of the storage engine. If index sizes exceed this, the query engine triggers disk page faults.
* **Fallback**: Left undefined if `serverStatus` fails.

#### Concurrent Transactions (`concurrentTransactions`)
* **MongoDB Command**: `{ serverStatus: 1 }` (executed via `adminDb.command({ serverStatus: 1 })`)
* **Target Namespace**: `admin` database.
* **Extracted Path**: `serverStatus.wiredTiger.concurrentTransactions` (includes read/write `available` and `out` ticket counts).
* **Optimization Value**: A drop in available tickets indicates thread concurrency exhaustion, pinpointing active resource bottlenecks.
* **Fallback**: Left undefined if `serverStatus` fails.

#### Cache Dirty Ratio (`cacheDirtyRatio`)
* **MongoDB Command**: Calculated dynamically from serverStatus cache telemetry:
  $$\text{cacheDirtyRatio} = \frac{\text{wiredTiger.cache["tracked dirty bytes in the cache"]}}{\text{wiredTiger.cache["maximum bytes configured"]}} \times 100$$
* **Target Namespace**: `admin` database.
* **Optimization Value**: Ratios exceeding 5% indicate that the storage engine's write queues are lagging behind application updates.
* **Fallback**: Left undefined if cache telemetry is missing.

#### Eviction Pressure (`pagesEvictedByApp`)
* **MongoDB Command**: `{ serverStatus: 1 }` (executed via `adminDb.command({ serverStatus: 1 })`)
* **Target Namespace**: `admin` database.
* **Extracted Path**: `serverStatus.wiredTiger.cache["pages evicted by application threads"]`.
* **Optimization Value**: Non-zero values identify high storage stress where client connections are forced to clear cache pages, resulting in query stall warnings.
* **Fallback**: Left undefined if `serverStatus` fails.

---

### 2. Collection-Level Metrics (`collections[]`)

#### Collection Name (`name`)
* **MongoDB Method**: `db.listCollections().toArray()`
* **Target Namespace**: Target database.
* **Details**: Filters out all internal system collections (e.g. names starting with `system.`).
* **Optimization Value**: Maps telemetry data to target collections.

#### Storage Model Type (`type`)
* **MongoDB Command**: `{ listCollections: 1, filter: { name: collectionName } }` (executed via `db.listCollections({ name }).toArray()`)
* **Target Namespace**: Target database.
* **Extracted Property**: `type` (e.g. `"timeseries"`, `"view"`, `"collection"`).
* **Optimization Value**: Drives optimizer strategies: disables index recommendations for views, prioritizes time-bucket layouts for timeseries, and sizes write constraints for capped collections.
* **Fallback**: Left undefined if the metadata query fails.

#### Storage Configuration Options (`options`)
* **MongoDB Command**: `{ listCollections: 1, filter: { name: collectionName } }` (executed via `db.listCollections({ name }).toArray()`)
* **Target Namespace**: Target database.
* **Extracted Property**: `options` (excluding the `validator` field).
* **Details**: Retrieves capped properties (size, max), timeseries structures (timeField, metaField), and clustered index definitions.
* **Optimization Value**: Inspects storage properties to verify compression constraints.
* **Fallback**: Left undefined if listing fails.

#### Schema Validator Rules (`validator`)
* **MongoDB Command**: `{ listCollections: 1, filter: { name: collectionName } }` (executed via `db.listCollections({ name }).toArray()`)
* **Target Namespace**: Target database.
* **Extracted Property**: `options.validator` (decoupled from the options object to present a clean structure).
* **Optimization Value**: Audits database-enforced schemas to recommend model changes or verify index constraints.
* **Fallback**: Left undefined if listing fails.

#### Precise Document Count (`count`)
* **MongoDB Command**: `{ collStats: collectionName }` (executed via `db.command({ collStats: collectionName })`)
* **Target Namespace**: Target database.
* **Fallback Method**: Runs `coll.countDocuments()` if `collStats` is blocked by permissions.
* **Optimization Value**: Serves as the database sizing baseline to score query plans.

#### Estimated Document Count (`estimatedDocumentCount`)
* **MongoDB Method**: `coll.estimatedDocumentCount()`
* **Target Namespace**: Target database.
* **Optimization Value**: Instantly returns metadata counts without scanning collections.
* **Fallback**: Defaults to `0` on permission failure.

#### Average Document Size (`avgObjSize`)
* **MongoDB Command**: `{ collStats: collectionName }` (executed via `db.command({ collStats: collectionName })`)
* **Target Namespace**: Target database.
* **Optimization Value**: Used for OOM prevention (dynamic sampling limit size decreases for large documents).
* **Fallback**: Defaults to `0` if `collStats` fails.

#### Combined Index Size (`totalIndexSize`)
* **MongoDB Command**: `{ collStats: collectionName }` (executed via `db.command({ collStats: collectionName })`)
* **Target Namespace**: Target database.
* **Optimization Value**: Compares active index size allocation against cache parameters.
* **Fallback**: Defaults to `0` if `collStats` fails.

#### Execution Plan Cache (`planCache`)
* **MongoDB Aggregation Stage**: `coll.aggregate([{ $planCacheStats: {} }]).toArray()`
* **Target Namespace**: Target collection (only executed when `--additional` is active).
* **Optimization Value**: Audits active execution plan histories, identifying plan caching leaks and bad plans.
* **Fallback**: Returns undefined if the aggregation fails or is unsupported.

#### Latency Histograms (`latencyStats`)
* **MongoDB Aggregation Stage**: `coll.aggregate([{ $collStats: { latencyStats: { histograms: true } } }]).toArray()`
* **Target Namespace**: Target collection (only executed when `--additional` is active).
* **Extracted Path**: The nested `latencyStats` property from the returned stats document.
* **Optimization Value**: Buckets write, read, and command operations in execution time histograms to expose latency spikes.
* **Fallback**: Returns undefined on permission/unsupported errors.

#### Index Definitions (`indexes`)
* **MongoDB Method**: `coll.indexes()` (runs `listIndexes` command).
* **Target Namespace**: Target collection.
* **Extracted Properties**: Full index keys, properties (unique, sparse), and partial filter expressions.
* **Optimization Value**: Pinpoints missing compound indexes, sort ordering, and redundant index prefixes.
* **Fallback**: Returns an empty array `[]` on privilege failure.

#### Index Access Usage (`indexStats`)
* **MongoDB Aggregation Stage**: `coll.aggregate([{ $indexStats: {} }]).toArray()`
* **Target Namespace**: Target collection.
* **Extracted Properties**: Access counts (`accesses.ops`, `accesses.since`), and node `host` strings.
* **Zero Data Leak Sanitization**:
  * Mask replica set hosts and IPs symbolically (e.g. `node_1:27017`) deterministically to prevent physical network topology leakage.
* **Optimization Value**: Identifies unused indexes to improve write performance by removing them.
* **Fallback**: Returns an empty array `[]` on privilege failure.

#### Probabilistic Inferred Schema (`schema`)
* **MongoDB Query/Aggregation**:
  * If `count <= limit`: `coll.find({}, { maxTimeMS: 5000 })`
  * If `count > limit`: `coll.aggregate([{ $sample: { size: limit } }], { maxTimeMS: 5000 })`
* **Details**: Steam cursor is converted to a Node.js Readable stream directly into `mongodb-schema` to prevent loading all documents into memory.
* **Zero Data Leak Sanitization**:
  * Strips the `values` array from all types.
  * Preserves string/number enums only under the `--enum-threshold` (cardinality limit) and filters out string enums longer than 100 characters.
* **Optimization Value**: Drives structural schema models, subdocument hierarchies, and data type optimizations.
* **Fallback**: Fails gracefully if the query cannot execute.

---

## Testing

This project includes a comprehensive test suite covering unit operations, CLI parsing, and real database integration tests using Docker containers. For a full mapping of core use cases to testing suites, see the [TEST_CASES.md](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/TEST_CASES.md) document.

### 1. Unit & Integration Tests (Vitest)
Unit and mock database integration tests are written in Vitest. They ensure core logic, error handling, parameter parsing, and schema cleaning function correctly.

To run Vitest tests:
```bash
npm test
```

### 2. Gherkin Acceptance Tests (Cucumber + Testcontainers)
Behavior-Driven Development (BDD) acceptance tests are written in Gherkin syntax using `@cucumber/cucumber` and executed against active, isolated MongoDB instances using Testcontainers.

These tests guarantee compatibility and functionality across:
- **MongoDB Versions**: `5.0`, `6.0`, `7.0`, and `8.0`.
- **Database Configurations**: Standalone, Authenticated, and Replica Set Cluster environments.
- **Connection Flags**: Validating routing behavior such as `--read-preference secondaryPreferred`.

#### How it works:
1. Cucumber launches isolated Docker containers via Testcontainers dynamically based on scenario parameters.
2. The database is seeded with mock schemas and collections.
3. The built CLI tool is executed against the container.
4. Output payload assertions run to verify enums, server context, and zero-data-leak compliance.

To run Gherkin BDD tests:
```bash
npm run test:acceptance
```


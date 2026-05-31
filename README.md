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
* **`hostInfo`** (Optional): Information about the underlying OS and CPU/RAM limits.

#### 2. `collections`
An array of objects, one for each scanned collection. Each object contains:
* **`stats`**: Metrics about the collection's size and footprint.
  * `name`: Collection name.
  * `count`: Precise document count.
  * `estimatedDocumentCount`: Fast metadata count.
  * `avgObjSize`: Average size of a document in bytes.
  * `totalIndexSize`: The combined size of all indexes in bytes.
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

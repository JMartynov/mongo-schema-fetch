# MongoDB Schema Extraction: Data Leakage Research and Safe Queries

This report analyzes why the current schema extraction process retrieves sensitive data from MongoDB and proposes "Safe Querying" alternatives that extract schema structure without transmitting raw sensitive values to the CLI client.

---

## 1. The Leakage Problem: Why and Where It Occurs

The traditional approach to MongoDB schema inference relies on retrieving a set of sample documents, parsing them on the client side, and determining their structure. In `mongo-schema-fetch`, this process involves:

### 1.1. Ingestion / Query Commands
The tool uses standard cursor queries to load full documents:
* **Standalone / Small Collections**: `db.collection.find({}, { maxTimeMS: 5000 })`
* **Large Collections**: `db.collection.aggregate([{ $sample: { size: limit } }], { maxTimeMS: 5000 })`

**Problem**: These queries return **entire documents** including all keys and raw values (such as plain-text passwords, SSNs, and credit cards) over the network and load them directly into the CLI's memory.

### 1.2. Schema Inference Engine
The `mongodb-schema` library parses the documents in-memory:
* It populates a `values` array containing a sample of raw observed values (to identify enums and semantic types).
* If left uncleaned, this results in direct data exposure in the exported JSON blueprint.

### 1.3. Clean-on-Read Risk Profile ("Extract & Clean")
While the tool implements `cleanSchema()` to sanitize the blueprint post-inference:
1. **Network Exposure**: Sensitive data is transmitted over the wire (potentially unencrypted if TLS is not enforced).
2. **Memory Footprint**: Secrets reside in the Node.js heap until garbage collection, making them vulnerable to memory leaks, crash logs, or heap inspection.
3. **Detection Failure Risk**: If a custom or obfuscated PII field does not match the blocklist regex patterns, its raw values will leak into the enums.

---

## 2. Alternatives: Safe Extraction Methods (Zero-Transmission)

To achieve a true **Zero Data Leak Policy**, we must avoid sending sensitive values from MongoDB to the CLI process. We have researched four alternative approaches:

### Method 1: Schema Validation Rules (`$jsonSchema`)
MongoDB allows collections to have optional schema validation rules.
* **Command**: `db.listCollections({ name: collectionName })`
* **Mechanism**: Reads the collection configuration which contains the `$jsonSchema` object defining field types and requirements.
* **Why it is safe**: Only collection metadata is queried. No document values are read or transmitted.
* **Limitation**: Most collections do not define schema validation rules, making this method unusable as a primary extraction mechanism.

### Method 2: On-Server JavaScript Aggregation (`$function`)
MongoDB 4.4+ supports executing custom JavaScript functions on the server as part of an aggregation pipeline.
* **Pipeline**:
  ```javascript
  db.collection.aggregate([
    { $sample: { size: 1000 } },
    { $project: {
        schema: {
          $function: {
            body: function(doc) {
              function extractSchema(obj) {
                if (Array.isArray(obj)) return obj.map(extractSchema);
                if (obj !== null && typeof obj === 'object') {
                  var res = {};
                  for (var k in obj) {
                    res[k] = extractSchema(obj[k]);
                  }
                  return res;
                }
                return typeof obj; // Return type string instead of value
              }
              return extractSchema(doc);
            },
            args: ["$$ROOT"],
            lang: "js"
          }
        }
    } }
  ])
  ```
* **Why it is safe**: The JavaScript engine runs inside the MongoDB server process. The raw values are immediately converted to their BSON/JS types (`"string"`, `"number"`, etc.). The client only receives the structural type tree.
* **Limitation**: Requires server-side JavaScript execution to be enabled (`security.javascriptEnabled: true` in `mongod.conf`), which is frequently disabled in hardened database environments.

### Method 3: Native On-Server Schema Aggregation (No JS Engine)
For a flat schema, MongoDB native aggregation operators can extract keys and BSON types without utilizing the JS engine.
* **Pipeline**:
  ```javascript
  db.collection.aggregate([
    { $sample: { size: 1000 } },
    { $project: { fields: { $objectToArray: "$$ROOT" } } },
    { $unwind: "$fields" },
    { $group: {
        _id: "$fields.k",
        types: { $addToSet: { $type: "$fields.v" } }
    } }
  ])
  ```
* **Why it is safe**: Runs entirely within MongoDB's native C++ aggregation engine. It outputs only a mapping of keys and their associated types (e.g. `[{ _id: "email", types: ["string"] }]`).
* **Limitation**: Aggregating deeply nested objects and mixed-type arrays natives is complex and can result in verbose pipelines, but it is highly compatible and highly performant.

### Method 4: Two-Pass Safe Projection (Discovery + Projection Exclusion)
If client-side parsing using `mongodb-schema` is preferred for layout accuracy, we can eliminate value transmission by performing a two-pass query:
1. **Pass 1: Key Discovery**: Run a fast native aggregation to discover all top-level and first-level keys (similar to Method 3).
2. **Pass 2: Excluded Ingestion**: Filter the discovered keys against the sensitive blocklist. Build a projection excluding all sensitive fields (e.g. `{ email: 0, password: 0, ssn: 0 }`). Run the standard sampler query with this projection.
* **Why it is safe**: The projection enforces that MongoDB never serializes or sends the contents of the blacklisted fields to the CLI.

---

## 3. Comparative Matrix

| Method | Safety | Compatibility | Complexity | Handles Nested Docs |
| :--- | :--- | :--- | :--- | :--- |
| **Current (Extract & Clean)** | ⚠️ Low (Heap leak risk) | High (All versions) | Low | Yes |
| **Method 1: `$jsonSchema`** | 🔒 Maximum (No docs read) | High (If defined) | Low | Yes |
| **Method 2: JS `$function`** | 🔒 Maximum (JS sanitized) | Medium (Requires JS enabled) | Medium | Yes |
| **Method 3: Native Aggregation** | 🔒 Maximum (Native types) | High (All versions) | High | Medium |
| **Method 4: Two-Pass Projection** | 🔒 High (Exclude projection) | High (All versions) | Medium | Yes |

---

## 4. Recommendations & Implementation Strategy

To transition from "Extract & Clean" to a "Safe Querying" paradigm, we recommend a **hybrid fallback pipeline**:

1. **Phase 1: Validation Inspection**: Check if `$jsonSchema` is defined. If so, parse it directly as it is the safest and fastest option.
2. **Phase 2: Native Key Discovery**: Run a native aggregation to map the document field paths.
3. **Phase 3: Secure Projection Sampling**: Run the sampler query with a dynamic projection that excludes all sensitive field paths discovered in Phase 2, ensuring that PII never leaves the database engine.

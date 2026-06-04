# Safe MongoDB Schema Extraction: Hashing, Anonymization, and Safe Libraries

This research document analyzes safety mechanisms for MongoDB schema extraction, focusing on Python libraries, server-side data anonymization/hashing, and query structures that prevent raw sensitive data from leaving the database.

---

## 1. Safety Analysis of Open-Source MongoDB Schema Tools

Several open-source libraries exist for schema discovery, but they handle data in different ways:

### 1.1. `pymongo-schema` (Python)
*   **How it works**: Connects to the collection and pulls a sample of documents using `collection.find()` to analyze their keys and types in memory.
*   **Leakage Risk**: **High**. Like `mongodb-schema`, it retrieves raw document values over the network and holds them in local client memory. It has no built-in masking or hashing mechanism.

### 1.2. `mongo-analyser` (Python)
*   **How it works**: Uses sampling queries and runs analytics locally.
*   **Leakage Risk**: **High**. Intended as a developer-facing tool, it explicitly prints sample values to the terminal to aid analysis, violating a Zero Data Leak Policy.

### 1.3. `Variety` (JavaScript / MongoDB Shell Script)
*   **How it works**: Executes a **MapReduce** job directly inside the MongoDB server process to iterate over all fields and their types.
*   **Leakage Risk**: **Low (No client-side value transmission)**. Because the logic runs entirely on the database server, raw field values are not transmitted to the client. The client only receives the aggregated schema results.
*   **Limitations**: Uses MapReduce which is deprecated in MongoDB 5.0+ in favor of aggregation pipelines. It writes temporary collections, requiring write access on the database, and is very resource-intensive on large collections.

### 1.4. `izmailoff/MongoDB-Schema-Analyzer` (Scala)
*   **How it works**: Pulls documents from MongoDB and parses them locally into an AST, discarding the values during structural identification.
*   **Leakage Risk**: **High (Client-side ingestion)**. While values are discarded in the final output, they are still queried and sent over the wire into the analyzer's memory.

### 1.5. Object-Document Mappers (ODMs) (`PyODMongo`, `MongoEngine`, `Ming`)
*   **How they work**: Enforce a schema defined in the application code.
*   **Leakage Risk**: **Low (No discovery needed)**. If the schema is already hardcoded in Python class definitions, the tool does not need to query database documents to infer the schema.
*   **Limitation**: Cannot be used to discover the schema of an unknown database, as the schema must be predefined by the developer.

---

## 2. Server-Side Hashing and Anonymization Techniques

To prevent raw sensitive data from being transmitted over the network and loaded into memory, we can instruct the MongoDB server to hash or mask values **before** they leave the database.

### 2.1. Server-Side Hashing via `$toHashedIndexKey` (MongoDB 4.4+)
For older MongoDB versions (5.0, 6.0, 7.0), we can use the `$toHashedIndexKey` operator. This computes the same hash used by MongoDB's hashed indexes.

*   **Example Pipeline**:
    ```javascript
    db.collection.aggregate([
      { $sample: { size: 1000 } },
      { $project: {
          // Keep structure, but replace sensitive string value with its hash
          password: { $toHashedIndexKey: "$password" },
          ssn: { $toHashedIndexKey: "$ssn" },
          email: { $toHashedIndexKey: "$email" },
          // Include other non-sensitive fields normally
          status: 1
      } }
    ])
    ```
*   **Security Benefit**: The actual values (`"secret123"`, `"john@example.com"`) never cross the network boundary. The client only receives the numeric/binary hash, preserving schema type structure (String -> Number/Hash) while masking the data.

### 2.2. Server-Side Cryptographic Hashing via `$hash` (MongoDB 8.3+)
If utilizing MongoDB 8.3+, we can compute standard SHA-256 or MD5 hashes natively.

*   **Example Pipeline**:
    ```javascript
    db.collection.aggregate([
      { $sample: { size: 1000 } },
      { $project: {
          email: { 
            $hash: { 
              input: "$email", 
              algorithm: "sha256" 
            } 
          }
      } }
    ])
    ```

---

## 3. Safe Schema Inference Strategies

Instead of raw value hashing (which still requires knowing which fields are sensitive beforehand), we can implement dynamic, zero-transmission querying using the following architectures:

### Strategy A: The "Blind Key" Flattening Pipeline
We can use a single-pass aggregation pipeline to flatten documents and return *only* the data type names of the values, completely stripping the values on-server.

*   **Native Aggregation (For Flat/Shallow Docs)**:
    ```javascript
    db.collection.aggregate([
      { $sample: { size: 100 } },
      { $project: { fields: { $objectToArray: "$$ROOT" } } },
      { $unwind: "$fields" },
      { $group: {
          _id: "$fields.k",
          types: { $addToSet: { $type: "$fields.v" } }
      } }
    ])
    ```
    This returns a list of keys and their associated types (e.g., `_id: "password", types: ["string"]`). The schema parser in our CLI can then construct the schema from this definition without ever loading document values.

### Strategy B: Dynamic Projection Sampling
If we want to continue using `mongodb-schema` for accurate mixed-array profiling, we can use a **Two-Pass Discovery and Projection** model:

1.  **Pass 1**: Run a fast native aggregation to discover all top-level keys in the collection.
2.  **Pass 2**: Identify which keys match our sensitive field patterns (e.g. `password`, `ssn`, `api_key`).
3.  **Pass 3**: Generate a projection query that sets these sensitive keys to `0` (exclude).
4.  **Pass 4**: Stream the projected documents (excluding all PII) to `mongodb-schema`.

```
+------------------+     1. Discover Keys      +------------------------+
|  MongoDB Server  | ------------------------> | Discovered Keys List   |
|                  |                           +-----------+------------+
|                  |                                       |
|                  |                                       v
|                  |                               +-------+--------+
|                  |                               | Filter PII keys|
|                  |                               +-------+--------+
|                  |                                       |
|                  |     2. Sample Query with              v
|                  |        Exclude Projection     +-------+--------+
|                  | <---------------------------- | Exclude Project|
|                  |                               | { ssn: 0 }     |
|                  |                               +----------------+
+------------------+
```

---

## 4. Recommendations for Safe Python & TypeScript Implementations

If you are developing a custom Python-based or Node.js schema discovery tool:

1.  **Do not use standard `find()` or `dump` operations**.
2.  **Adopt the Two-Pass Projection Model**: This works out-of-the-box on all MongoDB versions (3.6 to 8.0) and does not require server-side JavaScript to be enabled.
3.  **Perform On-Server Replacement**: If you need to verify schema cardinailty (e.g. for enums), replace the string fields with their lengths using `$strLenCP` or hash them using `$toHashedIndexKey` so that actual PII is never exposed.

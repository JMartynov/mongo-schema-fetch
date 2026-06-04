# Research Task: Secure and Zero-Transmission MongoDB Schema Discovery

## 1. Goal

The objective of this research is to design and implement a **Zero-Transmission, Zero-Leak Schema Discovery Mechanism** for MongoDB. The solution must extract the complete structural definition (field names, types, nesting, array elements, and safe enums) of a MongoDB collection without transmitting any raw Personally Identifiable Information (PII) or secrets (e.g., passwords, API keys, SSNs, credit cards) over the network or loading them into the client CLI's memory.

---

## 2. Requirements

*   **Zero-Trust Data Extraction**: No raw values from designated sensitive fields (or fields matching PII patterns) may leave the MongoDB server.
*   **Zero-Knowledge Ingestion**: The client process (CLI/SDK) must be able to infer the schema without reading raw secrets into the client's memory space, eliminating heap dump exposure risks.
*   **High Performance**: The discovery must be efficient, utilizing sampling (e.g., up to 1000 documents) and indexed operations. It must not lock the database, cause high CPU usage on the primary node, or execute long-running full collection scans.
*   **Comprehensive Structural Inference**: The schema output must accurately describe:
    *   Deeply nested subdocuments.
    *   Polymorphic fields (fields that contain multiple different types across documents).
    *   Mixed-type arrays and nested arrays of objects.
    *   Presence rate (frequency) and probability metrics for each field type.
*   **High Compatibility**: Must run on standard MongoDB installations from version 4.4 up to 8.0+, including Standalone, Replica Sets, and Sharded clusters, with standard authentication (SCRAM, X.509) and TLS enabled.
*   **Read-Only Compatibility**: Must function correctly when executed by a database user with strict read-only privileges (cannot write to temporary collections, create map-reduce tables, or define views).

---

## 3. Technical Difficulties and Constraints

*   **Dynamic Schemaless Structures**: MongoDB does not enforce a schema catalog. Different documents in the same collection can have entirely different keys and nesting structures. Hence, static metadata inspection (like `listCollections` or checking validation rules) is insufficient for active databases.
*   **Recursive Nesting Complexity**: Representing and extracting deeply nested trees (e.g., `user.profile.addresses.0.zip`) inside MongoDB's native aggregation framework is extremely difficult. Pure aggregation expressions do not support recursion or dynamic loops.
*   **JavaScript Engine Restrictions**: Server-side JS execution (such as Aggregation `$function` or legacy MapReduce) is disabled on many hardened production environments due to security policies. The solution cannot solely rely on JavaScript-based on-server execution.
*   **Lack of Prior Knowledge**: A client cannot project out sensitive fields *before* querying if it does not know the schema beforehand. Key discovery and extraction must occur dynamically.

---

## 4. Key Research Directions & Milestones

### Milestone 1: Native Aggregation Schema Extractor
Research the construction of a native aggregation pipeline (running purely in MongoDB's C++ execution engine) that recursively extracts keys and maps their BSON types.
*   *Challenge*: Build a pipeline that handles arbitrary object nesting and array traversal using native operators (`$objectToArray`, `$map`, `$reduce`, `$cond`) without exceeding aggregation limits or failing on deep structures.

### Milestone 2: Dynamic Two-Pass Filtering & Excluded Projection
Investigate a hybrid two-pass client-server strategy:
*   *Pass 1*: Run a fast, non-value-loading schema discovery query (e.g., returning only keys/paths).
*   *Pass 2*: Filter the discovered key paths against a PII/secret pattern blocklist.
*   *Pass 3*: Execute the detailed schema analysis (e.g., using `mongodb-schema` with `storeValues: false`) using a generated projection query that explicitly excludes all blacklisted field paths (e.g. `{ "secrets": 0, "user.password": 0 }`).

### Milestone 3: Server-Side Cryptographic Tokenization & Anonymization
Investigate using server-side hash functions (like `$toHashedIndexKey` or `$hash` with SHA-256) to replace string values with anonymous tokens on-server. Evaluate if the resulting anonymized documents can be safely parsed by client-side tools while preserving enum discovery (cardinality checks) without exposing raw strings.

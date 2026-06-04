# Proposal: Server-Side JS-Based Recursive Schema Discovery (Strategy C)

This proposal outlines the implementation of a server-side JavaScript-based recursive schema discovery mechanism using the MongoDB `$function` operator. This strategy aims to achieve absolute zero data leakage by mapping the schema structure entirely on the database server before any data is sent over the network.

---

## 1. Context & Motivation

Our current security architecture implements "Extract & Clean" via `mongodb-schema` and post-inference sanitization. While secure against final report leakage, it still loads raw PII (like passwords and SSNs) into Node.js client memory.

Strategy B (Two-Pass Dynamic Projection) solves this by excluding known sensitive field names from the database query. However, it suffers from two major limitations:
1. **Obfuscation Vulnerability**: It can miss sensitive values stored under non-obvious field names (e.g. `col_d` containing an SSN).
2. **Double Query Roundtrip**: It requires a first pass to discover keys before executing the actual sample query.

---

## 2. Proposed Architecture (Strategy C)

We propose using MongoDB's `$function` aggregation stage (introduced in MongoDB 4.4) to execute a recursive JavaScript schema compiler directly inside the MongoDB database engine.

```
                    +------------------------------------+
                    |           MongoDB Server           |
                    |                                    |
                    |  1. Sample Documents               |
                    |  2. Execute Recursive JS Engine    |
                    |     - Traverses objects & arrays   |
                    |     - Resolves nested paths        |
                    |     - Discards all values          |
                    |     - Returns type mappings        |
                    +-----------------+------------------+
                                      |
                                      v [Network: Metadata Only]
                                      | (e.g. "profile.city": ["string"])
                    +-----------------+------------------+
                    |             Node.js CLI            |
                    |                                    |
                    |  3. Construct Schema Blueprint     |
                    +------------------------------------+
```

### 2.1. The Aggregation Pipeline

The CLI will execute the following aggregation query against target collections:

```javascript
db.collection.aggregate([
  { $sample: { size: 100 } },
  { $project: {
      schema: {
        $function: {
          args: ["$$ROOT"],
          lang: "js",
          body: function(doc) {
            var paths = {};
            
            function traverse(obj, currentPath) {
              if (Array.isArray(obj)) {
                obj.forEach(function(item) {
                  traverse(item, currentPath);
                });
              } else if (obj !== null && typeof obj === 'object' && !(obj instanceof ObjectId) && !(obj instanceof Date)) {
                for (var key in obj) {
                  var nextPath = currentPath ? (currentPath + "." + key) : key;
                  traverse(obj[key], nextPath);
                }
              } else {
                var typeName = typeof obj;
                if (obj instanceof ObjectId) typeName = "ObjectId";
                if (obj instanceof Date) typeName = "Date";
                
                if (!paths[currentPath]) {
                  paths[currentPath] = [];
                }
                if (paths[currentPath].indexOf(typeName) === -1) {
                  paths[currentPath].push(typeName);
                }
              }
            }
            
            // Clean metadata
            var cleanDoc = Object.assign({}, doc);
            delete cleanDoc._id;
            
            traverse(cleanDoc, "");
            return paths;
          }
        }
      }
  } }
])
```

---

## 3. Analysis of Benefits

*   **100% Zero-Transmission**: Raw values (PII) are parsed on the database server and stripped instantly. The network payload only contains structural paths and BSON types.
*   **Fully Recursive**: Handles nested subdocuments, arrays of objects, and polymorphic field types of any depth natively.
*   **Handles Obfuscated PII**: Because it processes and discards all field values, obscurely named sensitive fields (e.g. `col_d: "123-45-6789"`) cannot leak their values.
*   **Single Query Execution**: Replaces the multiple roundtrips required by key discovery with a single aggregation stage.

---

## 4. Drawbacks & Fallback Strategy

### 4.1. Version & Environment Constraints
1. **MongoDB Version**: Requires MongoDB 4.4 or higher.
2. **Server Policy**: Requires `security.javascriptEnabled: true` in `mongod.conf`. Hardened database servers (e.g., enterprise clusters) frequently disable server-side JavaScript to reduce the attack surface.

### 4.2. Recommended Fallback Implementation
To ensure maximum compatibility, the CLI should implement a **hybrid fallback pipeline**:

```
                       +---------------------------------------+
                       | Try Strategy C (Server-side JS query) |
                       +-------------------+-------------------+
                                           |
                                           +---> [Success] -> Build Schema
                                           |
                                           +---> [Fail: "JS Disabled" / Version < 4.4]
                                           |
                                           v
                     +-------------------------------------------+
                     | Fallback to Strategy B (Two-Pass Project) |
                     |  1. Discover flat keys natively           |
                     |  2. Exclude PII keys in projection        |
                     |  3. Run client-side mongodb-schema        |
                     +-------------------------------------------+
```
This hybrid model ensures the highest possible security while maintaining 100% backward compatibility with older MongoDB versions or strict server configurations.

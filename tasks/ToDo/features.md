# Extracted Features & Option Flags Status

This document lists all useful features and option flags extracted from [OLD_README.md](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/OLD_README.md) detailing their descriptions and current implementation status.

---

## 1. CLI Parameters & Option Flags

### --db <name>
- **Description**: Explicitly overrides the database name to connect to, bypassing the database specified in the connection URI.
- **Status**: **Implemented**
- **Details**: Checked in [cli.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/cli.ts#L39-L41).

### --collections <list>
- **Description**: Comma-separated list of collection names to target for profiling. When provided, the interactive console prompt is bypassed.
- **Status**: **Implemented**
- **Details**: Split, trimmed, and mapped in [cli.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/cli.ts#L51-L52).

### --all-collections / --all
- **Description**: Force-scans all collections in the database and bypasses the interactive selection menu.
- **Status**: **Implemented**
- **Details**: Parsed as `--all-collections` in [cli.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/cli.ts#L20).

### --out <path>
- **Description**: Specifies the output target path where the generated schema JSON payload will be saved (defaults to `schema-payload.json`).
- **Status**: **Implemented**
- **Details**: Handled in [cli.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/cli.ts#L96).

### --sample <number>
- **Description**: Specifies a hard-limit override for document sampling during schema inference, bypassing smart dynamic limits.
- **Status**: **Implemented**
- **Details**: Passed to the inference module in [cli.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/cli.ts#L77) and parsed in [schema.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/schema.ts#L9-L11).

### --enum-threshold <number>
- **Description**: The maximum number of unique values a string or number field can have in the sample to be stored in the payload as a low-cardinality enum (defaults to 20).
- **Status**: **Implemented**
- **Details**: Configured and validated in [schema.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/schema.ts#L64).

### --read-preference <mode>
- **Description**: Specifies read preferences (e.g. `secondary` or `secondaryPreferred`) for Replica Set connections to ensure scans don't burden primary nodes.
- **Status**: **Implemented**
- **Details**: Passed to the MongoClient configuration options in [db.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/db.ts#L8-L10).

### --quiet
- **Description**: Bypasses all interactive prompt blocks (such as manual collection selection or magic link confirmation questions), enabling headless CI/CD execution.
- **Status**: **Implemented**
- **Details**: Checked throughout the control flow in [cli.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/cli.ts#L53).

### --query-file <path>
- **Description**: Path to a JSON file containing the database query to analyze in CI/CD pipeline modes.
- **Status**: **Implemented**
- **Details**: Checked for presence and existence in [cli.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/cli.ts#L29) and [upload.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/upload.ts#L8).

### --auto-analyze
- **Description**: Automatically submits the schema payload and the query file to the optimizer API and fails the pipeline (exit code `1`) if degradations are detected.
- **Status**: **Implemented**
- **Details**: Triggers mock analysis in [upload.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/upload.ts#L5).

### --additional
- **Description**: Enables the extraction of advanced query plan cache shape details (`$planCacheStats`) and read/write latency histograms (`$collStats`).
- **Status**: **Implemented**
- **Details**: Configured in [cli.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/cli.ts) and passed to `fetchCollectionStats` in [db.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/db.ts) to conditionally query aggregations.

---

## 2. Core Operational Features

### Server & Host Context Extraction
- **Description**: Extracting target server details via `buildInfo` and OS specifications via `hostInfo`. This includes memory size, CPU cores, architecture, and WiredTiger engine cache configurations.
- **Status**: **Implemented**
- **Details**: Standard build version context, OS metrics, hardware properties (CPU architecture, memory size, CPU count), and WiredTiger engine cache size configurations are safely retrieved, parsed into dedicated properties, and sanitized under the Zero Data Leak Policy.

### Extended Diagnostic Telemetry
- **Description**: Extracting server-level engine diagnostics, including concurrent read/write transactions (available and out tickets), cache dirty ratio percentage, application thread eviction pressure, plan cache shapes, and read/write latency histograms.
- **Status**: **Implemented**
- **Details**: Extracted from `{ serverStatus: 1 }` (WiredTiger concurrent transactions, cache dirty ratio, application eviction pages) and conditional aggregations (`$planCacheStats`, `$collStats` latency statistics) in [db.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/db.ts).

### Collection Stats Gathering
- **Description**: Compiling document counts, estimated document counts, average document size (`avgObjSize`), and total index size (`totalIndexSize`).
- **Status**: **Implemented**
- **Details**: Fetched using `collStats` command with estimation fallbacks in [db.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/db.ts#L42-L64).

### Storage-Model Awareness
- **Description**: Extracting collection storage models, including metadata configurations for Views, Time-Series collections, Capped limits, and Clustered indexes.
- **Status**: **Implemented**
- **Details**: Retrieved using `db.listCollections({ name })` in [db.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/db.ts) and returning `type`, `options`, and enforced `$jsonSchema` rules (`validator`).

### Index Structures & Usage Profiling
- **Description**: Pulling index keys, options, and index access operations (`$indexStats`) to detect unused indexes.
- **Status**: **Implemented**
- **Details**: Implemented in [db.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/db.ts#L66-L88).

### Memory-Safe Smart Sampling
- **Description**: Dynamically sizing sample counts based on `avgObjSize` to prevent OOM errors, and streaming cursor data directly using Node.js Streams instead of `toArray()`.
- **Status**: **Implemented**
- **Details**: Implemented using dynamic sizing (limits: 1000, 300, 50) and `Readable.from()` in [schema.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/schema.ts#L9-L34).

### Low-Cardinality Enum Preservation & String Truncation
- **Description**: Identifies enums (cardinality < threshold) and discards strings exceeding 100 characters to prevent raw data leak.
- **Status**: **Implemented**
- **Details**: Post-processed in [schema.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/schema.ts#L60-L74).

### Graceful Degradation Collection Picker Menu
- **Description**: Automatically scans collections if count <= 10. If > 10, prompts user with interactive selection lists using checkboxes.
- **Status**: **Implemented**
- **Details**: Prompts menu triggered via `prompts` in [interactive.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/interactive.ts#L5-L16).

### Magic Link Browser Launcher
- **Description**: Interactively asks user to upload the payload on save, executes a mock POST request, and opens the returned optimization session link inside the default browser using the `open` module.
- **Status**: **Implemented**
- **Details**: Implemented in [upload.ts](file:///Users/ivan/Project/3t.tools.intellij/mongo/mongo-schema-fetch/src/upload.ts#L30-L55).

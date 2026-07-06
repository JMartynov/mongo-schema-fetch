# MongoDB Schema Fetch: Security & Data Leak Prevention Specification

This specification defines the security architecture, threat model, and verification methodologies implemented in `mongo-schema-fetch` to guarantee a **Zero Data Leak Policy** (preventing any Personally Identifiable Information (PII) or secrets exposure).

---

## 1. Threat Model & Risk Profile

The primary asset protected is the **raw database data** stored in target MongoDB collections. The tool is designed to profile the schema structure (blueprint) for visualization, code generation, or query optimization. No real values must ever leave the database boundary.

### 1.1. Data Leakage Vectors
1. **Raw Sample Values**: The underlying inference library (`mongodb-schema`) retains a sample array of raw values (`values`) for each field type to analyze characteristics. If exported, this leaks real data.
2. **Short PII as Enums**: The utility features an option to preserve low-cardinality enum lists (e.g. `["admin", "user"]` or `["active", "pending"]`). However, if a collection has low unique values for a PII field (e.g. only 5 unique email addresses in a small collection), and `--enum-threshold` is set high, these actual email addresses would be categorized as "safe enums" and leaked.
3. **WiredTiger/Engine Cache Logs**: Database logs or debug metrics containing plan caches might reveal query parameters or values.
4. **Server Environment Metadata**: Hostnames, paths, OS usernames, or hardware details collected by `hostInfo` commands could reveal internal infrastructure names.

---

## 2. Mitigation Architecture & Invariants

To eliminate the leakage vectors, `mongo-schema-fetch` enforces strict sanitization invariants in the `cleanSchema` phase:

```
            +---------------------------+
            |  Raw mongodb-schema output|
            +-------------+-------------+
                          |
                          v
            +---------------------------+
            |  Wipe raw values array    |
            |     (delete obj.values)   |
            +-------------+-------------+
                          |
                          v
            +---------------------------+
            | Filter String & Number enums|
            |   - count < threshold     |
            |   - string length <= 100  |
            +-------------+-------------+
                          |
                          v
            +---------------------------+
            | Recursively clean arrays  |
            |   & subdocument structures |
            +-------------+-------------+
                          |
                          v
            +---------------------------+
            |  Sanitized Schema Blueprint|
            +---------------------------+
```

### 2.1. Sanitization Invariants
- **Default Value Suppression**: By default, `mongo-schema-fetch` executes with `storeValues: false` at the parser level, ensuring no raw value samples or enum values are ever loaded into the generated schema structure.
- **Unconditional Values Wipe**: If `--store-values` is explicitly enabled, all `values` lists generated during the analysis are strictly deleted in the clean schema phase.
- **Enum Threshold Limits**: When values are stored, enums are restricted to `"String"` and `"Number"` types and strictly limited to a cardinality `< enumThreshold` (default `20`).
- **Enum Length Guard**: Any string enum value exceeding **100 characters** is immediately discarded. This prevents capturing raw text blocks, descriptions, or comments that might contain sensitive remarks or secrets.
- **Environment Scrubbing**: The system context fetched by `hostInfo` is explicitly sanitized. The `hostname` and the entire `extra` object are stripped before payload compilation.

### 2.2. PII Sanitization & Masking Invariant (`--sanitize-pii`)
* **Two-Pass Masking**: The schema pipeline dynamically executes a two-pass parser. First, a temporary schema is inferred from raw sampled documents in memory to build the set of enums and keys. Second, the raw documents are walked recursively and mapped using `maskdata` formatting rules (preserving only discovered keys and enums) before executing the final schema inference.
* **Sensitive Format Retention**: Handled PII types preserve structure where possible:
  * Emails are masked to `axxx.xxxx@xxxx.xxx` (preserving username subparts, dots, and domain structures).
  * Phone numbers retain formatting and replace digits with `9` (e.g. `+1-555...` $\rightarrow$ `+9-999...`).
  * Names preserve capital initials and mask trailing characters (e.g. `John` $\rightarrow$ `Jxxx`).
  * Credit Cards retain the first 4 and last 4 digits (e.g., `4111-xxxx-xxxx-4444`).

### 2.3. Zero-Data HMAC Hashing Invariant (`--hash-values`)
* **Categorical Anonymization**: When `--hash-values` is active, string enum values (within the `enumValues` array of the schema) and string query filter values are hashed to prevent exposing any underlying data patterns.
* **16-Character HMAC-SHA256**: Uses a cryptographically secure 256-bit ephemeral key generated at startup using `crypto.randomBytes(32)`. The resulting HMAC hex string is truncated to exactly 16 characters. Numeric values, dates, and comparison operators are bypassed and kept in plaintext to ensure query parsing compatibility.


---

## 3. Security Verification Methodology

A dedicated, isolated security testing pipeline is implemented to continuously audit the utility against PII leakage, ensuring that the CLI operates safely under its default configuration (with `--store-values` set to `false`).

### 3.1. Test Components
1. **mongo-synth (Synthetic Ingestion)**:
   - Ingests mock documents containing realistic PII/secrets into MongoDB.
   - Command: `mongo-synth generate --inject-sensitive`
   - Injected fields: `name`, `email`, `phone`, `ssn`, `address`, `credit_card`, `password`, `api_key`.
2. **Canary Verifier Dictionary**:
   - During generation, `mongo-synth` outputs a dictionary listing all injected PII strings (`verifier.json`).
   - The test runner performs a case-insensitive substring scan of all verifier values (length $> 3$) against the raw exported JSON payload.
   - Any match triggers a test failure.
3. **py-secret-scan (Entropy & Secret Scanner)**:
   - Validates the output payload using the `py-secret-scan` library.
   - Rules target patterns: high-entropy strings, API keys, emails, passwords, and SSNs.
   - Command: `secret-scan --pii --data-dir test/security/data --fail-on-risk LOW`

---

## 4. Acceptance Testing Scope

The BDD security acceptance test suite runs against all supported MongoDB types and deployment topologies:

| Topology | Auth Type | Version Coverage | Security Verification |
| :--- | :--- | :--- | :--- |
| **Standalone** | None | 5.0, 6.0, 7.0, 8.0 | Emulation + Scan |
| **Standalone** | SCRAM-SHA-256 | 7.0 | Emulation + Scan |
| **Replica Set** | Replica auth | 6.0, 7.0, 8.0 | Emulation + Scan |
| **TLS/SSL** | Mutual SSL cert | 7.0 | Emulation + Scan |
| **TLS/SSL** | MONGODB-X509 | 7.0 | Emulation + Scan |

---

## 5. Result Verification & Failure Modes

### 5.1. Standard Exit Codes
- **`0`**: No data leakage detected, validation passed.
- **`1` (Test Suite Failure)**: A PII leakage occurred (a canary value was found in the blueprint, or `py-secret-scan` detected sensitive information).

### 5.2. Pipeline Invariants
The security pipeline is configured to fail on `LOW` risk threshold findings. Any warning generated by the scanner halts the build, ensuring that even minor potential data leaks are caught before release.

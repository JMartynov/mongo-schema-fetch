import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoDBContainer } from '@testcontainers/mongodb';
import { MongoClient, ObjectId } from 'mongodb';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import { maskDocument, hashValue, rewriteQuery, calculatePercentiles, maskOptions } from '../src/sandbox.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Sandbox Multi-Mode Support Unit Tests', () => {
  const key = crypto.randomBytes(32);

  // Test 1.1: Name Masking Verification
  it('Test 1.1: Name Masking Verification', () => {
    const doc = { name: "John Smith" };
    const masked = maskDocument(doc, new Set());
    expect(masked.name).toBe("Jxxx Sxxxx");
  });

  // Test 1.2: Email Masking Verification
  it('Test 1.2: Email Masking Verification', () => {
    const doc = { email: "alice.wonder@domain.com" };
    const masked = maskDocument(doc, new Set());
    expect(masked.email).toBe("axxx.xxxxxx@xxxxxx.xxx");
  });

  // Test 1.3: Phone Number Formatting Retention
  it('Test 1.3: Phone Number Formatting Retention', () => {
    const doc = { phone: "+1-555-890-1234" };
    const masked = maskDocument(doc, new Set());
    expect(masked.phone).toBe("+9-999-999-9999");
  });

  // Test 1.4: Credit Card Boundary Masking
  it('Test 1.4: Credit Card Boundary Masking', () => {
    const doc = { creditCard: "4111222233334444" };
    const masked = maskDocument(doc, new Set());
    expect(masked.creditCard).toBe("4111-xxxx-xxxx-4444");
  });

  // Test 1.5: String Key Preservation
  it('Test 1.5: String Key Preservation', () => {
    const doc = { user_id: "usr_90123" };
    const masked = maskDocument(doc, new Set());
    expect(masked.user_id).toBe("usr_90123");
  });

  // Test 1.6: ObjectId Hex Preservation
  it('Test 1.6: ObjectId Hex Preservation', () => {
    const id = new ObjectId("60a4f8e5f1b2c3d4e5f6a7b8");
    const doc = { _id: id };
    const masked = maskDocument(doc, new Set());
    expect(masked._id.toString()).toBe("60a4f8e5f1b2c3d4e5f6a7b8");
  });

  // Test 1.7: Low-Cardinality Enum Exclusion
  it('Test 1.7: Low-Cardinality Enum Exclusion', () => {
    const doc = { status: "active" };
    const excluded = new Set(["status"]);
    const masked = maskDocument(doc, excluded);
    expect(masked.status).toBe("active");
  });

  // Test 1.8: Numeric Field Preservation
  it('Test 1.8: Numeric Field Preservation', () => {
    const doc = { age: 28, salary: 95000 };
    const masked = maskDocument(doc, new Set());
    expect(masked.age).toBe(28);
    expect(masked.salary).toBe(95000);
  });

  // Test 1.9: Nested Array Document Masking
  it('Test 1.9: Nested Array Document Masking', () => {
    const doc = { contacts: [{ name: "Bob", email: "bob@test.com" }] };
    const masked = maskDocument(doc, new Set());
    expect(masked.contacts[0].name).toBe("Bxx");
    expect(masked.contacts[0].email).toBe("bxx@xxxx.xxx");
  });

  // Test 2.2: HMAC-SHA256 Token Length
  it('Test 2.2: HMAC-SHA256 Token Length', () => {
    const hashed = hashValue("pending", key);
    expect(hashed).toHaveLength(16);
  });

  // Test 2.6: Date Range Bypass
  it('Test 2.6: Date Range Bypass', () => {
    const query = { created_at: { $gt: "2026-01-01T00:00:00Z" } };
    const rewritten = rewriteQuery(query, key);
    expect(rewritten.created_at.$gt).toBe("2026-01-01T00:00:00Z");
  });

  // Test 2.7: Compound Query Rewrite Integrity
  it('Test 2.7: Compound Query Rewrite Integrity', () => {
    const query = { status: "active", price: { $gt: 100 } };
    const rewritten = rewriteQuery(query, key);
    expect(rewritten.status).not.toBe("active");
    expect(rewritten.status).toHaveLength(16);
    expect(rewritten.price.$gt).toBe(100);
  });
});

describe.skipIf(process.env.SKIP_TESTCONTAINERS === 'true')('Sandbox E2E Database Integration Tests', () => {
  let container: any;
  let uri: string;
  let client: MongoClient;
  const dbName = 'sandbox_db';

  beforeAll(async () => {
    container = await new MongoDBContainer('mongo:7.0').start();
    const baseUri = container.getConnectionString();
    uri = baseUri.includes('?') ? `${baseUri}&directConnection=true` : `${baseUri}?directConnection=true`;
    client = new MongoClient(uri);
    await client.connect();
    execSync('npm run build');
  }, 120000);

  afterAll(async () => {
    if (client) await client.close();
    if (container) await container.stop();
  });

  // Test 1.10: CLI Safe Exit Code
  it('Test 1.10: CLI Safe Exit Code', async () => {
    const db = client.db(dbName);
    await db.collection('customers').insertOne({ name: "Alice", email: "alice@domain.com" });
    const outPath = path.join(__dirname, 'test-sanitize-pii.json');

    execSync(`node dist/cli.js "${uri}" --db ${dbName} --collections customers --out "${outPath}" --sanitize-pii --quiet`);
    expect(fs.existsSync(outPath)).toBe(true);

    const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    fs.unlinkSync(outPath);

    expect(payload.collections.length).toBe(1);
    const schema = payload.collections[0].schema;
    const nameField = schema.fields.find((f: any) => f.name === 'name');
    expect(nameField).toBeDefined();
  });

  // Test 2.1: Ephemeral Key Generation Check
  it('Test 2.1: Ephemeral Key Generation Check', () => {
    const outPath1 = path.join(__dirname, 'test-hash-1.json');
    const outPath2 = path.join(__dirname, 'test-hash-2.json');

    execSync(`node dist/cli.js "${uri}" --db ${dbName} --collections customers --out "${outPath1}" --hash-values --quiet --enum-threshold 20 --store-values`);
    execSync(`node dist/cli.js "${uri}" --db ${dbName} --collections customers --out "${outPath2}" --hash-values --quiet --enum-threshold 20 --store-values`);

    const payload1 = JSON.parse(fs.readFileSync(outPath1, 'utf8'));
    const payload2 = JSON.parse(fs.readFileSync(outPath2, 'utf8'));

    fs.unlinkSync(outPath1);
    fs.unlinkSync(outPath2);

    const emailField1 = payload1.collections[0].schema.fields.find((f: any) => f.name === 'email');
    const emailField2 = payload2.collections[0].schema.fields.find((f: any) => f.name === 'email');

    const enum1 = emailField1.types[0].enumValues?.[0];
    const enum2 = emailField2.types[0].enumValues?.[0];

    expect(enum1).toBeDefined();
    expect(enum2).toBeDefined();
    expect(enum1).not.toBe(enum2);
  });

  // Test 2.3: Lower-Than Selectivity Ratio ($lt)
  it('Test 2.3: Lower-Than Selectivity Ratio ($lt)', async () => {
    const db = client.db(dbName);
    const coll = db.collection('grades');
    await coll.deleteMany({});
    await coll.insertMany([
      { score: 10 }, { score: 20 }, { score: 30 },
      { score: 50 }, { score: 60 }, { score: 70 },
      { score: 80 }, { score: 90 }, { score: 100 }, { score: 110 }
    ]);

    const outPath = path.join(__dirname, 'test-lt.json');
    const query = JSON.stringify({ score: { $lt: 50 } });

    execSync(`node dist/cli.js "${uri}" --db ${dbName} --collections grades --out "${outPath}" --percentiles --query '${query}' --quiet`);

    const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    fs.unlinkSync(outPath);

    const collData = payload.collections.find((c: any) => c.stats.name === 'grades');
    expect(collData.percentileStats.score).toBe(0.3);
  });

  // Test 2.4: Greater-Than Selectivity Ratio ($gt)
  it('Test 2.4: Greater-Than Selectivity Ratio ($gt)', async () => {
    const db = client.db(dbName);
    const coll = db.collection('products');
    await coll.deleteMany({});
    await coll.insertMany([
      { price: 50 }, { price: 60 }, { price: 70 }, { price: 80 }, { price: 90 }, { price: 100 },
      { price: 150 }, { price: 200 }, { price: 250 }, { price: 300 }
    ]);

    const outPath = path.join(__dirname, 'test-gt.json');
    const query = JSON.stringify({ price: { $gt: 100 } });

    execSync(`node dist/cli.js "${uri}" --db ${dbName} --collections products --out "${outPath}" --percentiles --query '${query}' --quiet`);

    const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    fs.unlinkSync(outPath);

    const collData = payload.collections.find((c: any) => c.stats.name === 'products');
    expect(collData.percentileStats.price).toBe(0.6);
  });

  // Test 2.5: Zero Document Copy Guarantee
  it('Test 2.5: Zero Document Copy Guarantee', async () => {
    const db = client.db(dbName);
    const coll = db.collection('large_coll');
    await coll.deleteMany({});
    const docs = [];
    for (let i = 0; i < 5000; i++) {
      docs.push({ val: i });
    }
    await coll.insertMany(docs);

    const outPath = path.join(__dirname, 'test-large.json');
    const query = JSON.stringify({ val: { $gt: 2500 } });

    execSync(`node dist/cli.js "${uri}" --db ${dbName} --collections large_coll --out "${outPath}" --percentiles --query '${query}' --quiet`);

    const stats = fs.statSync(outPath);
    expect(stats.size).toBeLessThan(50 * 1024);

    const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    fs.unlinkSync(outPath);

    const collData = payload.collections.find((c: any) => c.stats.name === 'large_coll');
    expect(collData.schema.fields.find((f: any) => f.name === 'val').types[0].values).toBeUndefined();
  });

  // Test 2.8: Unindexed Field Performance
  it('Test 2.8: Unindexed Field Performance', async () => {
    const db = client.db(dbName);
    const coll = db.collection('unindexed');
    await coll.deleteMany({});
    await coll.insertOne({ note: "Hello World" });

    const outPath = path.join(__dirname, 'test-unindexed.json');
    const query = JSON.stringify({ note: "Hello World" });

    execSync(`node dist/cli.js "${uri}" --db ${dbName} --collections unindexed --out "${outPath}" --percentiles --query '${query}' --quiet`);
    expect(fs.existsSync(outPath)).toBe(true);
    fs.unlinkSync(outPath);
  });

  // Test 2.9: Null and Missing Fields Handling
  it('Test 2.9: Null and Missing Fields Handling', async () => {
    const db = client.db(dbName);
    const coll = db.collection('missing_fields');
    await coll.deleteMany({});
    await coll.insertMany([
      { val: 10 }, { val: 10 }, { val: 10 },
      {}, {}
    ]);

    const outPath = path.join(__dirname, 'test-missing.json');
    const query = JSON.stringify({ val: { $lt: 50 } });

    execSync(`node dist/cli.js "${uri}" --db ${dbName} --collections missing_fields --out "${outPath}" --percentiles --query '${query}' --quiet`);

    const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    fs.unlinkSync(outPath);

    const collData = payload.collections.find((c: any) => c.stats.name === 'missing_fields');
    expect(collData.percentileStats.val).toBe(1.0);
  });

  // Test 2.10: Empty Collection Fallback
  it('Test 2.10: Empty Collection Fallback', async () => {
    const db = client.db(dbName);
    await db.createCollection('empty_coll').catch(() => {});
    const coll = db.collection('empty_coll');
    await coll.deleteMany({});

    const outPath = path.join(__dirname, 'test-empty.json');
    const query = JSON.stringify({ val: { $lt: 50 } });

    execSync(`node dist/cli.js "${uri}" --db ${dbName} --collections empty_coll --out "${outPath}" --percentiles --query '${query}' --quiet`);

    const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    fs.unlinkSync(outPath);

    const collData = payload.collections.find((c: any) => c.stats.name === 'empty_coll');
    expect(collData.percentileStats.val).toBe(0.0);
  });
});

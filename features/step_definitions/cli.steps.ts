import { Given, When, Then, After, BeforeAll, setDefaultTimeout } from '@cucumber/cucumber';
import { MongoDBContainer } from '@testcontainers/mongodb';
import { MongoClient } from 'mongodb';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import assert from 'assert';

setDefaultTimeout(180000); // 3 minutes timeout for pulling images and starting containers

let container: any;
let client: MongoClient;
let mongoUri: string;
let runExitCode: number;
const dbName = 'testdb';
const outPath = path.join(process.cwd(), 'features-payload.json');

BeforeAll(() => {
  // Ensure the CLI is built
  execSync('npm run build', { stdio: 'inherit' });
});

After(async () => {
  if (client) {
    await client.close();
  }
  if (container) {
    await container.stop();
  }
  if (fs.existsSync(outPath)) {
    fs.unlinkSync(outPath);
  }
});

Given('a running MongoDB {string} container in {string} configuration', async (version: string, config: string) => {
  if (config === 'auth') {
    container = await new MongoDBContainer(version)
      .withUsername('admin')
      .withPassword('password')
      .start();
  } else {
    container = await new MongoDBContainer(version).start();
  }

  const baseUri = container.getConnectionString();
  mongoUri = baseUri.includes('?') ? `${baseUri}&directConnection=true` : `${baseUri}?directConnection=true`;

  client = new MongoClient(mongoUri);
  await client.connect();
});

Given('a running MongoDB {string} replica set cluster container', async (version: string) => {
  container = await new MongoDBContainer(version).start();
  const baseUri = container.getConnectionString();
  mongoUri = baseUri.includes('?') ? `${baseUri}&directConnection=true` : `${baseUri}?directConnection=true`;
  if (!mongoUri.includes('replicaSet=')) {
    mongoUri += '&replicaSet=rs0';
  }

  client = new MongoClient(mongoUri);
  await client.connect();
});

Given('the database has collection {string} with documents:', async (collectionName: string, dataTable: any) => {
  const db = client.db(dbName);
  const collection = db.collection(collectionName);

  const rows = dataTable.hashes();
  const docs = rows.map((row: any) => {
    const doc: any = {};
    for (const key in row) {
      const val = row[key];
      if (/^\d+$/.test(val)) {
        doc[key] = parseInt(val, 10);
      } else {
        doc[key] = val;
      }
    }
    return doc;
  });

  await collection.insertMany(docs);
});

When('I run mongo-schema-fetch with {string} and quiet mode', (args: string) => {
  try {
    const cmd = `node dist/cli.js "${mongoUri}" --db ${dbName} --out ${outPath} --quiet ${args}`;
    execSync(cmd, { stdio: 'pipe' });
    runExitCode = 0;
  } catch (err: any) {
    runExitCode = err.status ?? 1;
    console.error("CLI Execution failed:", err.stderr?.toString() || err.message);
  }
});

Then('the exit code should be {int}', (expectedCode: number) => {
  assert.strictEqual(runExitCode, expectedCode);
});

Then('the output payload should contain collection {string}', (collectionName: string) => {
  assert.ok(fs.existsSync(outPath), "Output payload file does not exist");
  const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  assert.ok(payload.collections, "Payload does not contain 'collections'");
  
  const coll = payload.collections.find((c: any) => c.stats.name === collectionName);
  assert.ok(coll, `Collection ${collectionName} not found in payload`);
});

Then('the field {string} in {string} should have enum values {string} and {string}', (fieldName: string, collectionName: string, val1: string, val2: string) => {
  const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const coll = payload.collections.find((c: any) => c.stats.name === collectionName);
  assert.ok(coll, `Collection ${collectionName} not found`);

  const field = coll.schema.fields.find((f: any) => f.name === fieldName);
  assert.ok(field, `Field ${fieldName} not found`);

  const typeDesc = field.types.find((t: any) => t.name === 'String');
  assert.ok(typeDesc, `String type descriptor for field ${fieldName} not found`);
  assert.ok(typeDesc.enumValues, `enumValues not found for field ${fieldName}`);
  assert.ok(typeDesc.enumValues.includes(val1), `enumValues does not contain ${val1}`);
  assert.ok(typeDesc.enumValues.includes(val2), `enumValues does not contain ${val2}`);
});

Then('the field {string} in {string} should not leak any values', (fieldName: string, collectionName: string) => {
  const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const coll = payload.collections.find((c: any) => c.stats.name === collectionName);
  assert.ok(coll, `Collection ${collectionName} not found`);

  const field = coll.schema.fields.find((f: any) => f.name === fieldName);
  assert.ok(field, `Field ${fieldName} not found`);

  assert.strictEqual(field.values, undefined, `Field ${fieldName} leaked values directly`);
  
  if (field.types) {
    for (const typeDesc of field.types) {
      assert.strictEqual(typeDesc.values, undefined, `Type descriptor ${typeDesc.name} for field ${fieldName} leaked values`);
    }
  }
});

Then('the output payload should have buildInfo version matching {string}', (expectedVersion: string) => {
  const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  assert.ok(payload.serverContext, "Payload does not contain 'serverContext'");
  assert.ok(payload.serverContext.buildInfo, "serverContext does not contain 'buildInfo'");
  
  const actualVersion = payload.serverContext.buildInfo.version;
  // MongoDB version is in semantic format, e.g. "5.0.18", and expectedVersion is e.g. "mongo:5.0"
  const shortVersion = expectedVersion.replace('mongo:', '');
  assert.ok(actualVersion.startsWith(shortVersion), `Expected version to start with ${shortVersion}, but got ${actualVersion}`);
});

import { Given, When, Then, After, BeforeAll, AfterAll, Before, setDefaultTimeout } from '@cucumber/cucumber';
import { MongoDBContainer } from '@testcontainers/mongodb';
import { GenericContainer, Wait } from 'testcontainers';
import { MongoClient } from 'mongodb';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { generateCerts, cleanupCerts, getCertPaths } from '../../test/certs-helper.js';

setDefaultTimeout(180000); // 3 minutes timeout for pulling images and starting containers

let container: any;
let client: MongoClient;
let mongoUri: string;
let runExitCode: number;
const dbName = 'testdb';
const outPath = path.join(process.cwd(), 'features-payload.json');

export let isTlsScenario = false;
export let isX509Scenario = false;

Before(() => {
  isTlsScenario = false;
  isX509Scenario = false;
});


BeforeAll(() => {
  // Ensure the CLI is built
  execSync('npm run build', { stdio: 'inherit' });
  // Generate certificates for TLS testing
  generateCerts();
});

AfterAll(() => {
  // Cleanup generated certificates
  cleanupCerts();
});

const createdFiles: string[] = [];

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
  for (const f of createdFiles) {
    if (fs.existsSync(f)) {
      try {
        fs.unlinkSync(f);
      } catch (e) {}
    }
  }
  createdFiles.length = 0;
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

When('I run mongo-schema-fetch with username and password parameters and quiet mode', () => {
  try {
    const uriWithoutCredentials = mongoUri.replace(/\/\/[^@]+@/, '//');
    const cmd = `node dist/cli.js "${uriWithoutCredentials}" --db ${dbName} --out ${outPath} --quiet -u admin -p password --all-collections`;
    execSync(cmd, { stdio: 'pipe' });
    runExitCode = 0;
  } catch (err: any) {
    runExitCode = err.status ?? 1;
    console.error("CLI Execution failed:", err.stderr?.toString() || err.message);
  }
});

When('I run mongo-schema-fetch with wrong username and password parameters and quiet mode', () => {
  try {
    const uriWithoutCredentials = mongoUri.replace(/\/\/[^@]+@/, '//');
    const cmd = `node dist/cli.js "${uriWithoutCredentials}" --db ${dbName} --out ${outPath} --quiet -u wronguser -p wrongpassword --all-collections`;
    execSync(cmd, { stdio: 'pipe' });
    runExitCode = 0;
  } catch (err: any) {
    runExitCode = err.status ?? 1;
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

Given('a running MongoDB container with TLS enabled', async () => {
  isTlsScenario = true;
  const paths = getCertPaths();
  container = await new GenericContainer("mongo:7.0")
    .withExposedPorts(27017)
    .withCopyFilesToContainer([
      {
        source: paths.serverPem,
        target: "/etc/ssl/server.pem"
      },
      {
        source: paths.caPem,
        target: "/etc/ssl/ca.pem"
      }
    ])
    .withCommand([
      "--tlsMode", "requireTLS",
      "--tlsCertificateKeyFile", "/etc/ssl/server.pem",
      "--tlsCAFile", "/etc/ssl/ca.pem",
      "--tlsAllowConnectionsWithoutCertificates",
      "--bind_ip_all"
    ])
    .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
    .start();

  const mappedPort = container.getMappedPort(27017);
  const host = container.getHost();
  mongoUri = `mongodb://${host}:${mappedPort}/`;
  
  client = new MongoClient(mongoUri, {
    tls: true,
    tlsCAFile: paths.caPem,
    tlsCertificateKeyFile: paths.clientPem,
  });
  await client.connect();
});

When('I run mongo-schema-fetch with TLS and CA verification and quiet mode', () => {
  try {
    const paths = getCertPaths();
    const cmd = `node dist/cli.js "${mongoUri}" --db ${dbName} --out ${outPath} --quiet --tls --tls-ca-file "${paths.caPem}" --all-collections`;
    execSync(cmd, { stdio: 'pipe' });
    runExitCode = 0;
  } catch (err: any) {
    runExitCode = err.status ?? 1;
    console.error("CLI Execution failed:", err.stderr?.toString() || err.message);
  }
});

When('I run mongo-schema-fetch with TLS and mutual authentication and quiet mode', () => {
  try {
    const paths = getCertPaths();
    const cmd = `node dist/cli.js "${mongoUri}" --db ${dbName} --out ${outPath} --quiet --tls --tls-ca-file "${paths.caPem}" --tls-certificate-key-file "${paths.clientPem}" --all-collections`;
    execSync(cmd, { stdio: 'pipe' });
    runExitCode = 0;
  } catch (err: any) {
    runExitCode = err.status ?? 1;
    console.error("CLI Execution failed:", err.stderr?.toString() || err.message);
  }
});

When('I run mongo-schema-fetch with TLS but no CA verification and quiet mode', () => {
  try {
    const cmd = `node dist/cli.js "${mongoUri}" --db ${dbName} --out ${outPath} --quiet --tls --all-collections`;
    execSync(cmd, { stdio: 'pipe' });
    runExitCode = 0;
  } catch (err: any) {
    runExitCode = err.status ?? 1;
  }
});

When('I run mongo-schema-fetch with TLS and invalid CA verification bypassed and quiet mode', () => {
  try {
    const cmd = `node dist/cli.js "${mongoUri}" --db ${dbName} --out ${outPath} --quiet --tls --tls-allow-invalid-certificates --all-collections`;
    execSync(cmd, { stdio: 'pipe' });
    runExitCode = 0;
  } catch (err: any) {
    runExitCode = err.status ?? 1;
    console.error("CLI Execution failed:", err.stderr?.toString() || err.message);
  }
});

When('I run mongo-schema-fetch with TLS and mismatching hostname allowed and quiet mode', () => {
  try {
    const paths = getCertPaths();
    const cmd = `node dist/cli.js "${mongoUri}" --db ${dbName} --out ${outPath} --quiet --tls --tls-ca-file "${paths.caPem}" --tls-allow-invalid-hostnames --all-collections`;
    execSync(cmd, { stdio: 'pipe' });
    runExitCode = 0;
  } catch (err: any) {
    runExitCode = err.status ?? 1;
    console.error("CLI Execution failed:", err.stderr?.toString() || err.message);
  }
});

When('I run mongo-schema-fetch with username, password, authSource, and authMechanism parameters and quiet mode', () => {
  try {
    const uriWithoutCredentials = mongoUri.replace(/\/\/[^@]+@/, '//');
    const cmd = `node dist/cli.js "${uriWithoutCredentials}" --db ${dbName} --out ${outPath} --quiet -u admin -p password --auth-source admin --auth-mechanism SCRAM-SHA-256 --all-collections`;
    execSync(cmd, { stdio: 'pipe' });
    runExitCode = 0;
  } catch (err: any) {
    runExitCode = err.status ?? 1;
    console.error("CLI Execution failed:", err.stderr?.toString() || err.message);
  }
});

When('I run mongo-schema-fetch with TLS, mutual authentication, and encrypted client certificate password and quiet mode', () => {
  try {
    const paths = getCertPaths();
    const cmd = `node dist/cli.js "${mongoUri}" --db ${dbName} --out ${outPath} --quiet --tls --tls-ca-file "${paths.caPem}" --tls-certificate-key-file "${paths.clientEncPem}" --tls-certificate-key-file-password testpassword --all-collections`;
    execSync(cmd, { stdio: 'pipe' });
    runExitCode = 0;
  } catch (err: any) {
    runExitCode = err.status ?? 1;
    console.error("CLI Execution failed:", err.stderr?.toString() || err.message);
  }
});

When('I run mongo-schema-fetch with username parameter and password in environment and quiet mode', () => {
  try {
    const uriWithoutCredentials = mongoUri.replace(/\/\/[^@]+@/, '//');
    const cmd = `node dist/cli.js "${uriWithoutCredentials}" --db ${dbName} --out ${outPath} --quiet -u admin --all-collections`;
    execSync(cmd, {
      stdio: 'pipe',
      env: { ...process.env, MONGODB_PASSWORD: 'password' }
    });
    runExitCode = 0;
  } catch (err: any) {
    runExitCode = err.status ?? 1;
    console.error("CLI Execution failed:", err.stderr?.toString() || err.message);
  }
});

When('I run mongo-schema-fetch with all extended connection options and quiet mode', () => {
  try {
    const uriWithoutCredentials = mongoUri.replace(/\/\/[^@]+@/, '//');
    const cmd = `node dist/cli.js "${uriWithoutCredentials}" --db ${dbName} --out ${outPath} --quiet -u admin -p password --auth-source admin --auth-mechanism SCRAM-SHA-256 --auth-mechanism-properties "SERVICE_NAME:mongodb" --connect-timeout-ms 9000 --socket-timeout-ms 20000 --server-selection-timeout-ms 4000 --max-idle-time-ms 30000 --max-pool-size 10 --min-pool-size 2 --app-name "test-fetch-app" --retry-writes --retry-reads --direct-connection --compressors zlib --write-concern-w majority --write-concern-j --write-concern-wtimeout-ms 3000 --read-concern-level local --all-collections`;
    execSync(cmd, { stdio: 'pipe' });
    runExitCode = 0;
  } catch (err: any) {
    runExitCode = err.status ?? 1;
    console.error("CLI Execution failed:", err.stderr?.toString() || err.message);
  }
});

Given('a running MongoDB container with TLS and MONGODB-X509 auth enabled', async () => {
  isTlsScenario = true;
  isX509Scenario = true;
  const paths = getCertPaths();
  container = await new GenericContainer("mongo:7.0")
    .withExposedPorts(27017)
    .withCopyFilesToContainer([
      {
        source: paths.serverPem,
        target: "/etc/ssl/server.pem"
      },
      {
        source: paths.caPem,
        target: "/etc/ssl/ca.pem"
      },
      {
        source: paths.clientPem,
        target: "/etc/ssl/client.pem"
      }
    ])
    .withCommand([
      "--tlsMode", "requireTLS",
      "--tlsCertificateKeyFile", "/etc/ssl/server.pem",
      "--tlsCAFile", "/etc/ssl/ca.pem",
      "--auth",
      "--bind_ip_all"
    ])
    .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
    .start();

  const execResult = await container.exec([
    "mongosh",
    "--tls",
    "--tlsCAFile", "/etc/ssl/ca.pem",
    "--tlsCertificateKeyFile", "/etc/ssl/client.pem",
    "--tlsAllowInvalidHostnames",
    "--eval",
    `db.getSiblingDB("admin").createUser({ user: "admin", pwd: "password", roles: [{ role: "root", db: "admin" }] }); db.getSiblingDB("admin").auth("admin", "password"); db.getSiblingDB("$external").createUser({ user: "CN=client", roles: [{ role: "root", db: "admin" }, { role: "readWrite", db: "testdb" }] });`
  ]);
  
  if (execResult.exitCode !== 0) {
    throw new Error(`Failed to create X509 user in container: ${execResult.output}`);
  }

  const mappedPort = container.getMappedPort(27017);
  const host = container.getHost();
  mongoUri = `mongodb://${host}:${mappedPort}/`;
  
  client = new MongoClient(mongoUri, {
    tls: true,
    tlsCAFile: paths.caPem,
    tlsCertificateKeyFile: paths.clientPem,
    authMechanism: 'MONGODB-X509',
    authSource: '$external',
  });
  await client.connect();
});

When('I run mongo-schema-fetch with TLS and MONGODB-X509 authentication and quiet mode', () => {
  try {
    const paths = getCertPaths();
    const cmd = `node dist/cli.js "${mongoUri}" --db ${dbName} --out ${outPath} --quiet --tls --tls-ca-file "${paths.caPem}" --tls-certificate-key-file "${paths.clientPem}" --auth-mechanism MONGODB-X509 --auth-source '$external' --all-collections`;
    execSync(cmd, { stdio: 'pipe' });
    runExitCode = 0;
  } catch (err: any) {
    runExitCode = err.status ?? 1;
    console.error("CLI Execution failed:", err.stderr?.toString() || err.message);
  }
});

When('I run mongo-schema-fetch with username, password, authSource, and SCRAM-SHA-1 authMechanism parameters and quiet mode', () => {
  try {
    const uriWithoutCredentials = mongoUri.replace(/\/\/[^@]+@/, '//');
    const cmd = `node dist/cli.js "${uriWithoutCredentials}" --db ${dbName} --out ${outPath} --quiet -u admin -p password --auth-source admin --auth-mechanism SCRAM-SHA-1 --all-collections`;
    execSync(cmd, { stdio: 'pipe' });
    runExitCode = 0;
  } catch (err: any) {
    runExitCode = err.status ?? 1;
    console.error("CLI Execution failed:", err.stderr?.toString() || err.message);
  }
});

When('I run mongo-schema-fetch with username parameter and password in MONGODB_PASS environment and quiet mode', () => {
  try {
    const uriWithoutCredentials = mongoUri.replace(/\/\/[^@]+@/, '//');
    const cmd = `node dist/cli.js "${uriWithoutCredentials}" --db ${dbName} --out ${outPath} --quiet -u admin --all-collections`;
    execSync(cmd, {
      stdio: 'pipe',
      env: { ...process.env, MONGODB_PASS: 'password' }
    });
    runExitCode = 0;
  } catch (err: any) {
    runExitCode = err.status ?? 1;
    console.error("CLI Execution failed:", err.stderr?.toString() || err.message);
  }
});

export function getTestMongoUri() { return mongoUri; }
export function getTestDbName() { return dbName; }
export function getTestOutPath() { return outPath; }
export function getTestRunExitCode() { return runExitCode; }
export function setTestRunExitCode(code: number) { runExitCode = code; }
export function getIsTlsScenario() { return isTlsScenario; }
export function getIsX509Scenario() { return isX509Scenario; }

Then('the output payload should not contain collection {string}', (collectionName: string) => {
  assert.ok(fs.existsSync(outPath), "Output payload file does not exist");
  const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const coll = payload.collections.find((c: any) => c.stats.name === collectionName);
  assert.ok(!coll, `Collection ${collectionName} was found in payload but should be excluded`);
});

When('I run mongo-schema-fetch with username, password, and negated connection parameters and quiet mode', () => {
  try {
    const uriWithoutCredentials = mongoUri.replace(/\/\/[^@]+@/, '//');
    const cmd = `node dist/cli.js "${uriWithoutCredentials}" --db ${dbName} --out ${outPath} --quiet -u admin -p password --no-retry-writes --no-retry-reads --no-write-concern-j --all-collections`;
    execSync(cmd, { stdio: 'pipe' });
    runExitCode = 0;
  } catch (err: any) {
    runExitCode = err.status ?? 1;
    console.error("CLI Execution failed:", err.stderr?.toString() || err.message);
  }
});

When('I run mongo-schema-fetch with username, password, and disabled direct connection and quiet mode', () => {
  try {
    const uriWithoutCredentials = mongoUri.replace(/\/\/[^@]+@/, '//');
    const cmd = `node dist/cli.js "${uriWithoutCredentials}" --db ${dbName} --out ${outPath} --quiet -u admin -p password --no-direct-connection --all-collections`;
    execSync(cmd, { stdio: 'pipe' });
    runExitCode = 0;
  } catch (err: any) {
    runExitCode = err.status ?? 1;
  }
});

Given('a query file {string} containing {string}', (filename: string, content: string) => {
  const filePath = path.join(process.cwd(), filename);
  fs.writeFileSync(filePath, content, 'utf8');
  createdFiles.push(filePath);
});






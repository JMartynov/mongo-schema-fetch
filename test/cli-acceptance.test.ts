import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoDBContainer } from '@testcontainers/mongodb';
import { execSync } from 'child_process';
import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// These tests are designed to run in environments where Docker is fully available.
// They use testcontainers to spin up actual MongoDB instances for Acceptance Testing as required.
describe.skipIf(process.env.SKIP_TESTCONTAINERS === 'true')('mongo-schema-fetch Acceptance Tests (Testcontainers)', () => {

    // We can parameterize this or write a loop for mongo 6.0 and 7.0
    const mongoVersions = ['mongo:6.0', 'mongo:7.0'];

    for (const version of mongoVersions) {
        describe(`Running against ${version}`, () => {
            let container: any;
            let uri: string;
            let client: MongoClient;
            const dbName = 'testdb';
            let outPath: string;

            beforeAll(async () => {
                try {
                    container = await new MongoDBContainer(version).start();
                    uri = container.getConnectionString();

                    client = new MongoClient(uri);
                    await client.connect();

                    const db = client.db(dbName);
                    const users = db.collection('users');

                    // Insert dummy data
                    await users.insertMany([
                        { name: "Alice", age: 30, role: "admin", createdAt: new Date() },
                        { name: "Bob", age: 25, role: "user", createdAt: new Date() },
                        { name: "Charlie", age: 35, role: "user", createdAt: new Date() }
                    ]);
                    await users.createIndex({ age: 1 });

                    const orders = db.collection('orders');
                    await orders.insertMany([
                        { total: 100, status: "completed" },
                        { total: 50, status: "pending" }
                    ]);

                    execSync('npm run build');
                } catch (err) {
                    console.error("Setup failed (Docker might be unavailable):", err);
                    throw err;
                }
            }, 120000);

            afterAll(async () => {
                if (client) await client.close();
                if (container) await container.stop();
                if (outPath && fs.existsSync(outPath)) {
                    fs.unlinkSync(outPath);
                }
            });

            it(`should generate a valid schema payload file in quiet mode for ${version}`, () => {
                outPath = path.join(__dirname, `test-payload-${version.replace(':', '-')}.json`);

                // execute the cli
                execSync(`node dist/cli.js "${uri}" --db ${dbName} --out ${outPath} --quiet`);

                expect(fs.existsSync(outPath)).toBe(true);

                const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));

                // Assertions for payload format
                expect(payload).toHaveProperty('serverContext');
                expect(payload).toHaveProperty('collections');
                expect(payload.collections.length).toBeGreaterThanOrEqual(2);

                const userColl = payload.collections.find((c: any) => c.stats.name === 'users');
                expect(userColl).toBeDefined();
                expect(userColl.stats.count).toBe(3);
                expect(userColl.indexes.indexes.length).toBeGreaterThan(0);

                // Verify enum detection
                const roleField = userColl.schema.fields.find((f: any) => f.name === 'role');
                expect(roleField).toBeDefined();
                expect(roleField.type).toBe('String');
                expect(roleField.enumValues).toContain('admin');
                expect(roleField.enumValues).toContain('user');
                expect(roleField.values).toBeUndefined();

                // Verify ObjectId / Date didn't leak values
                const idField = userColl.schema.fields.find((f: any) => f.name === '_id');
                expect(idField.values).toBeUndefined();
                expect(idField.enumValues).toBeUndefined();

                const createdAtField = userColl.schema.fields.find((f: any) => f.name === 'createdAt');
                if (createdAtField) {
                    expect(createdAtField.values).toBeUndefined();
                }
            });
        });
    }
});

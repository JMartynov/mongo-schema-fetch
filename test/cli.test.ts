import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';

describe('mongo-schema-fetch CLI Options Validation', () => {
    beforeAll(() => {
        execSync('npm run build');
    });

    it('should output help and exit successfully', () => {
        const output = execSync('node dist/cli.js --help', { encoding: 'utf8' });
        expect(output).toContain('Usage: mongo-schema-fetch');
        expect(output).toContain('--quiet');
        expect(output).toContain('--stored-values-limit');
        expect(output).toContain('--distinct-fields-threshold');
        expect(output).toContain('--sanitize-pii');
        expect(output).toContain('--server');
        expect(output).toContain('--query');
        expect(output).toContain('--machine');
        expect(output).toContain('--log-file');
    });

    it('should fail if --server is passed without query or query-file', () => {
        let threw = false;
        try {
            execSync('node dist/cli.js "mongodb://localhost:27017/db" --server localhost:3000', { encoding: 'utf8', stdio: 'pipe' });
        } catch (err: any) {
            threw = true;
            expect(err.status).toBe(1);
            expect(err.stderr.toString()).toContain('Error: --query or --query-file must be provided when using --server');
        }
        expect(threw).toBe(true);
    });

    it('should fail if --query is invalid JSON', () => {
        let threw = false;
        try {
            execSync('node dist/cli.js "mongodb://localhost:27017/db" --server localhost:3000 --query "{invalid}"', { encoding: 'utf8', stdio: 'pipe' });
        } catch (err: any) {
            threw = true;
            expect(err.status).toBe(1);
            expect(err.stderr.toString()).toContain('Error: --query must be valid JSON');
        }
        expect(threw).toBe(true);
    });

    it('should fail if connection URI is invalid', () => {
        let threw = false;
        try {
            execSync('node dist/cli.js "invalid-uri" --server localhost:3000 --query "{}"', { encoding: 'utf8', stdio: 'pipe' });
        } catch (err: any) {
            threw = true;
            expect(err.status).toBe(1);
            expect(err.stderr.toString()).toContain('Error: Invalid MongoDB connection URI');
        }
        expect(threw).toBe(true);
    });

    it('should fail if numerical parameters are invalid', () => {
        let threw = false;
        try {
            execSync('node dist/cli.js "mongodb://localhost:27017/db" --server localhost:3000 --query "{}" --sample abc', { encoding: 'utf8', stdio: 'pipe' });
        } catch (err: any) {
            threw = true;
            expect(err.status).toBe(1);
            expect(err.stderr.toString()).toContain('Error: --sample must be a positive integer');
        }
        expect(threw).toBe(true);
    });

    it('should fail if query is empty', () => {
        let threw = false;
        try {
            execSync('node dist/cli.js "mongodb://localhost:27017/db" --server localhost:3000 --query ""', { encoding: 'utf8', stdio: 'pipe' });
        } catch (err: any) {
            threw = true;
            expect(err.status).toBe(1);
            expect(err.stderr.toString()).toContain('Error: --query must be valid JSON or a valid mongosh query: Query is empty');
        }
        expect(threw).toBe(true);
    });

    it('should successfully parse valid mongosh queries', () => {
        // Let's run in quiet mode, and since we connect to a non-existent port (or we can just check query parsing before connection starts)
        // Wait, URI validation passes, parameter validation passes, query validation passes.
        // Then it tries to connect and fails to connect (which is expected because there is no MongoDB server at localhost:27018),
        // but we verify it didn't fail on query validation!
        let threw = false;
        try {
            execSync('node dist/cli.js "mongodb://localhost:27018/db" --server-selection-timeout-ms 500 --server localhost:3000 --query "db.users.find({ age: { \\$gt: 20 } })"', { encoding: 'utf8', stdio: 'pipe' });
        } catch (err: any) {
            threw = true;
            // It should fail on connection timeout, NOT on query validation
            expect(err.stderr.toString()).not.toContain('Error: --query must be valid JSON');
            expect(err.stderr.toString()).not.toContain('Invalid query format');
        }
        expect(threw).toBe(true);
    });
});

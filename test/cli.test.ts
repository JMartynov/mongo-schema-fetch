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
});

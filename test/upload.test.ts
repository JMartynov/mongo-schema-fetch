import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { autoAnalyze, promptAndUploadMagicLink, submitToLiteServer } from '../src/upload.js';
import fs from 'fs';
import prompts from 'prompts';

vi.mock('fs');
vi.mock('prompts');
vi.mock('open', () => ({
  default: vi.fn()
}));

describe('Upload Module (UC-1, UC-2 & UC-3)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('UC-1: promptAndUploadMagicLink', () => {
        it('should prompt user and upload if user accepts', async () => {
            (prompts as any).mockResolvedValue({ upload: true });

            await promptAndUploadMagicLink('path/to/payload.json', 10);

            expect(prompts).toHaveBeenCalled();
        });

        it('should skip upload if user declines', async () => {
            (prompts as any).mockResolvedValue({ upload: false });

            await promptAndUploadMagicLink('path/to/payload.json', 10);

            expect(prompts).toHaveBeenCalled();
        });
    });

    describe('UC-2: autoAnalyze', () => {
        it('should return false if query file does not exist', async () => {
            (fs.existsSync as any).mockReturnValue(false);

            const result = await autoAnalyze('payload.json', 'missing.json');

            expect(result).toBe(false);
        });

        it('should return false if query contains fail_test', async () => {
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue('{ "fail_test": true }');

            const result = await autoAnalyze('payload.json', 'query.json');

            expect(result).toBe(false);
        });

        it('should return true if query does not contain fail_test', async () => {
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readFileSync as any).mockReturnValue('{ "valid": true }');

            const result = await autoAnalyze('payload.json', 'query.json');

            expect(result).toBe(true);
        });
    });

    describe('UC-3: submitToLiteServer', () => {
        beforeEach(() => {
            vi.stubGlobal('fetch', vi.fn());
            vi.spyOn(console, 'log').mockImplementation(() => {});
            vi.spyOn(console, 'error').mockImplementation(() => {});
        });

        afterEach(() => {
            vi.unstubAllGlobals();
            vi.restoreAllMocks();
        });

        it('should successfully submit payload to server with http protocol prepended and return true', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ id: 'mock-job-123' })
            });
            vi.stubGlobal('fetch', mockFetch);

            const result = await submitToLiteServer('localhost:3000', { collections: [] }, { role: 'admin' });

            expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/jobs', expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ schema: { collections: [] }, query: { role: 'admin' } })
            }));
            expect(result).toBe(true);
        });

        it('should include db parameter in POST payload body when provided', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ id: 'mock-job-123' })
            });
            vi.stubGlobal('fetch', mockFetch);

            const result = await submitToLiteServer('localhost:3000', { collections: [] }, { role: 'admin' }, 'my_test_db');

            expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/api/jobs', expect.objectContaining({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ schema: { collections: [] }, query: { role: 'admin' }, db: 'my_test_db' })
            }));
            expect(result).toBe(true);
        });

        it('should successfully submit payload when https is explicitly provided', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ jobId: 'mock-job-456' })
            });
            vi.stubGlobal('fetch', mockFetch);

            const result = await submitToLiteServer('https://secure-host:8080/', { collections: [] }, { role: 'admin' });

            expect(mockFetch).toHaveBeenCalledWith('https://secure-host:8080/api/jobs', expect.any(Object));
            expect(result).toBe(true);
        });

        it('should return false and log error if fetch fails', async () => {
            const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
            vi.stubGlobal('fetch', mockFetch);

            const result = await submitToLiteServer('localhost:3000', {}, {});

            expect(result).toBe(false);
        });

        it('should return false if response is not ok', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error'
            });
            vi.stubGlobal('fetch', mockFetch);

            const result = await submitToLiteServer('localhost:3000', {}, {});

            expect(result).toBe(false);
        });

        it('should return false if response JSON has no job ID', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ wrongField: 'no-id' })
            });
            vi.stubGlobal('fetch', mockFetch);

            const result = await submitToLiteServer('localhost:3000', {}, {});

            expect(result).toBe(false);
        });
    });
});

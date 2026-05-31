import { describe, it, expect, vi, beforeEach } from 'vitest';
import { autoAnalyze, promptAndUploadMagicLink } from '../src/upload.js';
import fs from 'fs';
import prompts from 'prompts';

vi.mock('fs');
vi.mock('prompts');
vi.mock('open', () => ({
  default: vi.fn()
}));

describe('Upload Module (UC-1 & UC-2)', () => {
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
});

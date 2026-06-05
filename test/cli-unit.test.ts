import { describe, it, expect } from 'vitest';
import { Command } from 'commander';

// We just test the CLI parsing logic directly to ensure commander behaves correctly
describe('CLI Unit tests (Argument parsing)', () => {
    it('should parse basic options', () => {
        const program = new Command();
        program
          .argument('<uri>', 'MongoDB Connection URI')
          .option('--db <name>')
          .option('--collections <list>')
          .option('--all-collections')
          .option('--out <path>', 'Output file path', 'schema-payload.json')
          .option('--sample <number>', 'Custom sample limit', parseInt)
          .option('--enum-threshold <number>', 'Threshold', parseInt, 20)
          .option('--store-values')
          .option('--stored-values-limit <number>', 'Stored values limit', parseInt)
          .option('--distinct-fields-threshold <number>', 'Distinct fields threshold', parseInt)
          .option('--sanitize-pii')
          .option('--read-preference <mode>')
          .option('--quiet')
          .action(() => {}); // prevent execution

        program.parse([
            'node',
            'cli.js',
            'mongodb://localhost',
            '--db', 'test',
            '--read-preference', 'secondary',
            '--stored-values-limit', '42',
            '--distinct-fields-threshold', '350',
            '--sanitize-pii'
        ]);

        const opts = program.opts();
        expect(opts.db).toBe('test');
        expect(opts.readPreference).toBe('secondary');
        expect(opts.out).toBe('schema-payload.json');
        expect(opts.enumThreshold).toBe(20);
        expect(opts.storedValuesLimit).toBe(42);
        expect(opts.distinctFieldsThreshold).toBe(350);
        expect(opts.sanitizePii).toBe(true);
    });
});

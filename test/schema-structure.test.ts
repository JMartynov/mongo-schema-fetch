import { describe, it, expect } from 'vitest';
import parse from 'mongodb-schema';
import { Readable } from 'stream';

describe('Real mongodb-schema output structure', () => {
    it('should show where the values array lives', async () => {
        const s = new Readable({
          objectMode: true,
          read() {
            this.push({ a: "secret123", b: 123 });
            this.push(null);
          }
        });

        const parser = (parse as any).default || parse;
        const schema = await parser(s, { semanticTypes: true });

        // Log it to see what we are dealing with.
        console.log(JSON.stringify(schema, null, 2));

        // The values are likely at: schema.fields[0].types[0].values
        expect(schema.fields[0].name).toBe('a');
        expect(schema.fields[0].types[0].values).toContain('secret123');
    });
});

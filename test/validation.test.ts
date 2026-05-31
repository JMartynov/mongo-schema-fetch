import { describe, it, expect } from 'vitest';
import { validatePayload } from '../src/validation.js';

describe('Payload Validation (AJV)', () => {
    it('should pass for a valid payload', () => {
        const payload = {
            serverContext: {
                buildInfo: { version: "6.0" }
            },
            collections: [
                {
                    stats: {
                        name: "users",
                        count: 10,
                        estimatedDocumentCount: 10,
                        avgObjSize: 100,
                        totalIndexSize: 4096
                    },
                    indexes: {
                        name: "users",
                        indexes: [],
                        indexStats: []
                    },
                    schema: {
                        fields: []
                    }
                }
            ]
        };

        expect(validatePayload(payload)).toBe(true);
    });

    it('should fail if serverContext is missing buildInfo', () => {
        const payload = {
            serverContext: {
                hostInfo: {}
            },
            collections: []
        };
        expect(validatePayload(payload)).toBe(false);
    });

    it('should fail if collections have missing stats', () => {
        const payload = {
            serverContext: { buildInfo: {} },
            collections: [
                {
                    stats: { name: "users" }, // missing fields
                    indexes: { name: "users", indexes: [], indexStats: [] },
                    schema: {}
                }
            ]
        };
        expect(validatePayload(payload)).toBe(false);
    });

    it('should fail if unexpected root properties are added', () => {
        const payload = {
            serverContext: { buildInfo: {} },
            collections: [],
            maliciousDataLeak: "some data"
        };
        expect(validatePayload(payload)).toBe(false);
    });
});

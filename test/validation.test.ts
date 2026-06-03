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

    it('should validate payload containing optional hardware, engine cache, storage models and diagnostics parameters', () => {
        const payload = {
            serverContext: {
                buildInfo: { version: "7.0" },
                hostInfo: { system: { cpuArch: "x86_64" } },
                cpuArch: "x86_64",
                memSizeMB: 16384,
                numProcessors: 8,
                wiredTigerCacheBytes: 8589934592,
                concurrentTransactions: {
                    read: { available: 120, out: 8 },
                    write: { available: 110, out: 18 }
                },
                cacheDirtyRatio: 12.5,
                pagesEvictedByApp: 45
            },
            collections: [
                {
                    stats: {
                        name: "users",
                        count: 10,
                        estimatedDocumentCount: 10,
                        avgObjSize: 100,
                        totalIndexSize: 4096,
                        type: "timeseries",
                        options: { timeseries: { timeField: "timestamp" } },
                        validator: { $jsonSchema: { required: ["timestamp"] } },
                        planCache: [{ queryHash: "A1B2" }],
                        latencyStats: { reads: { ops: 100 } }
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

    it('should fail validation if cpuArch is not a string', () => {
        const payload = {
            serverContext: {
                buildInfo: { version: "7.0" },
                cpuArch: 12345 // should be string
            },
            collections: []
        };
        expect(validatePayload(payload)).toBe(false);
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

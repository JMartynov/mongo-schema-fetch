import { describe, it, expect, vi } from 'vitest';
import { cleanSchema, inferSchema } from '../src/schema.js';
import { Readable } from 'stream';

vi.mock('mongodb-schema', () => {
    return {
        default: vi.fn((stream, opts, cb) => {
            return Promise.resolve({ mocked: true });
        })
    };
});

describe('inferSchema protection rules', () => {
    it('should use find for small collections', async () => {
        const findMock = vi.fn().mockReturnValue(Readable.from([]));
        const aggregateMock = vi.fn().mockReturnValue(Readable.from([]));
        
        const mockDb = {
            collection: () => ({
                estimatedDocumentCount: () => Promise.resolve(500),
                find: findMock,
                aggregate: aggregateMock
            })
        } as any;

        await inferSchema(mockDb, 'users', 1000);
        expect(findMock).toHaveBeenCalledWith({}, { maxTimeMS: 5000 });
        expect(aggregateMock).not.toHaveBeenCalled();
    });

    it('should use sample for large collections', async () => {
        const findMock = vi.fn().mockReturnValue(Readable.from([]));
        const aggregateMock = vi.fn().mockReturnValue(Readable.from([]));
        
        const mockDb = {
            collection: () => ({
                estimatedDocumentCount: () => Promise.resolve(2000),
                find: findMock,
                aggregate: aggregateMock
            })
        } as any;

        // avgObjSize is small, so limit remains 1000
        await inferSchema(mockDb, 'users', 1000);
        expect(aggregateMock).toHaveBeenCalledWith([{ $sample: { size: 1000 } }], { maxTimeMS: 5000 });
        expect(findMock).not.toHaveBeenCalled();
    });

    it('should dynamically lower sample limit based on avgObjSize', async () => {
        const aggregateMock = vi.fn().mockReturnValue(Readable.from([]));
        const mockDb = {
            collection: () => ({
                estimatedDocumentCount: () => Promise.resolve(2000),
                aggregate: aggregateMock,
                find: vi.fn()
            })
        } as any;

        await inferSchema(mockDb, 'users', 20 * 1024); // 20KB -> > 10KB -> limit 300
        expect(aggregateMock).toHaveBeenCalledWith([{ $sample: { size: 300 } }], { maxTimeMS: 5000 });

        aggregateMock.mockClear();
        await inferSchema(mockDb, 'users', 150 * 1024); // 150KB -> > 100KB -> limit 50
        expect(aggregateMock).toHaveBeenCalledWith([{ $sample: { size: 50 } }], { maxTimeMS: 5000 });
    });

    it('should override limit if customSampleLimit is provided', async () => {
        const aggregateMock = vi.fn().mockReturnValue(Readable.from([]));
        const mockDb = {
            collection: () => ({
                estimatedDocumentCount: () => Promise.resolve(10000),
                aggregate: aggregateMock,
                find: vi.fn()
            })
        } as any;

        // EVEN with large objects, custom limit forces it
        await inferSchema(mockDb, 'users', 150 * 1024, 5000); 
        expect(aggregateMock).toHaveBeenCalledWith([{ $sample: { size: 5000 } }], { maxTimeMS: 5000 });
    });

    it('should fallback to 0 count if estimatedDocumentCount throws', async () => {
        const findMock = vi.fn().mockReturnValue(Readable.from([]));
        const mockDb = {
            collection: () => ({
                estimatedDocumentCount: () => Promise.reject(new Error("Unauthorized")),
                find: findMock
            })
        } as any;

        // Will default count to 0, which is <= 1000, calling find()
        await inferSchema(mockDb, 'users', 1000);
        expect(findMock).toHaveBeenCalled();
    });
});

describe('Schema cleaning', () => {
    it('should keep enum values if below threshold and short string', () => {
        const rawSchema = {
            fields: [
                {
                    name: "status",
                    type: "String",
                    probability: 1,
                    types: [
                        {
                            name: "String",
                            values: ["active", "inactive"]
                        }
                    ]
                }
            ]
        };
        const cleaned = cleanSchema(rawSchema, 20);
        expect(cleaned.fields[0].types[0].enumValues).toEqual(["active", "inactive"]);
        expect(cleaned.fields[0].types[0].values).toBeUndefined(); // Should not leak original values array
    });

    it('should drop enum values if string is too long', () => {
        const longStr = "a".repeat(150);
        const rawSchema = {
            fields: [
                {
                    name: "description",
                    type: "String",
                    probability: 1,
                    types: [
                        {
                            name: "String",
                            values: ["short", longStr]
                        }
                    ]
                }
            ]
        };
        const cleaned = cleanSchema(rawSchema, 20);
        expect(cleaned.fields[0].types[0].enumValues).toEqual(["short"]);
        expect(cleaned.fields[0].types[0].values).toBeUndefined();
    });

    it('should remove enumValues completely if all strings were too long', () => {
        const longStr1 = "a".repeat(150);
        const longStr2 = "b".repeat(120);
        const rawSchema = {
            fields: [
                {
                    name: "description",
                    type: "String",
                    probability: 1,
                    types: [
                        {
                            name: "String",
                            values: [longStr1, longStr2]
                        }
                    ]
                }
            ]
        };
        const cleaned = cleanSchema(rawSchema, 20);
        expect(cleaned.fields[0].types[0].enumValues).toBeUndefined();
        expect(cleaned.fields[0].types[0].values).toBeUndefined();
    });

    it('should drop enum values if above threshold', () => {
        const rawSchema = {
            fields: [
                {
                    name: "status",
                    type: "String",
                    probability: 1,
                    types: [
                        {
                            name: "String",
                            values: ["1", "2", "3", "4", "5"]
                        }
                    ]
                }
            ]
        };
        const cleaned = cleanSchema(rawSchema, 3); // threshold 3
        expect(cleaned.fields[0].types[0].enumValues).toBeUndefined();
        expect(cleaned.fields[0].types[0].values).toBeUndefined();
    });

    it('should unconditionally drop values for non-string/number types (e.g. ObjectId, Date)', () => {
        const rawSchema = {
            fields: [
                {
                    name: "_id",
                    type: "ObjectID",
                    probability: 1,
                    types: [
                        {
                            name: "ObjectID",
                            values: ["64a6b2c2e4b00c3b00000001", "64a6b2c2e4b00c3b00000002"]
                        }
                    ]
                },
                {
                    name: "createdAt",
                    type: "Date",
                    probability: 1,
                    types: [
                        {
                            name: "Date",
                            values: ["2023-01-01T00:00:00.000Z", "2023-01-02T00:00:00.000Z"]
                        }
                    ]
                }
            ]
        };
        const cleaned = cleanSchema(rawSchema, 20);
        expect(cleaned.fields[0].types[0].enumValues).toBeUndefined();
        expect(cleaned.fields[0].types[0].values).toBeUndefined();

        expect(cleaned.fields[1].types[0].enumValues).toBeUndefined();
        expect(cleaned.fields[1].types[0].values).toBeUndefined();
    });
});

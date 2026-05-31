import { describe, it, expect } from 'vitest';
import { cleanSchema } from '../src/schema.js';

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

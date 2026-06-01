import { describe, it, expect, vi } from 'vitest';
import { fetchServerContext, getCollectionNames, fetchCollectionStats, fetchCollectionIndexes } from '../src/db.js';

describe('DB Operations (Mocked)', () => {
    it('fetchServerContext should handle permissions errors gracefully', async () => {
        const mockDb = {
            admin: () => ({
                command: vi.fn().mockImplementation((cmd) => {
                    if (cmd.buildInfo) return Promise.resolve({ version: "6.0" });
                    if (cmd.hostInfo) return Promise.reject(new Error("Unauthorized"));
                })
            })
        } as any;

        const ctx = await fetchServerContext(mockDb);
        expect(ctx.buildInfo).toEqual({ version: "6.0" });
        expect(ctx.hostInfo).toEqual({});
    });

    it('fetchServerContext should extract and sanitize hardware & cache options', async () => {
        const mockDb = {
            admin: () => ({
                command: vi.fn().mockImplementation((cmd) => {
                    if (cmd.buildInfo) return Promise.resolve({ version: "7.0.8" });
                    if (cmd.hostInfo) return Promise.resolve({
                        system: {
                            cpuArch: "x86_64",
                            memSizeMB: 16384,
                            numProcessors: 8,
                            hostname: "sensitive-hostname"
                        },
                        os: {
                            type: "Darwin",
                            name: "Mac OS X"
                        },
                        extra: {
                            cpuModel: "Intel Core i9"
                        }
                    });
                    if (cmd.serverStatus) return Promise.resolve({
                        wiredTiger: {
                            cache: {
                                "maximum bytes configured": 8589934592
                            }
                        }
                    });
                })
            })
        } as any;

        const ctx = await fetchServerContext(mockDb);
        expect(ctx.buildInfo).toEqual({ version: "7.0.8" });
        expect(ctx.cpuArch).toBe("x86_64");
        expect(ctx.memSizeMB).toBe(16384);
        expect(ctx.numProcessors).toBe(8);
        expect(ctx.wiredTigerCacheBytes).toBe(8589934592);
        
        // Assert sanitization
        expect(ctx.hostInfo).toBeDefined();
        expect(ctx.hostInfo.system).toBeDefined();
        expect(ctx.hostInfo.system.cpuArch).toBe("x86_64");
        expect(ctx.hostInfo.system.hostname).toBeUndefined();
        expect(ctx.hostInfo.extra).toBeUndefined();
        expect(ctx.hostInfo.os).toEqual({ type: "Darwin", name: "Mac OS X" });
    });

    it('getCollectionNames should list collections', async () => {
        const mockDb = {
            listCollections: () => ({
                toArray: () => Promise.resolve([{ name: "users" }, { name: "orders" }])
            })
        } as any;

        const names = await getCollectionNames(mockDb);
        expect(names).toEqual(["users", "orders"]);
    });

    it('fetchCollectionStats should fall back to estimations if collStats fails', async () => {
        const mockColl = {
            countDocuments: () => Promise.resolve(10),
            estimatedDocumentCount: () => Promise.resolve(12)
        };
        const mockDb = {
            command: vi.fn().mockRejectedValue(new Error("Unauthorized")),
            collection: () => mockColl
        } as any;

        const stats = await fetchCollectionStats(mockDb, "users");
        expect(stats.name).toBe("users");
        expect(stats.count).toBe(10);
        expect(stats.estimatedDocumentCount).toBe(12);
        expect(stats.avgObjSize).toBe(0);
        expect(stats.totalIndexSize).toBe(0);
    });

    it('fetchCollectionIndexes should handle missing privileges', async () => {
        const mockColl = {
            indexes: vi.fn().mockRejectedValue(new Error("Unauthorized")),
            aggregate: () => ({
                toArray: vi.fn().mockRejectedValue(new Error("Unauthorized"))
            })
        };
        const mockDb = {
            collection: () => mockColl
        } as any;

        const indexes = await fetchCollectionIndexes(mockDb, "users");
        expect(indexes.name).toBe("users");
        expect(indexes.indexes).toEqual([]);
        expect(indexes.indexStats).toEqual([]);
    });
});

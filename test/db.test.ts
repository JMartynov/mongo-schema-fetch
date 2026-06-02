import { describe, it, expect, vi, beforeEach } from 'vitest';
import { connectToDb, fetchServerContext, getCollectionNames, fetchCollectionStats, fetchCollectionIndexes, clearHostMap, sanitizeHost } from '../src/db.js';
import { MongoClient } from 'mongodb';

vi.mock('mongodb', () => {
  const mClient = {
    connect: vi.fn(),
    db: vi.fn().mockReturnValue({})
  };
  return {
    MongoClient: vi.fn().mockImplementation(function() {
      return mClient;
    })
  };
});

describe('DB Operations (Mocked)', () => {
    it('connectToDb should pass correct timeouts and readPreference', async () => {
        const { client, db } = await connectToDb('mongodb://localhost', 'secondary');
        
        expect(MongoClient).toHaveBeenCalledWith('mongodb://localhost', {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
            readPreference: 'secondary'
        });
        expect(client.connect).toHaveBeenCalled();
        expect(client.db).toHaveBeenCalled();
    });

    it('fetchServerContext should handle permissions errors gracefully', async () => {
        const mockDb = {
            admin: () => ({
                command: vi.fn().mockImplementation((cmd) => {
                    if (cmd.buildInfo) return Promise.reject(new Error("Unauthorized buildInfo"));
                    if (cmd.hostInfo) return Promise.reject(new Error("Unauthorized hostInfo"));
                    if (cmd.serverStatus) return Promise.reject(new Error("Unauthorized serverStatus"));
                })
            })
        } as any;

        const ctx = await fetchServerContext(mockDb);
        expect(ctx.buildInfo).toEqual({});
        expect(ctx.hostInfo).toEqual({});
        expect(ctx.wiredTigerCacheBytes).toBeUndefined();
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

    it('getCollectionNames should list collections and filter system.*', async () => {
        const mockDb = {
            listCollections: () => ({
                toArray: () => Promise.resolve([{ name: "users" }, { name: "system.profile" }, { name: "orders" }])
            })
        } as any;

        const names = await getCollectionNames(mockDb);
        expect(names).toEqual(["users", "orders"]);
    });

    it('sanitizeHost should handle IPv6 addresses and strip brackets', () => {
        clearHostMap();
        expect(sanitizeHost('[fe80::1]:27017')).toBe('node_1:27017');
        expect(sanitizeHost('[::1]')).toBe('node_2');
        expect(sanitizeHost('192.168.1.1:27017')).toBe('node_3:27017');
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

    beforeEach(() => {
        clearHostMap();
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

    it('fetchCollectionIndexes should sanitize indexStats hosts symbolically', async () => {
        const mockColl = {
            indexes: vi.fn().mockResolvedValue([{ v: 2, key: { _id: 1 }, name: "_id_" }]),
            aggregate: () => ({
                toArray: vi.fn().mockResolvedValue([
                    { name: "_id_", host: "cluster-node-01.internal:27017", accesses: { ops: 10 } },
                    { name: "email_1", host: "192.168.1.100:27017", accesses: { ops: 5 } },
                    { name: "role_1", host: "cluster-node-01.internal:27017", accesses: { ops: 8 } }
                ])
            })
        };
        const mockDb = {
            collection: () => mockColl
        } as any;

        const result = await fetchCollectionIndexes(mockDb, "users");
        expect(result.indexes).toEqual([{ v: 2, key: { _id: 1 }, name: "_id_" }]);
        expect(result.indexStats).toHaveLength(3);

        // Assert hostname/IP are masked symbolically
        expect(result.indexStats[0].host).not.toContain("cluster-node-01");
        expect(result.indexStats[0].host).toBe("node_1:27017");

        expect(result.indexStats[1].host).not.toContain("192.168.1.100");
        expect(result.indexStats[1].host).toBe("node_2:27017");

        // Assert identical hosts map to identical symbolic names
        expect(result.indexStats[2].host).toBe("node_1:27017");
    });
});

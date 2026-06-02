import { MongoClient, Db } from 'mongodb';
import { ServerContext, CollectionStats, CollectionIndexes } from './types.js';

import { ReadPreferenceMode } from 'mongodb';

export async function connectToDb(uri: string, readPreference?: string): Promise<{ client: MongoClient; db: Db }> {
  const options: any = {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  };
  if (readPreference) {
    options.readPreference = readPreference as ReadPreferenceMode;
  }
  const client = new MongoClient(uri, options);
  await client.connect();
  const db = client.db();
  return { client, db };
}

export async function fetchServerContext(db: Db): Promise<ServerContext> {
  const adminDb = db.admin();
  let buildInfo: any = {};
  let hostInfo: any = {};
  let cpuArch: string | undefined;
  let memSizeMB: number | undefined;
  let numProcessors: number | undefined;
  let wiredTigerCacheBytes: number | undefined;

  try {
    buildInfo = await adminDb.command({ buildInfo: 1 });
  } catch (err: any) {
    console.warn("⚠️ Could not fetch buildInfo (requires cluster privileges).", err.message);
  }

  try {
    hostInfo = await adminDb.command({ hostInfo: 1 });
    if (hostInfo && hostInfo.system) {
      if (typeof hostInfo.system.cpuArch === 'string') {
        cpuArch = hostInfo.system.cpuArch;
      }
      if (typeof hostInfo.system.memSizeMB === 'number') {
        memSizeMB = hostInfo.system.memSizeMB;
      }
      if (typeof hostInfo.system.numProcessors === 'number') {
        numProcessors = hostInfo.system.numProcessors;
      }
      delete hostInfo.system.hostname;
    }
    if (hostInfo) {
      delete hostInfo.extra;
    }
  } catch (err: any) {
    console.warn("⚠️ Could not fetch hostInfo (requires cluster privileges).", err.message);
  }

  try {
    const serverStatus = await adminDb.command({ serverStatus: 1 });
    if (serverStatus && serverStatus.wiredTiger && serverStatus.wiredTiger.cache) {
      const maxBytes = serverStatus.wiredTiger.cache['maximum bytes configured'];
      if (typeof maxBytes === 'number') {
        wiredTigerCacheBytes = maxBytes;
      }
    }
  } catch (err: any) {
    console.warn("⚠️ Could not fetch serverStatus (requires cluster privileges).", err.message);
  }

  return {
    buildInfo,
    hostInfo,
    cpuArch,
    memSizeMB,
    numProcessors,
    wiredTigerCacheBytes
  };
}

export async function getCollectionNames(db: Db): Promise<string[]> {
  const collections = await db.listCollections().toArray();
  return collections.map(c => c.name).filter(name => !name.startsWith('system.'));
}

export async function fetchCollectionStats(db: Db, collectionName: string): Promise<CollectionStats> {
  const coll = db.collection(collectionName);

  let stats: any = {};
  try {
    stats = await db.command({ collStats: collectionName });
  } catch (err: any) {
    console.warn(`⚠️ Could not fetch collStats for ${collectionName}. Falling back to estimations.`, err.message);
  }

  const count = stats.count ?? await coll.countDocuments().catch(() => 0);
  const estimatedDocumentCount = await coll.estimatedDocumentCount().catch(() => 0);
  const avgObjSize = stats.avgObjSize ?? 0;
  const totalIndexSize = stats.totalIndexSize ?? 0;

  return {
    name: collectionName,
    count,
    estimatedDocumentCount,
    avgObjSize,
    totalIndexSize
  };
}

const hostMap = new Map<string, string>();
let hostCounter = 1;

export function clearHostMap(): void {
  hostMap.clear();
  hostCounter = 1;
}

export function sanitizeHost(hostStr: string): string {
  if (!hostStr) return hostStr;

  const lastColonIndex = hostStr.lastIndexOf(':');
  let hostPart = hostStr;
  let portPart = '';

  if (lastColonIndex !== -1 && lastColonIndex > hostStr.lastIndexOf(']')) {
    hostPart = hostStr.substring(0, lastColonIndex);
    portPart = hostStr.substring(lastColonIndex);
  }

  const cleanHostPart = hostPart.replace(/^\[|\]$/g, '');

  if (!hostMap.has(cleanHostPart)) {
    hostMap.set(cleanHostPart, `node_${hostCounter++}`);
  }

  const symbolicHost = hostMap.get(cleanHostPart)!;
  return portPart ? `${symbolicHost}${portPart}` : symbolicHost;
}

export async function fetchCollectionIndexes(db: Db, collectionName: string): Promise<CollectionIndexes> {
  const coll = db.collection(collectionName);

  let indexes: any[] = [];
  try {
    indexes = await coll.indexes();
  } catch (err: any) {
    console.warn(`⚠️ Could not fetch indexes for ${collectionName}.`, err.message);
  }

  let indexStats: any[] = [];
  try {
    indexStats = await coll.aggregate([{ $indexStats: {} }]).toArray();
    for (const stat of indexStats) {
      if (typeof stat.host === 'string') {
        stat.host = sanitizeHost(stat.host);
      }
    }
  } catch (err: any) {
    console.warn(`⚠️ Could not fetch $indexStats for ${collectionName}.`, err.message);
  }

  return {
    name: collectionName,
    indexes,
    indexStats
  };
}

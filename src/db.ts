import { MongoClient, Db } from 'mongodb';
import { ServerContext, CollectionStats, CollectionIndexes } from './types.js';

import { ReadPreferenceMode } from 'mongodb';

export interface ConnectionOptions {
  readPreference?: string;
  username?: string;
  password?: string;
  authSource?: string;
  authMechanism?: string;
  authMechanismProperties?: string;
  tls?: boolean;
  tlsCAFile?: string;
  tlsCertificateKeyFile?: string;
  tlsCertificateKeyFilePassword?: string;
  tlsAllowInvalidCertificates?: boolean;
  tlsAllowInvalidHostnames?: boolean;
  connectTimeoutMS?: number;
  socketTimeoutMS?: number;
  serverSelectionTimeoutMS?: number;
  maxIdleTimeMS?: number;
  maxPoolSize?: number;
  minPoolSize?: number;
  appName?: string;
  retryWrites?: boolean;
  retryReads?: boolean;
  directConnection?: boolean;
  loadBalanced?: boolean;
  compressors?: string[];
  w?: string | number;
  journal?: boolean;
  wtimeoutMS?: number;
  readConcernLevel?: string;
}

function parseAuthMechanismProperties(propStr: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const pair of propStr.split(',')) {
    const splitIdx = pair.indexOf(':');
    if (splitIdx !== -1) {
      const key = pair.substring(0, splitIdx).trim();
      const value = pair.substring(splitIdx + 1).trim();
      props[key] = value;
    }
  }
  return props;
}

export async function connectToDb(
  uri: string,
  optionsOrReadPreference?: ConnectionOptions | string
): Promise<{ client: MongoClient; db: Db }> {
  let connOpts: ConnectionOptions = {};
  if (typeof optionsOrReadPreference === 'string') {
    connOpts.readPreference = optionsOrReadPreference;
  } else if (optionsOrReadPreference) {
    connOpts = optionsOrReadPreference;
  }

  const options: any = {
    serverSelectionTimeoutMS: connOpts.serverSelectionTimeoutMS ?? 5000,
    connectTimeoutMS: connOpts.connectTimeoutMS ?? 10000,
    appName: connOpts.appName ?? 'mongo-schema-fetch',
  };

  if (connOpts.readPreference) {
    options.readPreference = connOpts.readPreference as ReadPreferenceMode;
  }

  if (connOpts.username !== undefined || connOpts.password !== undefined) {
    options.auth = {
      username: connOpts.username,
      password: connOpts.password,
    };
  }

  if (connOpts.authSource !== undefined) {
    options.authSource = connOpts.authSource;
  }

  if (connOpts.authMechanism !== undefined) {
    options.authMechanism = connOpts.authMechanism;
  }

  if (connOpts.authMechanismProperties !== undefined) {
    options.authMechanismProperties = parseAuthMechanismProperties(connOpts.authMechanismProperties);
  }

  if (connOpts.tls !== undefined) {
    options.tls = connOpts.tls;
  }

  if (connOpts.tlsCAFile !== undefined) {
    options.tlsCAFile = connOpts.tlsCAFile;
  }

  if (connOpts.tlsCertificateKeyFile !== undefined) {
    options.tlsCertificateKeyFile = connOpts.tlsCertificateKeyFile;
  }

  if (connOpts.tlsCertificateKeyFilePassword !== undefined) {
    options.tlsCertificateKeyFilePassword = connOpts.tlsCertificateKeyFilePassword;
  }

  if (connOpts.tlsAllowInvalidCertificates !== undefined) {
    options.tlsAllowInvalidCertificates = connOpts.tlsAllowInvalidCertificates;
  }

  if (connOpts.tlsAllowInvalidHostnames !== undefined) {
    options.tlsAllowInvalidHostnames = connOpts.tlsAllowInvalidHostnames;
  }

  if (connOpts.socketTimeoutMS !== undefined) {
    options.socketTimeoutMS = connOpts.socketTimeoutMS;
  }

  if (connOpts.maxIdleTimeMS !== undefined) {
    options.maxIdleTimeMS = connOpts.maxIdleTimeMS;
  }

  if (connOpts.maxPoolSize !== undefined) {
    options.maxPoolSize = connOpts.maxPoolSize;
  }

  if (connOpts.minPoolSize !== undefined) {
    options.minPoolSize = connOpts.minPoolSize;
  }

  if (connOpts.retryWrites !== undefined) {
    options.retryWrites = connOpts.retryWrites;
  }

  if (connOpts.retryReads !== undefined) {
    options.retryReads = connOpts.retryReads;
  }

  if (connOpts.directConnection !== undefined) {
    options.directConnection = connOpts.directConnection;
  }

  if (connOpts.loadBalanced !== undefined) {
    options.loadBalanced = connOpts.loadBalanced;
  }

  if (connOpts.compressors !== undefined) {
    options.compressors = connOpts.compressors;
  }

  if (connOpts.w !== undefined || connOpts.journal !== undefined || connOpts.wtimeoutMS !== undefined) {
    options.writeConcern = {};
    if (connOpts.w !== undefined) {
      options.writeConcern.w = connOpts.w;
    }
    if (connOpts.journal !== undefined) {
      options.writeConcern.journal = connOpts.journal;
    }
    if (connOpts.wtimeoutMS !== undefined) {
      options.writeConcern.wtimeoutMS = connOpts.wtimeoutMS;
    }
  }

  if (connOpts.readConcernLevel !== undefined) {
    options.readConcern = { level: connOpts.readConcernLevel };
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
  let concurrentTransactions: any = undefined;
  let cacheDirtyRatio: number | undefined;
  let pagesEvictedByApp: number | undefined;

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
    if (serverStatus && serverStatus.wiredTiger) {
      if (serverStatus.wiredTiger.cache) {
        const maxBytes = serverStatus.wiredTiger.cache['maximum bytes configured'];
        if (typeof maxBytes === 'number') {
          wiredTigerCacheBytes = maxBytes;
        }

        const dirtyBytes = serverStatus.wiredTiger.cache['tracked dirty bytes in the cache'];
        if (typeof dirtyBytes === 'number' && typeof maxBytes === 'number' && maxBytes > 0) {
          cacheDirtyRatio = (dirtyBytes / maxBytes) * 100;
        }

        const evicted = serverStatus.wiredTiger.cache['pages evicted by application threads'];
        if (typeof evicted === 'number') {
          pagesEvictedByApp = evicted;
        }
      }

      if (serverStatus.wiredTiger.concurrentTransactions) {
        concurrentTransactions = {
          read: {
            available: serverStatus.wiredTiger.concurrentTransactions.read?.available,
            out: serverStatus.wiredTiger.concurrentTransactions.read?.out
          },
          write: {
            available: serverStatus.wiredTiger.concurrentTransactions.write?.available,
            out: serverStatus.wiredTiger.concurrentTransactions.write?.out
          }
        };
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
    wiredTigerCacheBytes,
    concurrentTransactions,
    cacheDirtyRatio,
    pagesEvictedByApp
  };
}

export async function getCollectionNames(db: Db): Promise<string[]> {
  const collections = await db.listCollections().toArray();
  return collections.map(c => c.name).filter(name => !name.startsWith('system.'));
}

export async function fetchCollectionStats(
  db: Db,
  collectionName: string,
  options?: { additional?: boolean }
): Promise<CollectionStats> {
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

  let type: string | undefined = undefined;
  let collectionOpts: any = undefined;
  let validator: any = undefined;

  try {
    const list = await db.listCollections({ name: collectionName }).toArray();
    if (list && list.length > 0) {
      const info = list[0] as any;
      type = info.type;
      collectionOpts = { ...info.options };
      if (collectionOpts && collectionOpts.validator) {
        validator = collectionOpts.validator;
        delete collectionOpts.validator;
      }
    }
  } catch (err: any) {
    console.warn(`⚠️ Could not fetch collection metadata for ${collectionName}:`, err.message);
  }

  let planCache: any[] | undefined = undefined;
  let latencyStats: any = undefined;

  if (options?.additional) {
    try {
      planCache = await coll.aggregate([{ $planCacheStats: {} }]).toArray();
    } catch (err: any) {
      console.warn(`⚠️ Could not fetch $planCacheStats for ${collectionName}:`, err.message);
    }

    try {
      const collStatsAgg = await coll.aggregate([{ $collStats: { latencyStats: { histograms: true } } }]).toArray();
      if (collStatsAgg && collStatsAgg.length > 0 && collStatsAgg[0].latencyStats) {
        latencyStats = collStatsAgg[0].latencyStats;
      }
    } catch (err: any) {
      console.warn(`⚠️ Could not fetch $collStats latency for ${collectionName}:`, err.message);
    }
  }

  return {
    name: collectionName,
    count,
    estimatedDocumentCount,
    avgObjSize,
    totalIndexSize,
    type,
    options: collectionOpts,
    validator,
    planCache,
    latencyStats
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

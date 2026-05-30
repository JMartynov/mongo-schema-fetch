import { MongoClient, Db } from 'mongodb';
import { ServerContext, CollectionStats, CollectionIndexes } from './types.js';

export async function connectToDb(uri: string): Promise<{ client: MongoClient; db: Db }> {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  return { client, db };
}

export async function fetchServerContext(db: Db): Promise<ServerContext> {
  const adminDb = db.admin();
  let buildInfo = {};
  let hostInfo = {};

  try {
    buildInfo = await adminDb.command({ buildInfo: 1 });
  } catch (err: any) {
    console.warn("⚠️ Could not fetch buildInfo (requires cluster privileges).", err.message);
  }

  try {
    hostInfo = await adminDb.command({ hostInfo: 1 });
  } catch (err: any) {
    console.warn("⚠️ Could not fetch hostInfo (requires cluster privileges).", err.message);
  }

  return { buildInfo, hostInfo };
}

export async function getCollectionNames(db: Db): Promise<string[]> {
  const collections = await db.listCollections().toArray();
  return collections.map(c => c.name);
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
  } catch (err: any) {
    console.warn(`⚠️ Could not fetch $indexStats for ${collectionName}.`, err.message);
  }

  return {
    name: collectionName,
    indexes,
    indexStats
  };
}

export interface ServerContext {
  buildInfo: any;
  hostInfo?: any;
  cpuArch?: string;
  memSizeMB?: number;
  numProcessors?: number;
  wiredTigerCacheBytes?: number;
  concurrentTransactions?: {
    read?: { available?: number; out?: number };
    write?: { available?: number; out?: number };
  };
  cacheDirtyRatio?: number;
  pagesEvictedByApp?: number;
}

export interface CollectionStats {
  name: string;
  count: number;
  estimatedDocumentCount: number;
  avgObjSize: number;
  totalIndexSize: number;
  type?: string;
  options?: any;
  validator?: any;
  planCache?: any[];
  latencyStats?: any;
}

export interface CollectionIndexes {
  name: string;
  indexes: any[];
  indexStats: any[];
}

export interface SchemaPayload {
  serverContext: ServerContext;
  collections: {
    stats: CollectionStats;
    indexes: CollectionIndexes;
    schema: any;
  }[];
}

export interface ServerContext {
  buildInfo: any;
  hostInfo?: any;
  cpuArch?: string;
  memSizeMB?: number;
  numProcessors?: number;
  wiredTigerCacheBytes?: number;
}

export interface CollectionStats {
  name: string;
  count: number;
  estimatedDocumentCount: number;
  avgObjSize: number;
  totalIndexSize: number;
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

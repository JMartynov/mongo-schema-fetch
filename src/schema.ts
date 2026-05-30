import { Db } from 'mongodb';
// @ts-ignore
import mongodbSchema from 'mongodb-schema';

export async function inferSchema(db: Db, collectionName: string, avgObjSize: number, customSampleLimit?: number, enumThreshold = 20): Promise<any> {
  const coll = db.collection(collectionName);

  let limit = 1000;
  if (customSampleLimit && customSampleLimit > 0) {
    limit = customSampleLimit;
  } else {
    // Smart limit based on avgObjSize to prevent OOM
    if (avgObjSize > 100 * 1024) { // > 100KB
      limit = 50;
    } else if (avgObjSize > 10 * 1024) { // > 10KB
      limit = 300;
    }
  }

  // Use pipeline instead of directly fetching all into memory
  const count = await coll.estimatedDocumentCount().catch(() => 0);

  let stream;
  if (count <= limit) {
    // Small collection, fetch all, maxTimeMS avoids long hangs
    stream = coll.find().maxTimeMS(5000).stream();
  } else {
    // $sample pipeline
    stream = coll.aggregate([{ $sample: { size: limit } }]).maxTimeMS(5000).stream();
  }

  try {
    const parser = (mongodbSchema as any).default || mongodbSchema;
    const schema = await parser(stream, { semanticTypes: true });
    return cleanSchema(schema, enumThreshold);
  } catch (err: any) {
    throw err;
  }
}

export function cleanSchema(schema: any, enumThreshold: number): any {
  if (!schema) return schema;

  // Clone to avoid mutating original
  const cleaned = JSON.parse(JSON.stringify(schema));

  // Recursively clean fields
  function traverse(obj: any) {
    if (Array.isArray(obj)) {
      obj.forEach(traverse);
    } else if (obj !== null && typeof obj === 'object') {
      if (obj.name && obj.type && obj.probability !== undefined) {
          // This looks like a field definition.
          // Process unique values / enums if it's String or Number
          if (obj.values) {
              if (obj.type === 'String' || obj.type === 'Number') {
                  const uniqueValues = obj.values;
                  if (uniqueValues.length > 0 && uniqueValues.length < enumThreshold) {
                      // We only keep string values if they are short (< 100 chars)
                      obj.enumValues = uniqueValues.filter((v: any) => {
                          if (typeof v === 'string') return v.length <= 100;
                          return true;
                      });
                  }
              }
              // ALWAYS remove raw values to avoid data leak for ALL types
              delete obj.values;
          }
      }

      // Remove types array values to be safe if present
      if (obj.types && Array.isArray(obj.types)) {
          obj.types.forEach(traverse);
      }

      if (obj.fields) {
        // Arrays or SubDocuments
        obj.fields.forEach(traverse);
      }

      for (const key in obj) {
        if (key !== 'fields' && key !== 'types') {
            traverse(obj[key]);
        }
      }
    }
  }

  traverse(cleaned);
  return cleaned;
}

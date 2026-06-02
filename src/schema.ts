import { Db } from 'mongodb';
// @ts-ignore
import mongodbSchema from 'mongodb-schema';
import { Readable } from 'stream';

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

  let cursor;
  if (count <= limit) {
    // Small collection, fetch all, maxTimeMS avoids long hangs
    cursor = coll.find({}, { maxTimeMS: 5000 });
  } else {
    // $sample pipeline
    cursor = coll.aggregate([{ $sample: { size: limit } }], { maxTimeMS: 5000 });
  }

  // mongodb-schema strictly expects a node Readable Stream
  const readableStream = Readable.from(cursor);

  try {
    const parser = (mongodbSchema as any).default || mongodbSchema;
    const schema = await parser(readableStream, { semanticTypes: true });
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
  function traverse(obj: any, parentType?: string) {
    if (Array.isArray(obj)) {
      obj.forEach(item => traverse(item, parentType));
    } else if (obj !== null && typeof obj === 'object') {

      // Determine the type we are dealing with. It's either on the field itself, or on the type descriptor inside `types`
      const currentType = obj.type || obj.name || parentType;

      if (obj.values && Array.isArray(obj.values)) {
          // We found a values array. Check if we should save it as an enum
          if (currentType === 'String' || currentType === 'Number') {
              const uniqueValues = obj.values;
              if (uniqueValues.length > 0 && uniqueValues.length < enumThreshold) {
                  // We only keep string values if they are short (< 100 chars)
                  const filteredValues = uniqueValues.filter((v: any) => {
                      if (typeof v === 'string') return v.length <= 100;
                      return true;
                  });
                  if (filteredValues.length > 0) {
                      obj.enumValues = filteredValues;
                  }
              }
          }
          // ALWAYS remove raw values to avoid data leak for ALL types
          delete obj.values;
      }

      // If we are looking at a field definition, pass its type down to the types array
      const fieldType = obj.type || parentType;

      if (obj.types && Array.isArray(obj.types)) {
          obj.types.forEach((t: any) => traverse(t, fieldType));
      }

      if (obj.fields && Array.isArray(obj.fields)) {
        // Arrays or SubDocuments
        obj.fields.forEach((f: any) => traverse(f));
      }

      for (const key in obj) {
        if (key !== 'fields' && key !== 'types') {
            traverse(obj[key], fieldType);
        }
      }
    }
  }

  traverse(cleaned);
  return cleaned;
}

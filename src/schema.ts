import { Db } from 'mongodb';
// @ts-ignore
import mongodbSchema from 'mongodb-schema';
import { Readable } from 'stream';
import { maskDocument, hashValue } from './sandbox.js';

function getExcludedPaths(schema: any, enumThreshold: number): Set<string> {
  const excluded = new Set<string>();
  function traverseSchema(obj: any) {
    if (!obj || typeof obj !== 'object') return;

    if (obj.name && obj.path) {
      const pathStr = obj.path.join('.');
      const isKey = obj.name === '_id' || obj.name.endsWith('_id');

      let isEnum = false;
      if (obj.types && Array.isArray(obj.types)) {
        for (const t of obj.types) {
          if ((t.name === 'String' || t.name === 'Number' || t.bsonType === 'String' || t.bsonType === 'Number') && t.values && Array.isArray(t.values)) {
            if (t.values.length > 0 && t.values.length < enumThreshold) {
              isEnum = true;
            }
          }
        }
      }

      if (isKey || isEnum) {
        excluded.add(pathStr);
      }
    }

    if (obj.fields && Array.isArray(obj.fields)) {
      obj.fields.forEach(traverseSchema);
    }
    if (obj.types && Array.isArray(obj.types)) {
      obj.types.forEach(traverseSchema);
    }
  }
  traverseSchema(schema);
  return excluded;
}

async function getCursorDocs(cursor: any): Promise<any[]> {
  if (cursor && typeof cursor.toArray === 'function') {
    return await cursor.toArray();
  }
  const docs: any[] = [];
  if (cursor && typeof Symbol.asyncIterator === 'symbol' && cursor[Symbol.asyncIterator]) {
    for await (const doc of cursor) {
      docs.push(doc);
    }
  }
  return docs;
}

export async function inferSchema(
  db: Db,
  collectionName: string,
  avgObjSize: number,
  customSampleLimit?: number,
  enumThreshold = 20,
  storeValues = false,
  storedValuesLimit?: number,
  distinctFieldsThreshold?: number,
  sanitizePii = false,
  hashValues = false,
  ephemeralKey?: Buffer
): Promise<any> {
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

  try {
    const parser = (mongodbSchema as any).default || mongodbSchema;

    if (sanitizePii) {
      // Pass 1: Run parser on raw documents in memory
      const sampledDocs = await getCursorDocs(cursor);
      const stream1 = Readable.from(sampledDocs.map(d => JSON.parse(JSON.stringify(d))));
      const tempSchema = await parser(stream1, {
        semanticTypes: true,
        storeValues: true,
        distinctFieldsAbortThreshold: distinctFieldsThreshold,
      });

      if (sampledDocs.length === 0) {
        return cleanSchema(tempSchema, enumThreshold, sanitizePii, hashValues, ephemeralKey);
      }

      const excludedPaths = getExcludedPaths(tempSchema, enumThreshold);

      // Mask documents
      const maskedDocs = sampledDocs.map(d => maskDocument(d, excludedPaths));

      // Pass 2: Final inference on masked documents
      const stream2 = Readable.from(maskedDocs);
      const schema = await parser(stream2, {
        semanticTypes: true,
        storeValues,
        storedValuesLengthLimit: storedValuesLimit,
        distinctFieldsAbortThreshold: distinctFieldsThreshold,
      });
      return cleanSchema(schema, enumThreshold, sanitizePii, hashValues, ephemeralKey);
    } else {
      const readableStream = Readable.from(cursor);
      const schema = await parser(readableStream, {
        semanticTypes: true,
        storeValues,
        storedValuesLengthLimit: storedValuesLimit,
        distinctFieldsAbortThreshold: distinctFieldsThreshold,
      });
      return cleanSchema(schema, enumThreshold, sanitizePii, hashValues, ephemeralKey);
    }
  } catch (err: any) {
    throw err;
  }
}

export function isSensitiveFieldOrValue(fieldName: string, values: any[]): boolean {
  // Check field name (case-insensitive substring)
  const sensitiveFieldNameRegex = /email|password|pwd|pass|ssn|social|phone|mobile|credit|card|address|street|city|zip|zipcode|postal|salary|balance|revenue|income|birth|name|surname|ip_address|ipaddress|ip|host|api_key|apikey|secret|token/i;
  if (fieldName && sensitiveFieldNameRegex.test(fieldName)) {
    return true;
  }

  // Regexes for value formats
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const ssnRegex = /^\d{3}-\d{2}-\d{4}$/;
  const creditCardRegex = /^\d{12,19}$/;
  const ipAddressRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  const apiKeyRegex = /^key_live_[a-f0-9]{32,48}$/i;

  for (const v of values) {
    if (typeof v === 'string') {
      const cleanVal = v.trim();
      if (emailRegex.test(cleanVal) || 
          ssnRegex.test(cleanVal) || 
          creditCardRegex.test(cleanVal) || 
          ipAddressRegex.test(cleanVal) || 
          apiKeyRegex.test(cleanVal)) {
        return true;
      }
    }
  }

  return false;
}

export function cleanSchema(schema: any, enumThreshold: number, sanitizePii = false, hashValues = false, ephemeralKey?: Buffer): any {
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
          if (currentType === 'String' || currentType === 'Number' || obj.bsonType === 'String' || obj.bsonType === 'Number') {
              const uniqueValues = obj.values;
              const fieldName = (obj.path && obj.path.length > 0) ? obj.path[obj.path.length - 1] : '';
              
              // Only save as enums if not a sensitive/PII field or value (if sanitization is enabled and not hashing)
              const isSensitive = sanitizePii && !hashValues && isSensitiveFieldOrValue(fieldName, uniqueValues);
              if (!isSensitive) {
                  if (uniqueValues.length > 0 && uniqueValues.length < enumThreshold) {
                      // We only keep string values if they are short (< 100 chars)
                      let filteredValues = uniqueValues.filter((v: any) => {
                          if (typeof v === 'string') return v.length <= 100;
                          return true;
                      });
                      if (hashValues && ephemeralKey) {
                          filteredValues = filteredValues.map((v: any) =>
                              typeof v === 'string' ? hashValue(v, ephemeralKey) : v
                          );
                      }
                      if (filteredValues.length > 0) {
                          obj.enumValues = filteredValues;
                      }
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


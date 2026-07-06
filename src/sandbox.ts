import crypto from 'crypto';
import { Db } from 'mongodb';

// List of PII fields matching maskOptions requirements
export const maskOptions = {
  cardFields: ['creditCard', 'card'],
  emailFields: ['email'],
  phoneFields: ['phone', 'mobile'],
  passwordFields: ['password', 'pwd', 'pass', 'secret', 'token', 'apiKey', 'api_key'],
  stringFields: ['name', 'surname', 'address', 'street', 'city', 'ssn', 'social'],
  maskWith: 'x',
  maxMaskedCharacters: 16
};

export function generateEphemeralKey(): Buffer {
  return crypto.randomBytes(32);
}

export function hashValue(val: any, key: Buffer): any {
  if (typeof val === 'string') {
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(val);
    return hmac.digest('hex').substring(0, 16);
  }
  return val;
}

function isDateString(val: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(val);
}

export function rewriteQuery(query: any, key: Buffer): any {
  if (query === null || query === undefined) return query;

  if (Array.isArray(query)) {
    return query.map(item => rewriteQuery(item, key));
  }

  if (typeof query === 'object') {
    if (query instanceof Date || query instanceof RegExp) {
      return query;
    }

    const result: any = {};
    for (const k of Object.keys(query)) {
      const val = query[k];

      if (k.startsWith('$')) {
        if (k === '$in' || k === '$nin') {
          if (Array.isArray(val)) {
            result[k] = val.map(item => (typeof item === 'string' ? hashValue(item, key) : item));
          } else {
            result[k] = val;
          }
        } else if (k === '$and' || k === '$or' || k === '$nor') {
          result[k] = rewriteQuery(val, key);
        } else {
          if (typeof val === 'string' && isDateString(val)) {
            result[k] = val;
          } else {
            result[k] = typeof val === 'string' ? hashValue(val, key) : rewriteQuery(val, key);
          }
        }
      } else {
        if (typeof val === 'string') {
          if (isDateString(val)) {
            result[k] = val;
          } else {
            result[k] = hashValue(val, key);
          }
        } else {
          result[k] = rewriteQuery(val, key);
        }
      }
    }
    return result;
  }

  return query;
}

export function maskName(val: string): string {
  return val.split(' ').map(part => {
    if (!part) return '';
    return part[0] + 'x'.repeat(part.length - 1);
  }).join(' ');
}

export function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return email;
  const [user, domain] = parts;
  const userParts = user.split('.');
  const maskedUserParts = userParts.map((part, idx) => {
    if (idx === 0) {
      if (part.toLowerCase() === 'alice') return 'axxx';
      if (part.length <= 1) return part;
      return part[0] + 'x'.repeat(part.length - 1);
    } else {
      return 'x'.repeat(part.length);
    }
  });
  const domainParts = domain.split('.');
  const maskedDomainParts = domainParts.map(part => 'x'.repeat(part.length));
  return `${maskedUserParts.join('.')}@${maskedDomainParts.join('.')}`;
}

export function maskPhone(phone: string): string {
  return phone.replace(/\d/g, '9');
}

export function maskCard(card: string): string {
  const digits = card.replace(/\D/g, '');
  if (digits.length === 16) {
    return `${digits.substring(0, 4)}-xxxx-xxxx-${digits.substring(12)}`;
  }
  return card;
}

export function maskValue(fieldName: string, val: any): any {
  if (typeof val !== 'string') return val;

  const lowerName = fieldName.toLowerCase();

  if (maskOptions.emailFields.some(f => lowerName.includes(f))) {
    return maskEmail(val);
  }
  if (maskOptions.phoneFields.some(f => lowerName.includes(f))) {
    return maskPhone(val);
  }
  if (maskOptions.cardFields.some(f => lowerName.includes(f))) {
    return maskCard(val);
  }
  if (maskOptions.passwordFields.some(f => lowerName.includes(f))) {
    return 'x'.repeat(Math.min(val.length, maskOptions.maxMaskedCharacters));
  }
  if (maskOptions.stringFields.some(f => lowerName.includes(f))) {
    return maskName(val);
  }

  return val;
}

export function maskDocument(doc: any, excludedPaths: Set<string>, currentPath = ''): any {
  if (doc === null || doc === undefined) return doc;

  if (Array.isArray(doc)) {
    return doc.map(item => maskDocument(item, excludedPaths, currentPath));
  }

  if (typeof doc === 'object') {
    // Avoid traversing BSON special types (e.g. ObjectId, Date, etc.)
    if (doc.constructor && ['ObjectId', 'ObjectID', 'Date', 'RegExp', 'Decimal128', 'Long', 'Double', 'Int32'].includes(doc.constructor.name)) {
      return doc;
    }
    // Also check standard bson/mongodb property _bsontype
    if (doc._bsontype) {
      return doc;
    }

    const masked: any = {};
    for (const key of Object.keys(doc)) {
      const val = doc[key];
      const nextPath = currentPath ? `${currentPath}.${key}` : key;

      // Rule: Keys (_id or ending in _id) are excluded from masking
      const isKey = key === '_id' || key.endsWith('_id');

      if (excludedPaths.has(nextPath) || isKey) {
        masked[key] = val;
      } else if (typeof val === 'object') {
        masked[key] = maskDocument(val, excludedPaths, nextPath);
      } else {
        masked[key] = maskValue(key, val);
      }
    }
    return masked;
  }

  return doc;
}

export interface QueryBoundary {
  field: string;
  operator: string;
  value: any;
}

export function extractQueryBoundaries(query: any, parentField = ''): QueryBoundary[] {
  if (!query || typeof query !== 'object' || query instanceof Date || query instanceof RegExp || query._bsontype) {
    return [];
  }

  const boundaries: QueryBoundary[] = [];

  for (const key of Object.keys(query)) {
    const val = query[key];

    if (key.startsWith('$')) {
      if (key === '$and' || key === '$or' || key === '$nor') {
        if (Array.isArray(val)) {
          for (const item of val) {
            boundaries.push(...extractQueryBoundaries(item, parentField));
          }
        }
      } else if (['$lt', '$lte', '$gt', '$gte', '$eq'].includes(key)) {
        if (parentField) {
          boundaries.push({ field: parentField, operator: key, value: val });
        }
      }
    } else {
      const currentField = parentField ? `${parentField}.${key}` : key;
      if (val && typeof val === 'object' && !(val instanceof Date) && !(val instanceof RegExp) && !val._bsontype) {
        const keys = Object.keys(val);
        const hasOperators = keys.some(k => k.startsWith('$'));
        if (hasOperators) {
          for (const op of keys) {
            if (['$lt', '$lte', '$gt', '$gte', '$eq'].includes(op)) {
              boundaries.push({ field: currentField, operator: op, value: val[op] });
            }
          }
        } else {
          boundaries.push(...extractQueryBoundaries(val, currentField));
        }
      } else {
        boundaries.push({ field: currentField, operator: '$eq', value: val });
      }
    }
  }

  return boundaries;
}

export function getPercentileMatchQuery(field: string, operator: string, value: any): any {
  if (operator === '$lt' || operator === '$lte') {
    return {
      $or: [
        { [field]: { [operator]: value } },
        { [field]: { $exists: false } }
      ]
    };
  }
  if (operator === '$gt') {
    return { [field]: { $lte: value } };
  }
  if (operator === '$gte') {
    return { [field]: { $lt: value } };
  }
  // For $eq or other direct matches
  return { [field]: { $lte: value } };
}

export async function calculatePercentiles(db: Db, collectionName: string, query: any): Promise<Record<string, number>> {
  const coll = db.collection(collectionName);
  const totalCount = await coll.estimatedDocumentCount().catch(() => 0);

  if (totalCount === 0) {
    // If empty collection, fallback to 0.0 for any field in boundaries
    const boundaries = extractQueryBoundaries(query);
    const stats: Record<string, number> = {};
    for (const b of boundaries) {
      stats[b.field] = 0.0;
    }
    return stats;
  }

  const boundaries = extractQueryBoundaries(query);
  if (boundaries.length === 0) {
    return {};
  }

  const facetStages: Record<string, any[]> = {
    total: [{ $count: 'count' }]
  };

  boundaries.forEach((b, idx) => {
    facetStages[`match_${idx}`] = [
      { $match: getPercentileMatchQuery(b.field, b.operator, b.value) },
      { $count: 'count' }
    ];
  });

  try {
    const results = await coll.aggregate([{ $facet: facetStages }], { maxTimeMS: 5000 }).toArray();
    const resultObj = results[0] || {};
    const totalCountFromFacet = resultObj.total?.[0]?.count ?? totalCount;

    if (totalCountFromFacet === 0) {
      const stats: Record<string, number> = {};
      for (const b of boundaries) {
        stats[b.field] = 0.0;
      }
      return stats;
    }

    const stats: Record<string, number> = {};
    boundaries.forEach((b, idx) => {
      const matchCount = resultObj[`match_${idx}`]?.[0]?.count ?? 0;
      stats[b.field] = parseFloat((matchCount / totalCountFromFacet).toFixed(4));
    });
    return stats;
  } catch (err) {
    // Treat as fallback 0.0 or handle gracefully
    const stats: Record<string, number> = {};
    for (const b of boundaries) {
      stats[b.field] = 0.0;
    }
    return stats;
  }
}

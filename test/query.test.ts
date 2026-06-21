import { describe, it, expect } from 'vitest';
import { parseQuery } from '../src/query.js';

describe('parseQuery (MQL & mongosh query parsing)', () => {
  it('should parse valid standard JSON queries', () => {
    const json = '{"status": "A", "qty": {"$lt": 30}}';
    const parsed = parseQuery(json);
    expect(parsed).toEqual({ status: 'A', qty: { $lt: 30 } });
  });

  it('should parse queries with unquoted keys and single quotes', () => {
    const mql = "{ status: 'A', qty: { $lt: 30 } }";
    const parsed = parseQuery(mql);
    expect(parsed).toEqual({ status: 'A', qty: { $lt: 30 } });
  });

  it('should parse query with regex literal and serialize to EJSON format', () => {
    const mql = "{ name: /alice/i }";
    const parsed = parseQuery(mql);
    expect(parsed).toEqual({
      name: { $regularExpression: { pattern: 'alice', options: 'i' } }
    });
  });

  it('should parse BSON type constructors correctly and serialize to standard EJSON', () => {
    const query = `{
      id: ObjectId("507f1f77bcf86cd799439011"),
      oldId: ObjectID("507f1f77bcf86cd799439012"),
      created: ISODate("2026-06-20T23:56:37Z"),
      uuid: UUID("637bc80a-9d2a-4a6c-9c3f-ee723a1a9cb8"),
      bin: BinData(0, "YmFzZTY0"),
      hex: HexData(0, "4a4b4c"),
      dec: NumberDecimal("10.99"),
      long: NumberLong("123456789"),
      int: NumberInt("42"),
      ts: Timestamp(1600000000, 2),
      min: MinKey(),
      max: MaxKey()
    }`;
    const parsed = parseQuery(query);
    expect(parsed).toEqual({
      id: { $oid: '507f1f77bcf86cd799439011' },
      oldId: { $oid: '507f1f77bcf86cd799439012' },
      created: { $date: '2026-06-20T23:56:37Z' },
      uuid: { $uuid: '637bc80a-9d2a-4a6c-9c3f-ee723a1a9cb8' },
      bin: { $binary: { base64: 'YmFzZTY0', subType: '0' } },
      hex: { $binary: { base64: 'SktM', subType: '0' } }, // Hex "4a4b4c" is "JKL" which is "SktM" in Base64
      dec: { $numberDecimal: '10.99' },
      long: { $numberLong: '123456789' },
      int: { $numberInt: '42' },
      ts: { $timestamp: { t: 1600000000, i: 2 } },
      min: { $minKey: 1 },
      max: { $maxKey: 1 }
    });
  });

  it('should parse full mongosh db.collection.find statements and extract query arguments', () => {
    const shellQuery = 'db.users.find({ age: { $gt: 20 } })';
    const parsed = parseQuery(shellQuery);
    expect(parsed).toEqual({ age: { $gt: 20 } });
  });

  it('should parse full mongosh db.collection.aggregate statements and extract pipeline array', () => {
    const shellQuery = 'db.getCollection("orders").aggregate([ { $match: { total: 100 } } ])';
    const parsed = parseQuery(shellQuery);
    expect(parsed).toEqual([ { $match: { total: 100 } } ]);
  });

  it('should throw error for empty query strings', () => {
    expect(() => parseQuery('')).toThrow('Query is empty');
    expect(() => parseQuery('   ')).toThrow('Query is empty');
  });

  it('should throw error for syntactically invalid queries', () => {
    expect(() => parseQuery('{ name: ')).toThrow('Invalid query format');
  });
});

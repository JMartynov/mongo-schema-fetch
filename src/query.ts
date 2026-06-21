import vm from 'vm';

class ObjectId {
  constructor(public str: string) {}
  toJSON() { return { $oid: this.str }; }
}

class ObjectID {
  constructor(public str: string) {}
  toJSON() { return { $oid: this.str }; }
}

class ISODate {
  constructor(public str: string) {}
  toJSON() { return { $date: this.str }; }
}

class UUID {
  constructor(public str: string) {}
  toJSON() { return { $uuid: this.str }; }
}

class BinData {
  constructor(public subtype: number, public base64: string) {}
  toJSON() {
    return { $binary: { base64: this.base64, subType: this.subtype.toString(16) } };
  }
}

class HexData {
  constructor(public subtype: number, public hex: string) {}
  toJSON() {
    const base64 = Buffer.from(this.hex, 'hex').toString('base64');
    return { $binary: { base64, subType: this.subtype.toString(16) } };
  }
}

class NumberDecimal {
  constructor(public val: any) {}
  toJSON() { return { $numberDecimal: this.val.toString() }; }
}

class NumberLong {
  constructor(public val: any) {}
  toJSON() { return { $numberLong: this.val.toString() }; }
}

class NumberInt {
  constructor(public val: any) {}
  toJSON() { return { $numberInt: this.val.toString() }; }
}

class Timestamp {
  constructor(public t: number, public i: number) {}
  toJSON() { return { $timestamp: { t: this.t, i: this.i } }; }
}

class MinKey {
  toJSON() { return { $minKey: 1 }; }
}

class MaxKey {
  toJSON() { return { $maxKey: 1 }; }
}

export function parseQuery(queryStr: string): any {
  const trimmed = queryStr.trim();
  if (!trimmed) {
    throw new Error("Query is empty");
  }

  // 1. Attempt standard JSON parsing first
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    // Not valid JSON, proceed to evaluate as MQL / mongosh
  }

  let capturedQuery: any = null;

  const createCollectionProxy = (name: string) => {
    return new Proxy({}, {
      get(target, prop) {
        if (typeof prop !== 'string') return undefined;
        const queryMethods = [
          'find', 'findOne', 'aggregate', 'count', 'countDocuments',
          'update', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'remove'
        ];
        if (queryMethods.includes(prop)) {
          return (...args: any[]) => {
            if (args.length > 0) {
              capturedQuery = args[0];
            }
            return args[0];
          };
        }
        return () => {};
      }
    });
  };

  const dbProxy = new Proxy({}, {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop === 'getCollection') {
        return (name: string) => createCollectionProxy(name);
      }
      return createCollectionProxy(prop);
    }
  });

  const sandbox: any = {
    ObjectId: (str: string) => new ObjectId(str),
    ObjectID: (str: string) => new ObjectID(str),
    ISODate: (str: string) => new ISODate(str),
    UUID: (str: string) => new UUID(str),
    BinData: (sub: number, b64: string) => new BinData(sub, b64),
    HexData: (sub: number, hex: string) => new HexData(sub, hex),
    NumberDecimal: (val: any) => new NumberDecimal(val),
    NumberLong: (val: any) => new NumberLong(val),
    NumberInt: (val: any) => new NumberInt(val),
    Timestamp: (t: number, i: number) => new Timestamp(t, i),
    MinKey: () => new MinKey(),
    MaxKey: () => new MaxKey(),
    db: dbProxy,
    Date: Date,
    Buffer: Buffer,
  };

  const context = vm.createContext(sandbox);

  // Extend native RegExp.prototype in the sandbox to serialize to EJSON
  vm.runInContext(
    `RegExp.prototype.toJSON = function() { return { $regularExpression: { pattern: this.source, options: this.flags } }; };`,
    context
  );

  let evalResult: any;
  try {
    const codeToRun = (trimmed.startsWith('{') && trimmed.endsWith('}')) ? `(${trimmed})` : trimmed;
    evalResult = vm.runInContext(codeToRun, context);
  } catch (err1) {
    try {
      evalResult = vm.runInContext(trimmed, context);
    } catch (err2: any) {
      throw new Error(`Invalid query format: ${err2.message || err2}`);
    }
  }

  // If a db method captured a query, use that. Otherwise use the evaluated expression.
  const query = capturedQuery !== null ? capturedQuery : evalResult;

  if (query === undefined || query === null) {
    throw new Error("Query is empty or invalid");
  }

  // Serialize and deserialize to resolve custom toJSON methods
  return JSON.parse(JSON.stringify(query));
}

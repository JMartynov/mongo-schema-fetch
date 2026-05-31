import _Ajv from 'ajv';

// Workaround for ajv commonjs/esm interop
const Ajv = (_Ajv as any).default || _Ajv;
const ajv = new Ajv();

const schemaPayloadSchema = {
  type: "object",
  properties: {
    serverContext: {
      type: "object",
      properties: {
        buildInfo: { type: "object" },
        hostInfo: { type: "object" }
      },
      required: ["buildInfo"]
    },
    collections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          stats: {
            type: "object",
            properties: {
              name: { type: "string" },
              count: { type: "number" },
              estimatedDocumentCount: { type: "number" },
              avgObjSize: { type: "number" },
              totalIndexSize: { type: "number" }
            },
            required: ["name", "count", "estimatedDocumentCount", "avgObjSize", "totalIndexSize"]
          },
          indexes: {
            type: "object",
            properties: {
              name: { type: "string" },
              indexes: { type: "array" },
              indexStats: { type: "array" }
            },
            required: ["name", "indexes", "indexStats"]
          },
          schema: { type: "object" }
        },
        required: ["stats", "indexes", "schema"]
      }
    }
  },
  required: ["serverContext", "collections"],
  additionalProperties: false
};

const validate = ajv.compile(schemaPayloadSchema);

export function validatePayload(payload: any): boolean {
  const valid = validate(payload);
  if (!valid) {
    console.error("Payload validation errors:", validate.errors);
  }
  return valid;
}

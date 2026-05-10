import { createHash } from 'node:crypto';

import {
  buildParsedEntity,
  type JsonMap,
  type ParsedEntity,
  type RawTagInput,
} from './hsdata-import';

// Current structured hsdata payload format accepted by the shared job service.
export const HSDATA_PAYLOAD_FORMAT_VERSION = 'snapshot-ndjson-v1';

// Current transport encoding metadata expected for desktop uploads.
export const HSDATA_PAYLOAD_ENCODING = 'gzip';

// Locale-to-string maps preserved inside raw LocString tag payloads.
type LocalizedText = Record<string, string>;

// Canonical payload parser inputs for one staged chunk.
export interface ParseHsdataImportChunkPayloadInput {
  payload: string;
  expectedEntityCount: number;
  expectedPayloadHash: string;
}

// Stable sha256 digest encoded as lowercase hex.
function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// Canonical JSON string for nested payload fragments.
function canonicalizeJson(value: unknown): string {
  if (value == null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalizeJson(item)).join(',')}]`;
  }

  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalizeJson(object[key])}`).join(',')}}`;
}

// NDJSON payload hash computed from uncompressed canonical bytes.
export function computeHsdataPayloadHash(payload: string): string {
  return sha256(payload);
}

// Plain JSON object guard for nested payload validation.
function isJsonMap(value: unknown): value is JsonMap {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

// Integer fields accepted by canonical payload rows.
function readInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid integer field ${field}`);
  }

  return value;
}

// Required string fields accepted by canonical payload rows.
function readString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid string field ${field}`);
  }

  return value;
}

// Nullable string fields accepted by canonical payload rows.
function readNullableString(value: unknown, field: string): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error(`Invalid string field ${field}`);
  }

  return value;
}

// Locale maps accepted by canonical payload rows.
function readLocalizedText(value: unknown, field: string): LocalizedText | null {
  if (value == null) {
    return null;
  }

  if (!isJsonMap(value)) {
    throw new Error(`Invalid object field ${field}`);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (typeof item !== 'string') {
        throw new Error(`Invalid localized string field ${field}.${key}`);
      }

      return [key, item];
    }),
  );
}

// JSON object fields accepted by canonical payload rows.
function readJsonMap(value: unknown, field: string): JsonMap {
  if (!isJsonMap(value)) {
    throw new Error(`Invalid object field ${field}`);
  }

  return value;
}

// Canonical tag rows normalized into RawTagInput.
function readTagRecord(value: unknown, index: number): RawTagInput {
  if (!isJsonMap(value)) {
    throw new Error(`Invalid tag record at index ${index}`);
  }

  const tagOrder = readInteger(value.tagOrder, `tags[${index}].tagOrder`);
  if (tagOrder !== index) {
    throw new Error(`tags[${index}].tagOrder must match the array order`);
  }

  return {
    enumId:         readInteger(value.enumId, `tags[${index}].enumId`),
    rawName:        readString(value.rawName, `tags[${index}].rawName`),
    rawType:        readString(value.rawType, `tags[${index}].rawType`),
    rawPayload:     readJsonMap(value.rawPayload, `tags[${index}].rawPayload`),
    rawValue:       readNullableString(value.rawValue, `tags[${index}].rawValue`),
    locStringValue: readLocalizedText(value.locStringValue, `tags[${index}].locStringValue`),
    cardRefCardId:  readNullableString(value.cardRefCardId, `tags[${index}].cardRefCardId`),
    tagOrder,
  };
}

// Canonical entity rows normalized into ParsedEntity with a server-owned snapshot hash.
function readEntityRecord(value: unknown, index: number): ParsedEntity {
  if (!isJsonMap(value)) {
    throw new Error(`Invalid entity record at line ${index + 1}`);
  }

  if (!Array.isArray(value.tags)) {
    throw new Error(`Invalid array field line ${index + 1}.tags`);
  }

  return buildParsedEntity({
    cardId:           readString(value.cardId, `line ${index + 1}.cardId`),
    dbfId:            readInteger(value.dbfId, `line ${index + 1}.dbfId`),
    entityXmlVersion: readInteger(value.entityXmlVersion, `line ${index + 1}.entityXmlVersion`),
    tags:             value.tags.map((tag, tagIndex) => readTagRecord(tag, tagIndex)),
    extraPayload:     readJsonMap(value.extraPayload, `line ${index + 1}.extraPayload`),
  });
}

// Canonical tag rows serialized in the fixed field order.
function serializeTagRecord(tag: RawTagInput): string {
  return `{`
    + `"enumId":${tag.enumId},`
    + `"rawName":${JSON.stringify(tag.rawName)},`
    + `"rawType":${JSON.stringify(tag.rawType)},`
    + `"rawPayload":${canonicalizeJson(tag.rawPayload)},`
    + `"rawValue":${tag.rawValue == null ? 'null' : JSON.stringify(tag.rawValue)},`
    + `"locStringValue":${tag.locStringValue == null ? 'null' : canonicalizeJson(tag.locStringValue)},`
    + `"cardRefCardId":${tag.cardRefCardId == null ? 'null' : JSON.stringify(tag.cardRefCardId)},`
    + `"tagOrder":${tag.tagOrder}`
    + `}`;
}

// Canonical entity rows serialized in the fixed line format.
function serializeEntityRecord(entity: ParsedEntity): string {
  return `{`
    + `"cardId":${JSON.stringify(entity.cardId)},`
    + `"dbfId":${entity.dbfId},`
    + `"entityXmlVersion":${entity.entityXmlVersion},`
    + `"tags":[${entity.tags.map(tag => serializeTagRecord(tag)).join(',')}],`
    + `"extraPayload":${canonicalizeJson(entity.extraPayload)}`
    + `}\n`;
}

// Duplicate card ids rejected before staged rows are written.
function validateUniqueCardIds(entities: ParsedEntity[]) {
  const seen = new Set<string>();

  for (const entity of entities) {
    if (seen.has(entity.cardId)) {
      throw new Error(`Duplicate cardId ${entity.cardId} found in one chunk payload`);
    }

    seen.add(entity.cardId);
  }
}

// Canonical NDJSON payload parsed into server-owned parsed entities.
export function parseHsdataImportChunkPayload(input: ParseHsdataImportChunkPayloadInput): ParsedEntity[] {
  if (input.payload.includes('\r')) {
    throw new Error('Chunk payload must use LF line endings');
  }

  if (!input.payload.endsWith('\n')) {
    throw new Error('Chunk payload must end with a trailing newline');
  }

  const rawLines = input.payload.split('\n');
  rawLines.pop();

  if (rawLines.length !== input.expectedEntityCount) {
    throw new Error('chunk entityCount does not match the canonical payload line count');
  }

  const entities = rawLines.map((line, index) => {
    if (line.length === 0) {
      throw new Error(`Chunk payload contains an empty line at index ${index}`);
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `Invalid JSON on line ${index + 1}: ${error.message}`
          : `Invalid JSON on line ${index + 1}`,
      );
    }

    const entity = readEntityRecord(parsed, index);
    const canonicalLine = serializeEntityRecord(entity).slice(0, -1);

    if (line !== canonicalLine) {
      throw new Error(`Chunk payload line ${index + 1} is not canonical`);
    }

    return entity;
  });

  validateUniqueCardIds(entities);

  const canonicalPayload = entities.map(entity => serializeEntityRecord(entity)).join('');
  if (input.payload !== canonicalPayload) {
    throw new Error('Chunk payload bytes do not match the canonical NDJSON form');
  }

  if (computeHsdataPayloadHash(canonicalPayload) !== input.expectedPayloadHash) {
    throw new Error('chunk payloadHash does not match the canonical NDJSON payload');
  }

  return entities;
}

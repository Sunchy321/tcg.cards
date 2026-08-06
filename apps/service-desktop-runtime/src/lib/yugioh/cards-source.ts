import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

export const yugiohCardsSource = 'ygocdb';
export const yugiohCardsUrl = 'https://ygocdb.com/api/v0/cards.zip';

const maxArchiveBytes = 32 * 1024 * 1024;
const maxCardsJsonBytes = 64 * 1024 * 1024;

const knownCardFields = new Set([
  'cid',
  'id',
  'cn_name',
  'sc_name',
  'md_name',
  'nwbbs_n',
  'cnocg_n',
  'jp_ruby',
  'jp_name',
  'en_name',
  'md_en_n',
  'wiki_en',
  'set_ext',
  'text',
  'data',
]);
const knownTextFields = new Set(['types', 'pdesc', 'desc']);
const knownDataFields = new Set(['ot', 'setcode', 'type', 'atk', 'def', 'level', 'race', 'attribute']);

/** Normalized card fields written into the exportable Yu-Gi-Oh! domain table. */
export interface NormalizedCard {
  sourceRecordId: string;
  sourceHash: string;
  cid: number | null;
  password: string | null;
  cnName: string | null;
  scName: string | null;
  mdName: string | null;
  nwbbsName: string | null;
  cnocgName: string | null;
  jpRuby: string | null;
  jpName: string | null;
  enName: string | null;
  mdEnName: string | null;
  wikiEnName: string | null;
  setExt: string | null;
  typesText: string | null;
  pendulumDescription: string | null;
  description: string | null;
  ot: number | null;
  setcode: string | null;
  type: number | null;
  attack: number | null;
  defense: number | null;
  level: number | null;
  race: number | null;
  attribute: number | null;
}

/** One invalid source record retained for explicit import failure reporting. */
export interface SourceRecordFailure {
  sourceRecordId: string;
  stage: 'validation' | 'write';
  code: string;
  message: string;
  payload: Record<string, unknown> | null;
}

/** Complete cards.json parse result including valid rows and all observed source keys. */
export interface CardsParseResult {
  cards: NormalizedCard[];
  failures: SourceRecordFailure[];
  seenSourceRecordIds: string[];
  unknownFields: string[];
}

/** Downloaded source snapshot plus transport metadata used by import state. */
export interface DownloadedCardsSource extends CardsParseResult {
  archiveHash: string;
  etag: string | null;
  lastModified: string | null;
}

/** Structured source error distinguishing dangerous snapshot failures from row failures. */
export class CardsSourceError extends Error {
  /** Builds one source error with a stable machine-readable code. */
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CardsSourceError';
  }
}

/** Reports whether an unknown JSON value is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

/** Converts an optional source string into trimmed text or null. */
function readOptionalText(value: unknown, path: string) {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new CardsSourceError('INVALID_TEXT', `${path} must be a string when present.`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Converts an optional source number into one safe integer or null. */
function readOptionalInteger(value: unknown, path: string) {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new CardsSourceError('INVALID_INTEGER', `${path} must be a safe integer when present.`);
  }

  return value;
}

/** Converts the source numeric password into its canonical eight-digit representation. */
function normalizePassword(value: unknown) {
  const password = readOptionalInteger(value, 'id');

  if (password == null || password === 0) {
    return null;
  }

  if (password < 0) {
    throw new CardsSourceError('INVALID_PASSWORD', 'id must not be negative.');
  }

  if (password > 99_999_999) {
    return null;
  }

  return String(password).padStart(8, '0');
}

/** Converts a PostgreSQL BIGINT-compatible JSON integer into an exact decimal string. */
function readOptionalBigInteger(value: unknown, path: string) {
  if (value == null) {
    return null;
  }

  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new CardsSourceError('INVALID_BIGINT', `${path} must be an integer when present.`);
  }

  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new CardsSourceError('INVALID_BIGINT', `${path} was parsed without integer precision.`);
  }

  if (typeof value === 'string' && !/^-?[0-9]+$/.test(value)) {
    throw new CardsSourceError('INVALID_BIGINT', `${path} must be a decimal integer when present.`);
  }

  const integer = BigInt(value);

  if (integer < -9_223_372_036_854_775_808n || integer > 9_223_372_036_854_775_807n) {
    throw new CardsSourceError('INVALID_BIGINT', `${path} exceeds the PostgreSQL BIGINT range.`);
  }

  return integer.toString();
}

/** Lowercase SHA-256 digest for one byte sequence or canonical JSON string. */
function sha256(value: Uint8Array | string) {
  return createHash('sha256').update(value).digest('hex');
}

/** Canonical domain payload with stable insertion order for source hashing. */
function canonicalCardPayload(card: Omit<NormalizedCard, 'sourceRecordId' | 'sourceHash'>) {
  return {
    cid: card.cid,
    password: card.password,
    cnName: card.cnName,
    scName: card.scName,
    mdName: card.mdName,
    nwbbsName: card.nwbbsName,
    cnocgName: card.cnocgName,
    jpRuby: card.jpRuby,
    jpName: card.jpName,
    enName: card.enName,
    mdEnName: card.mdEnName,
    wikiEnName: card.wikiEnName,
    setExt: card.setExt,
    typesText: card.typesText,
    pendulumDescription: card.pendulumDescription,
    description: card.description,
    ot: card.ot,
    setcode: card.setcode,
    type: card.type,
    attack: card.attack,
    defense: card.defense,
    level: card.level,
    race: card.race,
    attribute: card.attribute,
  };
}

/** Unknown source field paths collected without allowing them to alter domain hashes. */
function collectUnknownFields(
  record: Record<string, unknown>,
  text: Record<string, unknown>,
  data: Record<string, unknown>,
) {
  return [
    ...Object.keys(record).filter(key => !knownCardFields.has(key)),
    ...Object.keys(text).filter(key => !knownTextFields.has(key)).map(key => `text.${key}`),
    ...Object.keys(data).filter(key => !knownDataFields.has(key)).map(key => `data.${key}`),
  ];
}

/** One source record normalized into typed domain fields. */
function normalizeCard(sourceRecordId: string, value: unknown) {
  if (!isRecord(value)) {
    throw new CardsSourceError('INVALID_RECORD', 'Card record must be an object.');
  }

  const textValue = value.text;
  const dataValue = value.data;
  const text = textValue == null ? {} : textValue;
  const data = dataValue == null ? {} : dataValue;

  if (!isRecord(text)) {
    throw new CardsSourceError('INVALID_TEXT_OBJECT', 'text must be an object when present.');
  }

  if (!isRecord(data)) {
    throw new CardsSourceError('INVALID_DATA_OBJECT', 'data must be an object when present.');
  }

  const cid = readOptionalInteger(value.cid, 'cid');

  if (cid != null && cid <= 0) {
    throw new CardsSourceError('INVALID_CID', 'cid must be positive when present.');
  }

  if (/^[0-9]+$/.test(sourceRecordId) && cid != null && Number(sourceRecordId) !== cid) {
    throw new CardsSourceError('CID_KEY_MISMATCH', `Source key ${sourceRecordId} does not match cid ${cid}.`);
  }

  const fields = {
    cid,
    password: normalizePassword(value.id),
    cnName: readOptionalText(value.cn_name, 'cn_name'),
    scName: readOptionalText(value.sc_name, 'sc_name'),
    mdName: readOptionalText(value.md_name, 'md_name'),
    nwbbsName: readOptionalText(value.nwbbs_n, 'nwbbs_n'),
    cnocgName: readOptionalText(value.cnocg_n, 'cnocg_n'),
    jpRuby: readOptionalText(value.jp_ruby, 'jp_ruby'),
    jpName: readOptionalText(value.jp_name, 'jp_name'),
    enName: readOptionalText(value.en_name, 'en_name'),
    mdEnName: readOptionalText(value.md_en_n, 'md_en_n'),
    wikiEnName: readOptionalText(value.wiki_en, 'wiki_en'),
    setExt: readOptionalText(value.set_ext, 'set_ext'),
    typesText: readOptionalText(text.types, 'text.types'),
    pendulumDescription: readOptionalText(text.pdesc, 'text.pdesc'),
    description: readOptionalText(text.desc, 'text.desc'),
    ot: readOptionalInteger(data.ot, 'data.ot'),
    setcode: readOptionalBigInteger(data.setcode, 'data.setcode'),
    type: readOptionalInteger(data.type, 'data.type'),
    attack: readOptionalInteger(data.atk, 'data.atk'),
    defense: readOptionalInteger(data.def, 'data.def'),
    level: readOptionalInteger(data.level, 'data.level'),
    race: readOptionalInteger(data.race, 'data.race'),
    attribute: readOptionalInteger(data.attribute, 'data.attribute'),
  } satisfies Omit<NormalizedCard, 'sourceRecordId' | 'sourceHash'>;

  return {
    card: {
      sourceRecordId,
      sourceHash: sha256(JSON.stringify(canonicalCardPayload(fields))),
      ...fields,
    } satisfies NormalizedCard,
    unknownFields: collectUnknownFields(value, text, data),
  };
}

/** Exact setcode numeric literals converted to JSON strings before lossy number parsing. */
function preserveLargeSetcodes(text: string) {
  let cursor = 0;
  let index = 0;
  let output = '';

  while (index < text.length) {
    if (text[index] !== '"') {
      index += 1;
      continue;
    }

    const start = index;

    index += 1;

    while (index < text.length) {
      if (text[index] === '\\') {
        index += 2;
        continue;
      }

      if (text[index] === '"') {
        break;
      }

      index += 1;
    }

    if (index >= text.length) {
      break;
    }

    const end = index + 1;

    if (text.slice(start, end) !== '"setcode"') {
      index = end;
      continue;
    }

    let colon = end;

    while (/\s/.test(text[colon] ?? '')) colon += 1;

    if (text[colon] !== ':') {
      index = end;
      continue;
    }

    let numberStart = colon + 1;

    while (/\s/.test(text[numberStart] ?? '')) numberStart += 1;

    let numberEnd = numberStart;

    if (text[numberEnd] === '-') numberEnd += 1;
    while (/[0-9]/.test(text[numberEnd] ?? '')) numberEnd += 1;

    if (numberEnd === numberStart || (text[numberStart] === '-' && numberEnd === numberStart + 1)) {
      index = end;
      continue;
    }

    output += text.slice(cursor, numberStart);
    output += `"${text.slice(numberStart, numberEnd)}"`;
    cursor = numberEnd;
    index = numberEnd;
  }

  return output + text.slice(cursor);
}

/** Public payload fragment retained for one invalid source record. */
function failurePayload(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  return {
    cid: value.cid ?? null,
    id: value.id ?? null,
  };
}

/** Valid identity candidates read independently from other record validation. */
function readIdentityCandidates(value: unknown) {
  if (!isRecord(value)) {
    return { cid: null, password: null };
  }

  const cid = typeof value.cid === 'number'
    && Number.isSafeInteger(value.cid)
    && value.cid > 0
    ? value.cid
    : null;
  const password = typeof value.id === 'number'
    && Number.isSafeInteger(value.id)
    && value.id > 0
    && value.id <= 99_999_999
    ? String(value.id).padStart(8, '0')
    : null;

  return { cid, password };
}

/** UTF-8 cards.json parsed and validated as one complete source snapshot. */
export function parseCardsJson(text: string): CardsParseResult {
  let value: unknown;

  try {
    value = JSON.parse(preserveLargeSetcodes(text));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CardsSourceError('INVALID_JSON', `cards.json is invalid JSON: ${message}`);
  }

  if (!isRecord(value)) {
    throw new CardsSourceError('INVALID_ROOT', 'cards.json root must be an object.');
  }

  const seenSourceRecordIds = Object.keys(value).sort((left, right) => left.localeCompare(right, 'en'));
  const cards: NormalizedCard[] = [];
  const failures: SourceRecordFailure[] = [];
  const unknownFields = new Set<string>();
  const cidOwners = new Map<number, string>();
  const passwordOwners = new Map<string, string>();

  for (const sourceRecordId of seenSourceRecordIds) {
    const record = value[sourceRecordId];
    const identity = readIdentityCandidates(record);

    if (identity.cid != null) {
      if (cidOwners.has(identity.cid)) {
        throw new CardsSourceError('DUPLICATE_CID', `Duplicate cid ${identity.cid} in source snapshot.`);
      }

      cidOwners.set(identity.cid, sourceRecordId);
    }

    if (identity.password != null) {
      if (passwordOwners.has(identity.password)) {
        throw new CardsSourceError('DUPLICATE_PASSWORD', `Duplicate password ${identity.password} in source snapshot.`);
      }

      passwordOwners.set(identity.password, sourceRecordId);
    }

    try {
      const normalized = normalizeCard(sourceRecordId, record);

      cards.push(normalized.card);
      normalized.unknownFields.forEach(field => unknownFields.add(field));
    } catch (error) {
      const sourceError = error instanceof CardsSourceError
        ? error
        : new CardsSourceError('INVALID_RECORD', error instanceof Error ? error.message : String(error));

      failures.push({
        sourceRecordId,
        stage: 'validation',
        code: sourceError.code,
        message: sourceError.message,
        payload: failurePayload(record),
      });
    }
  }

  return {
    cards,
    failures,
    seenSourceRecordIds,
    unknownFields: [...unknownFields].sort(),
  };
}

/** Precomputed CRC-32 table verifies ZIP entry integrity. */
const crc32Table = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;

  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }

  return crc >>> 0;
});

/** CRC-32 digest calculated for one uncompressed ZIP entry. */
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = crc32Table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/** Ensures one ZIP structure range stays inside the downloaded byte buffer. */
function requireRange(bytes: Uint8Array, offset: number, length: number, label: string) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > bytes.length) {
    throw new CardsSourceError('INVALID_ZIP', `${label} exceeds the ZIP payload.`);
  }
}

/** Little-endian unsigned 16-bit value read from one validated ZIP offset. */
function uint16(view: DataView, bytes: Uint8Array, offset: number, label: string) {
  requireRange(bytes, offset, 2, label);
  return view.getUint16(offset, true);
}

/** Little-endian unsigned 32-bit value read from one validated ZIP offset. */
function uint32(view: DataView, bytes: Uint8Array, offset: number, label: string) {
  requireRange(bytes, offset, 4, label);
  return view.getUint32(offset, true);
}

/** End-of-central-directory offset found within the ZIP comment search window. */
function findEndRecord(view: DataView, bytes: Uint8Array) {
  const minimum = Math.max(0, bytes.length - 65_557);

  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (uint32(view, bytes, offset, 'ZIP end record') === 0x06054b50) {
      return offset;
    }
  }

  throw new CardsSourceError('INVALID_ZIP', 'Source payload is not a ZIP archive.');
}

/** One regular ZIP entry decoded from the central directory. */
interface ZipEntry {
  name: string;
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

/** ZIP central directory decoded without extracting files to disk. */
function readCentralDirectory(bytes: Uint8Array) {
  if (bytes.length < 22 || bytes.length > maxArchiveBytes) {
    throw new CardsSourceError('INVALID_ZIP', bytes.length > maxArchiveBytes
      ? 'Source ZIP exceeds the compressed size limit.'
      : 'Source payload is not a ZIP archive.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndRecord(view, bytes);
  const diskNumber = uint16(view, bytes, endOffset + 4, 'ZIP disk number');
  const centralDisk = uint16(view, bytes, endOffset + 6, 'ZIP central disk');
  const diskEntryCount = uint16(view, bytes, endOffset + 8, 'ZIP disk entry count');
  const entryCount = uint16(view, bytes, endOffset + 10, 'ZIP entry count');
  const centralSize = uint32(view, bytes, endOffset + 12, 'ZIP central size');
  const centralOffset = uint32(view, bytes, endOffset + 16, 'ZIP central offset');

  if (diskNumber !== 0 || centralDisk !== 0 || diskEntryCount !== entryCount) {
    throw new CardsSourceError('UNSUPPORTED_ZIP', 'Multi-disk ZIP archives are not supported.');
  }

  requireRange(bytes, centralOffset, centralSize, 'ZIP central directory');

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entries: ZipEntry[] = [];
  let offset = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (uint32(view, bytes, offset, 'ZIP central entry') !== 0x02014b50) {
      throw new CardsSourceError('INVALID_ZIP', 'ZIP central directory entry is invalid.');
    }

    const nameLength = uint16(view, bytes, offset + 28, 'ZIP entry name length');
    const extraLength = uint16(view, bytes, offset + 30, 'ZIP entry extra length');
    const commentLength = uint16(view, bytes, offset + 32, 'ZIP entry comment length');
    const nameOffset = offset + 46;

    requireRange(bytes, nameOffset, nameLength + extraLength + commentLength, 'ZIP central entry data');

    let name: string;

    try {
      name = decoder.decode(bytes.subarray(nameOffset, nameOffset + nameLength));
    } catch {
      throw new CardsSourceError('INVALID_ZIP', 'ZIP entry name must be valid UTF-8.');
    }

    entries.push({
      name,
      flags: uint16(view, bytes, offset + 8, 'ZIP entry flags'),
      method: uint16(view, bytes, offset + 10, 'ZIP compression method'),
      crc: uint32(view, bytes, offset + 16, 'ZIP entry CRC'),
      compressedSize: uint32(view, bytes, offset + 20, 'ZIP compressed size'),
      uncompressedSize: uint32(view, bytes, offset + 24, 'ZIP uncompressed size'),
      localOffset: uint32(view, bytes, offset + 42, 'ZIP local offset'),
    });

    offset = nameOffset + nameLength + extraLength + commentLength;
  }

  if (offset !== centralOffset + centralSize) {
    throw new CardsSourceError('INVALID_ZIP', 'ZIP central directory size does not match its entries.');
  }

  return { entries, view };
}

/** One ZIP entry decompressed and verified against its central-directory metadata. */
function readZipEntry(bytes: Uint8Array, view: DataView, entry: ZipEntry) {
  if (entry.flags & 0x0001) {
    throw new CardsSourceError('UNSUPPORTED_ZIP', 'Encrypted ZIP entries are not supported.');
  }

  if (entry.method !== 0 && entry.method !== 8) {
    throw new CardsSourceError('UNSUPPORTED_ZIP', `ZIP compression method ${entry.method} is not supported.`);
  }

  if (entry.uncompressedSize > maxCardsJsonBytes) {
    throw new CardsSourceError('ZIP_SIZE_LIMIT', 'cards.json exceeds the uncompressed size limit.');
  }

  const offset = entry.localOffset;

  if (uint32(view, bytes, offset, 'ZIP local entry') !== 0x04034b50) {
    throw new CardsSourceError('INVALID_ZIP', 'ZIP local file header is invalid.');
  }

  const localMethod = uint16(view, bytes, offset + 8, 'ZIP local compression method');
  const nameLength = uint16(view, bytes, offset + 26, 'ZIP local name length');
  const extraLength = uint16(view, bytes, offset + 28, 'ZIP local extra length');
  const dataOffset = offset + 30 + nameLength + extraLength;

  if (localMethod !== entry.method) {
    throw new CardsSourceError('INVALID_ZIP', 'ZIP local and central compression methods differ.');
  }

  requireRange(bytes, dataOffset, entry.compressedSize, 'ZIP compressed entry');
  const compressed = bytes.subarray(dataOffset, dataOffset + entry.compressedSize);
  let contents: Uint8Array;

  try {
    contents = entry.method === 0 ? compressed : inflateRawSync(compressed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CardsSourceError('INVALID_ZIP', `Failed to decompress cards.json: ${message}`);
  }

  if (contents.length !== entry.uncompressedSize) {
    throw new CardsSourceError('INVALID_ZIP', 'cards.json uncompressed size does not match the ZIP directory.');
  }

  if (crc32(contents) !== entry.crc) {
    throw new CardsSourceError('INVALID_ZIP', 'cards.json CRC does not match the ZIP directory.');
  }

  return contents;
}

/** In-memory cards.zip parsed without writing any download cache to the workspace. */
export async function parseCardsZip(bytes: Uint8Array): Promise<CardsParseResult> {
  const { entries, view } = readCentralDirectory(bytes);

  if (entries.length !== 1 || entries[0]?.name !== 'cards.json') {
    throw new CardsSourceError('INVALID_ARCHIVE_CONTENTS', 'Archive must contain only cards.json.');
  }

  const contents = readZipEntry(bytes, view, entries[0]);
  let text: string;

  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(contents);
  } catch {
    throw new CardsSourceError('INVALID_ENCODING', 'cards.json must be valid UTF-8.');
  }

  return parseCardsJson(text);
}

/** Fixed public cards.zip downloaded and parsed with transport metadata. */
export async function downloadCardsSource(
  fetcher: typeof fetch = fetch,
): Promise<DownloadedCardsSource> {
  const response = await fetcher(yugiohCardsUrl, {
    headers: {
      accept: 'application/zip, application/octet-stream;q=0.9',
    },
  });

  if (!response.ok) {
    throw new CardsSourceError('HTTP_ERROR', `cards.zip download failed with HTTP ${response.status}.`);
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('text/html')) {
    throw new CardsSourceError('HTML_RESPONSE', 'cards.zip endpoint returned HTML instead of a structured archive.');
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const parsed = await parseCardsZip(bytes);

  return {
    ...parsed,
    archiveHash: sha256(bytes),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  };
}

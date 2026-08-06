import { describe, expect, test } from 'bun:test';
import { deflateRawSync } from 'node:zlib';

import {
  CardsSourceError,
  parseCardsJson,
  parseCardsZip,
} from './cards-source';

/** CRC-32 digest used by the minimal ZIP fixture writer. */
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/** Minimal ZIP archive containing stored or deflated UTF-8 files for parser tests. */
function buildZip(files: Array<{ name: string; contents: string; deflated?: boolean }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const contents = Buffer.from(file.contents, 'utf8');
    const compressed = file.deflated ? deflateRawSync(contents) : contents;
    const method = file.deflated ? 8 : 0;
    const digest = crc32(contents);
    const local = Buffer.alloc(30);

    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(digest, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(contents.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);

    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(digest, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(contents.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);

  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

/** Representative source record with all required nested structures. */
function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    cid: 4007,
    id: 89631139,
    sc_name: ' 青眼白龙 ',
    text: {
      types: '[怪兽|通常] 龙/光',
      pdesc: '',
      desc: '传说之龙。',
    },
    data: {
      ot: 11,
      setcode: 221,
      type: 17,
      atk: 3000,
      def: 2500,
      level: 8,
      race: 8192,
      attribute: 16,
    },
    ...overrides,
  };
}

describe('parseCardsJson', () => {
  test('normalizes the Blue-Eyes record and hashes canonical fields', () => {
    const result = parseCardsJson(JSON.stringify({ 4007: makeRecord() }));

    expect(result.failures).toEqual([]);
    expect(result.seenSourceRecordIds).toEqual(['4007']);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({
      sourceRecordId: '4007',
      cid: 4007,
      password: '89631139',
      scName: '青眼白龙',
      pendulumDescription: null,
      attack: 3000,
    });
    expect(result.cards[0]?.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('maps zero passwords to null and pads shorter passwords', () => {
    const result = parseCardsJson(JSON.stringify({
      4007: makeRecord({ id: 0 }),
      4008: makeRecord({ cid: 4008, id: 8124921 }),
    }));

    expect(result.cards.map(card => card.password)).toEqual([null, '08124921']);
  });

  test('preserves large setcode values and treats non-eight-digit source ids as no password', () => {
    const result = parseCardsJson('{"23419":{"cid":23419,"id":100269038,"data":{"setcode":132858190492402140}}}');

    expect(result.failures).toEqual([]);
    expect(result.cards[0]).toMatchObject({
      cid: 23419,
      password: null,
      setcode: '132858190492402140',
    });
  });

  test('isolates invalid records while retaining their source keys as seen', () => {
    const result = parseCardsJson(JSON.stringify({
      4007: makeRecord(),
      4008: makeRecord({ cid: 9999, id: 8124921 }),
    }));

    expect(result.cards).toHaveLength(1);
    expect(result.failures).toEqual([
      expect.objectContaining({ sourceRecordId: '4008', code: 'CID_KEY_MISMATCH' }),
    ]);
    expect(result.seenSourceRecordIds).toEqual(['4007', '4008']);
  });

  test('rejects duplicate non-null passwords as a dangerous snapshot', () => {
    expect(() => parseCardsJson(JSON.stringify({
      4007: makeRecord(),
      4008: makeRecord({ cid: 4008 }),
    }))).toThrow(new CardsSourceError('DUPLICATE_PASSWORD', 'Duplicate password 89631139 in source snapshot.'));
  });

  test('rejects duplicate identifiers even when one owner has another invalid field', () => {
    expect(() => parseCardsJson(JSON.stringify({
      4007: makeRecord(),
      4008: makeRecord({ cid: 4008, text: 'invalid' }),
    }))).toThrow(new CardsSourceError('DUPLICATE_PASSWORD', 'Duplicate password 89631139 in source snapshot.'));
  });

  test('reports unknown top-level and nested fields without hashing them', () => {
    const result = parseCardsJson(JSON.stringify({
      4007: makeRecord({
        future_field: true,
        text: { types: 'type', pdesc: '', desc: 'text', future_text: true },
        data: { ot: 1, future_data: 2 },
      }),
    }));

    expect(result.unknownFields).toEqual(['data.future_data', 'future_field', 'text.future_text']);
  });
});

describe('parseCardsZip', () => {
  test('reads one deflated cards.json file without extracting it', async () => {
    const zip = buildZip([
      { name: 'cards.json', contents: JSON.stringify({ 4007: makeRecord() }), deflated: true },
    ]);

    const result = await parseCardsZip(zip);

    expect(result.cards[0]?.cid).toBe(4007);
  });

  test('rejects archives with any additional regular file', async () => {
    const zip = buildZip([
      { name: 'cards.json', contents: '{}' },
      { name: '../extra.json', contents: '{}' },
    ]);

    await expect(parseCardsZip(zip)).rejects.toThrow('Archive must contain only cards.json.');
  });

  test('rejects an HTML response before JSON parsing', async () => {
    await expect(parseCardsZip(Buffer.from('<!doctype html>'))).rejects.toThrow('Source payload is not a ZIP archive.');
  });
});

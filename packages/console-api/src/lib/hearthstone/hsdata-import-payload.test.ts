import { describe, expect, test } from 'bun:test';

import {
  computeHsdataPayloadHash,
  parseHsdataImportChunkPayload,
} from './hsdata-import-payload';

const canonicalPayload = [
  '{"cardId":"CARD_001","dbfId":1,"entityXmlVersion":1,"tags":[',
  '{"enumId":1,"rawName":"NAME","rawType":"String","rawPayload":{"attributes":{"enumID":"1","name":"NAME","type":"String","value":"abc"}},"rawValue":"abc","locStringValue":null,"cardRefCardId":null,"tagOrder":0}',
  '],"extraPayload":{"entourageCards":[],"masterPowers":[],"powers":[],"referencedTags":{},"triggeredPowerHistoryInfo":[]}}\n',
].join('');

describe('parseHsdataImportChunkPayload', () => {
  test('accepts canonical payload bytes and recomputes snapshot hashes', () => {
    const entities = parseHsdataImportChunkPayload({
      payload: canonicalPayload,
      expectedEntityCount: 1,
      expectedPayloadHash: computeHsdataPayloadHash(canonicalPayload),
    });

    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({
      cardId:           'CARD_001',
      dbfId:            1,
      entityXmlVersion: 1,
      tags:             [{
        enumId:        1,
        rawName:       'NAME',
        rawType:       'String',
        rawValue:      'abc',
        cardRefCardId: null,
        tagOrder:      0,
      }],
    });
    expect(entities[0]?.snapshotHash).toHaveLength(64);
  });

  test('rejects non-canonical field ordering', () => {
    const nonCanonicalPayload = [
      '{"dbfId":1,"cardId":"CARD_001","entityXmlVersion":1,"tags":[',
      '{"enumId":1,"rawName":"NAME","rawType":"String","rawPayload":{"attributes":{"enumID":"1","name":"NAME","type":"String","value":"abc"}},"rawValue":"abc","locStringValue":null,"cardRefCardId":null,"tagOrder":0}',
      '],"extraPayload":{"entourageCards":[],"masterPowers":[],"powers":[],"referencedTags":{},"triggeredPowerHistoryInfo":[]}}\n',
    ].join('');

    expect(() => parseHsdataImportChunkPayload({
      payload: nonCanonicalPayload,
      expectedEntityCount: 1,
      expectedPayloadHash: computeHsdataPayloadHash(nonCanonicalPayload),
    })).toThrow('Chunk payload line 1 is not canonical');
  });
});

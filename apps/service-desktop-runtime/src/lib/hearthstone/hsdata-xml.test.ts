import { describe, expect, test } from 'bun:test';

import { normalizeHsdataXmlSource, parseHsdataXml } from './hsdata-xml';

describe('parseHsdataXml', () => {
  test('parses hsdata entities from the Bun runtime XML path', () => {
    const parsed = parseHsdataXml(normalizeHsdataXmlSource(`<?xml version="1.0" encoding="utf-8"?>
<CardDefs build="123">
  <Metadata>
    <Ignored>top-level sibling</Ignored>
  </Metadata>
  <Entity CardID="CARD_001" ID="1" version="2">
    <Tag enumID="1" name="CARDNAME" type="LocString">
      <enUS><![CDATA[Alpha <Beta>]]></enUS>
    </Tag>
    <Tag enumID="2" name="TEXT" type="String">A &amp; B</Tag>
    <ReferencedTag enumID="190" value="1" />
    <ReferencedTag enumID="999" value="2" />
    <Power definition="MAIN">
      <PlayRequirement reqID="1" param="3" />
    </Power>
    <EntourageCard cardID="CARD_002" />
    <MasterPower>HERO_POWER</MasterPower>
    <TriggeredPowerHistoryInfo effectIndex="7" showInHistory="true" />
  </Entity>
</CardDefs>`));

    expect(parsed.build).toBe(123);
    expect(parsed.entities).toHaveLength(1);

    const entity = parsed.entities[0]!;
    expect(entity.cardId).toBe('CARD_001');
    expect(entity.dbfId).toBe(1);
    expect(entity.entityXmlVersion).toBe(2);
    expect(entity.tags).toHaveLength(2);
    expect(entity.tags[0]?.locStringValue).toEqual({ enUS: 'Alpha <Beta>' });
    expect(entity.tags[1]?.rawPayload).toEqual({
      attributes: {
        enumID: '2',
        name:   'TEXT',
        type:   'String',
      },
      text: 'A & B',
    });
    expect(entity.extraPayload).toEqual({
      referencedTags: {
        '190': true,
        '999': 2,
      },
      powers: [{
        definition:       'MAIN',
        playRequirements: [{ reqId: 1, param: 3 }],
      }],
      entourageCards: [{ cardId: 'CARD_002' }],
      masterPowers: ['HERO_POWER'],
      triggeredPowerHistoryInfo: [{ effectIndex: 7, showInHistory: true }],
    });
  });

  test('dedupes byte-identical duplicate entities', () => {
    const parsed = parseHsdataXml(normalizeHsdataXmlSource(`
      <CardDefs build="7">
        <Entity CardID="CARD_001" ID="1" version="1">
          <Tag enumID="1" name="ONE" type="String">abc</Tag>
        </Entity>
        <Entity CardID="CARD_001" ID="1" version="1">
          <Tag enumID="1" name="ONE" type="String">abc</Tag>
        </Entity>
      </CardDefs>
    `));

    expect(parsed.entities).toHaveLength(1);
    expect(parsed.entities[0]?.cardId).toBe('CARD_001');
  });

  test('rejects an unexpected XML root tag', () => {
    expect(() => parseHsdataXml('<Cards build="7"></Cards>')).toThrow('Unexpected root tag: Cards');
  });
});

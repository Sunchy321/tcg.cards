import { describe, expect, test } from 'bun:test';

import { countPublishLoadingBlocks } from './definition';

describe('publish task loading block planning', () => {
  test('counts one empty exhaustion block for each scanned table', () => {
    const blocks = countPublishLoadingBlocks({
      entities:             69_123,
      entity_localizations: 1_120_495,
      entity_relations:     12_187,
      cards:                37_675,
    });

    expect(blocks).toBe(1_246);
  });

  test('keeps exhaustion blocks for empty tables', () => {
    const blocks = countPublishLoadingBlocks({
      entities:             0,
      entity_localizations: 0,
      entity_relations:     0,
      cards:                0,
    });

    expect(blocks).toBe(4);
  });
});

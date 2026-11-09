import { describe, expect, test } from 'bun:test';

import { parseNeuronIndexCids } from './neuron-index';

describe('parseNeuronIndexCids', () => {
  test('reads cids when official card links include an instance id', () => {
    const html = '<input type="hidden" class="link_value" value="/yugiohdb/card_search.action?ope=2&cid=8610&iid=1">';

    expect(parseNeuronIndexCids(html)).toEqual([8610]);
  });
});

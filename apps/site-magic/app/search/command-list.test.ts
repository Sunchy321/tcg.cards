import { expect, test } from 'bun:test';

import { explain } from './index';

test.each([
  ['rarity:rare', 'is'],
  ['r:rare', 'is'],
  ['r!:rare', 'is-not'],
  ['rarity~:rare', 'has-print'],
  ['r~:rare', 'has-print'],
  ['-r~:rare', 'not-has-print'],
])('explains %s without failing search initialization', (query, operator) => {
  expect(explain.explain(query, key => key)).toEqual({
    type: 'result',
    text: `$.command.rarityoperator.${operator}$.parameter.rarity.rare`,
  });
});

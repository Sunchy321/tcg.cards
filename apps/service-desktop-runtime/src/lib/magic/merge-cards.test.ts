import { describe, expect, test } from 'bun:test';

import { findCardMergeGroup } from './merge-cards';

const BFM_LEFT = '8fd7503b-e722-49a7-a8ac-786e7354bc95';
const BFM_RIGHT = 'd0bd00f2-91bb-4c9c-a8e7-f8aeadc0bbb9';

describe('findCardMergeGroup', () => {
  test('finds the BFM group for both member oracles', () => {
    expect(findCardMergeGroup(BFM_LEFT)?.slug).toBe('b-f-m-big-furry-monster');
    expect(findCardMergeGroup(BFM_RIGHT)?.slug).toBe('b-f-m-big-furry-monster');
  });

  test('returns null for unrelated oracles', () => {
    expect(findCardMergeGroup('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  test('merged text contains every rule sentence from both halves', () => {
    const group = findCardMergeGroup(BFM_LEFT)!;
    expect(group.face.oracleText).toContain('You must cast both B.F.M. cards to put B.F.M. onto the battlefield.');
    expect(group.face.oracleText).toContain('If one B.F.M. card leaves the battlefield, sacrifice the other.');
    expect(group.face.oracleText).toContain('B.F.M. can\'t be blocked except by three or more creatures.');
  });

  test('merged type line joins both halves', () => {
    const group = findCardMergeGroup(BFM_LEFT)!;
    expect(group.face.typeLine).toContain('The Biggest, Baddest, Nastiest,');
    expect(group.face.typeLine).toContain('Scariest Creature You\'ll Ever See');
  });
});

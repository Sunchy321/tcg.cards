import { describe, expect, test } from 'bun:test';
import { analyzeRegex } from './regex';

describe('PG-compatible regex analysis', () => {
  test('recognizes literal alternatives without interpreting literal separators as DSL', () => {
    expect(analyzeRegex('draw|discard')).toEqual({
      type:      'exact', condition: { kind:  'or', exprs: [
        { kind: 'contains', value: 'draw' }, { kind: 'contains', value: 'discard' },
      ] },
    });
  });
});

describe('necessary regex substrings', () => {
  test.each([
    ['draw.*card', ['draw', 'card']],
    ['draw?', ['dra']],
    ['(draw|)card?', ['car']],
    ['(draw)?card', ['card']],
    ['(draw)*card', ['card']],
    ['(draw)+card', ['draw', 'card']],
    ['(draw){0,2}card', ['card']],
    ['(draw){2,3}card', ['draw', 'card']],
    ['^draw$', ['draw']],
    ['draw.*?card', ['draw', 'card']],
  ])('extracts required pieces from %s', (source, expected) => {
    const result = analyzeRegex(source);
    expect(result.type).toBe('candidate');
    if (result.type !== 'original') {
      expect(JSON.stringify(result.condition)).toBe(expected.length === 1
        ? JSON.stringify({ kind: 'contains', value: expected[0] })
        : JSON.stringify({ kind: 'and', exprs: expected.map(value => ({ kind: 'contains', value })) }));
    }
  });
  test.each(['.*', '(draw)?', 'draw|', '[a-z]draw', '\\bdraw', '(?=draw)draw', '(draw).*\\1', '\\d+draw', '抽牌', '(?i)draw'])('preserves unsupported or unconstrained %s on PG', source => {
    expect(analyzeRegex(source).type).toBe('original');
  });
  test('retains every alternative rather than requiring all branch words', () => {
    const result = analyzeRegex('(draw|discard).*card');
    expect(result.type).toBe('candidate');
    if (result.type !== 'original') {
      expect(result.condition).toEqual({ kind:  'and', exprs: [
        { kind: 'or', exprs: [{ kind: 'contains', value: 'draw' }, { kind: 'contains', value: 'discard' }] },
        { kind: 'contains', value: 'card' },
      ] });
    }
  });
  test('escapes metacharacters and preserves bounded analysis cost', () => {
    expect(analyzeRegex('draw\\|card')).toEqual({ type: 'exact', condition: { kind: 'contains', value: 'draw|card' } });
    expect(analyzeRegex('draw'.repeat(2000)).type).toBe('original');
    expect(analyzeRegex('('.repeat(40) + 'draw' + ')'.repeat(40)).type).toBe('original');
    expect(analyzeRegex('(a|b)'.repeat(12)).type).toBe('candidate');
  });
});

import { expect, test } from 'bun:test';
import { documentHistoryErrorKey } from './documentHistoryError';

test('distinguishes a missing history from an unavailable history service', () => {
  expect(documentHistoryErrorKey({ code: 'NOT_FOUND' })).toBe('not_found');
  expect(documentHistoryErrorKey({ code: 'INTERNAL_SERVER_ERROR' })).toBe('load_failed');
  expect(documentHistoryErrorKey(new Error('Document relations are not prepared or are outdated'))).toBe('load_failed');
});

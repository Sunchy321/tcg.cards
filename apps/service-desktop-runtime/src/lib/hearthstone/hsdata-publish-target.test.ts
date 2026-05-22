import { afterEach, describe, expect, test } from 'bun:test';

import { setHearthstonePublishTargetOverride } from '../../runtime-config';
import {
  getHearthstonePublishTarget,
  requireHearthstonePublishTarget,
} from './hsdata-publish-target';

/** Publish target override reset after each test to avoid cross-test runtime leakage. */
afterEach(() => {
  setHearthstonePublishTargetOverride(null);
});

describe('hsdata publish target', () => {
  test('returns one trimmed publish target when all required fields are present', () => {
    setHearthstonePublishTargetOverride({
      publishTargetId: '  target-dev  ',
      environment: '  dev  ',
      targetFingerprint: '  fp-123  ',
      connectionString: '  postgres://user:pass@127.0.0.1:5432/cards  ',
    });

    expect(getHearthstonePublishTarget()).toEqual({
      publishTargetId: 'target-dev',
      environment: 'dev',
      targetFingerprint: 'fp-123',
      connectionString: 'postgres://user:pass@127.0.0.1:5432/cards',
    });
  });

  test('reports every missing field when the runtime target is incomplete', () => {
    setHearthstonePublishTargetOverride({
      publishTargetId: 'target-dev',
      environment: null,
      targetFingerprint: '   ',
      connectionString: null,
    });

    expect(() => requireHearthstonePublishTarget()).toThrow(
      'Hearthstone publish target is not configured: missing environment, targetFingerprint, connectionString',
    );
  });
});

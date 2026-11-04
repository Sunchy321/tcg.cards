import { afterEach, describe, expect, test } from 'bun:test';

import {
  setHearthstonePublishTargetOverride,
  setHearthstonePublishTargetOverrides,
} from '../../runtime-config';
import {
  getHearthstonePublishTarget,
  getHearthstonePublishTargetByIdentity,
  listHearthstonePublishTargets,
  requireHearthstonePublishTarget,
  requireHearthstonePublishTargetByIdentity,
} from './hsdata-publish-target';

/** Publish target override reset after each test to avoid cross-test runtime leakage. */
afterEach(() => {
  setHearthstonePublishTargetOverride(null);
});

describe('hsdata publish target', () => {
  test('returns one trimmed publish target when all required fields are present', () => {
    setHearthstonePublishTargetOverride({
      game:              '  target-dev  ',
      target:            '  dev  ',
      targetFingerprint: '  fp-123  ',
      connectionString:  '  postgres://user:pass@127.0.0.1:5432/cards  ',
    });

    expect(getHearthstonePublishTarget()).toEqual({
      game:              'target-dev',
      target:            'dev',
      targetFingerprint: 'fp-123',
      connectionString:  'postgres://user:pass@127.0.0.1:5432/cards',
    });
  });

  test('reports every missing field when the runtime target is incomplete', () => {
    setHearthstonePublishTargetOverride({
      game:              'target-dev',
      target:            null,
      targetFingerprint: '   ',
      connectionString:  null,
    });

    expect(() => requireHearthstonePublishTarget()).toThrow(
      'Hearthstone publish target is not configured: missing target, targetFingerprint, connectionString',
    );
  });

  test('lists only fully configured publish targets from the runtime override list', () => {
    setHearthstonePublishTargetOverrides([
      {
        game:              ' hearthstone ',
        target:            ' dev ',
        targetFingerprint: ' fp-dev ',
        connectionString:  ' postgres://dev ',
      },
      {
        game:              'magic',
        target:            'prod',
        targetFingerprint: null,
        connectionString:  'postgres://prod',
      },
      {
        game:              ' hearthstone ',
        target:            ' prod ',
        targetFingerprint: ' fp-prod ',
        connectionString:  ' postgres://prod ',
      },
    ]);

    expect(listHearthstonePublishTargets()).toEqual([
      {
        game:              'hearthstone',
        target:            'dev',
        targetFingerprint: 'fp-dev',
        connectionString:  'postgres://dev',
      },
      {
        game:              'hearthstone',
        target:            'prod',
        targetFingerprint: 'fp-prod',
        connectionString:  'postgres://prod',
      },
    ]);
  });

  test('returns one matching publish target by identity', () => {
    setHearthstonePublishTargetOverrides([
      {
        game:              'hearthstone',
        target:            'dev',
        targetFingerprint: 'fp-dev',
        connectionString:  'postgres://dev',
      },
      {
        game:              'hearthstone',
        target:            'prod',
        targetFingerprint: 'fp-prod',
        connectionString:  'postgres://prod',
      },
    ]);

    expect(getHearthstonePublishTargetByIdentity('hearthstone', 'prod')).toEqual({
      game:              'hearthstone',
      target:            'prod',
      targetFingerprint: 'fp-prod',
      connectionString:  'postgres://prod',
    });
  });

  test('reports one missing identity when no matching publish target exists', () => {
    setHearthstonePublishTargetOverrides([
      {
        game:              'hearthstone',
        target:            'dev',
        targetFingerprint: 'fp-dev',
        connectionString:  'postgres://dev',
      },
    ]);

    expect(() => requireHearthstonePublishTargetByIdentity('hearthstone', 'prod')).toThrow(
      'Hearthstone publish target is not configured for hearthstone/prod.',
    );
  });
});

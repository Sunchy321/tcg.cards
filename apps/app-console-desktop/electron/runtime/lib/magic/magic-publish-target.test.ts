import { afterEach, describe, expect, test } from 'bun:test';

import { setPublishTargets } from '../../runtime-config';
import { requireMagicPublishTarget, verifyMagicPublishTargetFingerprint } from './magic-publish-target';

describe('magic publish target fingerprint validation', () => {
  afterEach(() => setPublishTargets([]));

  test('accepts the issuer fingerprint for an account target without comparing the temporary database login', () => {
    setPublishTargets([{
      id:                'prod',
      name:              'prod',
      kind:              'account',
      connectionString:  'postgresql://db.example.test/magic',
      targetFingerprint: 'issuer-fingerprint',
    }]);

    const target = requireMagicPublishTarget('magic', 'prod');

    expect(target.kind).toBe('account');
    expect(target.targetFingerprint).toBe('issuer-fingerprint');
    expect(() => verifyMagicPublishTargetFingerprint(target, 'runtime-fingerprint')).not.toThrow();
  });

  test('continues rejecting a direct target whose live database identity changed', () => {
    setPublishTargets([{
      id:                'dev',
      name:              'dev',
      kind:              'direct',
      connectionString:  'postgresql://db.example.test/magic',
      targetFingerprint: 'saved-fingerprint',
    }]);

    const target = requireMagicPublishTarget('magic', 'dev');

    expect(() => verifyMagicPublishTargetFingerprint(target, 'runtime-fingerprint'))
      .toThrow('发布目标与保存的配置不一致，请重新确认发布配置。');
  });

  test('accepts a direct target when its live database identity still matches', () => {
    setPublishTargets([{
      id:                'dev',
      name:              'dev',
      kind:              'direct',
      connectionString:  'postgresql://db.example.test/magic',
      targetFingerprint: 'saved-fingerprint',
    }]);

    const target = requireMagicPublishTarget('magic', 'dev');

    expect(() => verifyMagicPublishTargetFingerprint(target, 'saved-fingerprint')).not.toThrow();
  });
});

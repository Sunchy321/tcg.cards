import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolvePublishTarget, resolveSearchD1Target, withResolvedPublishTarget } from './publish-targets.ts';

const id = 'ae313789-9cfb-4d20-abde-41fefbd92814';

test('a direct target labels the stream with its name and captures the first verified identity', () => {
  const resolved = resolvePublishTarget({ id, name: '本地', kind: 'direct' }, 'fingerprint-a');

  assert.deepEqual(resolved, {
    target:            '本地',
    targetFingerprint: 'fingerprint-a',
    capture:           true,
  });
});

test('a recorded identity that still matches is not captured again', () => {
  const resolved = resolvePublishTarget(
    { id, name: '线上', kind: 'direct', targetFingerprint: 'fingerprint-a' },
    'fingerprint-a',
  );

  assert.equal(resolved.capture, false);
  assert.equal(resolved.target, '线上');
});

test('a recorded identity that no longer matches refuses to publish', () => {
  assert.throws(
    () => resolvePublishTarget(
      { id, name: '线上', kind: 'direct', targetFingerprint: 'fingerprint-a' },
      'fingerprint-b',
    ),
    /不一致/,
  );
});

test('an account target uses the identity the service reported', () => {
  const resolved = resolvePublishTarget(
    { id, name: '远端', kind: 'account', targetFingerprint: 'service-identity' },
    'service-identity',
  );

  assert.equal(resolved.capture, false);
  assert.equal(resolved.targetFingerprint, 'service-identity');
});

test('launch parameters carry the target name as the stream label without losing other values', () => {
  const params = withResolvedPublishTarget(
    { game: 'magic', targetId: id, dryRun: true },
    { target: '本地', targetFingerprint: 'fingerprint-a', capture: true },
  );

  assert.deepEqual(params, {
    game:              'magic',
    targetId:          id,
    dryRun:            true,
    target:            '本地',
    targetFingerprint: 'fingerprint-a',
  });
});

test('remote search publication requires an explicitly selected account target', () => {
  const direct = { id, name: '本地', kind: 'direct' } as const;
  const account = { id: 'remote', name: '远端', kind: 'account' } as const;
  const targets = [direct, account];

  assert.throws(() => resolveSearchD1Target(targets, direct.id), /账户发布目标/);
  assert.throws(() => resolveSearchD1Target(targets, ''), /账户发布目标/);
  assert.equal(resolveSearchD1Target(targets, account.id), account);
});

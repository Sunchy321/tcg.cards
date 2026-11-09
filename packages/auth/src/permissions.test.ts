import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gameDataPermission } from './permissions.ts';

test('only owners and the game own admin hold one game data permission', () => {
  assert.equal(gameDataPermission('owner', 'magic'), true);
  assert.equal(gameDataPermission('owner', 'shadowverse'), true);
  assert.equal(gameDataPermission('admin/magic', 'magic'), true);
  assert.equal(gameDataPermission('admin/magic', 'hearthstone'), false);
  assert.equal(gameDataPermission('admin', 'magic'), false);
  assert.equal(gameDataPermission('user', 'yugioh'), false);
  assert.equal(gameDataPermission(null, 'yugioh'), false);
  assert.equal(gameDataPermission(undefined, 'yugioh'), false);
});

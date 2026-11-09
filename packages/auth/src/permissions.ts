import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, adminAc, userAc } from 'better-auth/plugins/admin/access';

import { GAMES, type Game } from '@tcg-cards/base';

export const ac = createAccessControl({
  ...defaultStatements,
  data: GAMES,
} as const);

const owner = ac.newRole({
  ...adminAc.statements,
  data: [...GAMES],
});

const admin = ac.newRole({
  ...adminAc.statements,
});

const user = ac.newRole({
  ...userAc.statements,
});

const gameAdmins = Object.fromEntries(GAMES.map(game => [`admin/${game}`, ac.newRole({
  ...userAc.statements,
  data: [game],
})]));

export const roles = {
  owner,
  admin,
  user,
  ...gameAdmins,
};

/** Reports whether one stored role name carries the per-game data permission. */
export function gameDataPermission(role: string | null | undefined, game: Game): boolean {
  // Mirrors the role table above: owner holds every game, only a game's own admin holds it.
  if (role === 'owner') return true;
  return role === `admin/${game}`;
}

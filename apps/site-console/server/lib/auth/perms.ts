import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, adminAc, userAc } from 'better-auth/plugins/admin/access';

import { GAMES } from '#shared';

export const ac = createAccessControl({
  ...defaultStatements,
  data: GAMES,
} as const);

const owner = ac.newRole({
  ...adminAc.statements,
  data: [...GAMES],
});

const admin = ac.newRole ({
  ...adminAc.statements,
});

const user = ac.newRole({
  ...userAc.statements,
});

const gameAdmins = Object.fromEntries(GAMES.map(g => [`admin/${g}`, ac.newRole({
  ...userAc.statements,
  data: [g],
})]));

export const roles = {
  owner,
  admin,
  user,
  ...gameAdmins,
};

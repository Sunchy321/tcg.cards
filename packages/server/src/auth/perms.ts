import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, adminAc, userAc } from 'better-auth/plugins/admin/access';

import { games } from '@interface/index';

export const ac = createAccessControl({
    ...defaultStatements,
    data: games,
} as const);

const owner = ac.newRole({
    ...adminAc.statements,
});

const admin = ac.newRole ({
    ...adminAc.statements,
});

const user = ac.newRole({
    ...userAc.statements,
});

const gameAdmins = Object.fromEntries(games.map(g => [`admin/${g}`, ac.newRole({
    ...userAc.statements,
    data: [g],
})]));

export const roles = {
    owner,
    admin,
    user,
    ...gameAdmins,
};

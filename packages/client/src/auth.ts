import { createAuthClient } from 'better-auth/vue';
import { adminClient, usernameClient } from 'better-auth/client/plugins';

import { apiBase } from 'src/boot/server';

export const auth = createAuthClient({
    baseURL: apiBase,

    plugins: [
        usernameClient(),
        adminClient(),
    ],
});

export function checkAdmin(roles: string[], admin: string) {
    if (roles.includes('owner')) {
        return true;
    }

    if (roles.includes(admin)) {
        return true;
    }

    return false;
}

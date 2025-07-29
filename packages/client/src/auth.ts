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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function sessionHelper() { return auth.getSession(); }

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function useSessionHelper() { return auth.useSession().value; }

export type Session = Awaited<ReturnType<typeof sessionHelper>>;
export type UseSession = ReturnType<typeof useSessionHelper>;

export function checkAdmin(session: Session | UseSession, admin: string) {
    const roles = session.data?.user?.role?.split(',') ?? [];

    if (roles.includes('owner')) {
        return true;
    }

    if (roles.includes(admin)) {
        return true;
    }

    return false;
}

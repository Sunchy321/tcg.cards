import { ClientResponse, hc } from 'hono/client';
import { ContentfulStatusCode } from 'hono/utils/http-status';

import type { Router } from '@server/service';

const url = import.meta.env.VITE_HONO_URL;

export const hono = hc<Router>(url);

export const trpc = hono.trpc;

export async function getValue<T, R>(
    func: {
        $get: (arg: { query: T }) => Promise<ClientResponse<R, ContentfulStatusCode, 'json'>>;
    },
    arg: T,
): Promise<R | null> {
    const res = await func.$get({ query: arg });

    if (res.ok) {
        const value = await res.json();

        return value;
    }

    return null;
}

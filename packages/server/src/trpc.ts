import { initTRPC } from '@trpc/server';
import { OpenApiMeta } from 'trpc-to-openapi';

export const t = initTRPC.meta<OpenApiMeta>().create();

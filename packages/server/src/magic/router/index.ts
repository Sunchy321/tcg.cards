import { t } from '@/trpc';

import { cardRouter } from './card';

export const gameRouter = t.router({
    card: cardRouter,
});

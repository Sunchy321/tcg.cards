import { t } from '@/trpc';

import { cardRouter } from './card';
import { setRouter } from './set';

export const gameRouter = t.router({
    card: cardRouter,
    set:  setRouter,
});

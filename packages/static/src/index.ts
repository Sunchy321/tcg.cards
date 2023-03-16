import * as magic from './magic/basic';
import * as hearthstone from './hearthstone/basic';

import './magic/special';

export const games = ['magic', 'hearthstone'] as const;

export type Game = (typeof games)[number];

export default {
    magic,
    hearthstone,
};

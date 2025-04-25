import * as magic from './magic/basic';
import * as yugioh from './yugioh/basic';
import * as hearthstone from './hearthstone/basic';
import * as lorcana from './lorcana/basic';

import './magic/special';
import './magic/misc';

import './yugioh/misc';

export const games = ['magic', 'yugioh', 'hearthstone', 'lorcana'] as const;

export type Game = (typeof games)[number];

export default {
    magic,
    yugioh,
    hearthstone,
    lorcana,
};

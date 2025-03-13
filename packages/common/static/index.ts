import * as magic from './magic/basic';
import * as hearthstone from './hearthstone/basic';
import * as lorcana from './lorcana/basic';

import './magic/special';
import './magic/misc';

export const games = ['magic', 'hearthstone', 'lorcana'] as const;

export type Game = (typeof games)[number];

export default {
    magic,
    hearthstone,
    lorcana,
};

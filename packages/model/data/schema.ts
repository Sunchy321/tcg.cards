import magic from './magic/schema';
import hearthstone from './hearthstone/schema';

// export const games = ['magic', 'ptcg', 'yugioh', 'hearthstone', 'lorcana'] as const;

export const games = ['magic', 'hearthstone'] as const;

export type Game = (typeof games)[number];

export const allModels = {
    magic,
    hearthstone,
};

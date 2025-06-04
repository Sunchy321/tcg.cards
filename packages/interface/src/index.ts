export const games = ['magic', 'ptcg', 'yugioh', 'hearthstone', 'lorcana'] as const;

export type Game = (typeof games)[number];

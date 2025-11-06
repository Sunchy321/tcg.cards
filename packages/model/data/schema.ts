export const games = ['magic', 'ptcg', 'yugioh', 'hearthstone', 'lorcana'] as const;

export type Game = (typeof games)[number];

export const gameCodeNames: Record<Game, string> = {
    magic:       'Magic',
    ptcg:        'PTCG',
    yugioh:      'Yugioh',
    hearthstone: 'Hearthstone',
    lorcana:     'Lorcana',
};

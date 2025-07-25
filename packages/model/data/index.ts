import magic from './magic';

interface ZodMeta {
    
}

// export const games = ['magic', 'ptcg', 'yugioh', 'hearthstone', 'lorcana'] as const;

export const games = ['magic'] as const;

export type Game = (typeof games)[number];

export const allModels = {
    magic,
};

import { useMagic } from './magic';
import { useHearthstone } from './hearthstone';

export const games = ['magic', 'hearthstone'] as ['magic', 'hearthstone'];

export type Game = (typeof games)[number];

export const gameStores = {
    magic:       useMagic,
    hearthstone: useHearthstone,
};

export function useGame<G extends Game>(game: G): (typeof gameStores)[G] {
    return gameStores[game];
}

import { useMagic } from './magic';
import { useHearthstone } from './hearthstone';
import { useLorcana } from './lorcana';

import { Game } from 'static/index';

export const gameStores = {
    magic:       useMagic,
    hearthstone: useHearthstone,
    lorcana:     useLorcana,
};

export function useGame<G extends Game>(game: G): (typeof gameStores)[G] {
    return gameStores[game];
}

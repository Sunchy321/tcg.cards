import { useMagic } from './magic';
import { useYugioh } from './yugioh';
import { useHearthstone } from './hearthstone';
import { useLorcana } from './lorcana';

import { Game } from 'static/index';

export const gameStores = {
    magic:       useMagic,
    yugioh:      useYugioh,
    hearthstone: useHearthstone,
    lorcana:     useLorcana,
};

export function useGame<G extends Game>(game: G): (typeof gameStores)[G] {
    return gameStores[game];
}

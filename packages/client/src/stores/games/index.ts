import { Game } from 'static/index';
import { GameStoreDefinition } from './interface';

export const gameStores = import.meta.glob<true, undefined, GameStoreDefinition<Game, any>>(
    ['./*.ts', '!./index.ts', '!./game.ts', '!./interface.ts'],
    { eager: true, import: 'useGame' },
);

export function useGame<G extends Game>(game: G): (typeof gameStores)[G] {
    return gameStores[`./${game}.ts`];
}

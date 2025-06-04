import { StoreDefinition } from 'pinia';

import data, { Game } from 'interface/index';

interface GameOptionNumber {
    type: 'number';
}

interface GameOptionEnum {
    type:     'enum';
    values:   string[];
    default?: string;
}

export type GameOption = GameOptionEnum | GameOptionNumber;

export type GameOptions<S> = {
    [K in keyof S]: GameOption;
};

export type GameState<S> = S & {
    locale: string;
};

export type GameGetters<G extends Game> = (typeof data)[G] & {
    locales: string[];
};

export type GameActions = {
    init: () => Promise<void>;
};

export type GameStoreDefinition<G extends Game, S> =
    StoreDefinition<G, GameState<S>, GameGetters<G>, GameActions>;

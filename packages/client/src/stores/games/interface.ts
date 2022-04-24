import { StoreDefinition } from 'pinia';

interface GameOptionNumber {
    type: 'number';
}

interface GameOptionEnum {
    type: 'enum';
    values: string[];
    default?: string;
}

export type GameOption = GameOptionEnum | GameOptionNumber;

export type GameOptions<S> = {
    [K in keyof S]: GameOption;
};

export type GameState<D, S> = S & {
    locale: string;
    data: D;
};

export type GameGetters = {
    locales: string[];
};

export type GameActions<D> = {
    init: (data: D) => Promise<void>;
};

export type GameStoreDefinition<G extends string, D, S> =
    StoreDefinition<G, GameState<D, S>, GameGetters, GameActions<D>>;

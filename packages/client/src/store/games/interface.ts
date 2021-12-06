import { ModuleOptions } from '../typed-vuex/interface';
import type { Commit } from 'vuex';

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
    locales: string[];
    data: D;
};

export type GameGetters<D, S> = {
    [K in keyof S]: (state: GameState<D, S>) => S[K];
} & {
    locale: (state: GameState<D, S>) => string;
    locales: (state: GameState<D, S>) => string[];
    data: (state: GameState<D, S>) => D;
};

export type GameMutations<D, S> = {
    [K in keyof S]: (state: GameState<D, S>, value: S[K]) => void;
} & {
    locale: (state: GameState<D, S>, value: string) => void;
    locales: (state: GameState<D, S>, value: string[]) => void;
    data: (state: GameState<D, S>, value: D) => void;
};

export type GameActionContext = {
    commit: Commit; // the type cannot be inferred. use any instead.
    rootGetters: { readonly locale: string };
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type GameActions<D, S> = {
    init: (
        context: GameActionContext,
        data: D
    ) => Promise<void>;
};

export type GameModule<D, S> = ModuleOptions<
GameState<D, S>, GameGetters<D, S>, GameMutations<D, S>, GameActions<D, S>, true>;

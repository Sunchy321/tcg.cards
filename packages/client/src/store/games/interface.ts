import { Module } from '../interface';
import { Commit } from 'vuex';

interface GameOptionNumber {
    type: 'number';
}

interface GameOptionEnum {
    type: 'enum';
    values: string[];
    default?: string;
}

export type GameOption = GameOptionNumber | GameOptionEnum;

export type GameOptions<S> = {
    [K in keyof S]: GameOption;
}

export type GameState<D, S> = {
    locale: string;
    locales: string[];
    data: D;
} & S;

export type GameGetters<D, S> = {
    locale: (state: GameState<D, S>) => string;
    locales: (state: GameState<D, S>) => string[];
    data: (state: GameState<D, S>) => D;
} & {
    [K in keyof S]: (state: GameState<D, S>) => S[K];
};

export type GameMutations<D, S> = {
    locale: (state: GameState<D, S>, value: string) => void;
    locales: (state: GameState<D, S>, value: string[]) => void;
    data: (state: GameState<D, S>, value: D) => void;
} & {
    [K in keyof S]: (state: GameState<D, S>, value: S[K]) => void;
};

export type GameActionContext = {
    commit: Commit, // the type cannot be inferred. use any instead.
    rootGetters: { readonly locale: string }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type GameActions<D, S> = {
    init: (
        context: GameActionContext,
        data: D
    ) => Promise<void>;
}

export type GameModule<D extends { locales: string[] }, S>
    = Module<true, GameState<D, S>, GameGetters<D, S>, GameMutations<D, S>, GameActions<D, S>>;

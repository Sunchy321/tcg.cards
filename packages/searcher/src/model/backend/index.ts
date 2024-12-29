import Parser from '../../parser';
import { SearchOption, SearchResult } from '../../search';
import { PostAction } from '../type';
import { DBQuery, CommonBackendCommand } from '../../command/backend';
import { Aggregate } from 'mongoose';

import { simplify } from '../../parser/simplify';
import { translate } from './translate';

type Action<T> = (generator: <V = T>() => Aggregate<V[]>, query: DBQuery, post: PostAction[], option: SearchOption) => Promise<T>;

type Actions<A> = {
    [K in string & keyof A]: Action<A[K]>;
};

type Generator<A> = {
    [K in string & keyof A]: <V>() => Aggregate<V[]>;
};

type BackendModelOption<A> = {
    commands: CommonBackendCommand[];
    actions: Actions<A>;
};

class BackendSearcher<A> {
    commands: CommonBackendCommand[];
    actions: Actions<A>;
    generator: Generator<A>;

    constructor(commands: CommonBackendCommand[], actions: Actions<A>, generator: Generator<A>) {
        this.commands = commands;
        this.actions = actions;
        this.generator = generator;
    }

    async search<K extends string & keyof A>(actionKey: K, text: string, options: SearchOption = {}): Promise<SearchResult> {
        const action = this.actions[actionKey];
        const generator = this.generator[actionKey];

        if (action == null) {
            return {
                text,
                errors: [{ type: 'unknown-action' }],
            };
        }

        const trimmedText = text.trim();

        if (trimmedText === '') {
            return {
                text,
                errors: [{ type: 'empty-input' }],
            };
        }

        try {
            const expr = new Parser(trimmedText).parse();

            const simplified = simplify(expr);

            const { dbQuery, post } = translate(simplified, this.commands);

            if (dbQuery == null) {
                return { text, errors: [], result: [] };
            }

            const result = await action(generator, dbQuery, post, options);

            return { text, errors: [], result };
        } catch (e) {
            return { text, errors: [e] };
        }
    }
}

export class BackendModel<A, I> {
    commands: CommonBackendCommand[];
    actions: Actions<A>;
    generator: (input: I) => Generator<A>;

    constructor(option: BackendModelOption<A>, generator: (input: I) => Generator<A>) {
        this.commands = option.commands;
        this.actions = option.actions;
        this.generator = generator;
    }

    bind(input: I): BackendSearcher<A> {
        return new BackendSearcher(this.commands, this.actions, this.generator(input));
    }
}

export function defineBackendModel<A, I>(option: BackendModelOption<A>, generator: (input: I) => Generator<A>): BackendModel<A, I> {
    return new BackendModel(option, generator);
}

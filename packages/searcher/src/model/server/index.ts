import Parser from '../../parser';
import { SearchOption, SearchResult } from '../../search';
import { PostAction } from '../type';
import { DBQuery, CommonServerCommand } from '../../command/server';
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

type ServerModelOption<A> = {
    commands: CommonServerCommand[];
    actions: Actions<A>;
};

class ServerSearcher<A> {
    commands: CommonServerCommand[];
    actions: Actions<A>;
    generator: Generator<A>;

    constructor(commands: CommonServerCommand[], actions: Actions<A>, generator: Generator<A>) {
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

export class ServerModel<A, I> {
    commands: CommonServerCommand[];
    actions: Actions<A>;
    generator: (input: I) => Generator<A>;

    constructor(option: ServerModelOption<A>, generator: (input: I) => Generator<A>) {
        this.commands = option.commands;
        this.actions = option.actions;
        this.generator = generator;
    }

    bind(input: I): ServerSearcher<A> {
        return new ServerSearcher(this.commands, this.actions, this.generator(input));
    }
}

export function defineServerModel<A, I>(option: ServerModelOption<A>, generator: (input: I) => Generator<A>): ServerModel<A, I> {
    return new ServerModel(option, generator);
}

import Parser from '../../parser';
import { SearchOption, SearchResult } from '../../search';
import { PostAction } from '../type';
import { DBQuery, CommonBackendCommand } from '../../command/backend';
import { Model as MongooseModel } from 'mongoose';

import { simplify } from '../../parser/simplify';
import { translate } from './translate';

type Action<I> = (model: MongooseModel<I>, query: DBQuery, post: PostAction[], option: SearchOption) => any;

type Actions<I, A extends string> = Record<A, Action<I>>;

type BackendModelOption<I, A extends string> = {
    commands: CommonBackendCommand[];
    actions: Actions<I, A>;
};

class BackendSearcher<I, A extends string, M extends MongooseModel<I>> {
    commands: CommonBackendCommand[];
    actions: Actions<I, A>;
    model: M;

    constructor(commands: CommonBackendCommand[], actions: Actions<I, A>, model: M) {
        this.commands = commands;
        this.actions = actions;
        this.model = model;
    }

    async search(actionKey: A, text: string, options: SearchOption = {}): Promise<SearchResult> {
        const action = this.actions[actionKey];

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

            const result = await action(this.model, dbQuery, post, options);

            return { text, errors: [], result };
        } catch (e) {
            return { text, errors: [e] };
        }
    }
}

export class BackendModel<I, A extends string> {
    commands: CommonBackendCommand[];
    actions: Actions<I, A>;

    constructor(option: BackendModelOption<I, A>) {
        this.commands = option.commands;
        this.actions = option.actions;
    }

    bind<M extends MongooseModel<I>>(collection: M): BackendSearcher<I, A, M> {
        return new BackendSearcher<I, A, M>(this.commands, this.actions, collection);
    }
}

export function defineBackendModel<I, A extends string>(option: BackendModelOption<I, A>): BackendModel<I, A> {
    return new BackendModel(option);
}

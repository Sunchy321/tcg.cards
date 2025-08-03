import { SQL } from 'drizzle-orm';

import Parser from '@search/parser';
import { SearchResult } from '@search/schema';
import { CommonServerCommand, PostAction } from './command';

import { simplify } from '@search/parser/simplify';
import { translate } from './translate';

type Action<T, O> = (query: SQL, post: PostAction[], option: O) => Promise<T>;

type Actions = Record<string, Action<any, any>>;

type ActionOption<A, K extends keyof A> = A[K] extends Action<any, infer O> ? O : never;

type ActionResult<A, K extends keyof A> = A[K] extends Action<infer T, any> ? T : never;

type ServerSchema = {
    commands: CommonServerCommand[];
    actions:  Actions;
};

export class ServerModel<S extends ServerSchema> {
    commands: CommonServerCommand[];
    actions:  S['actions'];

    constructor(commands: CommonServerCommand[], actions: S['actions']) {
        this.commands = commands;
        this.actions = actions;
    }

    async search<K extends string & keyof S['actions']>(
        actionKey: K,
        text: string,
        options: ActionOption<S['actions'], K>,
    ): Promise<SearchResult<ActionResult<S['actions'], K>>> {
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

            const { query, post } = translate(simplified, this.commands);

            if (query == null) {
                return { text, errors: [], result: [] };
            }

            const result = await action(query, post, options);

            return { text, errors: [], result };
        } catch (e) {
            return { text, errors: [e] };
        }
    }
}

export function defineServerModel<S extends ServerSchema>(schema: S): ServerModel<S> {
    return new ServerModel(schema.commands, schema.actions);
}

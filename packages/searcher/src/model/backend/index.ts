import Parser from '../../parser';
import { SearchOption, SearchResult } from '../../search';
import { PostAction } from '../type';
import { DBQuery, CommonBackendCommand } from '../../command/backend';

import { simplify } from '../../parser/simplify';
import { translate } from './translate';

type Actions<A extends string> = Record<A, (query: DBQuery, post: PostAction[], option: SearchOption) => any>;

type BackendModelOption<A extends string> = {
    commands: CommonBackendCommand[];
    actions: Actions<A>;
};

export class BackendModel<A extends string> {
    commands: CommonBackendCommand[];
    actions: Actions<A>;

    constructor(option: BackendModelOption<A>) {
        this.commands = option.commands;
        this.actions = option.actions;
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

            const result = await action(dbQuery, post, options);

            return { text, errors: [], result };
        } catch (e) {
            return { text, errors: [e] };
        }
    }
}

export function defineBackendModel<A extends string>(option: BackendModelOption<A>): BackendModel<A> {
    return new BackendModel(option);
}

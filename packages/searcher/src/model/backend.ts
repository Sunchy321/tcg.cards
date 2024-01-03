import Parser from '../parser/index-';
import { SearchOption, SearchResult } from '../search';
import { AnyBackendCommand, PostAction } from './type';
import { DBQuery } from '../command/backend';

import { simplify } from '../parser/simplify';
import { translate } from './translate';

type Actions = Record<string, (query: DBQuery, post: PostAction[], option: SearchOption) => any>;

type BackendModelOption = {
    commands: AnyBackendCommand[];
    actions: Actions;
};

export class BackendModel {
    commands: AnyBackendCommand[] = [];
    actions: Actions = { };

    constructor(option: BackendModelOption) {
        this.commands = option.commands;
        this.actions = option.actions;
    }

    async search(actionKey: string, text: string, options: SearchOption): Promise<SearchResult> {
        const action = this.actions[actionKey];

        if (action == null) {
            return {
                text,
                errors: [{ type: 'unknown-action' }],
            };
        }

        const trimmedText = text.trim();

        if (trimmedText == null) {
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

export function defineBackendModel(option: BackendModelOption): BackendModel {
    return new BackendModel(option);
}

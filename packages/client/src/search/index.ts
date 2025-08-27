import Parser from '@search/parser';

import { QueryError } from '@search/command/error';

import { translate } from './translate';

import { CommonClientCommand, I18N } from '@search/command/client';

import { simplify } from '@search/parser/simplify';

type ExplainResult = {
    type: string;
    text: string;
};

type ClientModelOption = {
    id:       string;
    commands: CommonClientCommand[];

};

export class ClientModel {
    id:       string;
    commands: CommonClientCommand[];

    constructor(option: ClientModelOption) {
        this.id = option.id;
        this.commands = option.commands;
    }

    explain(text: string, i18n: I18N): ExplainResult {
        const trimmedText = text.trim();

        if (trimmedText === '') {
            return {
                type: 'result',
                text: trimmedText,
            };
        }

        try {
            const expr = new Parser(trimmedText).parse();

            const simplified = simplify(expr);

            const explainText = translate(simplified, this, i18n);

            return {
                type: 'result',
                text: explainText,
            };
        } catch (e) {
            return {
                type: 'error',
                text: i18n(`error.${(e as QueryError).type}`, (e as QueryError).payload),
            };
        }
    }
}

export function defineClientModel(option: ClientModelOption): ClientModel {
    return new ClientModel(option);
}

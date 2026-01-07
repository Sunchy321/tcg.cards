import Parser from '@search/parser';
import { simplify } from '@search/parser/simplify';
import { QueryError } from '@search/command/error';

import { CommonClientCommandOption, I18N } from './command';
import { translate } from './translate';

export type ExplainResult = {
    type: 'result' | 'error';
    text: string;
};

export class ClientModel {
    commands: Record<string, CommonClientCommandOption>;

    constructor(commands: Record<string, any>) {
        this.commands = commands;
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

            const commands = Object.values(this.commands);

            const explainText = translate(simplified, commands, i18n);

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

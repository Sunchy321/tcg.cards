import Parser from '../../parser';

import { QueryError } from '../../command/error';

import { translate } from './translate';

import { CommonFrontendCommand, I18N } from '../../command/frontend';

import { simplify } from '../../parser/simplify';

type ExplainResult = {
    type: string;
    text: string;
};

type FrontendModelOption = {
    id: string;
    commands: CommonFrontendCommand[];

};

export class FrontendModel {
    id: string;
    commands: CommonFrontendCommand[];

    constructor(option: FrontendModelOption) {
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
                text: i18n(`error.${(e as QueryError).message}`),
            };
        }
    }
}

export function defineFrontendModel(option: FrontendModelOption): FrontendModel {
    return new FrontendModel(option);
}

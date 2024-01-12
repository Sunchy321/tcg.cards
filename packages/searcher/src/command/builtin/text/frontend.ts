import { FrontendOf, I18N } from '../../frontend';
import { ArgumentOf } from '../../index';

import { TextCommand } from './index';

import { OperatorMapOf, defaultTranslate } from '../../../model/frontend/translate';

export type TextFrontendCommand = FrontendOf<TextCommand>;

export type TextQueryOption = ArgumentOf<TextCommand>;

const textMap: OperatorMapOf<TextCommand> = {
    '=':  'equal',
    '!=': 'not-equal',
    ':':  'include',
    '!:': 'not-include',
};

const regexMap: OperatorMapOf<TextCommand> = {
    '=':  'fully-match',
    '!=': 'not-full-match',
    ':':  'match',
    '!:': 'not-match',
};

function explain(arg: ArgumentOf<TextCommand>, i18n: I18N, id: string): string {
    return defaultTranslate(arg, i18n, id, (op, { parameter }) => {
        if (parameter instanceof RegExp) {
            return regexMap[op as keyof OperatorMapOf<TextCommand>] ?? op;
        } else {
            return textMap[op as keyof OperatorMapOf<TextCommand>] ?? op;
        }
    });
}

export default function text(command: TextCommand): TextFrontendCommand {
    return { ...command, explain: (arg, i18n) => explain(arg, i18n, command.id) };
}

text.explain = explain;
